import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string | number | boolean = string> {
  value: T;
  label: ReactNode;
  href?: string;
  disabled?: boolean;
  badge?: ReactNode;
  icon?: ReactNode;
  "aria-label"?: string;
}

export interface SegmentedControlProps<T extends string | number | boolean = string> {
  options: ReadonlyArray<SegmentedOption<T>>;
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
    pill: "h-6 px-2.5 py-1 text-[11px]",
    icon: "h-3 w-3",
  },
  md: {
    container: "p-1 gap-1",
    pill: "h-7.5 px-2.5 sm:px-3.5 py-1 text-[11px] sm:text-xs",
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
  className,
  pillClassName,
  fullWidth = false,
  disabled = false,
  "aria-label": ariaLabel,
}: SegmentedControlProps<T>) {
  const currentSize = sizeStyles[size] || sizeStyles.md;

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex max-w-full overflow-x-auto no-scrollbar items-center rounded-full bg-slate-100/90 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 backdrop-blur-md shadow-inner",
        currentSize.container,
        fullWidth && "w-full flex",
        className
      )}
    >
      {options.map((option) => {
        const isActive = option.value === value;
        const isDisabled = disabled || option.disabled;

        const content = (
          <>
            {option.icon && (
              <span className={cn("shrink-0", currentSize.icon)}>
                {option.icon}
              </span>
            )}
            <span>{option.label}</span>
            {option.badge && (
              <span
                className={cn(
                  "ml-1.5 rounded-full px-1.5 py-0.5 font-['Poppins',sans-serif] text-[10px] sm:text-xs tracking-normal font-medium",
                  isActive
                    ? "bg-white/20 text-white"
                    : "bg-slate-200/60 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                )}
              >
                {option.badge}
              </span>
            )}
          </>
        );

        const pillClasses = cn(
          "rounded-full font-semibold transition-all duration-200 cursor-pointer inline-flex items-center justify-center gap-1.5 whitespace-nowrap select-none disabled:cursor-not-allowed disabled:opacity-40",
          currentSize.pill,
          fullWidth && "flex-1",
          isActive
            ? "text-white shadow-sm bg-gradient-to-br from-[#6366F1] via-[#8B5CF6] to-[#EC4899]"
            : "font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/40 dark:hover:bg-slate-800/40",
          pillClassName
        );

        if (option.href) {
          return (
            <a
              key={String(option.value)}
              href={option.href}
              role="tab"
              aria-selected={isActive}
              aria-label={option["aria-label"]}
              onClick={(e) => {
                if (isDisabled) {
                  e.preventDefault();
                  return;
                }
                onChange(option.value);
              }}
              className={pillClasses}
            >
              {content}
            </a>
          );
        }

        return (
          <button
            key={String(option.value)}
            type="button"
            role="tab"
            disabled={isDisabled}
            aria-selected={isActive}
            aria-label={option["aria-label"]}
            onClick={() => {
              if (!isDisabled && !isActive) {
                onChange(option.value);
              }
            }}
            className={pillClasses}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}

export default SegmentedControl;
