import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type MathNumberInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export const MathNumberInput = forwardRef<HTMLInputElement, MathNumberInputProps>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    type="number"
    className={cn("bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1 text-slate-800 text-sm tracking-wide dark:text-white text-center focus:outline-blue-500 font-serif [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]", className)}
    {...props}
  />
));
MathNumberInput.displayName = "MathNumberInput";
