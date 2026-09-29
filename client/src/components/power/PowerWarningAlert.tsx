import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

export type PowerWarningSeverity = "error" | "warning" | "info";
export interface PowerWarning { code: string; message: string; }

export interface NoticeBadgeProps {
  label: ReactNode;
  tone?: "violet" | "amber" | "rose" | "sky" | "emerald" | "slate";
  className?: string;
}

const BADGE_TONES = {
  rose: "text-rose-600 dark:text-rose-400",
  amber: "text-amber-600 dark:text-amber-400",
  violet: "text-violet-600 dark:text-violet-400",
  sky: "text-sky-600 dark:text-sky-400",
  emerald: "text-emerald-600 dark:text-emerald-400",
  slate: "text-slate-600 dark:text-slate-400",
};

export function NoticeBadge({ label, tone = "rose", className = "" }: NoticeBadgeProps) {
  return (
    <span
      className={`font-sans text-xs sm:text-sm font-semibold tracking-wide uppercase ${BADGE_TONES[tone] ?? BADGE_TONES.rose} ${className}`}
    >
      {label}
    </span>
  );
}

export interface StudioAlertProps {
  variant?: "info" | "warning" | "error" | "default";
  badge?: ReactNode;
  title?: ReactNode;
  message?: ReactNode;
  children?: ReactNode;
  className?: string;
  action?: ReactNode;
}

export function StudioAlert({
  variant = "warning",
  badge,
  title,
  message,
  children,
  className = "",
  action,
}: StudioAlertProps) {
  const isViolet = variant === "info" || variant === "default";
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={`rounded-xl border bg-white dark:bg-slate-900 p-3 sm:p-3.5 shadow-sm transition-all ${
        isViolet
          ? "border-violet-200 dark:border-violet-900/60"
          : "border-rose-200 dark:border-rose-900/60"
      } ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {badge && (
            <NoticeBadge
              label={badge}
              tone={isViolet ? "violet" : "rose"}
            />
          )}
          {title && (
            <span className="font-sans text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100">
              {title}
            </span>
          )}
        </div>
        {action && <div>{action}</div>}
      </div>
      {(message || children) && (
        <div className="mt-1 font-sans text-xs sm:text-sm font-normal leading-relaxed text-slate-600 dark:text-slate-400">
          {message}
          {children}
        </div>
      )}
    </div>
  );
}

const SEVERITY_ORDER: Record<PowerWarningSeverity, number> = { error: 0, warning: 1, info: 2 };

// Maps each engine's warning code to a severity; the human-readable text always
// comes from the engine's own `message` (already parameterized with live values).
const WARNING_SEVERITY: Record<string, PowerWarningSeverity> = {
  FWD_INERT_FOR_LOAD: "info",
  EFFICIENCY_LOW: "warning",
  RIPPLE_EXCESSIVE: "warning",
  SHOOT_THROUGH: "error",
  OVERMODULATION: "warning",
  NYQUIST_VIOLATION: "error",
  BACK_EMF_EXCEEDED: "error",
  POOR_POWER_FACTOR: "warning",
  CONDUCTION_FAILURE: "error",
  DUTY_CYCLE_HIGH: "warning",
  BACK_EMF_REVERSES_CURRENT: "error",
  CCM_DCM_BOUNDARY: "info",
};

/** Unified MAE-compliant warning/alert component for Power Electronics Studios */
export function PowerWarningAlert({ warnings, className = "" }: { warnings: PowerWarning[]; className?: string }) {
  const { t } = useTranslation("simulators");
  const SEVERITY_CONFIG: Record<PowerWarningSeverity, { variant: "error" | "warning" | "info"; label: string }> = {
    error: { variant: "error", label: t("power.faultBadge", "FAULT") },
    warning: { variant: "warning", label: t("power.designWarningBadge", "DESIGN WARNING") },
    info: { variant: "info", label: t("power.systemNoticeBadge", "SYSTEM NOTICE") },
  };
  if (!warnings.length) return null;
  const sorted = [...warnings].sort(
    (a, b) => SEVERITY_ORDER[WARNING_SEVERITY[a.code] ?? "warning"] - SEVERITY_ORDER[WARNING_SEVERITY[b.code] ?? "warning"]
  );
  return (
    <div className={`space-y-2 ${className}`}>
      {sorted.map((warning) => {
        const severity = WARNING_SEVERITY[warning.code] ?? "warning";
        const cfg = SEVERITY_CONFIG[severity];
        return (
          <StudioAlert
            key={warning.code}
            variant={cfg.variant}
            badge={`${cfg.label} · ${warning.code.replace(/_/g, " ")}`}
            message={warning.message}
          />
        );
      })}
    </div>
  );
}
