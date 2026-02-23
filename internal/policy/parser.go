package policy

import (
	"fmt"
	"io"
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

// Parser reads YAML policy manifests and returns typed Manifest slices.
type Parser struct{}

func NewParser() *Parser { return &Parser{} }

// ParseFile reads one YAML file which may contain multiple ---separated docs.
func (p *Parser) ParseFile(path string) ([]*Manifest, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open %s: %w", path, err)
	}
	defer f.Close()
	return p.ParseReader(f)
}

// ParseDir reads all *.yaml / *.yml files in a directory.
func (p *Parser) ParseDir(dir string) ([]*Manifest, error) {
	patterns := []string{"*.yaml", "*.yml"}
	var all []*Manifest
	for _, pat := range patterns {
		matches, err := filepath.Glob(filepath.Join(dir, pat))
		if err != nil {
			return nil, err
		}
		for _, path := range matches {
			ms, err := p.ParseFile(path)
			if err != nil {
				return nil, fmt.Errorf("parsing %s: %w", path, err)
			}
			all = append(all, ms...)
		}
	}
	return all, nil
}

// ParseReader decodes all YAML documents from r.
func (p *Parser) ParseReader(r io.Reader) ([]*Manifest, error) {
	dec := yaml.NewDecoder(r)
	dec.KnownFields(false)

	var manifests []*Manifest
	for {
		// First pass: decode into a generic node to figure out Kind.
		var node yaml.Node
		if err := dec.Decode(&node); err != nil {
			if err == io.EOF {
				break
			}
			return nil, fmt.Errorf("yaml decode: %w", err)
		}

		// Extract apiVersion + kind without full unmarshal.
		header := struct {
			APIVersion string   `yaml:"apiVersion"`
			Kind       string   `yaml:"kind"`
			Metadata   Metadata `yaml:"metadata"`
		}{}
		if err := node.Decode(&header); err != nil {
			return nil, fmt.Errorf("decode header: %w", err)
		}

		if header.APIVersion != APIVersion {
			return nil, fmt.Errorf("unsupported apiVersion %q (want %s)", header.APIVersion, APIVersion)
		}

		m := &Manifest{
			APIVersion: header.APIVersion,
			Kind:       header.Kind,
			Metadata:   header.Metadata,
		}

		// Decode spec into the correct typed struct based on Kind.
		wrapper := struct {
			Spec yaml.Node `yaml:"spec"`
		}{}
		if err := node.Decode(&wrapper); err != nil {
			return nil, fmt.Errorf("decode spec node: %w", err)
		}

		switch header.Kind {
		case KindFirewallPolicy:
			var spec FirewallPolicySpec
			if err := wrapper.Spec.Decode(&spec); err != nil {
				return nil, fmt.Errorf("decode FirewallPolicy spec: %w", err)
			}
			m.FirewallSpec = &spec

		case KindLoadBalancerPolicy:
			var spec LoadBalancerPolicySpec
			if err := wrapper.Spec.Decode(&spec); err != nil {
				return nil, fmt.Errorf("decode LoadBalancerPolicy spec: %w", err)
			}
			m.LoadBalancerSpec = &spec

		case KindVPNPolicy:
			var spec VPNPolicySpec
			if err := wrapper.Spec.Decode(&spec); err != nil {
				return nil, fmt.Errorf("decode VPNPolicy spec: %w", err)
			}
			m.VPNSpec = &spec

		case KindNATPolicy:
			var spec NATPolicySpec
			if err := wrapper.Spec.Decode(&spec); err != nil {
				return nil, fmt.Errorf("decode NATPolicy spec: %w", err)
			}
			m.NATSpec = &spec

		case KindIDSPolicy:
			var spec IDSPolicySpec
			if err := wrapper.Spec.Decode(&spec); err != nil {
				return nil, fmt.Errorf("decode IDSPolicy spec: %w", err)
			}
			m.IDSSpec = &spec

		default:
			return nil, fmt.Errorf("unknown Kind %q", header.Kind)
		}

		manifests = append(manifests, m)
	}

	return manifests, nil
}
