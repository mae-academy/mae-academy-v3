import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Fluid shell: edge-optimized wrapper shared by all studio dashboards.
export function StudioShell({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("w-full max-w-[1536px] mx-auto px-3 sm:px-4 lg:px-6 py-4", className)}>{children}</div>;
}

export interface StudioDashboardGridProps {
  leftPanel: ReactNode;
  rightPanel: ReactNode;
  leftCols?: string;
  rightCols?: string;
}

// Side-by-side split triggers at lg (1024px), never deferred to xl/2xl.
export const StudioDashboardGrid = ({
  leftPanel,
  rightPanel,
  leftCols = "lg:col-span-5 xl:col-span-5",
  rightCols = "lg:col-span-7 xl:col-span-7",
}: StudioDashboardGridProps) => (
  <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5 items-start w-full">
    <div className={cn(leftCols, "min-w-0 space-y-4 w-full")}>{leftPanel}</div>
    <div className={cn(rightCols, "min-w-0 space-y-4 w-full lg:sticky lg:top-4")}>{rightPanel}</div>
  </div>
);
