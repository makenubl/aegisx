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

// ─── API client ────────────────────────────────────────────────────────────

class AegisXAPI {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: "/api/v1",
      timeout: 30000,
      headers: { "Content-Type": "application/json" },
    });

    // Attach JWT token from localStorage
    this.client.interceptors.request.use((config) => {
      const token = localStorage.getItem("aegisx_token");
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    // Handle 401 — redirect to login
    this.client.interceptors.response.use(
      (res) => res,
      (err) => {
        if (err.response?.status === 401) {
          localStorage.removeItem("aegisx_token");
          window.location.href = "/login";
        }
        return Promise.reject(err);
      }
    );
  }

  // ── Auth ──────────────────────────────────────────────────────────────
  async login(username: string, password: string): Promise<LoginResponse> {
    const { data } = await this.client.post<LoginResponse>("/auth/login", {
      username,
      password,
    });
    localStorage.setItem("aegisx_token", data.token);
    return data;
  }

  async logout(): Promise<void> {
    await this.client.post("/auth/logout").catch(() => {});
    localStorage.removeItem("aegisx_token");
  }

  // ── Policies ─────────────────────────────────────────────────────────
  async listPolicies(kind?: string): Promise<{ items: Policy[]; count: number }> {
    const { data } = await this.client.get("/policies", { params: { kind } });
    return data;
  }

  async getPolicy(id: string): Promise<Policy> {
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
    const { data } = await this.client.post(`/policies/${id}/apply`);
    return data;
  }

  async diffPolicy(id: string): Promise<{ diff: string }> {
    const { data } = await this.client.get(`/policies/${id}/diff`);
    return data;
  }

  async listPolicyRevisions(id: string): Promise<{ items: unknown[] }> {
    const { data } = await this.client.get(`/policies/${id}/revisions`);
    return data;
  }

  // ── Firewall ─────────────────────────────────────────────────────────
  async getFirewallStatus(): Promise<FirewallStatus> {
    const { data } = await this.client.get("/firewall/status");
    return data;
  }

  async listFirewallRules(): Promise<{ items: FirewallRule[]; count: number }> {
    const { data } = await this.client.get("/firewall/rules");
    return data;
  }

  async applyFirewall(): Promise<{ status: string }> {
    const { data } = await this.client.post("/firewall/apply");
    return data;
  }

  async rollbackFirewall(): Promise<{ status: string }> {
    const { data } = await this.client.post("/firewall/rollback");
    return data;
  }

  async flushFirewall(): Promise<{ status: string }> {
    const { data } = await this.client.post("/firewall/flush");
    return data;
  }

  // ── System ────────────────────────────────────────────────────────────
  async getSystemStatus(): Promise<SystemStatus> {
    const { data } = await this.client.get("/status");
    return data;
  }
}

export const api = new AegisXAPI();
