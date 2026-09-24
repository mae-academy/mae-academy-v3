import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { KatexMath } from "@/components/ui/KatexMath";

export interface FormulaBoxProps extends HTMLAttributes<HTMLDivElement> {
  math?: string;
  children?: ReactNode;
}

export function FormulaBox({ math, children, className, ...props }: FormulaBoxProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 p-3.5 flex items-center justify-center overflow-x-auto",
        className
      )}
      {...props}
    >
      {math ? <KatexMath math={math} displayMode /> : children}
    </div>
  );
}

