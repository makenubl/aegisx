-- AegisX database schema — migration 001
-- Creates core tables: tenants, users, policies, audit_log, firewall_rules, alerts

BEGIN;

-- ─── Extensions ────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Tenants ───────────────────────────────────────────────────────────────
CREATE TABLE tenants (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        TEXT NOT NULL UNIQUE,
    slug        TEXT NOT NULL UNIQUE,
    settings    JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMPTZ
);

-- ─── Users / Auth ──────────────────────────────────────────────────────────
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    username        TEXT NOT NULL,
    email           TEXT NOT NULL,
    password_hash   TEXT NOT NULL,    -- bcrypt
    role            TEXT NOT NULL DEFAULT 'viewer',  -- admin|operator|viewer
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, username),
    UNIQUE (tenant_id, email)
);

CREATE INDEX idx_users_tenant ON users(tenant_id);

-- ─── API Tokens ────────────────────────────────────────────────────────────
CREATE TABLE api_tokens (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    token_hash  TEXT NOT NULL UNIQUE,   -- sha256
    scopes      TEXT[] NOT NULL DEFAULT '{}',
    expires_at  TIMESTAMPTZ,
    last_used   TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Policies ──────────────────────────────────────────────────────────────
CREATE TABLE policies (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    namespace   TEXT NOT NULL DEFAULT 'default',
    kind        TEXT NOT NULL,          -- FirewallPolicy|LoadBalancerPolicy|etc
    version     INT NOT NULL DEFAULT 1,
    spec        JSONB NOT NULL,         -- full YAML spec as JSON
    raw_yaml    TEXT,                   -- original YAML source
    enabled     BOOLEAN NOT NULL DEFAULT TRUE,
    applied_at  TIMESTAMPTZ,
    created_by  UUID REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, namespace, name)
);

CREATE INDEX idx_policies_tenant ON policies(tenant_id);
CREATE INDEX idx_policies_kind ON policies(kind);
CREATE INDEX idx_policies_enabled ON policies(enabled) WHERE enabled = TRUE;

-- Policy version history
CREATE TABLE policy_revisions (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    policy_id   UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
    version     INT NOT NULL,
    spec        JSONB NOT NULL,
    raw_yaml    TEXT,
    changed_by  UUID REFERENCES users(id),
    changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    comment     TEXT,
    UNIQUE (policy_id, version)
);

CREATE INDEX idx_policy_revisions_policy ON policy_revisions(policy_id);

-- ─── Compiled IR snapshots ─────────────────────────────────────────────────
CREATE TABLE ir_snapshots (
    id          UUID PRIMARY KEY,       -- matches IR.ID
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    version     BIGINT NOT NULL,
    ir          JSONB NOT NULL,
    applied     BOOLEAN NOT NULL DEFAULT FALSE,
    applied_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ir_snapshots_tenant ON ir_snapshots(tenant_id, applied);

-- ─── Firewall Rules (denormalized for fast reads) ──────────────────────────
CREATE TABLE firewall_rules (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    policy_id   UUID REFERENCES policies(id) ON DELETE SET NULL,
    name        TEXT NOT NULL,
    priority    INT NOT NULL DEFAULT 100,
    chain       TEXT NOT NULL,          -- input|forward|output
    action      TEXT NOT NULL,          -- accept|drop|reject
    protocol    TEXT,
    src_addrs   TEXT[],
    dst_addrs   TEXT[],
    src_ports   TEXT[],
    dst_ports   TEXT[],
    states      TEXT[],
    rate_limit  TEXT,
    log         BOOLEAN NOT NULL DEFAULT FALSE,
    comment     TEXT,
    enabled     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_firewall_rules_tenant ON firewall_rules(tenant_id);
CREATE INDEX idx_firewall_rules_priority ON firewall_rules(priority);

-- ─── Audit Log ────────────────────────────────────────────────────────────
CREATE TABLE audit_log (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id   UUID REFERENCES tenants(id) ON DELETE SET NULL,
    user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    action      TEXT NOT NULL,      -- CREATE_POLICY | APPLY_POLICY | ROLLBACK | etc
    resource    TEXT,               -- resource type
    resource_id TEXT,               -- resource uuid
    detail      JSONB,
    ip_address  INET,
    user_agent  TEXT,
    status      TEXT NOT NULL DEFAULT 'success',  -- success|failure
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_log_tenant ON audit_log(tenant_id);
CREATE INDEX idx_audit_log_created ON audit_log(created_at DESC);
CREATE INDEX idx_audit_log_action ON audit_log(action);

-- ─── IDS Alerts ────────────────────────────────────────────────────────────
CREATE TABLE ids_alerts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID REFERENCES tenants(id) ON DELETE SET NULL,
    timestamp       TIMESTAMPTZ NOT NULL,
    signature_id    BIGINT,
    signature_msg   TEXT,
    severity        INT,                -- 1=high, 2=med, 3=low
    category        TEXT,
    action          TEXT,               -- allowed|blocked
    src_ip          INET,
    dst_ip          INET,
    src_port        INT,
    dst_port        INT,
    protocol        TEXT,
    flow_id         BIGINT,
    payload_b64     TEXT,
    raw             JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ids_alerts_tenant ON ids_alerts(tenant_id);
CREATE INDEX idx_ids_alerts_timestamp ON ids_alerts(timestamp DESC);
CREATE INDEX idx_ids_alerts_severity ON ids_alerts(severity);
CREATE INDEX idx_ids_alerts_src_ip ON ids_alerts(src_ip);

-- ─── VPN Peers ────────────────────────────────────────────────────────────
CREATE TABLE vpn_peers (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    public_key      TEXT NOT NULL UNIQUE,
    preshared_key   TEXT,               -- encrypted at rest
    allowed_ips     TEXT[],
    endpoint        TEXT,
    keepalive       INT DEFAULT 25,
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    last_handshake  TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, name)
);

-- ─── Load Balancer Backends ────────────────────────────────────────────────
CREATE TABLE lb_backends (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    policy_id       UUID REFERENCES policies(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    address         TEXT NOT NULL,
    port            INT NOT NULL,
    weight          INT NOT NULL DEFAULT 1,
    enabled         BOOLEAN NOT NULL DEFAULT TRUE,
    health_status   TEXT NOT NULL DEFAULT 'unknown',  -- up|down|unknown
    last_check      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_lb_backends_tenant ON lb_backends(tenant_id);
CREATE INDEX idx_lb_backends_policy ON lb_backends(policy_id);

-- ─── Metrics Snapshots ─────────────────────────────────────────────────────
CREATE TABLE metrics_snapshots (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID REFERENCES tenants(id) ON DELETE SET NULL,
    timestamp       TIMESTAMPTZ NOT NULL,
    metric_name     TEXT NOT NULL,
    labels          JSONB,
    value           DOUBLE PRECISION NOT NULL
);

CREATE INDEX idx_metrics_snapshots_tenant_time ON metrics_snapshots(tenant_id, timestamp DESC);
CREATE INDEX idx_metrics_snapshots_name ON metrics_snapshots(metric_name);

-- ─── Partitioning helper: auto-prune old data ──────────────────────────────
-- Alerts older than 90 days are automatically dropped via a background job.
-- See internal/store/cleanup.go

COMMIT;
