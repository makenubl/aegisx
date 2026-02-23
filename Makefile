# AegisX Makefile
.PHONY: all build test lint clean docker-build docker-push dev help

BINARY_API   := aegisx-api
BINARY_AGENT := aegisx-agent
BINARY_CLI   := aegisx-cli
VERSION      := $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
BUILD_TIME   := $(shell date -u '+%Y-%m-%dT%H:%M:%SZ')
LDFLAGS      := -ldflags="-s -w -X main.Version=$(VERSION) -X main.BuildTime=$(BUILD_TIME)"
GOFLAGS      := CGO_ENABLED=0 GOOS=linux

# ── Build ─────────────────────────────────────────────────────────────────────
all: build

build: build-api build-agent build-cli

build-api:
	@echo "Building $(BINARY_API)…"
	$(GOFLAGS) go build $(LDFLAGS) -o bin/$(BINARY_API) ./cmd/aegisx-api

build-agent:
	@echo "Building $(BINARY_AGENT)…"
	$(GOFLAGS) go build $(LDFLAGS) -o bin/$(BINARY_AGENT) ./cmd/aegisx-agent

build-cli:
	@echo "Building $(BINARY_CLI)…"
	$(GOFLAGS) go build $(LDFLAGS) -o bin/$(BINARY_CLI) ./cmd/aegisx-cli

# ── Test ──────────────────────────────────────────────────────────────────────
test:
	go test ./... -v -race -coverprofile=coverage.out

test-short:
	go test ./... -short

coverage: test
	go tool cover -html=coverage.out -o coverage.html
	@echo "Coverage report: coverage.html"

# ── Lint ──────────────────────────────────────────────────────────────────────
lint:
	golangci-lint run ./...

fmt:
	gofmt -w .
	goimports -w .

vet:
	go vet ./...

# ── Docker ────────────────────────────────────────────────────────────────────
docker-build:
	docker build -t aegisx/api:$(VERSION) -f Dockerfile.api .
	docker build -t aegisx/ui:$(VERSION) -f ui/Dockerfile ui/

docker-push: docker-build
	docker push aegisx/api:$(VERSION)
	docker push aegisx/ui:$(VERSION)

# ── Dev environment ───────────────────────────────────────────────────────────
dev:
	@echo "Starting dev environment…"
	docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
	@echo "API:    http://localhost:8080"
	@echo "UI:     http://localhost:3000 (run: cd ui && npm run dev)"
	@echo "PG:     localhost:5432"

dev-down:
	docker compose down

# ── DB Migrations ─────────────────────────────────────────────────────────────
migrate-up:
	docker compose exec postgres psql -U aegisx -d aegisx -f /docker-entrypoint-initdb.d/001_init.sql

migrate-status:
	docker compose exec postgres psql -U aegisx -d aegisx -c "SELECT * FROM schema_migrations ORDER BY version;"

# ── UI ────────────────────────────────────────────────────────────────────────
ui-install:
	cd ui && npm install

ui-dev:
	cd ui && npm run dev

ui-build:
	cd ui && npm run build

ui-lint:
	cd ui && npm run lint

# ── Clean ─────────────────────────────────────────────────────────────────────
clean:
	rm -rf bin/ coverage.out coverage.html
	cd ui && rm -rf .next

# ── Code generation ───────────────────────────────────────────────────────────
proto:
	protoc --go_out=. --go-grpc_out=. api/proto/*.proto

# ── Help ─────────────────────────────────────────────────────────────────────
help:
	@echo "AegisX Makefile targets:"
	@echo "  build         Build all binaries"
	@echo "  test          Run all tests"
	@echo "  lint          Run golangci-lint"
	@echo "  docker-build  Build Docker images"
	@echo "  dev           Start dev Docker Compose"
	@echo "  ui-dev        Start Next.js dev server"
	@echo "  clean         Remove build artifacts"
