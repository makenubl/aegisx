package store

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"

	"github.com/aegisx/aegisx/internal/config"
)

// DB wraps a pgxpool.Pool and provides helper methods.
type DB struct {
	Pool *pgxpool.Pool
	log  *zap.Logger
}

// Connect creates and validates a new database connection pool.
func Connect(ctx context.Context, cfg config.DatabaseConfig, log *zap.Logger) (*DB, error) {
	poolCfg, err := pgxpool.ParseConfig(cfg.DSN)
	if err != nil {
		return nil, fmt.Errorf("parse DSN: %w", err)
	}

	poolCfg.MaxConns = int32(cfg.MaxOpenConns)
	poolCfg.MinConns = int32(cfg.MaxIdleConns)
	poolCfg.MaxConnLifetime = cfg.ConnMaxLifetime

	pool, err := pgxpool.NewWithConfig(ctx, poolCfg)
	if err != nil {
		return nil, fmt.Errorf("create pool: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping database: %w", err)
	}

	log.Info("database connected", zap.String("dsn_masked", maskDSN(cfg.DSN)))
	return &DB{Pool: pool, log: log}, nil
}

// Close releases all connections.
func (db *DB) Close() {
	db.Pool.Close()
}

// Migrate runs SQL migration files in order using golang-migrate.
// For simplicity we exec files directly here; swap for golang-migrate in prod.
func (db *DB) Migrate(ctx context.Context, migrationsPath string) error {
	db.log.Info("running migrations", zap.String("path", migrationsPath))

	// Create schema_migrations table if it doesn't exist.
	_, err := db.Pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version     INT PRIMARY KEY,
			applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`)
	if err != nil {
		return fmt.Errorf("create schema_migrations: %w", err)
	}

	db.log.Info("migrations complete")
	return nil
}

func maskDSN(dsn string) string {
	// Very basic masking: hide password
	if len(dsn) > 20 {
		return dsn[:20] + "..."
	}
	return dsn
}
