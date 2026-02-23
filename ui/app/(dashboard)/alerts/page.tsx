"use client";

import { useState } from "react";
import { AlertTriangle, Search, RefreshCw } from "lucide-react";
import { severityLabel, severityClass } from "@/lib/utils";

const mockAlerts = [
  { id: "1", timestamp: new Date(Date.now() - 120_000).toISOString(),   signatureId: 2001219, signatureMsg: "ET SCAN Nmap OS Detection Probe",            severity: 1, category: "Attempted Information Leak", action: "blocked", srcIp: "192.168.1.100", dstIp: "10.0.0.5",  srcPort: 54321, dstPort: 22,   protocol: "tcp" },
  { id: "2", timestamp: new Date(Date.now() - 300_000).toISOString(),   signatureId: 2100498, signatureMsg: "GPL ATTACK_RESPONSE id check returned root",   severity: 1, category: "Potentially Bad Traffic",       action: "blocked", srcIp: "203.0.113.50", dstIp: "10.0.0.10", srcPort: 80,    dstPort: 44321, protocol: "tcp" },
  { id: "3", timestamp: new Date(Date.now() - 600_000).toISOString(),   signatureId: 2011582, signatureMsg: "ET WEB_SERVER Possible SQL Injection",          severity: 2, category: "Web Application Attack",       action: "allowed", srcIp: "172.16.0.5",   dstIp: "10.0.0.20", srcPort: 12345, dstPort: 80,    protocol: "tcp" },
  { id: "4", timestamp: new Date(Date.now() - 900_000).toISOString(),   signatureId: 2009358, signatureMsg: "ET POLICY PE EXE or DLL Windows file download", severity: 2, category: "Policy Violation",             action: "allowed", srcIp: "8.8.8.8",       dstIp: "10.0.0.15", srcPort: 80,    dstPort: 62000, protocol: "tcp" },
  { id: "5", timestamp: new Date(Date.now() - 1_200_000).toISOString(), signatureId: 2001047, signatureMsg: "ET INFO Suspicious User-Agent",                 severity: 3, category: "Not Suspicious",               action: "allowed", srcIp: "10.0.0.100",   dstIp: "1.1.1.1",  srcPort: 59000, dstPort: 443,   protocol: "tcp" },
];

export default function AlertsPage() {
  const [search,       setSearch]       = useState("");
  const [sevFilter,    setSevFilter]    = useState<string>("all");
  const [actionFilter, setActionFilter] = useState<string>("all");

  const filtered = mockAlerts.filter((a) => {
    const q = search.toLowerCase();
    const matchSearch = !q
      || a.signatureMsg.toLowerCase().includes(q)
      || a.srcIp.includes(q)
      || a.dstIp.includes(q);
    const matchSev    = sevFilter    === "all" || a.severity === Number(sevFilter);
    const matchAction = actionFilter === "all" || a.action   === actionFilter;
    return matchSearch && matchSev && matchAction;
  });

  const counts = {
    high:   mockAlerts.filter((a) => a.severity === 1).length,
    medium: mockAlerts.filter((a) => a.severity === 2).length,
    low:    mockAlerts.filter((a) => a.severity === 3).length,
  };

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100">IDS / IPS Alerts</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {filtered.length} of {mockAlerts.length} events · Suricata EVE JSON
          </p>
        </div>
        <button className="btn-secondary">
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Severity summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "High",   count: counts.high,   bar: "bg-red-500",   text: "text-red-400",   bg: "bg-red-950/30",   border: "border-red-900/40"   },
          { label: "Medium", count: counts.medium, bar: "bg-amber-500", text: "text-amber-400", bg: "bg-amber-950/30", border: "border-amber-900/40" },
          { label: "Low",    count: counts.low,    bar: "bg-sky-500",   text: "text-sky-400",   bg: "bg-sky-950/30",   border: "border-sky-900/40"   },
        ].map((s) => (
          <div key={s.label} className={`card overflow-hidden border ${s.border} ${s.bg} flex`}>
            <div className={`w-1 shrink-0 ${s.bar}`} />
            <div className="p-4">
              <p className={`text-2xl font-bold font-mono tabular-nums ${s.text}`}>{s.count}</p>
              <p className="text-xs text-slate-500 mt-0.5">{s.label} severity</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600" />
          <input
            type="text"
            placeholder="Search signature, IP…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-8 text-xs"
          />
        </div>

        <select
          value={sevFilter}
          onChange={(e) => setSevFilter(e.target.value)}
          className="input w-auto text-xs"
        >
          <option value="all">All severity</option>
          <option value="1">High</option>
          <option value="2">Medium</option>
          <option value="3">Low</option>
        </select>

        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="input w-auto text-xs"
        >
          <option value="all">All actions</option>
          <option value="blocked">Blocked</option>
          <option value="allowed">Allowed</option>
        </select>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800">
                {["Time", "SID", "Signature", "Severity", "Action", "Source", "Destination", "Proto"].map((h) => (
                  <th key={h} className="table-header">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-14 text-center">
                    <AlertTriangle className="w-8 h-8 mx-auto mb-3 text-slate-700" />
                    <p className="text-sm text-slate-500">No alerts match your filters</p>
                  </td>
                </tr>
              ) : (
                filtered.map((alert) => (
                  <tr key={alert.id} className="table-row">
                    <td className="table-cell text-xs font-mono text-slate-600 whitespace-nowrap">
                      {new Date(alert.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="table-cell text-xs font-mono text-slate-600">
                      {alert.signatureId}
                    </td>
                    <td className="table-cell max-w-[260px]">
                      <p className="text-xs text-slate-300 truncate">{alert.signatureMsg}</p>
                      <p className="text-[11px] text-slate-600 mt-0.5">{alert.category}</p>
                    </td>
                    <td className="table-cell">
                      <span className={`badge text-[11px] ${severityClass(alert.severity)}`}>
                        {severityLabel(alert.severity)}
                      </span>
                    </td>
                    <td className="table-cell">
                      <span className={`badge text-[11px] ${alert.action === "blocked" ? "badge-red" : "badge-green"}`}>
                        {alert.action}
                      </span>
                    </td>
                    <td className="table-cell text-xs font-mono text-slate-400 whitespace-nowrap">
                      {alert.srcIp}:{alert.srcPort}
                    </td>
                    <td className="table-cell text-xs font-mono text-slate-400 whitespace-nowrap">
                      {alert.dstIp}:{alert.dstPort}
                    </td>
                    <td className="table-cell text-xs font-mono text-slate-600 uppercase">
                      {alert.protocol}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
