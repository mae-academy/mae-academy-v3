import * as React from "react";

export interface SegmentedOption<T extends string | number | boolean = string> {
  label: React.ReactNode;
  value: T;
  icon?: React.ReactNode;
  badge?: string | React.ReactNode;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string | number | boolean = string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md" | "lg";
  className?: string;
  pillClassName?: string;
  fullWidth?: boolean;
  disabled?: boolean;
  "aria-label"?: string;
}

const sizeStyles = {
  sm: {
    container: "p-0.5 gap-0.5",
    pill: "h-6 px-2.5 text-[11px]",
    icon: "h-3 w-3",
  },
  md: {
    container: "p-1 gap-1",
    pill: "h-7.5 px-3.5 text-xs",
    icon: "h-3.5 w-3.5",
  },
  lg: {
    container: "p-1.5 gap-1.5",
    pill: "h-9 px-4 text-sm",
    icon: "h-4 w-4",
  },
};

export function SegmentedControl<T extends string | number | boolean = string>({
  options,
  value,
  onChange,
  size = "md",
  className = "",
  pillClassName = "",
  fullWidth = false,
  disabled = false,
  "aria-label": ariaLabel,
}: SegmentedControlProps<T>) {
  const currentSize = sizeStyles[size] || sizeStyles.md;

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`inline-flex items-center rounded-full bg-slate-100/90 dark:bg-slate-900/80 border border-slate-200/70 dark:border-slate-800 backdrop-blur-sm ${
        currentSize.container
      } ${fullWidth ? "w-full flex" : ""} ${className}`}
    >
      {options.map((option) => {
        const isActive = option.value === value;
        const isDisabled = disabled || option.disabled;

        return (
          <button
            key={String(option.value)}
            type="button"
            role="tab"
            aria-selected={isActive}
            disabled={isDisabled}
            onClick={() => {
              if (!isDisabled && !isActive) {
                onChange(option.value);
              }
            }}
            className={`rounded-full font-medium transition-all duration-200 ease-in-out cursor-pointer inline-flex items-center justify-center gap-1.5 whitespace-nowrap select-none disabled:cursor-not-allowed disabled:opacity-40 ${
              currentSize.pill
            } ${fullWidth ? "flex-1" : ""} ${
              isActive
                ? "bg-gradient-to-r from-[#2563eb] via-[#4f46e5] to-[#db2777] text-white font-medium shadow-sm brand-pill-active"
                : "brand-pill-inactive bg-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/40 dark:hover:bg-slate-800/40"
            } ${pillClassName}`}
          >
            {option.icon && (
              <span className={`shrink-0 ${currentSize.icon}`}>
                {option.icon}
              </span>
            )}
            <span>{option.label}</span>
            {option.badge && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold tracking-wide ${
                  isActive
                    ? "bg-white/20 text-white"
                    : "bg-slate-200/60 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                }`}
              >
                {option.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default SegmentedControl;
