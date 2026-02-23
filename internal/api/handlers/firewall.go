package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"

	"github.com/aegisx/aegisx/internal/firewall"
	"github.com/aegisx/aegisx/internal/policy"
)

// FirewallHandler handles /api/v1/firewall endpoints.
type FirewallHandler struct {
	svc    *firewall.Service
	parser *policy.Parser
	log    *zap.Logger
}

func NewFirewallHandler(svc *firewall.Service, log *zap.Logger) *FirewallHandler {
	return &FirewallHandler{svc: svc, parser: policy.NewParser(), log: log}
}

// Status GET /api/v1/firewall/status
func (h *FirewallHandler) Status(c *gin.Context) {
	ruleset, err := h.svc.Status()
	if err != nil {
		h.log.Warn("firewall status unavailable", zap.Error(err))
		c.JSON(http.StatusOK, gin.H{
			"status":  "unknown",
			"message": err.Error(),
		})
		return
	}

	ir := h.svc.CurrentIR()
	resp := gin.H{
		"status":  "active",
		"ruleset": ruleset,
	}
	if ir != nil {
		resp["irId"] = ir.ID
		resp["irVersion"] = ir.Version
		resp["appliedAt"] = ir.CreatedAt
		resp["ruleCount"] = len(ir.FirewallRules)
	}
	c.JSON(http.StatusOK, resp)
}

// ApplyDir POST /api/v1/firewall/apply
// Reads all policies from the configured policy directory and applies them.
func (h *FirewallHandler) ApplyDir(c *gin.Context) {
	if err := h.svc.ApplyPolicyDir(c.Request.Context()); err != nil {
		h.log.Error("apply policy dir failed", zap.Error(err))
		c.JSON(http.StatusInternalServerError, errResp("apply failed: "+err.Error()))
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "applied"})
}

// Rollback POST /api/v1/firewall/rollback
func (h *FirewallHandler) Rollback(c *gin.Context) {
	if err := h.svc.Rollback(c.Request.Context()); err != nil {
		h.log.Error("rollback failed", zap.Error(err))
		c.JSON(http.StatusInternalServerError, errResp("rollback failed: "+err.Error()))
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "rolled back"})
}

// Flush POST /api/v1/firewall/flush
func (h *FirewallHandler) Flush(c *gin.Context) {
	if err := h.svc.Flush(c.Request.Context()); err != nil {
		h.log.Error("flush failed", zap.Error(err))
		c.JSON(http.StatusInternalServerError, errResp("flush failed: "+err.Error()))
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "flushed"})
}

// ListRules GET /api/v1/firewall/rules
// Returns the compiled rules from the current IR.
func (h *FirewallHandler) ListRules(c *gin.Context) {
	ir := h.svc.CurrentIR()
	if ir == nil {
		c.JSON(http.StatusOK, gin.H{"items": []any{}, "count": 0})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"items": ir.FirewallRules,
		"count": len(ir.FirewallRules),
		"irId":  ir.ID,
	})
}
