// aegisx-api is the main control plane API server for AegisX.
// It starts the REST API, hot-reload watcher, and observability services.
package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"go.uber.org/zap"

	"github.com/aegisx/aegisx/internal/api"
	"github.com/aegisx/aegisx/internal/auth"
	"github.com/aegisx/aegisx/internal/config"
	"github.com/aegisx/aegisx/internal/firewall"
	"github.com/aegisx/aegisx/internal/metrics"
	"github.com/aegisx/aegisx/internal/store"
	"github.com/aegisx/aegisx/pkg/logger"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintf(os.Stderr, "fatal: %v\n", err)
		os.Exit(1)
	}
}

func run() error {
	// ── Config ────────────────────────────────────────────────────────────
	cfgFile := os.Getenv("AEGISX_CONFIG")
	cfg, err := config.Load(cfgFile)
	if err != nil {
		return fmt.Errorf("load config: %w", err)
	}

	// ── Logger ────────────────────────────────────────────────────────────
	log, err := logger.New(cfg.Log.Level, cfg.Log.Format)
	if err != nil {
		return fmt.Errorf("init logger: %w", err)
	}
	defer log.Sync()

	log.Info("AegisX starting", zap.String("version", "0.1.0"))

	// ── Database ──────────────────────────────────────────────────────────
	ctx := context.Background()
	db, err := store.Connect(ctx, cfg.Database, log)
	if err != nil {
		return fmt.Errorf("database: %w", err)
	}
	defer db.Close()

	if err := db.Migrate(ctx, cfg.Database.MigrationsPath); err != nil {
		return fmt.Errorf("migrations: %w", err)
	}

	// ── Services ──────────────────────────────────────────────────────────
	policyStore := store.NewPolicyStore(db)

	authSvc, err := auth.NewService(auth.Config{
		JWTSecret:     cfg.Auth.JWTSecret,
		JWTExpiry:     cfg.Auth.JWTExpiry,
		AdminUser:     cfg.Auth.AdminUser,
		AdminPassword: cfg.Auth.AdminPassword,
	})
	if err != nil {
		return fmt.Errorf("auth service: %w", err)
	}

	firewallSvc := firewall.NewService(firewall.ServiceConfig{
		TableName:   cfg.Firewall.TableName,
		RollbackDir: cfg.Firewall.RollbackDir,
		PolicyDir:   cfg.Firewall.PolicyDir,
		DryRun:      cfg.Firewall.DryRun,
	}, log)

	// ── Metrics server ────────────────────────────────────────────────────
	if cfg.Metrics.Enabled {
		metricsSrv := metrics.NewServer(cfg.Metrics.Port, cfg.Metrics.Path)
		go func() {
			if err := metricsSrv.Start(); err != nil && err != http.ErrServerClosed {
				log.Error("metrics server error", zap.Error(err))
			}
		}()
		log.Info("metrics server started", zap.Int("port", cfg.Metrics.Port))
	}

	// ── Hot-reload watcher ────────────────────────────────────────────────
	reloadCtx, cancelReload := context.WithCancel(ctx)
	defer cancelReload()
	if cfg.Firewall.HotReload {
		go firewallSvc.WatchAndReload(reloadCtx)
		log.Info("policy hot-reload enabled",
			zap.String("dir", cfg.Firewall.PolicyDir))
	}

	// ── HTTP API server ───────────────────────────────────────────────────
	srv := api.NewServer(api.ServerDeps{
		Config:      cfg,
		FirewallSvc: firewallSvc,
		PolicyStore: policyStore,
		AuthSvc:     authSvc,
		Log:         log,
	})

	// ── Graceful shutdown ─────────────────────────────────────────────────
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	errCh := make(chan error, 1)
	go func() {
		errCh <- srv.Start()
	}()

	select {
	case err := <-errCh:
		return fmt.Errorf("server error: %w", err)
	case sig := <-sigCh:
		log.Info("shutting down", zap.String("signal", sig.String()))
		shutdownCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
		defer cancel()
		if err := srv.Shutdown(shutdownCtx); err != nil {
			return fmt.Errorf("shutdown: %w", err)
		}
	}

	log.Info("shutdown complete")
	return nil
}
