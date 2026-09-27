import { forwardRef, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { KatexMath } from "@/components/ui/KatexMath";

export interface StudioSliderProps {
  label?: ReactNode;
  value?: number;
  defaultValue?: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange?: (val: number) => void;
  /** Optional math-typeset node rendered next to the label. */
  mathLabel?: ReactNode;
  className?: string;
  valueDisplay?: ReactNode;
  disabled?: boolean;
  id?: string;
  name?: string;
  title?: string;
  "aria-label"?: string;

  /** When true, renders editable input boxes for min and max bounds */
  editableLimits?: boolean;
  onMinChange?: (min: number) => void;
  onMaxChange?: (max: number) => void;

  /** When true, renders static labels/badges for min and max bounds */
  showLimits?: boolean;
  /** Optional custom label for minimum limit */
  minLabel?: ReactNode;
  /** Optional custom label for maximum limit */
  maxLabel?: ReactNode;

  /** When true, renders the current value as an editable number input */
  editableValue?: boolean;

  /** Custom precision (decimal places) for display */
  precision?: number;

  /** Custom value formatter */
  formatValue?: (val: number) => string;

  /** If true, hides the default header (for custom or external headers) */
  hideHeader?: boolean;
}

function decimals(step: number): number {
  const text = String(step);
  return text.includes(".") ? text.split(".")[1].length : 0;
}

export const StudioSlider = forwardRef<HTMLInputElement, StudioSliderProps>(
  (
    {
      label,
      value,
      defaultValue,
      min,
      max,
      step = 1,
      unit = "",
      onChange,
      mathLabel,
      className,
      valueDisplay,
      disabled,
      editableLimits = false,
      onMinChange,
      onMaxChange,
      showLimits = false,
      minLabel,
      maxLabel,
      editableValue = false,
      precision,
      formatValue,
      hideHeader = false,
      ...props
    },
    ref
  ) => {
    const isControlled = value !== undefined;
    const [internalVal, setInternalVal] = useState(defaultValue ?? min);
    const currentVal = isControlled ? value : internalVal;

    const span = max - min;
    const pct = span > 0 ? Math.min(100, Math.max(0, ((currentVal - min) / span) * 100)) : 0;

    const containerRef = useRef<HTMLDivElement>(null);

    const handleInput = (event: React.ChangeEvent<HTMLInputElement>) => {
      const next = Number(event.target.value);
      if (!isControlled) {
        setInternalVal(next);
      }
      onChange?.(next);
      const nextPct = span > 0 ? Math.min(100, Math.max(0, ((next - min) / span) * 100)) : 0;
      if (containerRef.current) {
        containerRef.current.style.setProperty("--slider-pct", `${nextPct}%`);
        containerRef.current.style.setProperty("--slider-ratio", `${nextPct / 100}`);
      }
    };

    const renderHeader = () => {
      if (hideHeader || (!label && !mathLabel && valueDisplay === undefined && !editableValue)) {
        return null;
      }
      return (
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200">
            {label}
            {mathLabel}
          </span>
          {valueDisplay !== undefined ? (
            valueDisplay
          ) : editableValue ? (
            <input
              type="number"
              value={Number(currentVal.toFixed(precision ?? decimals(step)))}
              min={min}
              max={max}
              step={step}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                if (!isNaN(val)) onChange?.(val);
              }}
              style={{ fontFamily: "'KaTeX_Main', 'Times New Roman', serif" }}
              className="h-8 w-24 rounded-md border border-slate-200 bg-slate-50 px-2 text-right text-slate-800 text-lg tracking-wide focus:outline-blue-500 dark:border-slate-800 dark:bg-slate-950 dark:text-white [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield] m-0"
            />
          ) : (
            <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800">
              {formatValue ? formatValue(currentVal) : `${currentVal.toFixed(precision ?? decimals(step))}${unit}`}
            </span>
          )}
        </div>
      );
    };

    const renderTrack = () => (
      <span className="relative flex h-4 items-center flex-1 min-w-0">
        <span className="h-1.5 w-full bg-slate-200 dark:bg-slate-700 rounded-full relative overflow-hidden">
          <span
            className="block h-full bg-gradient-to-r from-[#2563EB] to-[#7C3AED] rounded-full"
            style={{ width: "var(--slider-pct)" }}
          />
        </span>
        <input
          ref={ref}
          type="range"
          min={min}
          max={max}
          step={step}
          value={isControlled ? value : undefined}
          defaultValue={!isControlled ? defaultValue : undefined}
          onChange={handleInput}
          onInput={handleInput}
          disabled={disabled}
          className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
          {...props}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-md border border-slate-200 dark:border-slate-600 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 peer-hover:scale-110 peer-active:scale-95 transition-all"
          style={{ left: "calc(8px + (100% - 16px) * var(--slider-ratio))" }}
        />
      </span>
    );

    return (
      <div
        ref={containerRef}
        className={cn("grid gap-2 text-xs font-medium text-slate-600 dark:text-slate-300", className)}
        style={{
          ["--slider-pct" as string]: `${pct}%`,
          ["--slider-ratio" as string]: `${pct / 100}`,
        }}
      >
        {renderHeader()}
        {editableLimits ? (
          <div className="flex items-center gap-3">
            <input
              type="number"
              value={min}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (!isNaN(v) && onMinChange) onMinChange(v);
              }}
              style={{ fontFamily: "'KaTeX_Main', 'Times New Roman', serif" }}
              className="font-serif text-slate-800 text-lg tracking-wide bg-transparent border-none outline-none w-16 text-center [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield] m-0 dark:text-white"
            />
            {renderTrack()}
            <input
              type="number"
              value={max}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (!isNaN(v) && onMaxChange) onMaxChange(v);
              }}
              style={{ fontFamily: "'KaTeX_Main', 'Times New Roman', serif" }}
              className="font-serif text-slate-800 text-lg tracking-wide bg-transparent border-none outline-none w-16 text-center [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield] m-0 dark:text-white"
            />
          </div>
        ) : (
          renderTrack()
        )}
        {showLimits && !editableLimits && (
          <div className="flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500 px-0.5 mt-0.5 tracking-wide select-none">
            <span className="flex items-center">
              {minLabel !== undefined && minLabel !== null ? (
                typeof minLabel === "string" || typeof minLabel === "number" ? (
                  <KatexMath math={String(minLabel).replace(/°/g, "^\\circ")} className="text-[11px] text-slate-400 dark:text-slate-500" />
                ) : (
                  minLabel
                )
              ) : (
                <KatexMath math={`${min}${unit ? (unit === "°" ? "^\\circ" : `\\ \\mathrm{${unit}}`) : ""}`} className="text-[11px] text-slate-400 dark:text-slate-500" />
              )}
            </span>
            <span className="flex items-center">
              {maxLabel !== undefined && maxLabel !== null ? (
                typeof maxLabel === "string" || typeof maxLabel === "number" ? (
                  <KatexMath math={String(maxLabel).replace(/°/g, "^\\circ")} className="text-[11px] text-slate-400 dark:text-slate-500" />
                ) : (
                  maxLabel
                )
              ) : (
                <KatexMath math={`${max}${unit ? (unit === "°" ? "^\\circ" : `\\ \\mathrm{${unit}}`) : ""}`} className="text-[11px] text-slate-400 dark:text-slate-500" />
              )}
            </span>
          </div>
        )}
      </div>
    );
  }
);

StudioSlider.displayName = "StudioSlider";
export default StudioSlider;

