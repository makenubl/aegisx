package policy

import (
	"fmt"
	"net"
	"strings"
)

// Validator checks manifests for semantic correctness before compilation.
type Validator struct{}

func NewValidator() *Validator { return &Validator{} }

// ValidationError holds all errors found during validation.
type ValidationError struct {
	Errors []string
}

func (e *ValidationError) Error() string {
	return fmt.Sprintf("validation errors:\n  - %s", strings.Join(e.Errors, "\n  - "))
}

func (v *Validator) ValidateAll(manifests []*Manifest) error {
	var errs []string
	for _, m := range manifests {
		if err := v.Validate(m); err != nil {
			ve := err.(*ValidationError)
			errs = append(errs, ve.Errors...)
		}
	}
	if len(errs) > 0 {
		return &ValidationError{Errors: errs}
	}
	return nil
}

func (v *Validator) Validate(m *Manifest) error {
	var errs []string
	ctx := fmt.Sprintf("[%s/%s]", m.Metadata.Namespace, m.Metadata.Name)

	if m.Metadata.Name == "" {
		errs = append(errs, ctx+": metadata.name is required")
	}

	switch m.Kind {
	case KindFirewallPolicy:
		errs = append(errs, v.validateFirewall(ctx, m.FirewallSpec)...)
	case KindLoadBalancerPolicy:
		errs = append(errs, v.validateLB(ctx, m.LoadBalancerSpec)...)
	case KindVPNPolicy:
		errs = append(errs, v.validateVPN(ctx, m.VPNSpec)...)
	case KindNATPolicy:
		errs = append(errs, v.validateNAT(ctx, m.NATSpec)...)
	case KindIDSPolicy:
		// IDS policies are loosely validated
	default:
		errs = append(errs, fmt.Sprintf("%s: unknown kind %q", ctx, m.Kind))
	}

	if len(errs) > 0 {
		return &ValidationError{Errors: errs}
	}
	return nil
}

func (v *Validator) validateFirewall(ctx string, spec *FirewallPolicySpec) []string {
	if spec == nil {
		return []string{ctx + ": spec is required for FirewallPolicy"}
	}

	var errs []string
	validActions := map[string]bool{"ALLOW": true, "DROP": true, "REJECT": true, "LOG": true}
	validProtocols := map[string]bool{"tcp": true, "udp": true, "icmp": true, "any": true, "ANY": true, "": true}

	if spec.DefaultAction != "" && !validActions[spec.DefaultAction] {
		errs = append(errs, fmt.Sprintf("%s: invalid defaultAction %q", ctx, spec.DefaultAction))
	}

	for i, r := range spec.Rules {
		rCtx := fmt.Sprintf("%s rule[%d] %q", ctx, i, r.Name)

		if r.Name == "" {
			errs = append(errs, rCtx+": name is required")
		}
		if !validActions[r.Action] {
			errs = append(errs, fmt.Sprintf("%s: invalid action %q", rCtx, r.Action))
		}
		if !validProtocols[r.Protocol] {
			errs = append(errs, fmt.Sprintf("%s: invalid protocol %q", rCtx, r.Protocol))
		}

		// Validate CIDR addresses
		for _, addr := range append(r.Source.Addresses, r.Dest.Addresses...) {
			if _, _, err := net.ParseCIDR(addr); err != nil {
				if net.ParseIP(addr) == nil {
					errs = append(errs, fmt.Sprintf("%s: invalid address %q", rCtx, addr))
				}
			}
		}

		// Validate port ranges
		for _, port := range append(r.Source.Ports, r.Dest.Ports...) {
			if port < 1 || port > 65535 {
				errs = append(errs, fmt.Sprintf("%s: port %d out of range", rCtx, port))
			}
		}
		for _, pr := range append(r.Source.PortRanges, r.Dest.PortRanges...) {
			if pr.Start >= pr.End {
				errs = append(errs, fmt.Sprintf("%s: portRange start >= end (%d-%d)", rCtx, pr.Start, pr.End))
			}
		}
	}

	return errs
}

func (v *Validator) validateLB(ctx string, spec *LoadBalancerPolicySpec) []string {
	if spec == nil {
		return []string{ctx + ": spec is required for LoadBalancerPolicy"}
	}

	var errs []string
	validAlgorithms := map[string]bool{
		"roundrobin": true, "leastconn": true, "source": true, "random": true,
	}

	if spec.Frontend.Bind == "" {
		errs = append(errs, ctx+": frontend.bind is required")
	}
	if spec.Frontend.Mode == "" {
		errs = append(errs, ctx+": frontend.mode is required (tcp|http)")
	}

	algo := spec.Backend.Algorithm
	if algo != "" && !validAlgorithms[algo] {
		errs = append(errs, fmt.Sprintf("%s: unknown algorithm %q", ctx, algo))
	}

	if len(spec.Backend.Servers) == 0 {
		errs = append(errs, ctx+": backend must have at least one server")
	}
	for i, s := range spec.Backend.Servers {
		if s.Address == "" {
			errs = append(errs, fmt.Sprintf("%s server[%d]: address is required", ctx, i))
		}
		if _, _, err := net.SplitHostPort(s.Address); err != nil {
			errs = append(errs, fmt.Sprintf("%s server[%d]: invalid address %q", ctx, i, s.Address))
		}
	}

	return errs
}

func (v *Validator) validateVPN(ctx string, spec *VPNPolicySpec) []string {
	if spec == nil {
		return []string{ctx + ": spec is required for VPNPolicy"}
	}

	var errs []string
	if spec.Interface == "" {
		errs = append(errs, ctx+": interface is required")
	}
	if spec.ListenPort < 1 || spec.ListenPort > 65535 {
		errs = append(errs, fmt.Sprintf("%s: invalid listenPort %d", ctx, spec.ListenPort))
	}
	if _, _, err := net.ParseCIDR(spec.Address); err != nil {
		errs = append(errs, fmt.Sprintf("%s: invalid address CIDR %q", ctx, spec.Address))
	}
	for i, peer := range spec.Peers {
		if peer.PublicKey == "" {
			errs = append(errs, fmt.Sprintf("%s peer[%d]: publicKey is required", ctx, i))
		}
		for _, allowedIP := range peer.AllowedIPs {
			if _, _, err := net.ParseCIDR(allowedIP); err != nil {
				errs = append(errs, fmt.Sprintf("%s peer[%d]: invalid allowedIP %q", ctx, i, allowedIP))
			}
		}
	}
	return errs
}

func (v *Validator) validateNAT(ctx string, spec *NATPolicySpec) []string {
	if spec == nil {
		return []string{ctx + ": spec is required for NATPolicy"}
	}
	var errs []string
	validTypes := map[string]bool{"SNAT": true, "DNAT": true, "MASQUERADE": true}
	for i, r := range spec.Rules {
		if !validTypes[r.Type] {
			errs = append(errs, fmt.Sprintf("%s rule[%d]: invalid type %q", ctx, i, r.Type))
		}
	}
	return errs
}
