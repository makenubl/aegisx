// Package firewall provides the unified FirewallService that the API uses.
package firewall

import (
	"context"
	"fmt"
	"sync"
	"time"

	"go.uber.org/zap"

	"github.com/aegisx/aegisx/internal/policy"
)

// Service orchestrates policy compilation and dataplane application.
type Service struct {
	mu      sync.RWMutex
	adapter *Adapter
	engine  *policy.Engine
	parser  *policy.Parser
	current *policy.IR
	log     *zap.Logger
	cfg     ServiceConfig
}

type ServiceConfig struct {
	TableName   string
	RollbackDir string
	PolicyDir   string
	DryRun      bool
}

func NewService(cfg ServiceConfig, log *zap.Logger) *Service {
	adapter := NewAdapter(cfg.TableName, cfg.RollbackDir, cfg.DryRun, log)
	return &Service{
		adapter: adapter,
		engine:  policy.NewEngine(),
		parser:  policy.NewParser(),
		log:     log,
		cfg:     cfg,
	}
}

// ApplyManifests parses, compiles, and applies a set of manifests.
func (s *Service) ApplyManifests(ctx context.Context, manifests []*policy.Manifest) error {
	ir, err := s.engine.Compile(manifests)
	if err != nil {
		return fmt.Errorf("compile: %w", err)
	}
	return s.ApplyIR(ctx, ir)
}

// ApplyIR applies a pre-compiled IR to the dataplane.
func (s *Service) ApplyIR(ctx context.Context, ir *policy.IR) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := s.adapter.Apply(ir); err != nil {
		return err
	}
	s.current = ir
	return nil
}

// ApplyPolicyDir reads all policies from the configured directory and applies them.
func (s *Service) ApplyPolicyDir(ctx context.Context) error {
	manifests, err := s.parser.ParseDir(s.cfg.PolicyDir)
	if err != nil {
		return fmt.Errorf("parse dir: %w", err)
	}
	return s.ApplyManifests(ctx, manifests)
}

// DiffManifests returns what would change if manifests were applied.
func (s *Service) DiffManifests(manifests []*policy.Manifest) (string, error) {
	ir, err := s.engine.Compile(manifests)
	if err != nil {
		return "", err
	}
	return s.adapter.Diff(ir)
}

// Rollback restores the previous ruleset.
func (s *Service) Rollback(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.adapter.Rollback()
}

// Flush removes all AegisX rules.
func (s *Service) Flush(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.adapter.Flush()
}

// Status returns the currently applied ruleset as text.
func (s *Service) Status() (string, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.adapter.Status()
}

// CurrentIR returns the in-memory copy of the last applied IR.
func (s *Service) CurrentIR() *policy.IR {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.current
}

// WatchAndReload watches the policy directory for changes and hot-reloads.
// Call this in a goroutine.
func (s *Service) WatchAndReload(ctx context.Context) {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := s.ApplyPolicyDir(ctx); err != nil {
				s.log.Error("hot-reload failed", zap.Error(err))
			}
		}
	}
}
