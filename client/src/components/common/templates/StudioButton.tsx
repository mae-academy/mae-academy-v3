import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function StudioButton({ className, type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={cn("max-sm:inline-flex max-sm:min-h-11 max-sm:items-center max-sm:justify-center rounded-full px-4 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-all", className)} {...props} />;
}
