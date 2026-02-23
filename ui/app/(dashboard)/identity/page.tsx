"use client";

import { useState } from "react";
import {
  Users, User, Monitor, Smartphone, Lock, ShieldAlert,
  CheckCircle2, XCircle, AlertTriangle, Fingerprint, Wifi,
} from "lucide-react";

// ── Stable mock data ──────────────────────────────────────────────────────────
const sessions = [
  { user: "ahmed.malik",    role: "Finance",    device: "WIN-CORP-042",  type: "managed",   zone: "LAN",      risk: 8,  policy: "Finance-RBAC",    mfa: true  },
  { user: "sara.khan",      role: "DevOps",     device: "MAC-DEV-017",   type: "managed",   zone: "DMZ",      risk: 15, policy: "DevOps-Access",   mfa: true  },
  { user: "usman.ali",      role: "Exec",       device: "MAC-EXEC-003",  type: "managed",   zone: "LAN",      risk: 5,  policy: "Exec-Full",       mfa: true  },
  { user: "guest-user-91",  role: "Guest",      device: "iPhone-BYOD",   type: "byod",      zone: "GUEST",    risk: 42, policy: "Guest-Restricted",mfa: false },
  { user: "tariq.dev",      role: "Developer",  device: "LNX-DEV-009",   type: "managed",   zone: "DMZ",      risk: 22, policy: "Dev-Limited",     mfa: true  },
  { user: "fatima.ops",     role: "IT Admin",   device: "WIN-CORP-055",  type: "managed",   zone: "LAN",      risk: 12, policy: "IT-Admin",        mfa: true  },
  { user: "vpn-remote-04",  role: "Remote",     device: "Android-BYOD",  type: "unmanaged", zone: "VPN",      risk: 68, policy: "Remote-VPN",      mfa: false },
  { user: "ali.contractor", role: "Contractor", device: "WIN-PERS-211",  type: "unmanaged", zone: "VPN",      risk: 55, policy: "Contractor",      mfa: true  },
  { user: "bot-svc-api",    role: "Service",    device: "SVC-K8S-NODE",  type: "managed",   zone: "INTERNAL", risk: 3,  policy: "ServiceAccount",  mfa: false },
];

const violations = [
  { user: "vpn-remote-04",  event: "Access to Finance zone blocked",      risk: "High",   time: "3m ago"  },
  { user: "guest-user-91",  event: "Lateral movement attempt detected",   risk: "High",   time: "12m ago" },
  { user: "ali.contractor", event: "Admin portal access denied",           risk: "Medium", time: "28m ago" },
  { user: "tariq.dev",      event: "Attempted DNS exfiltration blocked",   risk: "High",   time: "1h ago"  },
];

const posture = [
  { name: "Managed",    value: 6, fill: "#10b981" },
  { name: "BYOD",       value: 2, fill: "#f59e0b" },
  { name: "Unmanaged",  value: 1, fill: "#ef4444" },
];

const zoneBreakdown = [
  { name: "LAN",      value: 3, fill: "#0ea5e9" },
  { name: "DMZ",      value: 2, fill: "#8b5cf6" },
  { name: "VPN",      value: 2, fill: "#06b6d4" },
  { name: "GUEST",    value: 1, fill: "#f59e0b" },
  { name: "INTERNAL", value: 1, fill: "#10b981" },
];

const riskBadge: Record<string, string> = {
  High:   "badge badge-red",
  Medium: "badge badge-yellow",
  Low:    "badge badge-blue",
};

const ZONES = ["All", "LAN", "DMZ", "VPN", "GUEST", "INTERNAL"];

// ── Risk bar ─────────────────────────────────────────────────────────────────
function RiskBar({ score }: { score: number }) {
  const color =
    score < 20 ? "bg-emerald-500" :
    score < 40 ? "bg-amber-500"   :
    score < 60 ? "bg-orange-500"  : "bg-red-500";
  const textColor =
    score < 20 ? "text-emerald-400" :
    score < 40 ? "text-amber-400"   :
    score < 60 ? "text-orange-400"  : "text-red-400";

  return (
    <div className="flex items-center gap-2 min-w-[80px]">
      <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className={`text-[11px] font-mono font-semibold w-6 text-right ${textColor}`}>
        {score}
      </span>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function IdentityPage() {
  const [zoneFilter, setZoneFilter] = useState("All");

  const filtered = zoneFilter === "All"
    ? sessions
    : sessions.filter((s) => s.zone === zoneFilter);

  const mfaCount = sessions.filter((s) => s.mfa).length;

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Identity & Access</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Zero Trust enforcement · User-aware policies · Device posture
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-md
                        bg-violet-500/10 border border-violet-500/30">
          <Fingerprint className="w-3.5 h-3.5 text-violet-400" />
          <span className="text-xs text-violet-300 font-medium">Zero Trust Active</span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {[
          { title: "Active Sessions",   value: sessions.length,             sub: "across all zones",  accent: "bg-sky-500",    Icon: Users       },
          { title: "High-Risk Users",   value: "3",                         sub: "score > 50",        accent: "bg-red-500",    Icon: ShieldAlert },
          { title: "Policy Violations", value: violations.length,           sub: "last 24h",          accent: "bg-amber-500",  Icon: AlertTriangle },
          { title: "MFA Enforced",      value: `${mfaCount}/${sessions.length}`, sub: "sessions verified", accent: "bg-emerald-500", Icon: Lock    },
        ].map((s) => (
          <div key={s.title} className="card overflow-hidden flex">
            <div className={`w-1 shrink-0 ${s.accent}`} />
            <div className="flex-1 p-4 flex items-start gap-3">
              <s.Icon className="w-4 h-4 mt-0.5 text-slate-500 shrink-0" />
              <div>
                <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">{s.title}</p>
                <p className="text-2xl font-bold font-mono text-slate-100 mt-1">{s.value}</p>
                <p className="text-xs text-slate-600 mt-0.5">{s.sub}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Posture + Violations */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">

        {/* Posture + Zone */}
        <div className="card p-5 space-y-5">
          <div>
            <h2 className="text-sm font-semibold text-slate-200 mb-3">Device Posture</h2>
            <div className="space-y-2.5">
              {posture.map((p) => (
                <div key={p.name} className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.fill }} />
                  <span className="text-xs text-slate-500 w-20">{p.name}</span>
                  <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all"
                         style={{ width: `${(p.value / sessions.length) * 100}%`, background: p.fill }} />
                  </div>
                  <span className="text-xs font-mono font-semibold text-slate-300 w-4 text-right">
                    {p.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-slate-200 mb-3">Sessions by Zone</h2>
            <div className="space-y-2.5">
              {zoneBreakdown.map((z) => (
                <div key={z.name} className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: z.fill }} />
                  <span className="text-xs font-mono text-slate-500 w-20">{z.name}</span>
                  <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full rounded-full"
                         style={{ width: `${(z.value / sessions.length) * 100}%`, background: z.fill }} />
                  </div>
                  <span className="text-xs font-mono font-semibold text-slate-300 w-4 text-right">
                    {z.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Policy violations */}
        <div className="card overflow-hidden xl:col-span-2">
          <div className="px-5 py-4 border-b border-slate-800">
            <h2 className="text-sm font-semibold text-slate-200">Recent Policy Violations</h2>
            <p className="text-xs text-slate-500">Blocked access by identity policy</p>
          </div>
          <div className="divide-y divide-slate-800">
            {violations.map((v, i) => (
              <div key={i} className="px-5 py-3.5 flex items-center gap-3 hover:bg-slate-800/40 transition-colors">
                <div className="w-7 h-7 rounded-full bg-red-950/60 flex items-center justify-center shrink-0">
                  <XCircle className="w-3.5 h-3.5 text-red-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-300 truncate">{v.event}</p>
                  <p className="text-[11px] text-slate-600 font-mono mt-0.5">user: {v.user}</p>
                </div>
                <span className={`${riskBadge[v.risk]} shrink-0`}>{v.risk}</span>
                <span className="text-[11px] text-slate-600 shrink-0">{v.time}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Sessions table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-200">Active Sessions</h2>
            <p className="text-xs text-slate-500">{filtered.length} of {sessions.length}</p>
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            {ZONES.map((z) => (
              <button key={z} onClick={() => setZoneFilter(z)}
                className={`px-2 py-1 text-[11px] font-mono rounded font-medium transition-colors ${
                  zoneFilter === z
                    ? "bg-violet-700 text-white"
                    : "text-slate-600 hover:text-slate-400 hover:bg-slate-800"
                }`}>
                {z}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800">
                {["User", "Role", "Device", "Zone", "Risk Score", "Policy", "MFA", "Status"].map((h) => (
                  <th key={h} className="table-header">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, i) => {
                const DevIcon =
                  s.type === "managed" ? Monitor :
                  s.type === "byod"    ? Smartphone : Wifi;
                const devColor =
                  s.type === "managed"   ? "text-emerald-500" :
                  s.type === "byod"      ? "text-amber-500"   : "text-red-500";

                return (
                  <tr key={i} className="table-row">
                    <td className="table-cell">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center shrink-0">
                          <User className="w-3 h-3 text-slate-500" />
                        </div>
                        <span className="text-xs font-mono text-slate-200">{s.user}</span>
                      </div>
                    </td>
                    <td className="table-cell text-xs text-slate-500">{s.role}</td>
                    <td className="table-cell">
                      <div className="flex items-center gap-1.5">
                        <DevIcon className={`w-3 h-3 shrink-0 ${devColor}`} />
                        <span className="text-[11px] font-mono text-slate-500 truncate max-w-[110px]">
                          {s.device}
                        </span>
                      </div>
                    </td>
                    <td className="table-cell">
                      <code className="text-[11px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-400 font-mono">
                        {s.zone}
                      </code>
                    </td>
                    <td className="table-cell w-36">
                      <RiskBar score={s.risk} />
                    </td>
                    <td className="table-cell text-[11px] text-slate-500 font-mono">{s.policy}</td>
                    <td className="table-cell">
                      {s.mfa
                        ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        : <XCircle      className="w-3.5 h-3.5 text-red-500" />}
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse-slow" />
                        <span className="text-[11px] text-emerald-500">Active</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
