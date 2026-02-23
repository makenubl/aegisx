// Package ids provides a Suricata adapter for IDS/IPS management.
package ids

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"go.uber.org/zap"

	"github.com/aegisx/aegisx/internal/policy"
)

// Alert is a parsed Suricata EVE JSON alert event.
type Alert struct {
	Timestamp   time.Time `json:"timestamp"`
	FlowID      int64     `json:"flow_id"`
	Event       string    `json:"event_type"`
	SrcIP       string    `json:"src_ip"`
	SrcPort     int       `json:"src_port"`
	DstIP       string    `json:"dest_ip"`
	DstPort     int       `json:"dest_port"`
	Protocol    string    `json:"proto"`
	AlertDetail struct {
		Action      string `json:"action"`
		GID         int    `json:"gid"`
		SID         int    `json:"signature_id"`
		Rev         int    `json:"rev"`
		Message     string `json:"signature"`
		Category    string `json:"category"`
		Severity    int    `json:"severity"`
	} `json:"alert"`
}

// Adapter manages a running Suricata instance.
type Adapter struct {
	configPath string
	rulesPath  string
	socketPath string
	logPath    string
	mode       string // "ids" | "ips"
	log        *zap.Logger

	alertHandlers []func(Alert)
}

type Config struct {
	ConfigPath string
	RulesPath  string
	SocketPath string
	LogPath    string
	Mode       string
}

func NewAdapter(cfg Config, log *zap.Logger) *Adapter {
	return &Adapter{
		configPath: cfg.ConfigPath,
		rulesPath:  cfg.RulesPath,
		socketPath: cfg.SocketPath,
		logPath:    cfg.LogPath,
		mode:       cfg.Mode,
		log:        log,
	}
}

// OnAlert registers a callback for incoming alerts.
func (a *Adapter) OnAlert(fn func(Alert)) {
	a.alertHandlers = append(a.alertHandlers, fn)
}

// ApplyRules writes compiled IDS rules to the rules directory and reloads.
func (a *Adapter) ApplyRules(rules []policy.CompiledIDSRule) error {
	customRulesPath := filepath.Join(a.rulesPath, "aegisx-custom.rules")

	var sb strings.Builder
	for _, r := range rules {
		if r.Enabled {
			sb.WriteString(r.Raw)
			sb.WriteString("\n")
		}
	}

	if err := os.WriteFile(customRulesPath, []byte(sb.String()), 0640); err != nil {
		return fmt.Errorf("write custom rules: %w", err)
	}

	return a.ReloadRules()
}

// ReloadRules sends a reload command to Suricata via its Unix socket.
func (a *Adapter) ReloadRules() error {
	return a.sendCommand(`{"command":"reload-rules"}`)
}

// Status returns Suricata stats via socket.
func (a *Adapter) Status() (map[string]interface{}, error) {
	resp, err := a.sendCommandResponse(`{"command":"dump-counters"}`)
	if err != nil {
		return nil, err
	}
	var result map[string]interface{}
	if err := json.Unmarshal([]byte(resp), &result); err != nil {
		return nil, err
	}
	return result, nil
}

// TailAlerts reads the EVE JSON log and emits parsed alerts.
// Call this in a goroutine; it blocks until ctx is cancelled.
func (a *Adapter) TailAlerts(ctx context.Context) error {
	evePath := filepath.Join(a.logPath, "eve.json")

	f, err := os.Open(evePath)
	if err != nil {
		return fmt.Errorf("open eve.json: %w", err)
	}
	defer f.Close()

	// Seek to end to get only new events.
	if _, err := f.Seek(0, 2); err != nil {
		return err
	}

	scanner := bufio.NewScanner(f)
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			for scanner.Scan() {
				line := scanner.Text()
				if !strings.Contains(line, `"alert"`) {
					continue
				}
				var alert Alert
				if err := json.Unmarshal([]byte(line), &alert); err != nil {
					a.log.Warn("parse alert", zap.Error(err))
					continue
				}
				for _, fn := range a.alertHandlers {
					fn(alert)
				}
			}
		}
	}
}

// IsRunning checks if Suricata is currently running.
func (a *Adapter) IsRunning() bool {
	out, err := exec.Command("pgrep", "-x", "suricata").Output()
	return err == nil && len(strings.TrimSpace(string(out))) > 0
}

// ─── Private helpers ──────────────────────────────────────────────────────

func (a *Adapter) sendCommand(cmd string) error {
	_, err := a.sendCommandResponse(cmd)
	return err
}

func (a *Adapter) sendCommandResponse(cmd string) (string, error) {
	conn, err := net.DialTimeout("unix", a.socketPath, 3*time.Second)
	if err != nil {
		return "", fmt.Errorf("connect to suricata socket: %w", err)
	}
	defer conn.Close()

	conn.SetDeadline(time.Now().Add(5 * time.Second))

	if _, err := fmt.Fprintln(conn, cmd); err != nil {
		return "", fmt.Errorf("send command: %w", err)
	}

	var sb strings.Builder
	scanner := bufio.NewScanner(conn)
	for scanner.Scan() {
		sb.WriteString(scanner.Text())
	}
	return sb.String(), scanner.Err()
}
