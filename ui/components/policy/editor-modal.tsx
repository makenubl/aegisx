"use client";

import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Save, Play, Eye } from "lucide-react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { api, type Policy } from "@/lib/api";
import { cn } from "@/lib/utils";

// Monaco editor loaded client-side only
const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

const EXAMPLE_FIREWALL_POLICY = `apiVersion: aegisx.io/v1
kind: FirewallPolicy
metadata:
  name: example-policy
  namespace: default
spec:
  defaultAction: DROP
  rules:
    - name: allow-http-https
      action: ALLOW
      protocol: tcp
      source:
        zones: [internet]
      destination:
        zones: [dmz]
        ports: [80, 443]
      log: true
      comment: "Allow web traffic"

    - name: allow-established
      action: ALLOW
      state: [established, related]
      comment: "Allow established connections"
`;

const EXAMPLE_LB_POLICY = `apiVersion: aegisx.io/v1
kind: LoadBalancerPolicy
metadata:
  name: web-lb
  namespace: default
spec:
  frontend:
    bind: "0.0.0.0:80"
    mode: http
    maxConn: 10000
  backend:
    algorithm: leastconn
    servers:
      - name: web1
        address: "10.0.1.10:8080"
        weight: 1
      - name: web2
        address: "10.0.1.11:8080"
        weight: 1
    healthCheck:
      interval: "5s"
      path: /healthz
      rise: 2
      fall: 3
`;

const examples: Record<string, string> = {
  FirewallPolicy:     EXAMPLE_FIREWALL_POLICY,
  LoadBalancerPolicy: EXAMPLE_LB_POLICY,
};

interface Props {
  open: boolean;
  onClose: () => void;
  policy?: Policy | null;
}

export function PolicyEditorModal({ open, onClose, policy }: Props) {
  const qc = useQueryClient();
  const [yaml, setYaml] = useState(EXAMPLE_FIREWALL_POLICY);
  const [selectedKind, setSelectedKind] = useState("FirewallPolicy");
  const [tab, setTab] = useState<"editor" | "preview">("editor");
  const [diff, setDiff] = useState<string | null>(null);

  // Load existing policy YAML
  useEffect(() => {
    if (policy?.rawYaml) {
      setYaml(policy.rawYaml);
    } else if (!policy) {
      setYaml(examples[selectedKind] ?? EXAMPLE_FIREWALL_POLICY);
    }
  }, [policy, selectedKind]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Parse kind from YAML to use for API call
      const kindMatch = yaml.match(/^kind:\s*(\S+)/m);
      const nameMatch = yaml.match(/^\s+name:\s*(\S+)/m);
      const nsMatch   = yaml.match(/^\s+namespace:\s*(\S+)/m);

      const kind = kindMatch?.[1] ?? selectedKind;
      const name = nameMatch?.[1] ?? "unnamed";
      const ns   = nsMatch?.[1] ?? "default";

      if (policy?.id) {
        return api.updatePolicy(policy.id, { rawYaml: yaml, enabled: true });
      } else {
        return api.createPolicy({
          name,
          namespace: ns,
          kind,
          spec: {},
          rawYaml: yaml,
          enabled: true,
        });
      }
    },
    onSuccess: () => {
      toast.success(policy ? "Policy updated" : "Policy created");
      qc.invalidateQueries({ queryKey: ["policies"] });
      onClose();
    },
    onError: (err: Error) => toast.error("Save failed: " + err.message),
  });

  const applyMutation = useMutation({
    mutationFn: async () => {
      if (!policy?.id) {
        toast.info("Save the policy first, then apply.");
        return;
      }
      return api.applyPolicy(policy.id);
    },
    onSuccess: () => {
      toast.success("Policy applied to dataplane");
      qc.invalidateQueries({ queryKey: ["firewall-status"] });
    },
    onError: (err: Error) => toast.error("Apply failed: " + err.message),
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-[#1e293b] border border-slate-700 rounded-xl w-full max-w-4xl
                      max-h-[90vh] flex flex-col shadow-2xl animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              {policy ? `Edit: ${policy.name}` : "New Policy"}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">YAML policy editor</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Template selector (only for new policies) */}
        {!policy && (
          <div className="px-5 py-3 border-b border-slate-800 flex items-center gap-3">
            <span className="text-xs text-slate-500">Template:</span>
            <div className="flex gap-1.5">
              {Object.keys(examples).map((k) => (
                <button
                  key={k}
                  onClick={() => { setSelectedKind(k); setYaml(examples[k]); }}
                  className={cn(
                    "px-2.5 py-1 text-xs rounded font-medium transition-colors",
                    selectedKind === k
                      ? "bg-sky-600 text-white"
                      : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                  )}
                >
                  {k.replace("Policy", "")}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-1 px-5 pt-2 border-b border-slate-700">
          {(["editor", "preview"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "px-3 py-2 text-sm font-medium capitalize transition-colors -mb-px",
                tab === t
                  ? "text-sky-400 border-b-2 border-sky-500"
                  : "text-slate-500 hover:text-slate-300"
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Editor / Preview */}
        <div className="flex-1 overflow-hidden p-4">
          {tab === "editor" ? (
            <div className="h-full min-h-[400px] monaco-editor-container">
              <MonacoEditor
                height="400px"
                language="yaml"
                theme="vs-dark"
                value={yaml}
                onChange={(v) => setYaml(v ?? "")}
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                  lineNumbers: "on",
                  scrollBeyondLastLine: false,
                  wordWrap: "on",
                  renderLineHighlight: "line",
                  tabSize: 2,
                }}
              />
            </div>
          ) : (
            <div className="h-full overflow-auto">
              <pre className="text-xs font-mono text-slate-300 bg-[#0f172a] rounded-md p-4
                              border border-slate-700 whitespace-pre-wrap leading-relaxed">
                {yaml}
              </pre>
              {diff && (
                <div className="mt-4">
                  <p className="text-xs text-slate-500 mb-2">Diff vs current ruleset:</p>
                  <pre className="text-xs font-mono bg-[#0f172a] rounded-md p-4 border border-slate-700
                                  whitespace-pre-wrap text-slate-300">
                    {diff.split("\n").map((line, i) => (
                      <span
                        key={i}
                        className={
                          line.startsWith("+")
                            ? "text-emerald-400 block"
                            : line.startsWith("-")
                            ? "text-red-400 block"
                            : "block"
                        }
                      >
                        {line}
                      </span>
                    ))}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-slate-700">
          <div className="text-xs text-slate-600">
            {yaml.split("\n").length} lines · YAML
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="btn-secondary"
            >
              Cancel
            </button>
            {policy && (
              <button
                onClick={() => applyMutation.mutate()}
                disabled={applyMutation.isPending}
                className="btn-secondary flex items-center gap-2"
              >
                <Play className="w-3.5 h-3.5" />
                Apply
              </button>
            )}
            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="btn-primary flex items-center gap-2"
            >
              <Save className="w-3.5 h-3.5" />
              {saveMutation.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
