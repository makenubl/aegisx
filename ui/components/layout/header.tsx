"use client";

import { Bell, Search, RefreshCw } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";

const breadcrumbMap: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/firewall":  "Firewall",
  "/policies":  "Policies",
  "/alerts":    "IDS Alerts",
  "/settings":  "Settings",
};

export function Header() {
  const qc       = useQueryClient();
  const pathname = usePathname();

  const { data: status } = useQuery({
    queryKey: ["system-status"],
    queryFn:  () => api.getSystemStatus(),
    refetchInterval: 30_000,
  });

  const pageName = breadcrumbMap[pathname] ?? pathname.split("/").pop() ?? "AegisX";

  return (
    <header className="h-14 bg-[#0d1117] border-b border-slate-800/80 flex items-center px-5 gap-3 shrink-0">

      {/* Breadcrumb */}
      <div className="hidden sm:flex items-center gap-1.5 text-sm">
        <span className="text-slate-600">AegisX</span>
        <span className="text-slate-700">/</span>
        <span className="text-slate-300 font-medium">{pageName}</span>
      </div>

      <div className="flex-1" />

      {/* Search */}
      <div className="relative hidden md:block">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600" />
        <input
          type="text"
          placeholder="Search…"
          className="w-40 bg-[#090e1a] border border-slate-800 rounded-md pl-8 pr-3 py-1.5
                     text-xs text-slate-400 placeholder-slate-700
                     focus:outline-none focus:ring-1 focus:ring-sky-600 focus:w-52
                     transition-all"
        />
      </div>

      {/* System info */}
      {status && (
        <div className="hidden lg:flex items-center gap-1.5 text-xs text-slate-600 font-mono">
          <span>v{status.version}</span>
          <span className="text-slate-800">·</span>
          <span>{status.uptime}</span>
        </div>
      )}

      {/* Refresh */}
      <button
        onClick={() => qc.invalidateQueries()}
        className="p-1.5 rounded-md text-slate-600 hover:text-slate-400 hover:bg-slate-800 transition-colors"
        title="Refresh all data"
      >
        <RefreshCw className="w-3.5 h-3.5" />
      </button>

      {/* Notifications */}
      <button className="relative p-1.5 rounded-md text-slate-600 hover:text-slate-400 hover:bg-slate-800 transition-colors">
        <Bell className="w-3.5 h-3.5" />
        <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-red-500 rounded-full" />
      </button>

      {/* User */}
      <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-sky-500 to-blue-700 flex items-center justify-center text-[10px] font-bold text-white">
          A
        </div>
        <span className="text-xs text-slate-500 hidden lg:block">admin</span>
      </div>
    </header>
  );
}
