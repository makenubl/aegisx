# AegisX — MVP Timeline & Roadmap

## Phase 1 — Foundation MVP (Weeks 1–4)

**Goal:** Single-node deployment with working firewall management.

### Week 1–2: Core Infrastructure
- [x] Go module + project scaffold
- [x] PostgreSQL schema + migrations
- [x] Configuration system (Viper)
- [x] Structured logging (Zap)
- [x] Docker Compose for local dev
- [x] REST API server (Gin)
- [x] JWT authentication
- [ ] `go.sum` populated (`go mod tidy`)
- [ ] Unit tests: policy parser + validator

### Week 2–3: Policy Engine + Firewall Adapter
- [x] YAML policy DSL (FirewallPolicy, NATPolicy)
- [x] Policy parser (multi-doc YAML)
- [x] Intermediate Representation (IR)
- [x] Policy validator (semantic checks)
- [x] nftables translator (rules → nft syntax)
- [x] Atomic apply / rollback
- [x] Diff engine
- [ ] End-to-end test: apply a policy on real Ubuntu 22.04
- [ ] Hot-reload via inotify (fsnotify)

### Week 3–4: API + UI
- [x] Policy CRUD API (/api/v1/policies)
- [x] Firewall control API (/api/v1/firewall)
- [x] Auth endpoints
- [x] Next.js UI skeleton
- [x] Dashboard page (traffic charts, stats)
- [x] Firewall page (rule table, nftables viewer)
- [x] Policies page (CRUD + Monaco editor)
- [x] Alerts page
- [x] Login page
- [ ] Real data integration (remove mock data from charts)
- [ ] WebSocket for live rule updates

---

## Phase 2 — IDS/IPS + Load Balancer (Weeks 5–8)

**Goal:** Suricata inline mode + HAProxy management.

### Week 5–6: Suricata Integration
- [ ] Suricata adapter: socket control
- [ ] Rule reload without restart
- [ ] Alert ingestion (EVE JSON log parser)
- [ ] Alert storage in PostgreSQL
- [ ] Real-time alert stream (WebSocket → UI)
- [ ] IDS policy → Suricata rule translation
- [ ] Signature update scheduler

### Week 7–8: Load Balancer
- [ ] HAProxy config generator from IR
- [ ] HAProxy stats socket integration (backend health)
- [ ] Backend health visualization in UI
- [ ] LB page in UI (backends, weights, health)
- [ ] Envoy xDS adapter (stretch)

---

## Phase 3 — VPN + Observability (Weeks 9–12)

**Goal:** WireGuard management + full Grafana dashboards.

### Week 9–10: VPN
- [ ] WireGuard key generation (wgctrl)
- [ ] Peer add/remove/list
- [ ] Route management
- [ ] VPN page in UI (peer list, QR codes for mobile)
- [ ] Client config export (.conf file)

### Week 11–12: Observability
- [ ] Prometheus metrics (complete set)
- [ ] Grafana dashboard provisioning
- [ ] nftables counter export → Prometheus
- [ ] PCAP-on-demand (tcpdump via API trigger)
- [ ] Zeek integration (flow logs)
- [ ] Alert dashboard with trends

---

## Phase 4 — HA + Production Hardening (Weeks 13–16)

**Goal:** Two-node active/standby with automated failover.

- [ ] Keepalived VRRP for virtual IP
- [ ] PostgreSQL replication (streaming)
- [ ] Config sync between nodes
- [ ] Zero-downtime upgrade procedure
- [ ] mTLS between services
- [ ] Rate limiting on API (token bucket)
- [ ] RBAC: operator / viewer roles
- [ ] Multi-tenant: namespace isolation
- [ ] Kubernetes operator (CRD-based)

---

## Phase 5 — Stretch Features (Post v1.0)

- [ ] ML anomaly detection (PyTorch Lite / ONNX)
- [ ] eBPF dataplane offload (XDP drop rules)
- [ ] DPDK support (100 Gbps target)
- [ ] Plugin system (Go plugin API)
- [ ] Zeek scripting integration
- [ ] SSO / SAML / OAuth2 login
- [ ] GitOps workflow (policy-as-code from Git)
- [ ] Terraform provider
- [ ] CVE feed integration (auto-rule generation)

---

## Performance Targets

| Metric                      | MVP Target  | v1.0 Target |
|-----------------------------|-------------|-------------|
| Firewall throughput         | 1–5 Gbps    | 5–10 Gbps   |
| Connection table size       | 500K        | 2M          |
| API latency (p99)           | < 100ms     | < 20ms      |
| Rule apply time (cold)      | < 2s        | < 500ms     |
| Rollback time               | < 1s        | < 500ms     |
| HA failover time            | < 30s       | < 5s        |
| IDS alert throughput        | 5K eps      | 50K eps     |

---

## Security Hardening Checklist

### System
- [ ] Run API server as non-root (UID 1000)
- [ ] Run dataplane agent as root (separate process)
- [ ] AppArmor / SELinux profiles for all services
- [ ] Filesystem: `/etc/aegisx` mode 750, owned root:aegisx
- [ ] Secrets: use `AEGISX_*` env vars — never bake into images
- [ ] TLS: enforce TLSv1.2+ on API (TLSv1.3 preferred)
- [ ] Rotate JWT secret without downtime (JWKS endpoint)
- [ ] Audit log: every policy change recorded with user + IP
- [ ] Rate limit API endpoints (100 req/min per IP default)

### Firewall Default Posture
- [ ] Default INPUT policy: DROP
- [ ] Default FORWARD policy: DROP
- [ ] Default OUTPUT policy: ACCEPT (then tighten)
- [ ] Drop invalid conntrack state on INPUT
- [ ] Block ICMP redirects (accept_redirects=0)
- [ ] Enable RP filter (rp_filter=1)
- [ ] SYN cookies enabled (tcp_syncookies=1)
- [ ] Reject/drop null packets
- [ ] Log and drop Xmas/NULL/FIN scans
- [ ] Limit ICMP to 10/sec

### Network
- [ ] WireGuard: use pre-shared keys for additional PQ security
- [ ] HAProxy: disable SSLv3, TLSv1.0, TLSv1.1
- [ ] HAProxy: HSTS header on all HTTPS responses
- [ ] API: X-Frame-Options, X-Content-Type-Options, CSP headers
- [ ] Suricata: IPS mode with policy-based drop

### Container / K8s
- [ ] Read-only root filesystems
- [ ] No privileged containers (agent uses capabilities: NET_ADMIN only)
- [ ] Network policies: deny all except explicit allows
- [ ] Image scanning: Trivy in CI pipeline
- [ ] Non-root users in all Dockerfiles
- [ ] Pin base images to digest (not tag)
- [ ] Secrets in K8s Secrets (or Vault), not ConfigMaps
