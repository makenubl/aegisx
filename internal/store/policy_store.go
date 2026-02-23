package store

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// PolicyRecord is the DB representation of a policy.
type PolicyRecord struct {
	ID        uuid.UUID       `json:"id"`
	TenantID  uuid.UUID       `json:"tenantId"`
	Name      string          `json:"name"`
	Namespace string          `json:"namespace"`
	Kind      string          `json:"kind"`
	Version   int             `json:"version"`
	Spec      json.RawMessage `json:"spec"`
	RawYAML   string          `json:"rawYaml"`
	Enabled   bool            `json:"enabled"`
	AppliedAt *time.Time      `json:"appliedAt"`
	CreatedBy *uuid.UUID      `json:"createdBy"`
	CreatedAt time.Time       `json:"createdAt"`
	UpdatedAt time.Time       `json:"updatedAt"`
}

// PolicyStore handles CRUD for policies.
type PolicyStore struct{ db *DB }

func NewPolicyStore(db *DB) *PolicyStore { return &PolicyStore{db: db} }

// Create inserts a new policy and returns its ID.
func (s *PolicyStore) Create(ctx context.Context, p *PolicyRecord) error {
	if p.ID == uuid.Nil {
		p.ID = uuid.New()
	}
	p.CreatedAt = time.Now()
	p.UpdatedAt = time.Now()
	p.Version = 1

	_, err := s.db.Pool.Exec(ctx, `
		INSERT INTO policies
			(id, tenant_id, name, namespace, kind, version, spec, raw_yaml, enabled, created_by)
		VALUES
			($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
		p.ID, p.TenantID, p.Name, p.Namespace, p.Kind,
		p.Version, p.Spec, p.RawYAML, p.Enabled, p.CreatedBy,
	)
	if err != nil {
		return fmt.Errorf("insert policy: %w", err)
	}

	// Write revision
	return s.appendRevision(ctx, p)
}

// Get returns a single policy by ID.
func (s *PolicyStore) Get(ctx context.Context, tenantID, id uuid.UUID) (*PolicyRecord, error) {
	row := s.db.Pool.QueryRow(ctx, `
		SELECT id, tenant_id, name, namespace, kind, version, spec, raw_yaml,
		       enabled, applied_at, created_by, created_at, updated_at
		FROM policies
		WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
		id, tenantID)

	return scanPolicy(row)
}

// List returns all policies for a tenant, optionally filtered by kind.
func (s *PolicyStore) List(ctx context.Context, tenantID uuid.UUID, kind string) ([]*PolicyRecord, error) {
	query := `
		SELECT id, tenant_id, name, namespace, kind, version, spec, raw_yaml,
		       enabled, applied_at, created_by, created_at, updated_at
		FROM policies
		WHERE tenant_id = $1 AND deleted_at IS NULL`
	args := []any{tenantID}

	if kind != "" {
		query += " AND kind = $2"
		args = append(args, kind)
	}
	query += " ORDER BY namespace, name"

	rows, err := s.db.Pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var policies []*PolicyRecord
	for rows.Next() {
		p, err := scanPolicy(rows)
		if err != nil {
			return nil, err
		}
		policies = append(policies, p)
	}
	return policies, rows.Err()
}

// Update increments the version and persists changes.
func (s *PolicyStore) Update(ctx context.Context, p *PolicyRecord) error {
	p.UpdatedAt = time.Now()

	tag, err := s.db.Pool.Exec(ctx, `
		UPDATE policies
		SET spec = $1, raw_yaml = $2, enabled = $3, version = version + 1, updated_at = NOW()
		WHERE id = $4 AND tenant_id = $5`,
		p.Spec, p.RawYAML, p.Enabled, p.ID, p.TenantID,
	)
	if err != nil {
		return fmt.Errorf("update policy: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("policy not found")
	}
	return s.appendRevision(ctx, p)
}

// Delete soft-deletes a policy.
func (s *PolicyStore) Delete(ctx context.Context, tenantID, id uuid.UUID) error {
	tag, err := s.db.Pool.Exec(ctx, `
		UPDATE policies SET deleted_at = NOW() WHERE id = $1 AND tenant_id = $2`,
		id, tenantID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("policy not found")
	}
	return nil
}

// MarkApplied sets applied_at on a policy.
func (s *PolicyStore) MarkApplied(ctx context.Context, tenantID, id uuid.UUID) error {
	_, err := s.db.Pool.Exec(ctx, `
		UPDATE policies SET applied_at = NOW() WHERE id = $1 AND tenant_id = $2`,
		id, tenantID)
	return err
}

// ListRevisions returns the revision history for a policy.
func (s *PolicyStore) ListRevisions(ctx context.Context, policyID uuid.UUID) ([]*PolicyRevision, error) {
	rows, err := s.db.Pool.Query(ctx, `
		SELECT id, policy_id, version, spec, changed_by, changed_at, comment
		FROM policy_revisions
		WHERE policy_id = $1
		ORDER BY version DESC`, policyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var revs []*PolicyRevision
	for rows.Next() {
		var r PolicyRevision
		if err := rows.Scan(&r.ID, &r.PolicyID, &r.Version, &r.Spec,
			&r.ChangedBy, &r.ChangedAt, &r.Comment); err != nil {
			return nil, err
		}
		revs = append(revs, &r)
	}
	return revs, rows.Err()
}

type PolicyRevision struct {
	ID        uuid.UUID       `json:"id"`
	PolicyID  uuid.UUID       `json:"policyId"`
	Version   int             `json:"version"`
	Spec      json.RawMessage `json:"spec"`
	ChangedBy *uuid.UUID      `json:"changedBy"`
	ChangedAt time.Time       `json:"changedAt"`
	Comment   string          `json:"comment"`
}

// ─── Private helpers ──────────────────────────────────────────────────────

func (s *PolicyStore) appendRevision(ctx context.Context, p *PolicyRecord) error {
	_, err := s.db.Pool.Exec(ctx, `
		INSERT INTO policy_revisions (policy_id, version, spec, changed_by)
		VALUES ($1, $2, $3, $4)`,
		p.ID, p.Version, p.Spec, p.CreatedBy)
	return err
}

type scanner interface {
	Scan(dest ...any) error
}

func scanPolicy(row scanner) (*PolicyRecord, error) {
	var p PolicyRecord
	err := row.Scan(
		&p.ID, &p.TenantID, &p.Name, &p.Namespace, &p.Kind, &p.Version,
		&p.Spec, &p.RawYAML, &p.Enabled, &p.AppliedAt, &p.CreatedBy,
		&p.CreatedAt, &p.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, fmt.Errorf("policy not found")
		}
		return nil, err
	}
	return &p, nil
}
