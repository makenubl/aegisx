package policy

import (
	"fmt"
	"sort"
	"strconv"
	"time"

	"github.com/google/uuid"
)

// Engine compiles a slice of Manifests into an IR.
type Engine struct {
	validator *Validator
}

func NewEngine() *Engine {
	return &Engine{validator: NewValidator()}
}

// Compile validates and compiles manifests into an IR ready for backend adapters.
func (e *Engine) Compile(manifests []*Manifest) (*IR, error) {
	if err := e.validator.ValidateAll(manifests); err != nil {
		return nil, fmt.Errorf("validation failed: %w", err)
	}

	ir := &IR{
		ID:        uuid.NewString(),
		Version:   time.Now().UnixMilli(),
		CreatedAt: time.Now(),
	}

	for _, m := range manifests {
		switch m.Kind {
		case KindFirewallPolicy:
			rules, err := e.compileFirewall(m)
			if err != nil {
				return nil, fmt.Errorf("compiling firewall policy %s: %w", m.Metadata.Name, err)
			}
			ir.FirewallRules = append(ir.FirewallRules, rules...)

		case KindNATPolicy:
			rules, err := e.compileNAT(m)
			if err != nil {
				return nil, err
			}
			ir.NATRules = append(ir.NATRules, rules...)

		case KindLoadBalancerPolicy:
			lb, err := e.compileLB(m)
			if err != nil {
				return nil, err
			}
			ir.LoadBalancers = append(ir.LoadBalancers, *lb)

		case KindVPNPolicy:
			vpn, err := e.compileVPN(m)
			if err != nil {
				return nil, err
			}
			ir.VPNConfigs = append(ir.VPNConfigs, *vpn)

		case KindIDSPolicy:
			rules, err := e.compileIDS(m)
			if err != nil {
				return nil, err
			}
			ir.IDSRules = append(ir.IDSRules, rules...)
		}
	}

	// Sort firewall rules by priority (lower number = higher priority).
	sort.Slice(ir.FirewallRules, func(i, j int) bool {
		return ir.FirewallRules[i].Priority < ir.FirewallRules[j].Priority
	})

	return ir, nil
}

// ─── Firewall compilation ─────────────────────────────────────────────────

func (e *Engine) compileFirewall(m *Manifest) ([]CompiledFirewallRule, error) {
	spec := m.FirewallSpec
	var compiled []CompiledFirewallRule

	for i, r := range spec.Rules {
		cr := CompiledFirewallRule{
			Priority: r.Priority,
			Action:   normalizeAction(r.Action),
			Protocol: normalizeProtocol(r.Protocol),
			States:   r.State,
			Log:      r.Log,
			Comment:  fmt.Sprintf("%s/%s/%s", m.Metadata.Namespace, m.Metadata.Name, r.Name),
		}

		// Default priority is insertion order × 100
		if cr.Priority == 0 {
			cr.Priority = (i + 1) * 100
		}

		// Resolve source addresses / ports
		cr.SrcAddrs = r.Source.Addresses
		cr.DstAddrs = r.Dest.Addresses
		cr.DstPorts = compilePorts(r.Dest.Ports, r.Dest.PortRanges)
		cr.SrcPorts = compilePorts(r.Source.Ports, r.Source.PortRanges)

		// Determine chain based on traffic direction
		cr.Chain = "forward" // default; refined by zone logic below

		if hasZone(r.Source.Zones, "localhost") || hasZone(r.Dest.Zones, "localhost") {
			if hasZone(r.Dest.Zones, "localhost") {
				cr.Chain = "input"
			} else {
				cr.Chain = "output"
			}
		}

		if r.RateLimit != nil {
			cr.RateLimit = r.RateLimit.Rate
		}

		compiled = append(compiled, cr)
	}

	// If a default action is set, append a catch-all rule at max priority.
	if spec.DefaultAction != "" {
		compiled = append(compiled, CompiledFirewallRule{
			Priority: 99999,
			Chain:    "forward",
			Action:   normalizeAction(spec.DefaultAction),
			Comment:  fmt.Sprintf("%s/%s/default", m.Metadata.Namespace, m.Metadata.Name),
		})
	}

	return compiled, nil
}

// ─── NAT compilation ──────────────────────────────────────────────────────

func (e *Engine) compileNAT(m *Manifest) ([]CompiledNATRule, error) {
	var compiled []CompiledNATRule
	for _, r := range m.NATSpec.Rules {
		compiled = append(compiled, CompiledNATRule{
			Type:     r.Type,
			SrcAddr:  r.Source,
			DstAddr:  r.Dest,
			ToAddr:   r.ToDest,
			OutIface: r.OutIface,
		})
	}
	return compiled, nil
}

// ─── Load Balancer compilation ────────────────────────────────────────────

func (e *Engine) compileLB(m *Manifest) (*CompiledLoadBalancer, error) {
	spec := m.LoadBalancerSpec
	return &CompiledLoadBalancer{
		Name:     m.Metadata.Name,
		Frontend: spec.Frontend,
		Backend:  spec.Backend,
		TLS:      spec.TLS,
	}, nil
}

// ─── VPN compilation ──────────────────────────────────────────────────────

func (e *Engine) compileVPN(m *Manifest) (*CompiledVPNConfig, error) {
	spec := m.VPNSpec
	return &CompiledVPNConfig{
		Interface:  spec.Interface,
		ListenPort: spec.ListenPort,
		Address:    spec.Address,
		Peers:      spec.Peers,
	}, nil
}

// ─── IDS compilation ──────────────────────────────────────────────────────

func (e *Engine) compileIDS(m *Manifest) ([]CompiledIDSRule, error) {
	var compiled []CompiledIDSRule
	for _, r := range m.IDSSpec.CustomRules {
		compiled = append(compiled, CompiledIDSRule{
			Raw:     r.Rule,
			Enabled: r.Enabled,
		})
	}
	return compiled, nil
}

// ─── Helpers ──────────────────────────────────────────────────────────────

func normalizeAction(a string) string {
	switch a {
	case "ALLOW", "allow", "ACCEPT", "accept":
		return "accept"
	case "DROP", "drop":
		return "drop"
	case "REJECT", "reject":
		return "reject"
	case "LOG", "log":
		return "log"
	default:
		return "drop"
	}
}

func normalizeProtocol(p string) string {
	switch p {
	case "any", "ANY", "":
		return ""
	default:
		return p
	}
}

func compilePorts(ports []int, ranges []PortRange) []string {
	var out []string
	for _, p := range ports {
		out = append(out, strconv.Itoa(p))
	}
	for _, r := range ranges {
		out = append(out, fmt.Sprintf("%d-%d", r.Start, r.End))
	}
	return out
}

func hasZone(zones []string, target string) bool {
	for _, z := range zones {
		if z == target {
			return true
		}
	}
	return false
}
