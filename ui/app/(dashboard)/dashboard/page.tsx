"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Shield, AlertTriangle, Activity, CheckCircle2, XCircle,
  TrendingUp, TrendingDown, ArrowRight,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, BarChart, Bar, Cell,
} from "recharts";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/utils";
import { TrafficViz } from "@/components/dashboard/TrafficViz";

// ── Stable mock data (module-level — generated once per load) ──────────────
const seed = (n: number) => ((n * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

const trafficData = Array.from({ length: 24 }, (_, i) => ({
  hour:    `${String(i).padStart(2, "0")}:00`,
  allowed: Math.round(seed(i * 3 + 1) * 80000 + 20000),
  blocked: Math.round(seed(i * 3 + 2) * 4500  + 500),
}));

const alertBreakdown = [
  { name: "High",   value: 12,  fill: "#ef4444" },
  { name: "Medium", value: 45,  fill: "#f59e0b" },
  { name: "Low",    value: 134, fill: "#0ea5e9" },
];

const recentAlerts = [
  { msg: "ET SCAN Nmap SYN Scan",              src: "192.168.1.100", sev: "High",   time: "2m ago" },
  { msg: "ET DROP Spamhaus DROP Listed",       src: "10.0.5.22",     sev: "Medium", time: "5m ago" },
  { msg: "ET INFO Suspicious User-Agent",      src: "172.16.0.5",    sev: "Low",    time: "8m ago" },
  { msg: "ET WEB_SERVER Possible SQLi",        src: "203.0.113.50",  sev: "High",   time: "12m ago" },
  { msg: "ET POLICY PE EXE Download Windows", src: "8.8.8.8",        sev: "Medium", time: "18m ago" },
];

const sevBadge: Record<string, string> = {
  High:   "badge badge-red",
  Medium: "badge badge-yellow",
  Low:    "badge badge-blue",
};

// ─── Stat card ────────────────────────────────────────────────────────────
function StatCard({
  title, value, sub, icon: Icon, trend, trendUp, accent,
}: {
  title: string; value: string | number; sub?: string;
  icon: React.ElementType; trend?: string; trendUp?: boolean;
  accent: string; // Tailwind color classes for the left bar
}) {
  return (
    <div className={`card overflow-hidden flex`}>
      {/* Colored left bar */}
      <div className={`w-1 shrink-0 ${accent}`} />
      <div className="flex-1 p-4 flex items-start gap-3">
        <Icon className={`w-4 h-4 mt-0.5 shrink-0 text-slate-500`} />
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">{title}</p>
          <p className="text-2xl font-bold text-slate-100 mt-1 font-mono tabular-nums">
            {typeof value === "number" ? formatNumber(value) : value}
          </p>
          {sub && <p className="text-xs text-slate-600 mt-0.5">{sub}</p>}
        </div>
        {trend && (
          <div className={`flex items-center gap-1 text-xs font-medium shrink-0 ${trendUp ? "text-emerald-400" : "text-red-400"}`}>
            {trendUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {trend}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { data: fwStatus } = useQuery({
    queryKey: ["firewall-status"],
    queryFn:  () => api.getFirewallStatus(),
    refetchInterval: 15_000,
  });

  const { data: sysStatus } = useQuery({
    queryKey: ["system-status"],
    queryFn:  () => api.getSystemStatus(),
    refetchInterval: 30_000,
  });

  const { data: rules } = useQuery({
    queryKey: ["firewall-rules"],
    queryFn:  () => api.listFirewallRules(),
    refetchInterval: 30_000,
  });

  const isProtected = fwStatus?.status === "active";

  return (
    <div className="space-y-5">

      {/* Security posture banner */}
      <div className={`rounded-lg border px-4 py-3 flex items-center gap-4
        ${isProtected
          ? "bg-emerald-950/30 border-emerald-800/40"
          : "bg-slate-800/40 border-slate-700"
        }`}
      >
        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
          isProtected ? "bg-emerald-500/20" : "bg-slate-700"
        }`}>
          <Shield className={`w-4 h-4 ${isProtected ? "text-emerald-400" : "text-slate-500"}`} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            {isProtected && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse-slow" />
            )}
            <span className={`text-sm font-semibold ${isProtected ? "text-emerald-300" : "text-slate-400"}`}>
              {isProtected ? "Protected" : "Firewall Inactive"}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {isProtected
              ? `Firewall active · ${rules?.count ?? 0} rules loaded · No critical threats`
              : "Apply a firewall policy to start protecting your network"}
          </p>
        </div>
        {sysStatus && (
          <div className="hidden md:block text-right shrink-0">
            <p className="text-[10px] text-slate-600 uppercase tracking-wide">Uptime</p>
            <p className="text-sm font-mono text-slate-400">{sysStatus.uptime}</p>
          </div>
        )}
        <Link href="/firewall" className="hidden md:flex items-center gap-1 text-xs text-sky-500 hover:text-sky-400 transition-colors shrink-0">
          Manage <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {/* Live traffic visualization */}
      <TrafficViz />

      {/* Stats row */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard
          title="Active Rules"
          value={rules?.count ?? 0}
          sub="nftables loaded"
          icon={Shield}
          accent="bg-sky-500"
          trend="+3 today"
          trendUp
        />
        <StatCard
          title="Pkts Allowed"
          value={1_284_932}
          sub="last 24h"
          icon={CheckCircle2}
          accent="bg-emerald-500"
          trend="+12%"
          trendUp
        />
        <StatCard
          title="Pkts Blocked"
          value={48_201}
          sub="last 24h"
          icon={XCircle}
          accent="bg-red-500"
          trend="-8%"
          trendUp={false}
        />
        <StatCard
          title="IDS Alerts"
          value={191}
          sub="12 high sev"
          icon={AlertTriangle}
          accent="bg-amber-500"
          trend="+5 today"
          trendUp={false}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">

        {/* Traffic over time */}
        <div className="card p-5 xl:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-200">Traffic — Last 24h</h2>
              <p className="text-xs text-slate-500">Packets allowed vs blocked</p>
            </div>
            <Activity className="w-4 h-4 text-slate-600" />
          </div>
          <ResponsiveContainer width="100%" height={190}>
            <AreaChart data={trafficData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gradAllowed" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#0ea5e9" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradBlocked" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 4" stroke="#1e293b" />
              <XAxis dataKey="hour" tick={{ fill: "#475569", fontSize: 10 }} tickLine={false} axisLine={false} interval={3} />
              <YAxis tick={{ fill: "#475569", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={formatNumber} />
              <Tooltip
                contentStyle={{ background: "#0d1117", border: "1px solid #1e293b", borderRadius: "6px", fontSize: "12px" }}
                labelStyle={{ color: "#64748b" }}
                itemStyle={{ color: "#cbd5e1" }}
              />
              <Area type="monotone" dataKey="allowed" stroke="#0ea5e9" strokeWidth={1.5} fill="url(#gradAllowed)" name="Allowed" dot={false} />
              <Area type="monotone" dataKey="blocked" stroke="#ef4444" strokeWidth={1.5} fill="url(#gradBlocked)" name="Blocked" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Alert severity breakdown */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-200">Alert Severity</h2>
              <p className="text-xs text-slate-500">Last 24 hours</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={130}>
            <BarChart data={alertBreakdown} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="#1e293b" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: "#475569", fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: "#475569", fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ background: "#0d1117", border: "1px solid #1e293b", borderRadius: "6px", fontSize: "12px" }}
                labelStyle={{ color: "#64748b" }}
                cursor={{ fill: "#1e293b" }}
              />
              <Bar dataKey="value" name="Alerts" radius={[3, 3, 0, 0]} maxBarSize={40}>
                {alertBreakdown.map((entry, idx) => (
                  <Cell key={idx} fill={entry.fill} fillOpacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Legend */}
          <div className="mt-4 space-y-2">
            {alertBreakdown.map((d) => (
              <div key={d.name} className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.fill }} />
                <span className="text-xs text-slate-500 flex-1">{d.name}</span>
                <span className="text-xs font-mono font-semibold text-slate-300">{d.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">

        {/* Active rules */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200">Active Rules</h2>
            <Link href="/firewall" className="text-xs text-sky-500 hover:text-sky-400 transition-colors flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="divide-y divide-slate-800">
            {(rules?.items ?? []).slice(0, 5).map((rule, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-800/40 transition-colors">
                <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${
                  rule.action === "accept" ? "bg-emerald-900/50" : "bg-red-900/50"
                }`}>
                  {rule.action === "accept"
                    ? <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    : <XCircle      className="w-3 h-3 text-red-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-300 truncate">
                    {rule.comment || `Rule ${rule.priority}`}
                  </p>
                  <p className="text-[11px] text-slate-600 font-mono mt-0.5">chain: {rule.chain} · {rule.protocol || "any"}</p>
                </div>
                <span className={`badge text-[10px] ${rule.action === "accept" ? "badge-green" : "badge-red"}`}>
                  {rule.action.toUpperCase()}
                </span>
              </div>
            ))}
            {(rules?.count ?? 0) === 0 && (
              <div className="px-5 py-10 text-center">
                <Shield className="w-8 h-8 mx-auto mb-3 text-slate-700" />
                <p className="text-sm text-slate-500">No active rules</p>
                <p className="text-xs text-slate-600 mt-1">Apply a policy to start filtering traffic</p>
              </div>
            )}
          </div>
        </div>

        {/* Recent IDS alerts */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200">Recent IDS Alerts</h2>
            <Link href="/alerts" className="text-xs text-sky-500 hover:text-sky-400 transition-colors flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="divide-y divide-slate-800">
            {recentAlerts.map((alert, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-800/40 transition-colors">
                <span className={`${sevBadge[alert.sev]} shrink-0 text-[10px]`}>{alert.sev}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-300 truncate">{alert.msg}</p>
                  <p className="text-[11px] text-slate-600 font-mono mt-0.5">src {alert.src}</p>
                </div>
                <span className="text-[11px] text-slate-600 shrink-0">{alert.time}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}
