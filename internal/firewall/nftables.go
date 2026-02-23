// Package firewall provides a nftables adapter that translates AegisX IR
// into nftables rulesets and applies them atomically to the kernel.
package firewall

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"text/template"
	"time"

	"go.uber.org/zap"

	"github.com/aegisx/aegisx/internal/policy"
)

const nftTableTemplate = `# AegisX nftables ruleset — generated {{ .Timestamp }}
# DO NOT EDIT MANUALLY — managed by aegisx

table inet {{ .TableName }} {
    # ── Connection tracking ────────────────────────────────────────────
    chain ct_state {
        ct state invalid drop comment "drop invalid"
        ct state { established, related } accept comment "accept established"
    }

    # ── Input chain ────────────────────────────────────────────────────
    chain input {
        type filter hook input priority 0; policy {{ .DefaultInputPolicy }};
        jump ct_state
        iif lo accept comment "loopback"
        {{ range .InputRules }}{{ . }}
        {{ end }}
    }

    # ── Forward chain ──────────────────────────────────────────────────
    chain forward {
        type filter hook forward priority 0; policy {{ .DefaultForwardPolicy }};
        jump ct_state
        {{ range .ForwardRules }}{{ . }}
        {{ end }}
    }

    # ── Output chain ───────────────────────────────────────────────────
    chain output {
        type filter hook output priority 0; policy {{ .DefaultOutputPolicy }};
        ct state { established, related } accept
        {{ range .OutputRules }}{{ . }}
        {{ end }}
    }

    # ── NAT prerouting ────────────────────────────────────────────────
    chain prerouting {
        type nat hook prerouting priority dstnat;
        {{ range .DNATRules }}{{ . }}
        {{ end }}
    }

    # ── NAT postrouting ───────────────────────────────────────────────
    chain postrouting {
        type nat hook postrouting priority srcnat;
        {{ range .SNATRules }}{{ . }}
        {{ end }}
    }
}
`

// Adapter translates policy.IR into nftables rules and applies them.
type Adapter struct {
	tableName   string
	rollbackDir string
	dryRun      bool
	log         *zap.Logger
}

// NewAdapter creates an nftables adapter.
func NewAdapter(tableName, rollbackDir string, dryRun bool, log *zap.Logger) *Adapter {
	return &Adapter{
		tableName:   tableName,
		rollbackDir: rollbackDir,
		dryRun:      dryRun,
		log:         log,
	}
}

// Apply translates ir and atomically applies the ruleset.
// On failure it attempts an automatic rollback.
func (a *Adapter) Apply(ir *policy.IR) error {
	ruleset, err := a.Translate(ir)
	if err != nil {
		return fmt.Errorf("translate: %w", err)
	}

	if a.dryRun {
		a.log.Info("dry-run: nftables ruleset", zap.String("ruleset", ruleset))
		return nil
	}

	// Save current ruleset for rollback.
	if err := a.saveRollback(); err != nil {
		a.log.Warn("could not save rollback snapshot", zap.Error(err))
	}

	// Write to a temp file and use `nft -f` for atomic application.
	tmpFile, err := os.CreateTemp("", "aegisx-nft-*.conf")
	if err != nil {
		return fmt.Errorf("create temp file: %w", err)
	}
	defer os.Remove(tmpFile.Name())

	if _, err := tmpFile.WriteString(ruleset); err != nil {
		return fmt.Errorf("write temp file: %w", err)
	}
	tmpFile.Close()

	// Flush + replace atomically.
	out, err := exec.Command("nft", "-f", tmpFile.Name()).CombinedOutput()
	if err != nil {
		a.log.Error("nft apply failed, attempting rollback",
			zap.Error(err), zap.String("output", string(out)))
		if rbErr := a.Rollback(); rbErr != nil {
			a.log.Error("rollback also failed", zap.Error(rbErr))
		}
		return fmt.Errorf("nft -f failed: %w (output: %s)", err, out)
	}

	a.log.Info("nftables ruleset applied", zap.String("ir_id", ir.ID))
	return nil
}

// Translate converts an IR into a nftables ruleset string.
func (a *Adapter) Translate(ir *policy.IR) (string, error) {
	type templateData struct {
		TableName            string
		Timestamp            string
		DefaultInputPolicy   string
		DefaultForwardPolicy string
		DefaultOutputPolicy  string
		InputRules           []string
		ForwardRules         []string
		OutputRules          []string
		DNATRules            []string
		SNATRules            []string
	}

	data := templateData{
		TableName:            a.tableName,
		Timestamp:            time.Now().UTC().Format(time.RFC3339),
		DefaultInputPolicy:   "drop",
		DefaultForwardPolicy: "drop",
		DefaultOutputPolicy:  "accept",
	}

	// Translate firewall rules into nft rule strings.
	for _, r := range ir.FirewallRules {
		stmt := a.translateFirewallRule(r)
		switch r.Chain {
		case "input":
			data.InputRules = append(data.InputRules, stmt)
		case "output":
			data.OutputRules = append(data.OutputRules, stmt)
		default:
			data.ForwardRules = append(data.ForwardRules, stmt)
		}
	}

	// Translate NAT rules.
	for _, r := range ir.NATRules {
		switch r.Type {
		case "DNAT":
			data.DNATRules = append(data.DNATRules, a.translateDNAT(r))
		case "SNAT":
			data.SNATRules = append(data.SNATRules, a.translateSNAT(r))
		case "MASQUERADE":
			data.SNATRules = append(data.SNATRules, a.translateMasquerade(r))
		}
	}

	tmpl, err := template.New("nft").Parse(nftTableTemplate)
	if err != nil {
		return "", fmt.Errorf("parse template: %w", err)
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, data); err != nil {
		return "", fmt.Errorf("execute template: %w", err)
	}

	return buf.String(), nil
}

// translateFirewallRule converts one CompiledFirewallRule to an nft statement.
func (a *Adapter) translateFirewallRule(r policy.CompiledFirewallRule) string {
	var parts []string

	// Protocol
	if r.Protocol != "" {
		parts = append(parts, "meta l4proto "+r.Protocol)
	}

	// Source addresses
	if len(r.SrcAddrs) == 1 {
		parts = append(parts, "ip saddr "+r.SrcAddrs[0])
	} else if len(r.SrcAddrs) > 1 {
		parts = append(parts, "ip saddr { "+strings.Join(r.SrcAddrs, ", ")+" }")
	}

	// Destination addresses
	if len(r.DstAddrs) == 1 {
		parts = append(parts, "ip daddr "+r.DstAddrs[0])
	} else if len(r.DstAddrs) > 1 {
		parts = append(parts, "ip daddr { "+strings.Join(r.DstAddrs, ", ")+" }")
	}

	// Source ports
	if len(r.SrcPorts) == 1 {
		parts = append(parts, r.Protocol+" sport "+r.SrcPorts[0])
	} else if len(r.SrcPorts) > 1 {
		parts = append(parts, r.Protocol+" sport { "+strings.Join(r.SrcPorts, ", ")+" }")
	}

	// Destination ports
	if len(r.DstPorts) == 1 {
		parts = append(parts, r.Protocol+" dport "+r.DstPorts[0])
	} else if len(r.DstPorts) > 1 {
		parts = append(parts, r.Protocol+" dport { "+strings.Join(r.DstPorts, ", ")+" }")
	}

	// Connection state
	if len(r.States) > 0 {
		parts = append(parts, "ct state { "+strings.Join(r.States, ", ")+" }")
	}

	// Rate limiting
	if r.RateLimit != "" {
		parts = append(parts, "limit rate "+r.RateLimit)
	}

	// Log before action
	if r.Log {
		parts = append(parts, fmt.Sprintf(`log prefix "[aegisx] %s: "`, r.Comment))
	}

	// Verdict
	parts = append(parts, r.Action)

	// Comment
	if r.Comment != "" {
		parts = append(parts, fmt.Sprintf(`comment "%s"`, r.Comment))
	}

	return strings.Join(parts, " ")
}

func (a *Adapter) translateDNAT(r policy.CompiledNATRule) string {
	stmt := ""
	if r.SrcAddr != "" {
		stmt += "ip saddr " + r.SrcAddr + " "
	}
	if r.DstAddr != "" {
		stmt += "ip daddr " + r.DstAddr + " "
	}
	stmt += "dnat to " + r.ToAddr
	return stmt
}

func (a *Adapter) translateSNAT(r policy.CompiledNATRule) string {
	stmt := ""
	if r.SrcAddr != "" {
		stmt += "ip saddr " + r.SrcAddr + " "
	}
	if r.OutIface != "" {
		stmt += "oif " + r.OutIface + " "
	}
	stmt += "snat to " + r.ToAddr
	return stmt
}

func (a *Adapter) translateMasquerade(r policy.CompiledNATRule) string {
	stmt := ""
	if r.SrcAddr != "" {
		stmt += "ip saddr " + r.SrcAddr + " "
	}
	if r.OutIface != "" {
		stmt += "oif " + r.OutIface + " "
	}
	stmt += "masquerade"
	return stmt
}

// Diff returns a human-readable diff between current live rules and proposed IR.
func (a *Adapter) Diff(ir *policy.IR) (string, error) {
	proposed, err := a.Translate(ir)
	if err != nil {
		return "", err
	}

	current, err := a.dumpCurrent()
	if err != nil {
		// Current ruleset may not exist yet.
		return fmt.Sprintf("--- current (empty)\n+++ proposed\n%s", proposed), nil
	}

	return simpleDiff(current, proposed), nil
}

// Rollback restores the most recent saved ruleset.
func (a *Adapter) Rollback() error {
	latest, err := a.latestRollbackFile()
	if err != nil {
		return fmt.Errorf("find rollback file: %w", err)
	}

	out, err := exec.Command("nft", "-f", latest).CombinedOutput()
	if err != nil {
		return fmt.Errorf("rollback apply failed: %w (output: %s)", err, out)
	}
	a.log.Info("rollback applied", zap.String("file", latest))
	return nil
}

// Flush removes all AegisX rules from the kernel.
func (a *Adapter) Flush() error {
	out, err := exec.Command("nft", "delete", "table", "inet", a.tableName).CombinedOutput()
	if err != nil && !strings.Contains(string(out), "No such file") {
		return fmt.Errorf("flush table: %w (output: %s)", err, out)
	}
	return nil
}

// Status returns the currently active nftables ruleset.
func (a *Adapter) Status() (string, error) {
	return a.dumpCurrent()
}

// ─── Private helpers ──────────────────────────────────────────────────────

func (a *Adapter) dumpCurrent() (string, error) {
	out, err := exec.Command("nft", "-s", "list", "table", "inet", a.tableName).CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("nft list table: %w", err)
	}
	return string(out), nil
}

func (a *Adapter) saveRollback() error {
	if err := os.MkdirAll(a.rollbackDir, 0700); err != nil {
		return err
	}

	current, err := a.dumpCurrent()
	if err != nil {
		return nil // nothing to save if no rules exist
	}

	fname := filepath.Join(a.rollbackDir,
		fmt.Sprintf("rollback-%d.conf", time.Now().UnixMilli()))
	return os.WriteFile(fname, []byte(current), 0600)
}

func (a *Adapter) latestRollbackFile() (string, error) {
	entries, err := os.ReadDir(a.rollbackDir)
	if err != nil {
		return "", err
	}
	if len(entries) == 0 {
		return "", fmt.Errorf("no rollback snapshots found")
	}
	// Files are named with timestamps; the last one is the most recent.
	return filepath.Join(a.rollbackDir, entries[len(entries)-1].Name()), nil
}

// simpleDiff produces a basic unified-diff-style comparison.
func simpleDiff(current, proposed string) string {
	cLines := strings.Split(current, "\n")
	pLines := strings.Split(proposed, "\n")

	cSet := make(map[string]bool)
	pSet := make(map[string]bool)
	for _, l := range cLines {
		cSet[strings.TrimSpace(l)] = true
	}
	for _, l := range pLines {
		pSet[strings.TrimSpace(l)] = true
	}

	var out strings.Builder
	for _, l := range cLines {
		if !pSet[strings.TrimSpace(l)] {
			out.WriteString("- " + l + "\n")
		}
	}
	for _, l := range pLines {
		if !cSet[strings.TrimSpace(l)] {
			out.WriteString("+ " + l + "\n")
		}
	}
	return out.String()
}
