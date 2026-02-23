"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileText, Plus, PlayCircle, Trash2,
  GitBranch, Eye, CheckCircle, Clock, XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { api, type Policy } from "@/lib/api";
import { cn } from "@/lib/utils";
import { PolicyEditorModal } from "@/components/policy/editor-modal";

// ─── Kind config ───────────────────────────────────────────────────────────
const kindMeta: Record<string, { badgeCls: string; barCls: string; label: string }> = {
  FirewallPolicy:     { badgeCls: "badge-blue",   barCls: "bg-sky-500",     label: "Firewall"     },
  LoadBalancerPolicy: { badgeCls: "badge-green",  barCls: "bg-emerald-500", label: "Load Balancer" },
  VPNPolicy:          { badgeCls: "badge-yellow", barCls: "bg-amber-500",   label: "VPN"           },
  NATPolicy:          { badgeCls: "badge-gray",   barCls: "bg-slate-500",   label: "NAT"           },
  IDSPolicy:          { badgeCls: "badge-red",    barCls: "bg-red-500",     label: "IDS"           },
};

// ─── Policy card ───────────────────────────────────────────────────────────
function PolicyCard({
  policy, onApply, onDelete, onView,
}: {
  policy: Policy;
  onApply:  (id: string) => void;
  onDelete: (id: string) => void;
  onView:   (p: Policy)  => void;
}) {
  const meta = kindMeta[policy.kind] ?? { badgeCls: "badge-gray", barCls: "bg-slate-500", label: policy.kind };

  return (
    <div className="card overflow-hidden hover:border-slate-700 transition-colors group flex flex-col">
      {/* Kind color bar */}
      <div className={`h-0.5 w-full ${meta.barCls}`} />

      <div className="p-4 flex-1 flex flex-col gap-3">
        {/* Top row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`badge text-[11px] ${meta.badgeCls}`}>{meta.label}</span>
              {policy.namespace && (
                <span className="text-[11px] text-slate-700 font-mono truncate">{policy.namespace}</span>
              )}
            </div>
            <h3 className="text-sm font-semibold text-slate-200 mt-2 truncate">{policy.name}</h3>
          </div>

          {/* Actions — shown on hover */}
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button
              onClick={() => onView(policy)}
              className="p-1.5 rounded text-slate-600 hover:text-sky-400 hover:bg-sky-950/50 transition-colors"
              title="View / Edit"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onApply(policy.id)}
              className="p-1.5 rounded text-slate-600 hover:text-emerald-400 hover:bg-emerald-950/50 transition-colors"
              title="Apply"
            >
              <PlayCircle className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => {
                if (!confirm(`Delete "${policy.name}"?`)) return;
                onDelete(policy.id);
              }}
              className="p-1.5 rounded text-slate-600 hover:text-red-400 hover:bg-red-950/50 transition-colors"
              title="Delete"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-3 text-[11px] text-slate-600 mt-auto">
          <span className="flex items-center gap-1">
            <GitBranch className="w-3 h-3" />
            v{policy.version}
          </span>
          {policy.appliedAt ? (
            <span className="flex items-center gap-1 text-emerald-600">
              <CheckCircle className="w-3 h-3" />
              {new Date(policy.appliedAt).toLocaleDateString()}
            </span>
          ) : (
            <span className="flex items-center gap-1 text-amber-700">
              <Clock className="w-3 h-3" />
              Not applied
            </span>
          )}
          <span className={cn("ml-auto flex items-center gap-1", policy.enabled ? "text-emerald-600" : "text-slate-700")}>
            {policy.enabled
              ? <><CheckCircle className="w-3 h-3" /> Enabled</>
              : <><XCircle    className="w-3 h-3" /> Disabled</>}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────
export default function PoliciesPage() {
  const qc = useQueryClient();
  const [kindFilter,     setKindFilter]     = useState<string>("all");
  const [editorOpen,     setEditorOpen]     = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState<Policy | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["policies", kindFilter],
    queryFn:  () => api.listPolicies(kindFilter === "all" ? undefined : kindFilter),
  });

  const applyMutation = useMutation({
    mutationFn: (id: string) => api.applyPolicy(id),
    onSuccess: () => {
      toast.success("Policy applied");
      qc.invalidateQueries({ queryKey: ["policies"] });
      qc.invalidateQueries({ queryKey: ["firewall-status"] });
    },
    onError: (err: Error) => toast.error("Apply failed: " + err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deletePolicy(id),
    onSuccess: () => {
      toast.success("Policy deleted");
      qc.invalidateQueries({ queryKey: ["policies"] });
    },
    onError: (err: Error) => toast.error("Delete failed: " + err.message),
  });

  const kinds = ["all", "FirewallPolicy", "LoadBalancerPolicy", "VPNPolicy", "NATPolicy", "IDSPolicy"];
  const policies = data?.items ?? [];

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Policies</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {policies.length} total · config-as-code YAML
          </p>
        </div>
        <button
          onClick={() => { setSelectedPolicy(null); setEditorOpen(true); }}
          className="btn-primary"
        >
          <Plus className="w-3.5 h-3.5" />
          New Policy
        </button>
      </div>

      {/* Kind filter pills */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {kinds.map((k) => (
          <button
            key={k}
            onClick={() => setKindFilter(k)}
            className={cn(
              "px-3 py-1 text-xs rounded font-medium transition-colors border",
              kindFilter === k
                ? "bg-sky-600 text-white border-sky-600"
                : "bg-transparent text-slate-500 border-slate-800 hover:border-slate-700 hover:text-slate-300"
            )}
          >
            {k === "all" ? "All" : k.replace("Policy", "")}
          </button>
        ))}
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card p-4 space-y-3 animate-pulse">
              <div className="h-3 bg-slate-800 rounded w-1/4" />
              <div className="h-4 bg-slate-800 rounded w-3/5" />
              <div className="h-3 bg-slate-800 rounded w-2/5" />
            </div>
          ))}
        </div>
      ) : policies.length === 0 ? (
        <div className="card p-16 text-center">
          <FileText className="w-10 h-10 mx-auto mb-4 text-slate-800" />
          <h3 className="text-base font-semibold text-slate-400">No policies</h3>
          <p className="text-sm text-slate-600 mt-1">
            Create your first YAML policy to start controlling traffic.
          </p>
          <button
            onClick={() => setEditorOpen(true)}
            className="btn-primary mt-5 mx-auto"
          >
            <Plus className="w-3.5 h-3.5" />
            Create Policy
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {policies.map((policy) => (
            <PolicyCard
              key={policy.id}
              policy={policy}
              onApply={(id)  => applyMutation.mutate(id)}
              onDelete={(id) => deleteMutation.mutate(id)}
              onView={(p)    => { setSelectedPolicy(p); setEditorOpen(true); }}
            />
          ))}
        </div>
      )}

      <PolicyEditorModal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        policy={selectedPolicy}
      />
    </div>
  );
}
