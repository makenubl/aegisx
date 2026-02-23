"use client";

import { useState } from "react";
import { Globe, Lock, Eye, Layers, Bug, Radio } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";

// ── Stable mock data ──────────────────────────────────────────────────────────
const categories = [
  { name: "Web Browsing",     value: 38, fill: "#0ea5e9", bytes: "4.2 GB" },
  { name: "Streaming",        value: 24, fill: "#8b5cf6", bytes: "12.8 GB" },
  { name: "Cloud Storage",    value: 16, fill: "#06b6d4", bytes: "2.1 GB" },
  { name: "Social Media",     value: 11, fill: "#f59e0b", bytes: "1.4 GB" },
  { name: "Enc. Tunnel",      value:  7, fill: "#ef4444", bytes: "800 MB" },
  { name: "P2P",              value:  4, fill: "#f97316", bytes: "450 MB" },
];

const bwData = [
  { name: "YouTube",    value: 8400, fill: "#8b5cf6" },
  { name: "Drive",      value: 2100, fill: "#0ea5e9" },
  { name: "FB Video",   value: 1200, fill: "#f59e0b" },
  { name: "TunnelBear", value:  560, fill: "#ef4444" },
  { name: "Dropbox",    value:  380, fill: "#06b6d4" },
  { name: "Zoom",       value:  280, fill: "#10b981" },
];

const topApps = [
  { app: "YouTube",         cat: "Streaming",     proto: "QUIC/HTTP3",  bytes: "8.4 GB",  sessions: 1240, action: "allow", risk: "low" },
  { app: "Google Drive",    cat: "Cloud Storage", proto: "HTTPS",       bytes: "2.1 GB",  sessions: 483,  action: "allow", risk: "low" },
  { app: "Facebook Video",  cat: "Social Media",  proto: "HTTPS",       bytes: "1.2 GB",  sessions: 891,  action: "allow", risk: "medium" },
  { app: "WhatsApp",        cat: "Messaging",     proto: "HTTPS",       bytes: "890 MB",  sessions: 3421, action: "allow", risk: "low" },
  { app: "TunnelBear VPN",  cat: "VPN/Tunnel",    proto: "OpenVPN",     bytes: "560 MB",  sessions: 12,   action: "block", risk: "high" },
  { app: "BitTorrent",      cat: "P2P",           proto: "BitTorrent",  bytes: "450 MB",  sessions: 8,    action: "block", risk: "high" },
  { app: "Dropbox",         cat: "Cloud Storage", proto: "HTTPS",       bytes: "380 MB",  sessions: 224,  action: "allow", risk: "low" },
  { app: "Telegram",        cat: "Messaging",     proto: "MTProto",     bytes: "310 MB",  sessions: 1820, action: "allow", risk: "low" },
  { app: "Zoom",            cat: "Conferencing",  proto: "HTTPS/RTP",   bytes: "280 MB",  sessions: 67,   action: "allow", risk: "low" },
  { app: "Tor Browser",     cat: "Anonymizer",    proto: "Tor",         bytes: "120 MB",  sessions: 3,    action: "block", risk: "critical" },
];

const riskBadge: Record<string, string> = {
  low:      "badge badge-green",
  medium:   "badge badge-yellow",
  high:     "badge badge-red",
  critical: "badge badge-red",
};

const CATS = ["All", "Streaming", "Cloud Storage", "Social Media", "VPN/Tunnel", "P2P", "Messaging"];

// ── Page ─────────────────────────────────────────────────────────────────────
export default function AppIntelPage() {
  const [sslInspect, setSslInspect] = useState(true);
  const [catFilter,  setCatFilter]  = useState("All");

  const filtered = catFilter === "All"
    ? topApps
    : topApps.filter((a) => a.cat === catFilter);

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100">App Intelligence</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Layer-7 deep packet inspection · Application identification
          </p>
        </div>
        <button
          onClick={() => setSslInspect(!sslInspect)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium border transition-all ${
            sslInspect
              ? "bg-sky-500/10 border-sky-500/30 text-sky-400"
              : "bg-slate-800/60 border-slate-700 text-slate-500"
          }`}
        >
          <Lock className="w-3.5 h-3.5" />
          SSL Inspection {sslInspect ? "ON" : "OFF"}
        </button>
      </div>

      {/* SSL notice */}
      {sslInspect && (
        <div className="rounded-lg border border-sky-800/40 bg-sky-950/20 px-4 py-2.5 flex items-center gap-3">
          <Lock className="w-3.5 h-3.5 text-sky-400 shrink-0" />
          <p className="text-xs text-sky-300">
            SSL/TLS interception active — encrypted traffic is decrypted, inspected, and
            re-encrypted using the AegisX CA certificate.
          </p>
          <span className="ml-auto text-[10px] font-semibold text-sky-600 bg-sky-950
                           border border-sky-800 px-2 py-0.5 rounded shrink-0">
            CA Trusted
          </span>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {[
          { title: "Apps Classified",   value: "1,284", sub: "across 47 categories",  accent: "bg-sky-500",     Icon: Globe  },
          { title: "Encrypted Tunnels", value: "3",     sub: "detected & blocked",    accent: "bg-red-500",     Icon: Lock   },
          { title: "L7 Rules Active",   value: "24",    sub: "app-aware policies",    accent: "bg-violet-500",  Icon: Layers },
          { title: "SSL Sessions/s",    value: "1,847", sub: "inspected real-time",   accent: "bg-emerald-500", Icon: Eye    },
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
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-3">

        {/* Category donut */}
        <div className="card p-5 xl:col-span-2">
          <h2 className="text-sm font-semibold text-slate-200 mb-1">Traffic by Category</h2>
          <p className="text-xs text-slate-500 mb-3">By bandwidth consumed</p>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={categories} dataKey="value"
                   cx="50%" cy="50%" innerRadius={46} outerRadius={70}
                   paddingAngle={2} strokeWidth={0}>
                {categories.map((c, i) => <Cell key={i} fill={c.fill} fillOpacity={0.9} />)}
              </Pie>
              <Tooltip
                contentStyle={{ background: "#0d1117", border: "1px solid #1e293b", borderRadius: "6px", fontSize: "11px" }}
                formatter={(v: number) => [`${v}%`, "Share"]}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5 mt-2">
            {categories.map((c) => (
              <div key={c.name} className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.fill }} />
                <span className="text-[11px] text-slate-500 flex-1 truncate">{c.name}</span>
                <span className="text-[11px] font-mono text-slate-400">{c.bytes}</span>
                <span className="text-[11px] font-mono text-slate-600">{c.value}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bandwidth bar */}
        <div className="card p-5 xl:col-span-3">
          <h2 className="text-sm font-semibold text-slate-200 mb-1">Top Apps by Bandwidth</h2>
          <p className="text-xs text-slate-500 mb-3">Last 24 hours (MB)</p>
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={bwData} layout="vertical"
                      margin={{ top: 0, right: 16, left: 60, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="#1e293b" horizontal={false} />
              <XAxis type="number" tick={{ fill: "#475569", fontSize: 10 }}
                     tickLine={false} axisLine={false}
                     tickFormatter={(v) => `${v}M`} />
              <YAxis dataKey="name" type="category"
                     tick={{ fill: "#94a3b8", fontSize: 11 }}
                     tickLine={false} axisLine={false} width={60} />
              <Tooltip
                contentStyle={{ background: "#0d1117", border: "1px solid #1e293b", borderRadius: "6px", fontSize: "11px" }}
                formatter={(v: number) => [`${v} MB`, "Bandwidth"]}
                cursor={{ fill: "#1e293b" }}
              />
              <Bar dataKey="value" radius={[0, 3, 3, 0]} maxBarSize={18}>
                {bwData.map((d, i) => <Cell key={i} fill={d.fill} fillOpacity={0.85} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Application table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-200">Application Signatures</h2>
            <p className="text-xs text-slate-500">{topApps.length} applications identified</p>
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            {CATS.map((c) => (
              <button key={c} onClick={() => setCatFilter(c)}
                className={`px-2 py-1 text-[11px] rounded font-medium transition-colors ${
                  catFilter === c
                    ? "bg-sky-600 text-white"
                    : "text-slate-600 hover:text-slate-400 hover:bg-slate-800"
                }`}>
                {c}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800">
                {["Application", "Category", "Protocol", "Bandwidth", "Sessions", "Risk", "Action"].map((h) => (
                  <th key={h} className="table-header">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((app, i) => (
                <tr key={i} className="table-row">
                  <td className="table-cell">
                    <span className="text-xs font-medium text-slate-200">{app.app}</span>
                  </td>
                  <td className="table-cell text-xs text-slate-500">{app.cat}</td>
                  <td className="table-cell">
                    <code className="text-[11px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-400 font-mono">
                      {app.proto}
                    </code>
                  </td>
                  <td className="table-cell text-xs font-mono text-slate-400">{app.bytes}</td>
                  <td className="table-cell text-xs font-mono text-slate-500">
                    {app.sessions.toLocaleString()}
                  </td>
                  <td className="table-cell">
                    <span className={riskBadge[app.risk]}>{app.risk}</span>
                  </td>
                  <td className="table-cell">
                    <span className={`badge text-[10px] ${app.action === "allow" ? "badge-green" : "badge-red"}`}>
                      {app.action.toUpperCase()}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
