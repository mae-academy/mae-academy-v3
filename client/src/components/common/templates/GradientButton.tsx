import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface GradientButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: "sm" | "md" | "lg";
  variant?: "default" | "ghost" | "outline";
}

export function GradientButton({
  className,
  type = "button",
  size = "md",
  variant = "default",
  ...props
}: GradientButtonProps) {
  const sizeClasses = {
    sm: "max-sm:min-h-11 px-3 py-1.5 text-xs",
    md: "max-sm:min-h-11 px-5 py-2 text-xs",
    lg: "max-sm:min-h-11 px-6 py-2.5 text-sm",
  }[size];

  const variantClasses = {
    default: "btn-active-brand hover:opacity-90 active:scale-95",
    ghost: "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 shadow-sm",
    outline: "text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 hover:border-violet-500 dark:hover:border-violet-400 bg-transparent",
  }[variant];

  return (
    <button
      type={type}
      className={cn(
        "rounded-full font-semibold transition-all inline-flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed",
        sizeClasses,
        variantClasses,
        className
      )}
      {...props}
    />
  );
}

