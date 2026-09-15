export type PowerWarningSeverity = "error" | "warning" | "info";
export interface PowerWarning { code: string; message: string; }

interface SeverityStyle { label: string; tone: string; role: "alert" | "status"; }

const SEVERITY_ORDER: Record<PowerWarningSeverity, number> = { error: 0, warning: 1, info: 2 };

const SEVERITY_STYLE: Record<PowerWarningSeverity, SeverityStyle> = {
  error: { label: "FAULT / VALIDATION", tone: "border-rose-500 bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300", role: "alert" },
  warning: { label: "DESIGN WARNING", tone: "border-amber-400 bg-amber-50/70 dark:bg-amber-400/10 text-amber-700 dark:text-amber-300", role: "status" },
  info: { label: "AUTO-CORRECTED", tone: "border-sky-400 bg-sky-50/70 dark:bg-sky-400/10 text-sky-700 dark:text-sky-300", role: "status" },
};

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
  BIDIRECTIONAL_ASYMMETRY: "info",
  DUTY_CYCLE_HIGH: "warning",
  BACK_EMF_REVERSES_CURRENT: "error",
  CCM_DCM_BOUNDARY: "info",
};

/** Reusable warning strip for the 4 power-electronics Studios; matches the existing
 * left-border-strip idiom already used for the DCM/shoot-through flags in this folder. */
export function PowerWarningAlert({ warnings, className = "" }: { warnings: PowerWarning[]; className?: string }) {
  if (!warnings.length) return null;
  const sorted = [...warnings].sort((a, b) => SEVERITY_ORDER[WARNING_SEVERITY[a.code] ?? "warning"] - SEVERITY_ORDER[WARNING_SEVERITY[b.code] ?? "warning"]);
  return (
    <div className={`space-y-2 ${className}`}>
      {sorted.map((warning) => {
        const severity = WARNING_SEVERITY[warning.code] ?? "warning";
        const style = SEVERITY_STYLE[severity];
        return (
          <div key={warning.code} role={style.role} className={`border-l-2 px-3 py-2 ${style.tone}`}>
            <div className="font-mono text-[9px] font-bold tracking-[.12em]">{style.label} · {warning.code}</div>
            <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">{warning.message}</p>
          </div>
        );
      })}
    </div>
  );
}
