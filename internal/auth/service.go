package auth

import (
	"context"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

// Claims are embedded in JWT tokens.
type Claims struct {
	UserID   uuid.UUID `json:"uid"`
	TenantID uuid.UUID `json:"tid"`
	Role     string    `json:"role"`
	jwt.RegisteredClaims
}

// TokenPair holds access + refresh tokens.
type TokenPair struct {
	AccessToken  string
	RefreshToken string
	ExpiresIn    int
	Role         string
}

// Service provides authentication primitives.
type Service struct {
	jwtSecret  []byte
	jwtExpiry  time.Duration
	adminUser  string
	adminHash  string // bcrypt
	adminID    uuid.UUID
	tenantID   uuid.UUID
}

type Config struct {
	JWTSecret     string
	JWTExpiry     time.Duration
	AdminUser     string
	AdminPassword string
}

func NewService(cfg Config) (*Service, error) {
	if cfg.JWTSecret == "" {
		return nil, fmt.Errorf("jwt_secret is required")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(cfg.AdminPassword), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hash admin password: %w", err)
	}

	return &Service{
		jwtSecret:  []byte(cfg.JWTSecret),
		jwtExpiry:  cfg.JWTExpiry,
		adminUser:  cfg.AdminUser,
		adminHash:  string(hash),
		adminID:    uuid.New(),
		tenantID:   uuid.MustParse("00000000-0000-0000-0000-000000000001"),
	}, nil
}

// Login validates credentials and returns a token pair.
func (s *Service) Login(_ context.Context, username, password string) (*TokenPair, error) {
	// Bootstrap admin user — in production, look up from DB.
	if username != s.adminUser {
		return nil, fmt.Errorf("user not found")
	}
	if err := bcrypt.CompareHashAndPassword([]byte(s.adminHash), []byte(password)); err != nil {
		return nil, fmt.Errorf("invalid password")
	}

	return s.issueTokenPair(s.adminID, s.tenantID, "admin")
}

// RefreshToken issues a new access token from a valid refresh token.
func (s *Service) RefreshToken(_ context.Context, refreshToken string) (*TokenPair, error) {
	claims, err := s.parseToken(refreshToken)
	if err != nil {
		return nil, fmt.Errorf("invalid refresh token: %w", err)
	}
	return s.issueTokenPair(claims.UserID, claims.TenantID, claims.Role)
}

// ValidateToken parses and validates a JWT, returning its claims.
func (s *Service) ValidateToken(tokenStr string) (*Claims, error) {
	return s.parseToken(tokenStr)
}

// HashPassword returns a bcrypt hash of the plaintext password.
func HashPassword(password string) (string, error) {
	h, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(h), err
}

// CheckPassword validates a plaintext password against a bcrypt hash.
func CheckPassword(password, hash string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

// ─── Private helpers ──────────────────────────────────────────────────────

func (s *Service) issueTokenPair(userID, tenantID uuid.UUID, role string) (*TokenPair, error) {
	expiry := s.jwtExpiry
	if expiry == 0 {
		expiry = 24 * time.Hour
	}

	accessToken, err := s.signToken(userID, tenantID, role, expiry)
	if err != nil {
		return nil, err
	}

	// Refresh token lives 7× longer.
	refreshToken, err := s.signToken(userID, tenantID, role, expiry*7)
	if err != nil {
		return nil, err
	}

	return &TokenPair{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		ExpiresIn:    int(expiry.Seconds()),
		Role:         role,
	}, nil
}

func (s *Service) signToken(userID, tenantID uuid.UUID, role string, expiry time.Duration) (string, error) {
	now := time.Now()
	claims := &Claims{
		UserID:   userID,
		TenantID: tenantID,
		Role:     role,
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(expiry)),
			Issuer:    "aegisx",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(s.jwtSecret)
}

func (s *Service) parseToken(tokenStr string) (*Claims, error) {
	var claims Claims
	token, err := jwt.ParseWithClaims(tokenStr, &claims, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return s.jwtSecret, nil
	})
	if err != nil {
		return nil, err
	}
	if !token.Valid {
		return nil, fmt.Errorf("token is not valid")
	}
	return &claims, nil
}
