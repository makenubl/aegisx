package api

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"

	"github.com/aegisx/aegisx/internal/api/handlers"
	"github.com/aegisx/aegisx/internal/auth"
	"github.com/aegisx/aegisx/internal/config"
	"github.com/aegisx/aegisx/internal/firewall"
	"github.com/aegisx/aegisx/internal/store"
)

// Server is the HTTP API server.
type Server struct {
	cfg        *config.ServerConfig
	router     *gin.Engine
	httpServer *http.Server
	log        *zap.Logger

	// Services
	firewallSvc *firewall.Service
	policyStore *store.PolicyStore
	authSvc     *auth.Service
}

// ServerDeps bundles all service dependencies.
type ServerDeps struct {
	Config      *config.Config
	FirewallSvc *firewall.Service
	PolicyStore *store.PolicyStore
	AuthSvc     *auth.Service
	Log         *zap.Logger
}

// NewServer wires up the Gin router with all routes and middleware.
func NewServer(deps ServerDeps) *Server {
	if deps.Config.Server.Port == 0 {
		deps.Config.Server.Port = 8080
	}

	gin.SetMode(gin.ReleaseMode)
	router := gin.New()

	s := &Server{
		cfg:         &deps.Config.Server,
		router:      router,
		log:         deps.Log,
		firewallSvc: deps.FirewallSvc,
		policyStore: deps.PolicyStore,
		authSvc:     deps.AuthSvc,
	}

	s.setupMiddleware()
	s.setupRoutes()

	s.httpServer = &http.Server{
		Addr:         fmt.Sprintf("%s:%d", deps.Config.Server.Host, deps.Config.Server.Port),
		Handler:      router,
		ReadTimeout:  deps.Config.Server.ReadTimeout,
		WriteTimeout: deps.Config.Server.WriteTimeout,
	}

	return s
}

func (s *Server) setupMiddleware() {
	s.router.Use(
		gin.Recovery(),
		s.requestLogger(),
		s.corsMiddleware(),
		s.securityHeaders(),
	)
}

func (s *Server) setupRoutes() {
	// Health
	s.router.GET("/healthz", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok", "timestamp": time.Now()})
	})
	s.router.GET("/readyz", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ready"})
	})

	// Prometheus metrics — served by metrics package on separate port

	v1 := s.router.Group("/api/v1")

	// ── Auth ────────────────────────────────────────────────────────────
	authHandler := handlers.NewAuthHandler(s.authSvc, s.log)
	v1.POST("/auth/login", authHandler.Login)
	v1.POST("/auth/refresh", authHandler.Refresh)
	v1.POST("/auth/logout", s.authMiddleware(), authHandler.Logout)

	// ── All routes below require authentication ─────────────────────────
	protected := v1.Group("", s.authMiddleware())

	// ── Policies ─────────────────────────────────────────────────────────
	policyHandler := handlers.NewPolicyHandler(s.policyStore, s.firewallSvc, s.log)
	policies := protected.Group("/policies")
	{
		policies.GET("", policyHandler.List)
		policies.POST("", policyHandler.Create)
		policies.GET("/:id", policyHandler.Get)
		policies.PUT("/:id", policyHandler.Update)
		policies.DELETE("/:id", policyHandler.Delete)
		policies.POST("/:id/apply", policyHandler.Apply)
		policies.GET("/:id/diff", policyHandler.Diff)
		policies.GET("/:id/revisions", policyHandler.ListRevisions)
	}

	// ── Firewall ─────────────────────────────────────────────────────────
	fwHandler := handlers.NewFirewallHandler(s.firewallSvc, s.log)
	firewall := protected.Group("/firewall")
	{
		firewall.GET("/status", fwHandler.Status)
		firewall.POST("/apply", fwHandler.ApplyDir)
		firewall.POST("/rollback", fwHandler.Rollback)
		firewall.POST("/flush", fwHandler.Flush)
		firewall.GET("/rules", fwHandler.ListRules)
	}

	// ── System status ────────────────────────────────────────────────────
	sysHandler := handlers.NewSystemHandler(s.log)
	protected.GET("/status", sysHandler.Status)
	protected.GET("/version", sysHandler.Version)
}

// Start begins listening for HTTP connections.
func (s *Server) Start() error {
	s.log.Info("API server starting",
		zap.String("addr", s.httpServer.Addr))

	if s.cfg.TLSCert != "" && s.cfg.TLSKey != "" {
		return s.httpServer.ListenAndServeTLS(s.cfg.TLSCert, s.cfg.TLSKey)
	}
	return s.httpServer.ListenAndServe()
}

// Shutdown gracefully drains connections.
func (s *Server) Shutdown(ctx context.Context) error {
	s.log.Info("API server shutting down")
	return s.httpServer.Shutdown(ctx)
}

// ─── Middleware helpers ───────────────────────────────────────────────────

func (s *Server) requestLogger() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		s.log.Info("request",
			zap.String("method", c.Request.Method),
			zap.String("path", c.Request.URL.Path),
			zap.Int("status", c.Writer.Status()),
			zap.Duration("latency", time.Since(start)),
			zap.String("ip", c.ClientIP()),
		)
	}
}

func (s *Server) corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Tenant-ID")

		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}

func (s *Server) securityHeaders() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("X-Frame-Options", "DENY")
		c.Header("X-XSS-Protection", "1; mode=block")
		c.Header("Referrer-Policy", "strict-origin-when-cross-origin")
		c.Header("Content-Security-Policy", "default-src 'self'")
		c.Next()
	}
}

func (s *Server) authMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		token := c.GetHeader("Authorization")
		if token == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing authorization header"})
			return
		}
		// Strip "Bearer " prefix
		if len(token) > 7 && token[:7] == "Bearer " {
			token = token[7:]
		}

		claims, err := s.authSvc.ValidateToken(token)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
			return
		}

		c.Set("user_id", claims.UserID)
		c.Set("tenant_id", claims.TenantID)
		c.Set("role", claims.Role)
		c.Next()
	}
}
