"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Shield, LayoutDashboard, FileText, AlertTriangle,
  Network, Layers, Key, Settings, Activity, LogOut,
  Bug, Globe, Fingerprint,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

// ─── Nav config ───────────────────────────────────────────────────────────

const monitorNav = [
  { href: "/dashboard", label: "Dashboard",  icon: LayoutDashboard },
  { href: "/alerts",    label: "Alerts",     icon: AlertTriangle, badge: "5" },
];

const securityNav = [
  { href: "/firewall",  label: "Firewall",          icon: Shield    },
  { href: "/policies",  label: "Policies",          icon: FileText  },
  { href: "/threats",   label: "Threat Prevention", icon: Bug       },
];

const intelligenceNav = [
  { href: "/app-intel", label: "App Intelligence",  icon: Globe       },
  { href: "/identity",  label: "Identity & Access", icon: Fingerprint },
];

const networkNav = [
  { href: "/lb",       label: "Load Balancer", icon: Layers,  soon: true },
  { href: "/vpn",      label: "VPN",           icon: Key,     soon: true },
  { href: "/topology", label: "Topology",      icon: Network, soon: true },
];

const observabilityNav = [
  { href: "/metrics", label: "Metrics", icon: Activity, soon: true },
];

// ─── Primitives ───────────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return (
    <p className="px-3 pt-5 pb-1.5 text-[10px] font-semibold tracking-[0.14em] text-slate-600 uppercase select-none first:pt-0">
      {label}
    </p>
  );
}

function NavItem({
  href, label, icon: Icon, badge, soon, active,
}: {
  href: string; label: string; icon: React.ElementType;
  badge?: string; soon?: boolean; active?: boolean;
}) {
  if (soon) {
    return (
      <div className="flex items-center gap-3 px-3 py-2 rounded-md select-none cursor-default">
        <Icon className="w-4 h-4 shrink-0 text-slate-700" />
        <span className="text-sm text-slate-700">{label}</span>
        <span className="ml-auto text-[9px] font-semibold tracking-wide text-slate-700
                         bg-slate-800/50 px-1.5 py-0.5 rounded border border-slate-800">
          SOON
        </span>
      </div>
    );
  }

  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all",
        "border-l-2 group",
        active
          ? "bg-sky-500/10 text-sky-400 border-sky-500"
          : "text-slate-400 hover:bg-slate-800/70 hover:text-slate-200 border-transparent"
      )}
    >
      <Icon className={cn(
        "w-4 h-4 shrink-0 transition-colors",
        active ? "text-sky-400" : "text-slate-600 group-hover:text-slate-400"
      )} />
      <span>{label}</span>
      {badge && (
        <span className="ml-auto bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5
                         rounded-full min-w-[18px] text-center leading-tight">
          {badge}
        </span>
      )}
    </Link>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────

export function Sidebar() {
  const pathname = usePathname();
  const router   = useRouter();

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <aside className="flex flex-col w-60 bg-[#0d1117] border-r border-slate-800/80 h-screen fixed left-0 top-0 z-30">

      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-14 border-b border-slate-800/80 shrink-0">
        <div className="flex items-center justify-center w-7 h-7 rounded-lg
                        bg-gradient-to-br from-sky-400 to-blue-700 shadow shadow-sky-700/40">
          <Shield className="w-3.5 h-3.5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white tracking-tight leading-none">AegisX</p>
          <p className="text-[10px] text-slate-600 leading-none mt-1">NGFW Platform</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse-slow" />
          <span className="text-[10px] font-semibold text-emerald-600 tracking-wide">LIVE</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-3 overflow-y-auto space-y-0.5">

        <SectionLabel label="Monitor" />
        {monitorNav.map((item) => (
          <NavItem key={item.href} {...item} active={isActive(item.href)} />
        ))}

        <SectionLabel label="Security" />
        {securityNav.map((item) => (
          <NavItem key={item.href} {...item} active={isActive(item.href)} />
        ))}

        <SectionLabel label="Intelligence" />
        {intelligenceNav.map((item) => (
          <NavItem key={item.href} {...item} active={isActive(item.href)} />
        ))}

        <SectionLabel label="Network" />
        {networkNav.map((item) => <NavItem key={item.href} {...item} />)}

        <SectionLabel label="Observability" />
        {observabilityNav.map((item) => <NavItem key={item.href} {...item} />)}

      </nav>

      {/* Bottom */}
      <div className="px-3 py-3 border-t border-slate-800/80 space-y-0.5 shrink-0">
        <NavItem href="/settings" label="Settings" icon={Settings} soon />
        <button
          onClick={async () => { await api.logout(); router.push("/login"); }}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium
                     text-slate-500 hover:bg-red-950/40 hover:text-red-400 transition-colors
                     border-l-2 border-transparent"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <span>Sign out</span>
        </button>
        <p className="text-[10px] text-slate-700 px-3 pt-2">v0.1.0 · Apache 2.0</p>
      </div>
    </aside>
  );
}
