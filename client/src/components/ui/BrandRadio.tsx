import * as React from "react";
import { cn } from "@/lib/utils";

export interface BrandRadioProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const BrandRadio = React.forwardRef<HTMLInputElement, BrandRadioProps>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        type="radio"
        className={cn(
          "h-4 w-4 shrink-0 cursor-pointer appearance-none rounded-full border-2 border-slate-300 bg-white transition focus:outline-none focus:ring-2 focus:ring-blue-500/30 checked:border-transparent checked:bg-[radial-gradient(circle,#ffffff_35%,transparent_40%),linear-gradient(90deg,#2563eb_0%,#7c3aed_50%,#f43f5e_100%)] dark:border-slate-600 dark:bg-slate-900",
          className
        )}
        {...props}
      />
    );
  }
);

BrandRadio.displayName = "BrandRadio";

export default BrandRadio;
