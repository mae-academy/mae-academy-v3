import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function InnerBox({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border border-slate-200/60 dark:border-slate-800/60 bg-slate-50/60 dark:bg-slate-950/40 p-4 transition-all", className)} {...props} />;
}
