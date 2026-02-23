# CybSuite — Architecture Reference

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CybSuite Platform                              │
├────────────────────────┬-───────────────────────────────────────────────────┤
│      CONTROL PLANE     │                   DATA PLANE                       │
│   (Go microservices)   │            (Linux kernel + daemons)                │
│                        │                                                    │
│  ┌─────────────────┐   │   ┌──────────┐  ┌──────────┐  ┌──────────────┐     │
│  │  Policy Engine  │───┼──▶│ nftables │  │ Suricata │  │  HAProxy /   │     │
│  │  (parser + IR)  │   │   │  (L3/L4) │  │ (IDS/IPS)│  │    Envoy     │     │
│  └────────┬────────┘   │   └──────────┘  └──────────┘  └──────────────┘     │
│           │            │                                                    │
│  ┌────────▼────────┐   │   ┌──────────┐  ┌──────────┐                       │
│  │  Firewall       │   │   │WireGuard │  │  Zeek    │                       │
│  │  Adapter        │───┼──▶│  (VPN)   │  │ Analytics│                       │
│  └─────────────────┘   │   └──────────┘  └──────────┘                       │
│  ┌─────────────────┐   │                                                    │
│  │  IDS/IPS        │   ├───────────────────────────────────────────────────-┤
│  │  Adapter        │   │                OBSERVABILITY                       │
│  └─────────────────┘   │   ┌──────────┐  ┌──────────┐  ┌──────────────┐     │
│  ┌─────────────────┐   │   │Prometheus│  │ Grafana  │  │  AlertMgr    │     │
│  │  LB Adapter     │   │   └──────────┘  └──────────┘  └──────────────┘     │
│  └─────────────────┘   │                                                    │
│  ┌─────────────────┐   ├───────────────────────────────────────────────────-┤
│  │  VPN Manager    │   │                  STORAGE                           │
│  └─────────────────┘   │   ┌──────────────────────────┐                     │
│  ┌─────────────────┐   │   │      PostgreSQL           │                    │
│  │  REST / gRPC    │   │   │  (policies, audit, state) │                    │
│  │  API Server     │◀──┼───└──────────────────────────┘                     │
│  └────────┬────────┘   │                                                    │
│           │            ├────────────────────────────────────────────────-───┤
│  ┌────────▼────────┐   │                    WEB UI                          │
│  │  Auth / RBAC    │   │   ┌──────────────────────────────────────────┐     │
│  └─────────────────┘   │   │  Next.js 14  (React + Tailwind + shadcn) │     │
│                        │   │  Dashboard │ Firewall │ Policies │ Alerts│     │
│                        │   └──────────────────────────────────────────┘     │
└────────────────────────┴──────────────────────────────────────────────────-─┘
```

## Component Responsibilities

| Component | Technology | Role |
|-----------|-----------|------|
| Policy Engine | Go | Parse YAML/HCL → IR → emit backend configs |
| Firewall Adapter | Go + nft CLI | Translate IR → nftables ruleset, hot-reload |
| IDS/IPS Adapter | Go + Suricata socket | Manage Suricata rules, inline blocking |
| LB Adapter | Go + HAProxy socket | Generate HAProxy/Envoy configs |
| VPN Manager | Go + wg CLI | WireGuard key/peer/route management |
| API Server | Go + Gin | REST + gRPC, auth, rate-limit |
| Auth/RBAC | Go + JWT | Multi-tenant, role-based access |
| Store | PostgreSQL + pgx | Policy history, audit log, state |
| Observability | Prometheus + Grafana | Metrics, flow logs, dashboards |
| Web UI | Next.js 14 | Management console |

## Policy Flow

```
YAML Policy
    │
    ▼
┌──────────┐    ┌──────────┐    ┌────────────────────┐
│  Parser  │───▶│    IR    │───▶│  Backend Translators│
│ (YAML)   │    │ (typed)  │    │  ┌─ nftables       │
└──────────┘    └──────────┘    │  ├─ Suricata rules  │
                                │  ├─ HAProxy cfg      │
                                │  └─ WireGuard cfg    │
                                └────────────────────┘
                                         │
                                         ▼
                                  ┌────────────┐
                                  │  Dataplane │
                                  │  (kernel)  │
                                  └────────────┘
```

## HA / Cluster Mode

```
         ┌─────────────┐
         │  VRRP/CARP  │  (keepalived)
         │  Virtual IP │
         └──────┬──────┘
         ┌──────┴──────┐
    ┌────▼────┐   ┌────▼────┐
    │ Node 1  │   │ Node 2  │
    │(primary)│   │(standby)│
    └────┬────┘   └────┬────┘
         └──────┬──────┘
         ┌──────▼──────┐
         │  PostgreSQL  │
         │  (shared /  │
         │  replicated)│
         └─────────────┘
```

## Security Zones

```
INTERNET ──▶ [WAN interface]
               │
               ▼
         [nftables pre-filter]   ← DROP invalid, rate-limit
               │
               ▼
         [Suricata IPS]          ← signature + protocol analysis
               │
         ┌─────┴──────┐
         ▼             ▼
      [DMZ]         [LAN]
    Web/LB        Internal
    HAProxy       services
```

## API Architecture

```
Client ──HTTPS──▶ API Gateway (Nginx/Caddy)
                        │
              ┌─────────┴──────────┐
              ▼                    ▼
        REST /api/v1          gRPC :9090
              │                    │
         ┌────┴────────────────────┘
         │        Go API Server
         │   (Gin router + middleware)
         │
    ┌────▼──────────────────────────┐
    │          Service Layer        │
    │  PolicySvc │ FirewallSvc │... │
    └────┬──────────────────────────┘
         │
    ┌────▼──────┐
    │ PostgreSQL │
    └────────────┘
```
