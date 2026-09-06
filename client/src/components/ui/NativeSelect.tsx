import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/simulators/circuit-engine/models/utils";

export interface NativeSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  containerClassName?: string;
}

export const NativeSelect = React.forwardRef<HTMLSelectElement, NativeSelectProps>(
  ({ className, containerClassName, children, ...props }, ref) => {
    return (
      <div className={cn("relative w-full", containerClassName)}>
        <select
          ref={ref}
          className={cn(
            "w-full appearance-none rounded-xl border border-slate-200/80 bg-white px-4 py-2 pr-10 text-sm font-medium text-slate-700 shadow-sm outline-none transition focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200",
            className
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
      </div>
    );
  }
);

NativeSelect.displayName = "NativeSelect";

export default NativeSelect;
