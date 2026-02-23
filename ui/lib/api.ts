import axios, { AxiosInstance } from "axios";

// ─── Types ────────────────────────────────────────────────────────────────

export interface Policy {
  id: string;
  tenantId: string;
  name: string;
  namespace: string;
  kind: "FirewallPolicy" | "LoadBalancerPolicy" | "VPNPolicy" | "NATPolicy" | "IDSPolicy";
  version: number;
  spec: Record<string, unknown>;
  rawYaml?: string;
  enabled: boolean;
  appliedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FirewallRule {
  priority: number;
  chain: string;
  action: string;
  protocol: string;
  srcAddrs: string[];
  dstAddrs: string[];
  srcPorts: string[];
  dstPorts: string[];
  states: string[];
  rateLimit: string;
  log: boolean;
  comment: string;
}

export interface FirewallStatus {
  status: "active" | "inactive" | "unknown";
  ruleset: string;
  irId?: string;
  irVersion?: number;
  appliedAt?: string;
  ruleCount?: number;
}

export interface IDSAlert {
  id: string;
  timestamp: string;
  signatureId: number;
  signatureMsg: string;
  severity: number;
  category: string;
  action: string;
  srcIp: string;
  dstIp: string;
  srcPort: number;
  dstPort: number;
  protocol: string;
}

export interface SystemStatus {
  status: string;
  version: string;
  uptime: string;
  goroutines: number;
}

export interface LoginResponse {
  token: string;
  refreshToken: string;
  expiresIn: number;
  role: string;
}

// ─── Demo-mode sentinel ───────────────────────────────────────────────────
// Activates when the backend is unreachable (static CloudFront deploy / local demo).
const DEMO_TOKEN = "aegisx-demo-v1";
const isDemoMode = () =>
  typeof window !== "undefined" && localStorage.getItem("aegisx_token") === DEMO_TOKEN;

// ─── Mock data ────────────────────────────────────────────────────────────
const _applied = new Date(Date.now() - 2 * 3_600_000).toISOString();
const _created = new Date(Date.now() - 7 * 86_400_000).toISOString();

const MOCK = {
  login: {
    token: DEMO_TOKEN,
    refreshToken: "demo-refresh-token",
    expiresIn: 86400,
    role: "admin",
  } satisfies LoginResponse,

  systemStatus: {
    status: "healthy",
    version: "0.1.0",
    uptime: "3d 14h 22m",
    goroutines: 42,
  } satisfies SystemStatus,

  firewallStatus: {
    status: "active" as const,
    irId: "ir-20240224-001",
    irVersion: 4,
    appliedAt: _applied,
    ruleCount: 8,
    ruleset: `# AegisX nftables ruleset — applied ${new Date(_applied).toLocaleString()}
table inet aegisx_filter {
  chain input {
    type filter hook input priority 0; policy drop;
    ct state invalid drop comment "Drop invalid"
    ct state { established, related } accept comment "Allow established"
    ip protocol icmp accept comment "Allow ICMP"
    tcp dport 22 ip saddr 10.0.0.0/8 limit rate 3/minute accept comment "Rate-limited SSH"
    ip saddr { 0.0.0.0/8, 127.0.0.0/8, 169.254.0.0/16 } drop comment "Block bogons"
    log prefix "[AEGISX DROP] " drop comment "Default deny"
  }
  chain forward {
    type filter hook forward priority 0; policy drop;
    ct state { established, related } accept
    tcp dport { 80, 443 } ip daddr 10.0.1.0/24 accept comment "Allow web to DMZ"
    udp dport 53 accept comment "Allow DNS"
    log prefix "[AEGISX FWD DROP] " drop
  }
  chain output {
    type filter hook output priority 0; policy accept;
  }
}`,
  } satisfies FirewallStatus,

  firewallRules: [
    { priority: 1,    chain: "input",   action: "drop",   protocol: "",     srcAddrs: [],                                                           dstAddrs: [],              srcPorts: [], dstPorts: [],          states: ["invalid"],               rateLimit: "",         log: false, comment: "Drop invalid connection states"     },
    { priority: 10,   chain: "input",   action: "accept", protocol: "",     srcAddrs: [],                                                           dstAddrs: [],              srcPorts: [], dstPorts: [],          states: ["established", "related"], rateLimit: "",         log: false, comment: "Allow established/related"          },
    { priority: 20,   chain: "input",   action: "accept", protocol: "icmp", srcAddrs: [],                                                           dstAddrs: [],              srcPorts: [], dstPorts: [],          states: [],                         rateLimit: "",         log: false, comment: "Allow ICMP ping"                    },
    { priority: 30,   chain: "input",   action: "accept", protocol: "tcp",  srcAddrs: ["10.0.0.0/8"],                                               dstAddrs: [],              srcPorts: [], dstPorts: ["22"],      states: [],                         rateLimit: "3/minute", log: true,  comment: "Rate-limited SSH (management only)" },
    { priority: 5,    chain: "input",   action: "drop",   protocol: "",     srcAddrs: ["0.0.0.0/8", "127.0.0.0/8", "169.254.0.0/16"],              dstAddrs: [],              srcPorts: [], dstPorts: [],          states: [],                         rateLimit: "",         log: false, comment: "Block bogon addresses"              },
    { priority: 100,  chain: "forward", action: "accept", protocol: "tcp",  srcAddrs: [],                                                           dstAddrs: ["10.0.1.0/24"], srcPorts: [], dstPorts: ["80","443"],states: [],                         rateLimit: "",         log: true,  comment: "Allow HTTP/HTTPS to DMZ"            },
    { priority: 50,   chain: "forward", action: "accept", protocol: "udp",  srcAddrs: [],                                                           dstAddrs: [],              srcPorts: [], dstPorts: ["53"],      states: [],                         rateLimit: "",         log: false, comment: "Allow DNS resolution"               },
    { priority: 9999, chain: "input",   action: "drop",   protocol: "",     srcAddrs: [],                                                           dstAddrs: [],              srcPorts: [], dstPorts: [],          states: [],                         rateLimit: "",         log: true,  comment: "Default deny with logging"          },
  ] as FirewallRule[],

  policies: [
    {
      id: "pol-001", tenantId: "tenant-demo", name: "web-dmz",      namespace: "production",
      kind: "FirewallPolicy" as const,     version: 4, enabled: true,
      appliedAt: _applied, createdAt: _created, updatedAt: _applied,
      spec: { defaultAction: "DROP", rules: [] },
      rawYaml: [
        "apiVersion: aegisx.io/v1",
        "kind: FirewallPolicy",
        "metadata:",
        "  name: web-dmz",
        "  namespace: production",
        "spec:",
        "  defaultAction: DROP",
        "  rules:",
        "    - name: allow-http",
        "      priority: 100",
        "      action: ALLOW",
        "      protocol: tcp",
        "      destination:",
        "        addresses: [\"10.0.1.0/24\"]",
        "        ports: [80, 443]",
        "      state: [new, established]",
        "      log: true",
        "      comment: \"Allow web traffic to DMZ\"",
        "    - name: allow-established",
        "      priority: 200",
        "      action: ALLOW",
        "      state: [established, related]",
        "    - name: rate-limit-ssh",
        "      priority: 300",
        "      action: ALLOW",
        "      protocol: tcp",
        "      source:",
        "        addresses: [\"10.0.0.0/8\"]",
        "      destination:",
        "        ports: [22]",
        "      rateLimit:",
        "        rate: \"3/minute\"",
        "        burst: 5",
        "      log: true",
        "    - name: block-bogons",
        "      priority: 50",
        "      action: DROP",
        "      source:",
        "        addresses: [\"0.0.0.0/8\",\"127.0.0.0/8\",\"169.254.0.0/16\"]",
        "    - name: deny-all-log",
        "      priority: 9999",
        "      action: DROP",
        "      log: true",
        "      comment: \"Default deny with log\"",
      ].join("\n"),
    },
    {
      id: "pol-002", tenantId: "tenant-demo", name: "internet-nat",  namespace: "production",
      kind: "NATPolicy" as const,          version: 2, enabled: true,
      appliedAt: _applied, createdAt: _created, updatedAt: _applied,
      spec: { rules: [] },
      rawYaml: [
        "apiVersion: aegisx.io/v1",
        "kind: NATPolicy",
        "metadata:",
        "  name: internet-nat",
        "  namespace: production",
        "spec:",
        "  rules:",
        "    - name: masquerade-lan",
        "      type: MASQUERADE",
        "      source: \"10.0.0.0/8\"",
        "      outInterface: eth0",
        "    - name: dnat-web",
        "      type: DNAT",
        "      destination: \"203.0.113.1\"",
        "      toDest: \"10.0.1.10:80\"",
      ].join("\n"),
    },
    {
      id: "pol-003", tenantId: "tenant-demo", name: "web-lb",        namespace: "production",
      kind: "LoadBalancerPolicy" as const, version: 1, enabled: true,
      appliedAt: _applied, createdAt: _created, updatedAt: _applied,
      spec: {},
      rawYaml: [
        "apiVersion: aegisx.io/v1",
        "kind: LoadBalancerPolicy",
        "metadata:",
        "  name: web-lb",
        "  namespace: production",
        "spec:",
        "  frontend:",
        "    bind: \"0.0.0.0:80\"",
        "    mode: http",
        "    maxConn: 50000",
        "  backend:",
        "    algorithm: leastconn",
        "    servers:",
        "      - name: web1",
        "        address: \"10.0.1.10:8080\"",
        "        weight: 1",
        "      - name: web2",
        "        address: \"10.0.1.11:8080\"",
        "        weight: 1",
        "    healthCheck:",
        "      interval: \"5s\"",
        "      path: \"/healthz\"",
      ].join("\n"),
    },
    {
      id: "pol-004", tenantId: "tenant-demo", name: "branch-vpn",    namespace: "production",
      kind: "VPNPolicy" as const,          version: 1, enabled: true,
      appliedAt: undefined, createdAt: _created, updatedAt: _created,
      spec: {},
      rawYaml: [
        "apiVersion: aegisx.io/v1",
        "kind: VPNPolicy",
        "metadata:",
        "  name: branch-vpn",
        "  namespace: production",
        "spec:",
        "  interface: wg0",
        "  listenPort: 51820",
        "  address: \"10.200.0.1/24\"",
        "  peers:",
        "    - name: branch-office",
        "      allowedIPs:",
        "        - \"10.200.0.2/32\"",
        "        - \"192.168.10.0/24\"",
        "      keepAlive: 25",
      ].join("\n"),
    },
    {
      id: "pol-005", tenantId: "tenant-demo", name: "custom-ids",    namespace: "production",
      kind: "IDSPolicy" as const,          version: 3, enabled: true,
      appliedAt: _applied, createdAt: _created, updatedAt: _applied,
      spec: {},
      rawYaml: [
        "apiVersion: aegisx.io/v1",
        "kind: IDSPolicy",
        "metadata:",
        "  name: custom-ids",
        "  namespace: production",
        "spec:",
        "  mode: ips",
        "  ruleSets:",
        "    - emerging-threats",
        "    - suricata-main",
        "  customRules:",
        "    - id: local-1000001",
        "      message: \"Block outbound to known C2 ports\"",
        "      enabled: true",
        "      rule: >",
        "        drop tcp $HOME_NET any -> $EXTERNAL_NET [4444,8080,8443]",
        "        (msg:\"Block potential C2 egress\"; sid:1000001; rev:1;)",
      ].join("\n"),
    },
  ] satisfies Policy[],
};

// ─── API client ────────────────────────────────────────────────────────────

class AegisXAPI {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: "/api/v1",
      timeout: 8000,
      headers: { "Content-Type": "application/json" },
    });

    // Attach JWT — skip the demo sentinel token
    this.client.interceptors.request.use((config) => {
      const token = localStorage.getItem("aegisx_token");
      if (token && token !== DEMO_TOKEN) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    // Handle 401 — skip redirect when in demo mode
    this.client.interceptors.response.use(
      (res) => res,
      (err) => {
        if (err.response?.status === 401 && !isDemoMode()) {
          localStorage.removeItem("aegisx_token");
          window.location.href = "/login";
        }
        return Promise.reject(err);
      }
    );
  }

  /**
   * True when the backend is unavailable — covers:
   *  - Network errors (no HTTP response at all)
   *  - 403/404 from S3/CloudFront when no backend origin is configured
   *  - 5xx server errors
   */
  private isUnavailable(err: unknown): boolean {
    if (!axios.isAxiosError(err)) return false;
    if (!err.response) return true;
    const s = err.response.status;
    return s === 403 || s === 404 || s >= 500;
  }

  // ── Auth ──────────────────────────────────────────────────────────────
  async login(username: string, password: string): Promise<LoginResponse> {
    try {
      const { data } = await this.client.post<LoginResponse>("/auth/login", {
        username,
        password,
      });
      localStorage.setItem("aegisx_token", data.token);
      return data;
    } catch (err) {
      if (this.isUnavailable(err)) {
        // Backend unreachable — activate demo mode automatically
        localStorage.setItem("aegisx_token", DEMO_TOKEN);
        return MOCK.login;
      }
      throw err;
    }
  }

  async logout(): Promise<void> {
    await this.client.post("/auth/logout").catch(() => {});
    localStorage.removeItem("aegisx_token");
  }

  // ── Policies ─────────────────────────────────────────────────────────
  async listPolicies(kind?: string): Promise<{ items: Policy[]; count: number }> {
    if (isDemoMode()) {
      const items = kind ? MOCK.policies.filter((p) => p.kind === kind) : MOCK.policies;
      return { items, count: items.length };
    }
    try {
      const { data } = await this.client.get("/policies", { params: { kind } });
      return data;
    } catch (err) {
      if (this.isUnavailable(err)) {
        const items = kind ? MOCK.policies.filter((p) => p.kind === kind) : MOCK.policies;
        return { items, count: items.length };
      }
      throw err;
    }
  }

  async getPolicy(id: string): Promise<Policy> {
    if (isDemoMode()) return MOCK.policies.find((p) => p.id === id) ?? MOCK.policies[0];
    const { data } = await this.client.get(`/policies/${id}`);
    return data;
  }

  async createPolicy(payload: {
    name: string;
    namespace?: string;
    kind: string;
    spec: Record<string, unknown>;
    rawYaml?: string;
    enabled?: boolean;
  }): Promise<Policy> {
    const { data } = await this.client.post("/policies", payload);
    return data;
  }

  async updatePolicy(
    id: string,
    payload: { spec?: Record<string, unknown>; rawYaml?: string; enabled?: boolean }
  ): Promise<Policy> {
    const { data } = await this.client.put(`/policies/${id}`, payload);
    return data;
  }

  async deletePolicy(id: string): Promise<void> {
    await this.client.delete(`/policies/${id}`);
  }

  async applyPolicy(id: string): Promise<{ status: string; policyId: string }> {
    if (isDemoMode()) return { status: "applied", policyId: id };
    const { data } = await this.client.post(`/policies/${id}/apply`);
    return data;
  }

  async diffPolicy(id: string): Promise<{ diff: string }> {
    if (isDemoMode()) return { diff: "# No diff available in demo mode" };
    const { data } = await this.client.get(`/policies/${id}/diff`);
    return data;
  }

  async listPolicyRevisions(id: string): Promise<{ items: unknown[] }> {
    if (isDemoMode()) return { items: [] };
    const { data } = await this.client.get(`/policies/${id}/revisions`);
    return data;
  }

  // ── Firewall ─────────────────────────────────────────────────────────
  async getFirewallStatus(): Promise<FirewallStatus> {
    if (isDemoMode()) return MOCK.firewallStatus;
    try {
      const { data } = await this.client.get("/firewall/status");
      return data;
    } catch (err) {
      if (this.isUnavailable(err)) return MOCK.firewallStatus;
      throw err;
    }
  }

  async listFirewallRules(): Promise<{ items: FirewallRule[]; count: number }> {
    if (isDemoMode()) return { items: MOCK.firewallRules, count: MOCK.firewallRules.length };
    try {
      const { data } = await this.client.get("/firewall/rules");
      return data;
    } catch (err) {
      if (this.isUnavailable(err)) return { items: MOCK.firewallRules, count: MOCK.firewallRules.length };
      throw err;
    }
  }

  async applyFirewall(): Promise<{ status: string }> {
    if (isDemoMode()) return { status: "applied" };
    const { data } = await this.client.post("/firewall/apply");
    return data;
  }

  async rollbackFirewall(): Promise<{ status: string }> {
    if (isDemoMode()) return { status: "rolled back" };
    const { data } = await this.client.post("/firewall/rollback");
    return data;
  }

  async flushFirewall(): Promise<{ status: string }> {
    if (isDemoMode()) return { status: "flushed" };
    const { data } = await this.client.post("/firewall/flush");
    return data;
  }

  // ── System ────────────────────────────────────────────────────────────
  async getSystemStatus(): Promise<SystemStatus> {
    if (isDemoMode()) return MOCK.systemStatus;
    try {
      const { data } = await this.client.get("/status");
      return data;
    } catch (err) {
      if (this.isUnavailable(err)) return MOCK.systemStatus;
      throw err;
    }
  }
}

export const api = new AegisXAPI();
