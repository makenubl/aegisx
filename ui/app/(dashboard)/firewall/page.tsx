"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Shield, PlayCircle, RotateCcw, Trash2,
  ChevronDown, ChevronRight, Terminal,
  CheckCircle2, XCircle, Clock, List,
} from "lucide-react";
import { toast } from "sonner";
import { api, type FirewallRule } from "@/lib/api";
import { cn, actionClass } from "@/lib/utils";

// ─── Rule row ─────────────────────────────────────────────────────────────
function RuleRow({ rule }: { rule: FirewallRule }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        className="table-row cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <td className="table-cell text-xs font-mono text-slate-600 w-12">{rule.priority}</td>
        <td className="table-cell">
          <code className="text-xs bg-slate-800 px-1.5 py-0.5 rounded text-slate-400 font-mono">
            {rule.chain}
          </code>
        </td>
        <td className="table-cell">
          <span className={`badge text-[11px] ${actionClass(rule.action)}`}>
            {rule.action.toUpperCase()}
          </span>
        </td>
        <td className="table-cell text-xs font-mono text-slate-500">{rule.protocol || "any"}</td>
        <td className="table-cell text-xs font-mono text-slate-400 max-w-[140px] truncate">
          {rule.srcAddrs?.join(", ") || <span className="text-slate-600">any</span>}
        </td>
        <td className="table-cell text-xs font-mono text-slate-400 max-w-[160px] truncate">
          {rule.dstAddrs?.join(", ") || <span className="text-slate-600">any</span>}
          {rule.dstPorts?.length > 0 && (
            <span className="text-slate-600">:{rule.dstPorts.join(",")}</span>
          )}
        </td>
        <td className="table-cell text-xs text-slate-500 max-w-[180px] truncate">{rule.comment || "—"}</td>
        <td className="table-cell w-8">
          {expanded
            ? <ChevronDown  className="w-3.5 h-3.5 text-slate-600" />
            : <ChevronRight className="w-3.5 h-3.5 text-slate-700" />}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-[#0a0f1a]">
          <td colSpan={8} className="px-8 py-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              {[
                { label: "States",     value: rule.states?.join(", ")    || "—" },
                { label: "Src Ports",  value: rule.srcPorts?.join(", ")  || "any" },
                { label: "Rate Limit", value: rule.rateLimit              || "—" },
                { label: "Log",        value: rule.log ? "enabled" : "disabled" },
              ].map((f) => (
                <div key={f.label}>
                  <p className="text-slate-600 mb-1 uppercase tracking-wide text-[10px]">{f.label}</p>
                  <p className="font-mono text-slate-400">{f.value}</p>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────
export default function FirewallPage() {
  const qc = useQueryClient();
  const [activeTab,   setActiveTab]   = useState<"rules" | "ruleset">("rules");
  const [chainFilter, setChainFilter] = useState<string>("all");

  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ["firewall-status"],
    queryFn:  () => api.getFirewallStatus(),
    refetchInterval: 15_000,
  });

  const { data: rulesData, isLoading: rulesLoading } = useQuery({
    queryKey: ["firewall-rules"],
    queryFn:  () => api.listFirewallRules(),
    refetchInterval: 30_000,
  });

  const applyMutation = useMutation({
    mutationFn: () => api.applyFirewall(),
    onSuccess: () => {
      toast.success("Firewall policy applied");
      qc.invalidateQueries({ queryKey: ["firewall-status"] });
      qc.invalidateQueries({ queryKey: ["firewall-rules"] });
    },
    onError: (err: Error) => toast.error("Apply failed: " + err.message),
  });

  const rollbackMutation = useMutation({
    mutationFn: () => api.rollbackFirewall(),
    onSuccess: () => {
      toast.success("Rolled back to previous ruleset");
      qc.invalidateQueries({ queryKey: ["firewall-status"] });
    },
    onError: (err: Error) => toast.error("Rollback failed: " + err.message),
  });

  const flushMutation = useMutation({
    mutationFn: () => api.flushFirewall(),
    onSuccess: () => {
      toast.warning("All firewall rules flushed");
      qc.invalidateQueries({ queryKey: ["firewall-status"] });
      qc.invalidateQueries({ queryKey: ["firewall-rules"] });
    },
    onError: (err: Error) => toast.error("Flush failed: " + err.message),
  });

  const chains = ["all", "input", "forward", "output"];
  const filteredRules = (rulesData?.items ?? []).filter(
    (r) => chainFilter === "all" || r.chain === chainFilter
  );

  const isActive = status?.status === "active";

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Firewall</h1>
          <p className="text-xs text-slate-500 mt-0.5">nftables — kernel packet filtering</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => applyMutation.mutate()}
            disabled={applyMutation.isPending}
            className="btn-primary"
          >
            <PlayCircle className="w-3.5 h-3.5" />
            Apply
          </button>
          <button
            onClick={() => rollbackMutation.mutate()}
            disabled={rollbackMutation.isPending}
            className="btn-secondary"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Rollback
          </button>
          <button
            onClick={() => {
              if (!confirm("Remove ALL active firewall rules?")) return;
              flushMutation.mutate();
            }}
            disabled={flushMutation.isPending}
            className="btn-danger"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Flush
          </button>
        </div>
      </div>

      {/* Status row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card p-4 flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
            isActive ? "bg-emerald-950/60" : "bg-slate-800"
          }`}>
            <Shield className={`w-4 h-4 ${isActive ? "text-emerald-400" : "text-slate-600"}`} />
          </div>
          <div>
            <p className="text-[10px] text-slate-600 uppercase tracking-wide">Status</p>
            {statusLoading ? (
              <div className="h-4 w-16 bg-slate-800 rounded animate-pulse mt-1" />
            ) : (
              <span className={`badge mt-1 text-[11px] ${isActive ? "badge-green" : "badge-gray"}`}>
                {status?.status ?? "unknown"}
              </span>
            )}
          </div>
        </div>

        <div className="card p-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-sky-950/60 flex items-center justify-center shrink-0">
            <List className="w-4 h-4 text-sky-400" />
          </div>
          <div>
            <p className="text-[10px] text-slate-600 uppercase tracking-wide">Active Rules</p>
            <p className="text-xl font-bold font-mono text-slate-200 mt-0.5">
              {rulesLoading ? <span className="text-slate-600">—</span> : (rulesData?.count ?? 0)}
            </p>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-purple-950/40 flex items-center justify-center shrink-0">
            <Clock className="w-4 h-4 text-purple-400" />
          </div>
          <div>
            <p className="text-[10px] text-slate-600 uppercase tracking-wide">Last Applied</p>
            <p className="text-xs text-slate-400 mt-1 font-mono">
              {status?.appliedAt ? new Date(status.appliedAt).toLocaleTimeString() : "Never"}
            </p>
          </div>
        </div>
      </div>

      {/* IR info bar */}
      {status?.irId && (
        <div className="card px-4 py-2.5 flex items-center gap-2 text-xs text-slate-600 font-mono">
          <Terminal className="w-3 h-3 shrink-0" />
          <span>IR {status.irId}</span>
          <span className="text-slate-800">·</span>
          <span>v{status.irVersion}</span>
        </div>
      )}

      {/* Tabs + table */}
      <div className="card overflow-hidden">
        <div className="flex items-center gap-0 px-4 border-b border-slate-800">
          {(["rules", "ruleset"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "px-4 py-3 text-xs font-medium transition-colors border-b-2 -mb-px",
                activeTab === tab
                  ? "text-sky-400 border-sky-500"
                  : "text-slate-600 hover:text-slate-400 border-transparent"
              )}
            >
              {tab === "rules" ? `Rules (${rulesData?.count ?? 0})` : "nftables Ruleset"}
            </button>
          ))}

          {/* Chain filter */}
          {activeTab === "rules" && (
            <div className="ml-auto flex items-center gap-1 py-2">
              {chains.map((c) => (
                <button
                  key={c}
                  onClick={() => setChainFilter(c)}
                  className={cn(
                    "px-2 py-1 text-[11px] rounded font-mono capitalize transition-colors",
                    chainFilter === c
                      ? "bg-sky-600 text-white"
                      : "text-slate-600 hover:text-slate-400 hover:bg-slate-800"
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>

        {activeTab === "rules" ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800">
                  {["Pri", "Chain", "Action", "Proto", "Source", "Destination", "Comment", ""].map((h) => (
                    <th key={h} className="table-header">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rulesLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-slate-800/50">
                      {Array.from({ length: 8 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-3 bg-slate-800 rounded animate-pulse" style={{ width: `${40 + (j * 7) % 40}%` }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : filteredRules.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-16 text-center">
                      <Shield className="w-10 h-10 mx-auto mb-3 text-slate-800" />
                      <p className="text-sm text-slate-500">No rules loaded</p>
                      <p className="text-xs text-slate-600 mt-1">Create a policy and click Apply</p>
                    </td>
                  </tr>
                ) : (
                  filteredRules.map((rule, i) => <RuleRow key={i} rule={rule} />)
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-4">
            <pre className="text-xs font-mono text-slate-400 bg-[#090e1a] rounded-md p-4
                            overflow-auto max-h-80 border border-slate-800 whitespace-pre-wrap leading-relaxed">
              {status?.ruleset || "# No ruleset loaded\n# Apply a policy to generate rules"}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
