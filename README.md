# AegisX — Next-Generation Firewall + Load Balancer Platform

> **Open-source NGFW built on Linux nftables · Suricata · HAProxy · WireGuard · Zeek**

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Go Version](https://img.shields.io/badge/Go-1.22+-00ADD8.svg)](https://golang.org)

## What is AegisX?

AegisX is a single deployable platform combining:

| Module | Engine | Description |
|--------|--------|-------------|
| **Firewall** | Linux nftables | L3/L4 stateful packet filtering, NAT, ipsets |
| **IDS/IPS** | Suricata | Deep packet inspection, inline blocking |
| **Load Balancer** | HAProxy + Envoy | L4 TCP/UDP + L7 HTTP/gRPC, TLS termination |
| **VPN** | WireGuard | Site-to-site and remote access |
| **Analytics** | Zeek | Protocol analysis, flow logs |
| **Observability** | Prometheus + Grafana | Metrics, dashboards, alerting |
| **WAF** | Suricata + custom rules | HTTP anomaly detection |

## Architecture Principles

- **Never reimplement packet engines** — use Linux kernel dataplane
- **Control plane is the product** — orchestration, policy, RBAC, API, UI
- **Config-as-code** — all state is YAML policies stored in Postgres
- **Hot reload** — zero-downtime rule updates
- **Declarative policies** — human-readable DSL compiles to backend configs

## Quick Start

```bash
# Clone
git clone https://github.com/your-org/aegisx && cd aegisx

# Start with Docker Compose (dev)
cp .env.example .env
docker compose up -d

# UI is at http://localhost:3000
# API is at http://localhost:8080/api/v1
# Default credentials: admin / changeme
```

## Policy Example

```yaml
# /etc/aegisx/policies/web-policy.yaml
apiVersion: aegisx.io/v1
kind: FirewallPolicy
metadata:
  name: web-allow
  namespace: production
spec:
  rules:
    - name: allow-http-https
      action: ALLOW
      source:
        zones: [internet]
      destination:
        zones: [dmz]
        ports: [80, 443]
      protocol: tcp

    - name: block-everything-else
      action: DROP
      source:
        zones: [internet]
      destination:
        zones: [internal]
      priority: 9999

---
apiVersion: aegisx.io/v1
kind: LoadBalancerPolicy
metadata:
  name: web-lb
spec:
  frontend:
    bind: "0.0.0.0:80"
    mode: http
  backend:
    algorithm: least_conn
    servers:
      - address: 10.0.1.10:8080
        weight: 1
      - address: 10.0.1.11:8080
        weight: 1
    healthCheck:
      interval: 5s
      path: /healthz
```

## Directory Structure

```
aegisx/
├── cmd/
│   ├── aegisx-api/          # Control plane API server
│   ├── aegisx-agent/        # Dataplane agent (runs as root)
│   └── aegisx-cli/          # CLI management tool
├── internal/
│   ├── config/              # App configuration
│   ├── policy/              # Policy engine (parser + IR + validator)
│   ├── firewall/            # nftables adapter
│   ├── ids/                 # Suricata adapter
│   ├── lb/                  # HAProxy/Envoy adapter
│   ├── vpn/                 # WireGuard manager
│   ├── store/               # PostgreSQL data layer
│   ├── api/                 # REST/gRPC handlers
│   ├── metrics/             # Prometheus metrics
│   └── auth/                # JWT + RBAC
├── pkg/
│   ├── nftables/            # nftables Go client
│   └── logger/              # Structured logging
├── ui/                      # Next.js 14 web console
├── configs/examples/        # Example policy files
├── deploy/
│   ├── kubernetes/          # K8s manifests
│   └── ansible/             # Bare-metal provisioning
└── scripts/                 # Install + setup scripts
```

## Requirements

- Ubuntu 22.04 LTS (bare metal or VM)
- 4 vCPU / 8 GB RAM minimum
- 2 network interfaces (WAN + LAN)
- Docker 24+ (for containerized deployment)
- Go 1.22+ (for building from source)

## Roadmap

See [ROADMAP.md](docs/ROADMAP.md)

## License

Apache 2.0 — see [LICENSE](LICENSE)
