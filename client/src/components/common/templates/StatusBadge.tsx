import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StatusBadgeVariant = "default" | "info" | "danger" | "neutral" | "success" | "warning";

const variants: Record<StatusBadgeVariant, string> = {
  default: "bg-violet-50 text-violet-600 border border-violet-200 dark:bg-violet-950/40 dark:text-violet-400 dark:border-violet-800",
  info: "bg-blue-50 text-blue-600 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800",
  danger: "bg-rose-50 text-rose-600 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800",
  neutral: "bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:border-slate-700",
  success: "bg-emerald-50 text-emerald-600 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800",
  warning: "bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
};

export interface StatusBadgeProps {
  variant?: StatusBadgeVariant;
  className?: string;
  label?: string;
  children?: ReactNode;
}

export function StatusBadge({ variant = "default", className, label, children }: StatusBadgeProps) {
  return (
    <span className={cn("inline-flex items-center text-[11px] font-semibold px-2.5 py-0.5 rounded-full", variants[variant], className)}>
      {children ?? label}
    </span>
  );
}

