"use client";

import { useState } from "react";
import { Bug, ShieldAlert, Zap, Target, AlertTriangle } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell,
} from "recharts";

// ── Stable mock data ──────────────────────────────────────────────────────────
const seed = (n: number) => ((n * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

const threatTimeline = Array.from({ length: 24 }, (_, i) => ({
  hour:     `${String(i).padStart(2, "0")}:00`,
  exploits: Math.round(seed(i * 5 + 1) * 20),
  malware:  Math.round(seed(i * 5 + 2) * 8),
  c2:       Math.round(seed(i * 5 + 3) * 5),
}));

const sevBreakdown = [
  { name: "Critical", value: 4, fill: "#dc2626" },
  { name: "High",     value: 5, fill: "#ef4444" },
  { name: "Medium",   value: 2, fill: "#f59e0b" },
  { name: "Low",      value: 1, fill: "#0ea5e9" },
];

const ipsEvents = [
  { id: "CVE-2024-21413", sig: "Microsoft Outlook RCE Exploit",          src: "203.0.113.42",   dst: "10.0.1.15",    sev: "Critical", action: "block", cat: "Exploit", time: "1m ago"  },
  { id: "CVE-2024-3400",  sig: "PAN-OS Command Injection",               src: "198.51.100.7",   dst: "10.0.0.1",     sev: "Critical", action: "block", cat: "Exploit", time: "4m ago"  },
  { id: "ET-MAL-001",     sig: "Emotet Banking Trojan Callback",         src: "10.0.2.55",      dst: "91.200.45.3",  sev: "High",     action: "block", cat: "Malware", time: "7m ago"  },
  { id: "CVE-2023-44487", sig: "HTTP/2 Rapid Reset DoS",                 src: "185.220.101.9",  dst: "10.0.0.80",    sev: "High",     action: "block", cat: "DoS",     time: "11m ago" },
  { id: "ET-C2-7721",     sig: "Cobalt Strike Beacon C2 Check-In",       src: "10.0.3.88",      dst: "45.33.32.156", sev: "High",     action: "block", cat: "C2",      time: "15m ago" },
  { id: "CVE-2023-23397", sig: "Outlook NTLM Hash Theft",                src: "10.0.1.42",      dst: "172.16.5.1",   sev: "High",     action: "block", cat: "Exploit", time: "22m ago" },
  { id: "ET-SCAN-002",    sig: "Nmap TCP SYN Port Scan",                 src: "192.168.5.100",  dst: "10.0.0.0/24",  sev: "Medium",   action: "alert", cat: "Recon",   time: "28m ago" },
  { id: "CVE-2021-44228", sig: "Log4Shell JNDI Injection Attempt",       src: "104.21.14.89",   dst: "10.0.1.20",    sev: "Critical", action: "block", cat: "Exploit", time: "34m ago" },
  { id: "ET-MAL-442",     sig: "RedLine Stealer HTTP POST Exfil",        src: "10.0.4.11",      dst: "77.91.124.55", sev: "High",     action: "block", cat: "Malware", time: "41m ago" },
  { id: "CVE-2024-1709",  sig: "ConnectWise Auth Bypass",                src: "91.92.241.44",   dst: "10.0.1.50",    sev: "Critical", action: "block", cat: "Exploit", time: "1h ago"  },
  { id: "ET-DNS-C2-005",  sig: "DNS Tunneling Exfiltration Detected",    src: "10.0.5.33",      dst: "8.8.8.8",      sev: "High",     action: "block", cat: "C2",      time: "1h ago"  },
  { id: "ET-POLICY-101",  sig: "P2P BitTorrent DHT Protocol",            src: "10.0.2.77",      dst: "any",          sev: "Low",      action: "alert", cat: "Policy",  time: "55m ago" },
];

const sevBadge: Record<string, string> = {
  Critical: "badge badge-red",
  High:     "badge badge-red",
  Medium:   "badge badge-yellow",
  Low:      "badge badge-blue",
};

const catColor: Record<string, string> = {
  Exploit: "text-red-400",
  Malware: "text-orange-400",
  C2:      "text-purple-400",
  DoS:     "text-amber-400",
  Recon:   "text-sky-400",
  Policy:  "text-slate-400",
};

const SEVS = ["All", "Critical", "High", "Medium", "Low"];
const CATS = ["All", "Exploit", "Malware", "C2", "DoS", "Recon"];

// ── Page ─────────────────────────────────────────────────────────────────────
export default function ThreatsPage() {
  const [sevFilter, setSevFilter] = useState("All");
  const [catFilter, setCatFilter] = useState("All");

  const filtered = ipsEvents.filter(
    (e) => (sevFilter === "All" || e.sev === sevFilter) &&
            (catFilter === "All" || e.cat === catFilter)
  );

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Threat Prevention</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            IPS · Malware detection · C2 blocking · Real-time signatures
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-md
                        bg-emerald-500/10 border border-emerald-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse-slow" />
          <span className="text-xs text-emerald-400 font-medium">Threat Engine Active</span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {[
          { title: "Threats Blocked",   value: "1,284",  sub: "last 24h",           accent: "bg-red-500",    Icon: ShieldAlert },
          { title: "Exploits Stopped",  value: "47",     sub: "CVE-matched",        accent: "bg-orange-500", Icon: Zap         },
          { title: "Malware Blocked",   value: "23",     sub: "signatures matched", accent: "bg-purple-500", Icon: Bug         },
          { title: "Active Signatures", value: "41,283", sub: "Suricata rules",     accent: "bg-sky-500",    Icon: Target      },
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

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">

        {/* Timeline */}
        <div className="card p-5 xl:col-span-2">
          <h2 className="text-sm font-semibold text-slate-200 mb-1">Threat Events — Last 24h</h2>
          <p className="text-xs text-slate-500 mb-4">Exploits · Malware · C2 traffic</p>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={threatTimeline} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                {[
                  ["gE", "#ef4444"],
                  ["gM", "#f97316"],
                  ["gC", "#a855f7"],
                ].map(([id, color]) => (
                  <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={color} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="2 4" stroke="#1e293b" />
              <XAxis dataKey="hour" tick={{ fill: "#475569", fontSize: 10 }}
                     tickLine={false} axisLine={false} interval={3} />
              <YAxis tick={{ fill: "#475569", fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ background: "#0d1117", border: "1px solid #1e293b", borderRadius: "6px", fontSize: "12px" }}
                labelStyle={{ color: "#64748b" }}
                itemStyle={{ color: "#cbd5e1" }}
              />
              <Area type="monotone" dataKey="exploits" stroke="#ef4444" strokeWidth={1.5} fill="url(#gE)" name="Exploits" dot={false} />
              <Area type="monotone" dataKey="malware"  stroke="#f97316" strokeWidth={1.5} fill="url(#gM)" name="Malware"  dot={false} />
              <Area type="monotone" dataKey="c2"       stroke="#a855f7" strokeWidth={1.5} fill="url(#gC)" name="C2"       dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Severity breakdown */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-200 mb-1">By Severity</h2>
          <p className="text-xs text-slate-500 mb-4">Current session</p>
          <ResponsiveContainer width="100%" height={130}>
            <BarChart data={sevBreakdown} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="#1e293b" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: "#475569", fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: "#475569", fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ background: "#0d1117", border: "1px solid #1e293b", borderRadius: "6px", fontSize: "12px" }}
                cursor={{ fill: "#1e293b" }}
              />
              <Bar dataKey="value" name="Events" radius={[3, 3, 0, 0]} maxBarSize={40}>
                {sevBreakdown.map((d, i) => <Cell key={i} fill={d.fill} fillOpacity={0.85} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-4 space-y-2">
            {sevBreakdown.map((d) => (
              <div key={d.name} className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.fill }} />
                <span className="text-xs text-slate-500 flex-1">{d.name}</span>
                <span className="text-xs font-mono font-semibold text-slate-300">{d.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* IPS event log */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-200">IPS Event Log</h2>
            <p className="text-xs text-slate-500">{filtered.length} events</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1">
              {SEVS.map((s) => (
                <button key={s} onClick={() => setSevFilter(s)}
                  className={`px-2 py-1 text-[11px] rounded font-medium transition-colors ${
                    sevFilter === s
                      ? "bg-sky-600 text-white"
                      : "text-slate-600 hover:text-slate-400 hover:bg-slate-800"
                  }`}>
                  {s}
                </button>
              ))}
            </div>
            <div className="w-px h-4 bg-slate-800" />
            <div className="flex items-center gap-1">
              {CATS.map((c) => (
                <button key={c} onClick={() => setCatFilter(c)}
                  className={`px-2 py-1 text-[11px] rounded font-medium transition-colors ${
                    catFilter === c
                      ? "bg-violet-700 text-white"
                      : "text-slate-600 hover:text-slate-400 hover:bg-slate-800"
                  }`}>
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800">
                {["Signature ID", "Description", "Category", "Source → Dest", "Severity", "Action", "Time"].map((h) => (
                  <th key={h} className="table-header">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center">
                    <ShieldAlert className="w-10 h-10 mx-auto mb-3 text-slate-800" />
                    <p className="text-sm text-slate-500">No events match filters</p>
                  </td>
                </tr>
              ) : filtered.map((evt, i) => (
                <tr key={i} className="table-row">
                  <td className="table-cell">
                    <code className="text-[11px] bg-slate-800 px-1.5 py-0.5 rounded text-sky-400 font-mono">
                      {evt.id}
                    </code>
                  </td>
                  <td className="table-cell">
                    <span className="text-xs text-slate-300 max-w-[220px] block truncate">{evt.sig}</span>
                  </td>
                  <td className="table-cell">
                    <span className={`text-[11px] font-semibold ${catColor[evt.cat] ?? "text-slate-400"}`}>
                      {evt.cat}
                    </span>
                  </td>
                  <td className="table-cell">
                    <span className="text-[11px] font-mono text-slate-500">{evt.src}</span>
                    <span className="text-slate-700 mx-1">→</span>
                    <span className="text-[11px] font-mono text-slate-500">{evt.dst}</span>
                  </td>
                  <td className="table-cell">
                    <span className={sevBadge[evt.sev]}>{evt.sev}</span>
                  </td>
                  <td className="table-cell">
                    <span className={`badge text-[10px] ${evt.action === "block" ? "badge-red" : "badge-yellow"}`}>
                      {evt.action.toUpperCase()}
                    </span>
                  </td>
                  <td className="table-cell text-[11px] text-slate-600">{evt.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
