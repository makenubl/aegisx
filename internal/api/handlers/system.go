package handlers

import (
	"net/http"
	"runtime"
	"time"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

var startTime = time.Now()

const Version = "0.1.0"

type SystemHandler struct {
	log *zap.Logger
}

func NewSystemHandler(log *zap.Logger) *SystemHandler {
	return &SystemHandler{log: log}
}

// Status GET /api/v1/status
func (h *SystemHandler) Status(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":    "ok",
		"version":   Version,
		"uptime":    time.Since(startTime).String(),
		"goVersion": runtime.Version(),
		"os":        runtime.GOOS,
		"arch":      runtime.GOARCH,
		"goroutines": runtime.NumGoroutine(),
	})
}

// Version GET /api/v1/version
func (h *SystemHandler) Version(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"version":   Version,
		"buildTime": "unknown",
		"gitCommit": "unknown",
	})
}
