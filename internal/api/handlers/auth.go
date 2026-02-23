package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"

	"github.com/aegisx/aegisx/internal/auth"
)

type AuthHandler struct {
	svc *auth.Service
	log *zap.Logger
}

func NewAuthHandler(svc *auth.Service, log *zap.Logger) *AuthHandler {
	return &AuthHandler{svc: svc, log: log}
}

type LoginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type LoginResponse struct {
	Token        string `json:"token"`
	RefreshToken string `json:"refreshToken"`
	ExpiresIn    int    `json:"expiresIn"` // seconds
	Role         string `json:"role"`
}

// Login POST /api/v1/auth/login
func (h *AuthHandler) Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, errResp(err.Error()))
		return
	}

	resp, err := h.svc.Login(c.Request.Context(), req.Username, req.Password)
	if err != nil {
		h.log.Warn("login failed",
			zap.String("username", req.Username),
			zap.String("ip", c.ClientIP()),
			zap.Error(err))
		c.JSON(http.StatusUnauthorized, errResp("invalid credentials"))
		return
	}

	c.JSON(http.StatusOK, LoginResponse{
		Token:        resp.AccessToken,
		RefreshToken: resp.RefreshToken,
		ExpiresIn:    resp.ExpiresIn,
		Role:         resp.Role,
	})
}

// Refresh POST /api/v1/auth/refresh
func (h *AuthHandler) Refresh(c *gin.Context) {
	var body struct {
		RefreshToken string `json:"refreshToken" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, errResp(err.Error()))
		return
	}

	resp, err := h.svc.RefreshToken(c.Request.Context(), body.RefreshToken)
	if err != nil {
		c.JSON(http.StatusUnauthorized, errResp("invalid or expired refresh token"))
		return
	}

	c.JSON(http.StatusOK, LoginResponse{
		Token:     resp.AccessToken,
		ExpiresIn: resp.ExpiresIn,
		Role:      resp.Role,
	})
}

// Logout POST /api/v1/auth/logout
func (h *AuthHandler) Logout(c *gin.Context) {
	// Stateless JWT: client drops the token.
	// For stateful sessions, blacklist the token here.
	c.JSON(http.StatusOK, gin.H{"status": "logged out"})
}
