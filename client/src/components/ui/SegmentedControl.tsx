import * as React from "react";

export interface SegmentedOption<T extends string | number = string> {
  label: React.ReactNode;
  value: T;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string | number = string> {
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
    pill: "h-6 px-2 text-[11px]",
    icon: "h-3 w-3",
  },
  md: {
    container: "p-1 gap-1",
    pill: "h-7 px-3 text-xs",
    icon: "h-3.5 w-3.5",
  },
  lg: {
    container: "p-1 gap-1",
    pill: "h-8.5 px-4 text-sm",
    icon: "h-4 w-4",
  },
};

export function SegmentedControl<T extends string | number = string>({
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
      className={`inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80 ${
        currentSize.container
      } ${fullWidth ? "w-full flex" : ""} ${className}`}
    >
      {options.map((option) => {
        const isActive = option.value === value;
        const isDisabled = disabled || option.disabled;

        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            disabled={isDisabled}
            onClick={() => {
              if (!isDisabled && !isActive) {
                onChange(option.value);
              }
            }}
            className={`rounded-full font-medium transition-all duration-150 ease-in-out cursor-pointer inline-flex items-center justify-center gap-1.5 whitespace-nowrap select-none disabled:cursor-not-allowed disabled:opacity-40 ${
              currentSize.pill
            } ${fullWidth ? "flex-1" : ""} ${
              isActive
                ? "brand-pill-active font-semibold shadow-sm text-white"
                : "brand-pill-inactive text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/50"
            } ${pillClassName}`}
          >
            {option.icon && (
              <span className={`shrink-0 ${currentSize.icon}`}>
                {option.icon}
              </span>
            )}
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export default SegmentedControl;
