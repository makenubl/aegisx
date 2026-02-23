package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"go.uber.org/zap"

	"github.com/aegisx/aegisx/internal/firewall"
	"github.com/aegisx/aegisx/internal/policy"
	"github.com/aegisx/aegisx/internal/store"
)

// PolicyHandler handles /api/v1/policies endpoints.
type PolicyHandler struct {
	store       *store.PolicyStore
	firewallSvc *firewall.Service
	parser      *policy.Parser
	log         *zap.Logger
}

func NewPolicyHandler(store *store.PolicyStore, fw *firewall.Service, log *zap.Logger) *PolicyHandler {
	return &PolicyHandler{store: store, firewallSvc: fw, parser: policy.NewParser(), log: log}
}

// ─── Request / Response DTOs ──────────────────────────────────────────────

type CreatePolicyRequest struct {
	Name      string          `json:"name"      binding:"required"`
	Namespace string          `json:"namespace"`
	Kind      string          `json:"kind"      binding:"required"`
	Spec      json.RawMessage `json:"spec"      binding:"required"`
	RawYAML   string          `json:"rawYaml"`
	Enabled   bool            `json:"enabled"`
}

type UpdatePolicyRequest struct {
	Spec    json.RawMessage `json:"spec"`
	RawYAML string          `json:"rawYaml"`
	Enabled *bool           `json:"enabled"`
}

// ─── Handlers ─────────────────────────────────────────────────────────────

// List GET /api/v1/policies
func (h *PolicyHandler) List(c *gin.Context) {
	tenantID := mustTenantID(c)
	kind := c.Query("kind")

	policies, err := h.store.List(c.Request.Context(), tenantID, kind)
	if err != nil {
		h.log.Error("list policies", zap.Error(err))
		c.JSON(http.StatusInternalServerError, errResp("failed to list policies"))
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": policies, "count": len(policies)})
}

// Get GET /api/v1/policies/:id
func (h *PolicyHandler) Get(c *gin.Context) {
	tenantID := mustTenantID(c)
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, errResp("invalid id"))
		return
	}

	p, err := h.store.Get(c.Request.Context(), tenantID, id)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			c.JSON(http.StatusNotFound, errResp("policy not found"))
			return
		}
		c.JSON(http.StatusInternalServerError, errResp(err.Error()))
		return
	}
	c.JSON(http.StatusOK, p)
}

// Create POST /api/v1/policies
func (h *PolicyHandler) Create(c *gin.Context) {
	tenantID := mustTenantID(c)
	userID, _ := c.Get("user_id")

	var req CreatePolicyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, errResp(err.Error()))
		return
	}

	if req.Namespace == "" {
		req.Namespace = "default"
	}

	uid, _ := userID.(uuid.UUID)
	record := &store.PolicyRecord{
		TenantID:  tenantID,
		Name:      req.Name,
		Namespace: req.Namespace,
		Kind:      req.Kind,
		Spec:      req.Spec,
		RawYAML:   req.RawYAML,
		Enabled:   req.Enabled,
		CreatedBy: &uid,
	}

	if err := h.store.Create(c.Request.Context(), record); err != nil {
		h.log.Error("create policy", zap.Error(err))
		c.JSON(http.StatusInternalServerError, errResp("failed to create policy"))
		return
	}
	c.JSON(http.StatusCreated, record)
}

// Update PUT /api/v1/policies/:id
func (h *PolicyHandler) Update(c *gin.Context) {
	tenantID := mustTenantID(c)
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, errResp("invalid id"))
		return
	}

	var req UpdatePolicyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, errResp(err.Error()))
		return
	}

	existing, err := h.store.Get(c.Request.Context(), tenantID, id)
	if err != nil {
		c.JSON(http.StatusNotFound, errResp("policy not found"))
		return
	}

	if req.Spec != nil {
		existing.Spec = req.Spec
	}
	if req.RawYAML != "" {
		existing.RawYAML = req.RawYAML
	}
	if req.Enabled != nil {
		existing.Enabled = *req.Enabled
	}

	if err := h.store.Update(c.Request.Context(), existing); err != nil {
		c.JSON(http.StatusInternalServerError, errResp("failed to update policy"))
		return
	}
	c.JSON(http.StatusOK, existing)
}

// Delete DELETE /api/v1/policies/:id
func (h *PolicyHandler) Delete(c *gin.Context) {
	tenantID := mustTenantID(c)
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, errResp("invalid id"))
		return
	}

	if err := h.store.Delete(c.Request.Context(), tenantID, id); err != nil {
		c.JSON(http.StatusNotFound, errResp("policy not found"))
		return
	}
	c.Status(http.StatusNoContent)
}

// Apply POST /api/v1/policies/:id/apply
func (h *PolicyHandler) Apply(c *gin.Context) {
	tenantID := mustTenantID(c)
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, errResp("invalid id"))
		return
	}

	record, err := h.store.Get(c.Request.Context(), tenantID, id)
	if err != nil {
		c.JSON(http.StatusNotFound, errResp("policy not found"))
		return
	}

	manifests, err := h.parseRecordToManifests(record)
	if err != nil {
		c.JSON(http.StatusBadRequest, errResp("parse policy: "+err.Error()))
		return
	}

	if err := h.firewallSvc.ApplyManifests(context.Background(), manifests); err != nil {
		h.log.Error("apply policy", zap.Error(err), zap.String("policy_id", id.String()))
		c.JSON(http.StatusInternalServerError, errResp("apply failed: "+err.Error()))
		return
	}

	if err := h.store.MarkApplied(c.Request.Context(), tenantID, id); err != nil {
		h.log.Warn("mark applied failed", zap.Error(err))
	}

	c.JSON(http.StatusOK, gin.H{"status": "applied", "policyId": id})
}

// Diff GET /api/v1/policies/:id/diff
func (h *PolicyHandler) Diff(c *gin.Context) {
	tenantID := mustTenantID(c)
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, errResp("invalid id"))
		return
	}

	record, err := h.store.Get(c.Request.Context(), tenantID, id)
	if err != nil {
		c.JSON(http.StatusNotFound, errResp("policy not found"))
		return
	}

	manifests, err := h.parseRecordToManifests(record)
	if err != nil {
		c.JSON(http.StatusBadRequest, errResp("parse policy: "+err.Error()))
		return
	}

	diff, err := h.firewallSvc.DiffManifests(manifests)
	if err != nil {
		c.JSON(http.StatusInternalServerError, errResp(err.Error()))
		return
	}

	c.JSON(http.StatusOK, gin.H{"diff": diff})
}

// ListRevisions GET /api/v1/policies/:id/revisions
func (h *PolicyHandler) ListRevisions(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, errResp("invalid id"))
		return
	}
	revs, err := h.store.ListRevisions(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, errResp(err.Error()))
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": revs})
}

// ─── Helpers ──────────────────────────────────────────────────────────────

func (h *PolicyHandler) parseRecordToManifests(record *store.PolicyRecord) ([]*policy.Manifest, error) {
	if record.RawYAML != "" {
		return h.parser.ParseReader(strings.NewReader(record.RawYAML))
	}
	// Reconstruct minimal manifest from stored JSON spec.
	return nil, nil // TODO: JSON-based reconstruction
}

func mustTenantID(c *gin.Context) uuid.UUID {
	val, _ := c.Get("tenant_id")
	if id, ok := val.(uuid.UUID); ok {
		return id
	}
	// Fall back to header (for multi-tenant proxied requests)
	if h := c.GetHeader("X-Tenant-ID"); h != "" {
		if id, err := uuid.Parse(h); err == nil {
			return id
		}
	}
	return uuid.Nil
}

func errResp(msg string) gin.H { return gin.H{"error": msg} }
