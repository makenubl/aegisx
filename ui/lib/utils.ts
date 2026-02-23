import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function severityLabel(sev: number): string {
  return ["", "High", "Medium", "Low"][sev] ?? "Unknown";
}

export function severityClass(sev: number): string {
  return ["", "badge-red", "badge-yellow", "badge-blue"][sev] ?? "badge-gray";
}

export function actionClass(action: string): string {
  return action === "accept" || action === "ALLOW" ? "badge-green" : "badge-red";
}
