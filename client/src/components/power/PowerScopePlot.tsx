import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { KatexMath } from "@/components/ui/KatexMath";
import { SegmentedControl } from "@/components/common/templates";

export interface ScopePoint {
  t: number; // in milliseconds (or seconds if indicated)
  val: number;
}

export interface ScopeSeries {
  id: string;
  katexName: string;
  data: ScopePoint[];
  color: string;
  axis?: "voltage" | "current";
  unit?: string;
  stepped?: boolean;
  dashArray?: string;
  strokeWidth?: number;
  defaultHidden?: boolean;
}

export interface HarmonicItem {
  order: number;
  rms: number;
  frequency?: number;
}

export interface PowerScopePlotProps {
  title?: React.ReactNode;
  subtitleLatex?: string;
  badge?: {
    label: string;
    tone?: "violet" | "emerald" | "amber" | "rose" | "blue";
  };
  series: ScopeSeries[];
  height?: number | string;
  className?: string;
  xLabelKatex?: string;
  yVoltageLabelKatex?: string;
  yCurrentLabelKatex?: string;
  headerRight?: React.ReactNode;
  dcmExtinctionTimeMs?: number | null;
  dcmExtinctionLabel?: string;
  dcmWindowStartMs?: number | null;
  annotations?: Array<{ timeMs: number; label: string; color: string }>;
  spectrum?: {
    harmonics: HarmonicItem[];
    fundamentalRms?: number;
    thdPercent?: number;
  } | null;
}

function getNiceTicks(min: number, max: number, maxTicks = 5): number[] {
  const span = max - min;
  if (span <= 0) return [min];
  const roughStep = span / maxTicks;
  const power = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const norm = roughStep / power;
  let step: number;
  if (norm < 1.5) step = 1 * power;
  else if (norm < 3.5) step = 2 * power;
  else if (norm < 7.5) step = 5 * power;
  else step = 10 * power;

  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let val = start; val <= max + step * 0.001; val += step) {
    const clean = Math.abs(val) < 1e-9 ? 0 : Number(val.toFixed(6));
    ticks.push(clean);
  }
  return ticks;
}

function getSpectrumTicks(maxVal: number): { ticks: number[]; vMax: number } {
  const safeMax = Math.max(1, maxVal);
  const roughStep = safeMax / 5;
  const power = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const norm = roughStep / power;
  let step: number;
  if (norm < 1.5) step = 1 * power;
  else if (norm < 3.5) step = 2 * power;
  else if (norm < 7.5) step = 5 * power;
  else step = 10 * power;

  let vMax = Math.ceil(safeMax / step) * step;
  // If the maximum value is right at the top line (or within 2% of it),
  // add an extra step of headroom so the stem and lollipop dot don't get clipped.
  if (safeMax >= vMax - step * 0.02) {
    vMax += step;
  }

  const ticks: number[] = [];
  for (let val = 0; val <= vMax + step * 0.001; val += step) {
    const clean = Math.abs(val) < 1e-9 ? 0 : Number(val.toFixed(6));
    ticks.push(clean);
  }
  return { ticks, vMax };
}

function interpolateVal(data: ScopePoint[], tTarget: number): number | null {
  if (!data || data.length === 0) return null;
  if (tTarget <= data[0].t) return data[0].val;
  if (tTarget >= data[data.length - 1].t) return data[data.length - 1].val;

  let low = 0;
  let high = data.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (data[mid].t === tTarget) return data[mid].val;
    if (data[mid].t < tTarget) low = mid + 1;
    else high = mid - 1;
  }

  const p0 = data[high];
  const p1 = data[low];
  if (!p0 || !p1) return null;
  const dt = p1.t - p0.t;
  if (dt === 0) return p0.val;
  const fraction = (tTarget - p0.t) / dt;
  return p0.val + fraction * (p1.val - p0.val);
}

const badgeToneStyles = {
  violet: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-400/30 dark:bg-violet-500/15 dark:text-violet-200",
  emerald: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/15 dark:text-emerald-200",
  amber: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/15 dark:text-amber-200",
  rose: "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-400/30 dark:bg-rose-500/15 dark:text-rose-200",
  blue: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-400/30 dark:bg-blue-500/15 dark:text-blue-200",
};

export function PowerScopePlot({
  title,
  subtitleLatex,
  badge,
  series,
  height = 500,
  className = "",
  xLabelKatex = "t\\ \\mathrm{[ms]}",
  yVoltageLabelKatex = "V\\ \\mathrm{[V]}",
  yCurrentLabelKatex = "I\\ \\mathrm{[A]}",
  headerRight,
  dcmExtinctionTimeMs,
  dcmExtinctionLabel = "I_o = 0",
  dcmWindowStartMs,
  annotations = [],
  spectrum,
}: PowerScopePlotProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<"waveform" | "spectrum">("waveform");
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({
    width: 760,
    height: typeof height === "number" ? height : 500,
  });

  const [hiddenSeries, setHiddenSeries] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    series.forEach((s) => {
      if (s.defaultHidden) initial[s.id] = true;
    });
    return initial;
  });

  const toggleSeries = useCallback((id: string) => {
    setHiddenSeries((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const [hoverState, setHoverState] = useState<{
    xScreen: number;
    yScreen: number;
    tMs: number;
    values: {
      seriesId: string;
      katexName: string;
      color: string;
      val: number;
      axis: "voltage" | "current";
      unit?: string;
    }[];
  } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setContainerSize({ width: rect.width, height: rect.height });
      }
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const visibleSeries = useMemo(() => {
    return series.filter((s) => !hiddenSeries[s.id]);
  }, [series, hiddenSeries]);

  const hasCurrentAxis = useMemo(() => {
    return visibleSeries.some((s) => s.axis === "current");
  }, [visibleSeries]);

  const padding = useMemo(
    () => ({
      top: 26,
      right: hasCurrentAxis ? 56 : 24,
      bottom: 40,
      left: 56,
    }),
    [hasCurrentAxis]
  );

  const plotWidth = Math.max(10, containerSize.width - padding.left - padding.right);
  const plotHeight = Math.max(10, containerSize.height - padding.top - padding.bottom);

  // Bounds evaluation
  const { tMin, tMax, vMin, vMax, iMin, iMax, hasNegativeV, hasNegativeI } = useMemo(() => {
    let minT = 0;
    let maxT = 0;
    let minV = 0;
    let maxV = -Infinity;
    let minI = 0;
    let maxI = -Infinity;
    let hasNegV = false;
    let hasNegI = false;

    for (const s of visibleSeries) {
      const isCur = s.axis === "current";
      for (const p of s.data) {
        if (p.t > maxT) maxT = p.t;
        if (isCur) {
          if (p.val > maxI) maxI = p.val;
          if (p.val < minI) {
            minI = p.val;
            if (p.val < -0.01) hasNegI = true;
          }
        } else {
          if (p.val > maxV) maxV = p.val;
          if (p.val < minV) {
            minV = p.val;
            if (p.val < -0.01) hasNegV = true;
          }
        }
      }
    }

    if (maxT <= 0) maxT = 20;
    if (maxV === -Infinity) maxV = 100;
    if (maxI === -Infinity) maxI = 10;

    // Voltage scaling: if AC / bipolar, make symmetric; if DC, pin at 0 with top margin
    let computedVMin = 0;
    let computedVMax = 100;
    if (hasNegV) {
      const peakV = Math.max(Math.abs(minV), Math.abs(maxV)) * 1.15;
      computedVMin = -peakV;
      computedVMax = peakV;
    } else {
      computedVMin = 0;
      computedVMax = Math.max(1, maxV * 1.15);
    }

    // Current scaling
    let computedIMin = 0;
    let computedIMax = 10;
    if (hasNegI) {
      const peakI = Math.max(Math.abs(minI), Math.abs(maxI)) * 1.18;
      computedIMin = -peakI;
      computedIMax = peakI;
    } else {
      computedIMin = 0;
      computedIMax = Math.max(0.5, maxI * 1.18);
    }

    return {
      tMin: minT,
      tMax: maxT,
      vMin: computedVMin,
      vMax: computedVMax,
      iMin: computedIMin,
      iMax: computedIMax,
      hasNegativeV: hasNegV,
      hasNegativeI: hasNegI,
    };
  }, [visibleSeries]);

  const toX = useCallback(
    (t: number) => {
      const ratio = (t - tMin) / (tMax - tMin || 1);
      return padding.left + ratio * plotWidth;
    },
    [tMin, tMax, padding.left, plotWidth]
  );

  const toYVoltage = useCallback(
    (val: number) => {
      const ratio = (val - vMin) / (vMax - vMin || 1);
      return padding.top + (1 - ratio) * plotHeight;
    },
    [vMin, vMax, padding.top, plotHeight]
  );

  const toYCurrent = useCallback(
    (val: number) => {
      const ratio = (val - iMin) / (iMax - iMin || 1);
      return padding.top + (1 - ratio) * plotHeight;
    },
    [iMin, iMax, padding.top, plotHeight]
  );

  const toTFromX = useCallback(
    (pixelX: number) => {
      const clampedX = Math.max(padding.left, Math.min(padding.left + plotWidth, pixelX));
      const ratio = (clampedX - padding.left) / (plotWidth || 1);
      return tMin + ratio * (tMax - tMin);
    },
    [padding.left, plotWidth, tMin, tMax]
  );

  const tTicks = useMemo(() => getNiceTicks(tMin, tMax, 5), [tMin, tMax]);
  const vTicks = useMemo(() => getNiceTicks(vMin, vMax, 5), [vMin, vMax]);
  const iTicks = useMemo(() => getNiceTicks(iMin, iMax, 5), [iMin, iMax]);

  const zeroYVoltage = toYVoltage(0);
  const zeroYCurrent = toYCurrent(0);

  // SVG Paths
  const seriesPaths = useMemo(() => {
    return visibleSeries.map((s) => {
      if (s.data.length === 0) return { ...s, pathD: "" };
      const isCur = s.axis === "current";
      const scaleY = isCur ? toYCurrent : toYVoltage;
      let d = "";

      for (let i = 0; i < s.data.length; i++) {
        const pt = s.data[i];
        const px = toX(pt.t);
        const py = scaleY(pt.val);
        if (i === 0) {
          d += `M ${px.toFixed(1)} ${py.toFixed(1)}`;
        } else if (s.stepped) {
          d += ` H ${px.toFixed(1)} V ${py.toFixed(1)}`;
        } else {
          d += ` L ${px.toFixed(1)} ${py.toFixed(1)}`;
        }
      }
      return {
        ...s,
        pathD: d,
      };
    });
  }, [visibleSeries, toX, toYVoltage, toYCurrent]);

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (
      mouseX < padding.left ||
      mouseX > padding.left + plotWidth ||
      mouseY < padding.top ||
      mouseY > padding.top + plotHeight
    ) {
      setHoverState(null);
      return;
    }

    const tMs = toTFromX(mouseX);
    const values: {
      seriesId: string;
      katexName: string;
      color: string;
      val: number;
      axis: "voltage" | "current";
      unit?: string;
    }[] = [];

    for (const s of visibleSeries) {
      const interpolated = interpolateVal(s.data, tMs);
      if (interpolated !== null) {
        values.push({
          seriesId: s.id,
          katexName: s.katexName,
          color: s.color,
          val: interpolated,
          axis: s.axis ?? "voltage",
          unit: s.unit ?? (s.axis === "current" ? "A" : "V"),
        });
      }
    }

    setHoverState({
      xScreen: mouseX,
      yScreen: mouseY,
      tMs,
      values,
    });
  };

  const handlePointerLeave = () => {
    setHoverState(null);
  };

  return (
    <section
      className={`relative flex flex-col w-full min-h-0 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-950/80 backdrop-blur shadow-sm p-4 md:p-6 power-scope-card ${className}`}
      style={height !== undefined ? { height: typeof height === "number" ? `${height}px` : height } : undefined}
    >
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200/60 dark:border-slate-800/80">
        <div>
          <div className="flex items-center gap-2">
            {title && (
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-white">
                {title}
              </h3>
            )}
            {badge && (
              <span
                className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${
                  badgeToneStyles[badge.tone ?? "violet"]
                }`}
              >
                {badge.label}
              </span>
            )}
          </div>
          {subtitleLatex && (
            <KatexMath
              math={subtitleLatex}
              className="mt-1 block text-xs text-slate-500 dark:text-slate-400"
            />
          )}
        </div>

        {/* Toolbar & Interactive Signal Legend */}
        <div className="flex flex-wrap items-center gap-2.5">
          {activeTab === "waveform" && series.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5" role="toolbar" aria-label="Signal toggles">
              {series.map((s) => {
                const isHidden = !!hiddenSeries[s.id];
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleSeries(s.id)}
                    aria-pressed={!isHidden}
                    className={`group inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium transition-all select-none cursor-pointer ${
                      isHidden
                        ? "border border-dashed border-slate-300 dark:border-slate-700 bg-slate-100/50 dark:bg-slate-800/40 text-slate-400 opacity-50 hover:opacity-80"
                        : "border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 shadow-sm hover:border-slate-300 dark:hover:border-slate-600"
                    }`}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full transition-transform group-hover:scale-110 shrink-0"
                      style={{ backgroundColor: s.color }}
                    />
                    <span className="font-semibold">
                      <KatexMath math={s.katexName} />
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {headerRight}

          {spectrum && (
            <SegmentedControl
              options={[
                { label: "Waveforms", value: "waveform" },
                { label: "Harmonic Spectrum", value: "spectrum" },
              ]}
              value={activeTab}
              onChange={setActiveTab}
              size="sm"
              aria-label="Scope Display Mode"
            />
          )}
        </div>
      </div>

      {/* Main Plot Area */}
      {activeTab === "waveform" ? (
        <div ref={containerRef} className="relative flex-1 w-full min-h-0 overflow-hidden select-none mt-2">
          {/* Voltage Y-Axis KaTeX Label (Top-Left) */}
          <div className="pointer-events-none absolute top-1 left-2 z-10 text-[11px] font-medium text-slate-500 dark:text-slate-400">
            <KatexMath math={yVoltageLabelKatex} />
          </div>

          {/* Current Y-Axis KaTeX Label (Top-Right) */}
          {hasCurrentAxis && (
            <div className="pointer-events-none absolute top-1 right-2 z-10 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <KatexMath math={yCurrentLabelKatex} />
            </div>
          )}

          {/* Time X-Axis KaTeX Label (Bottom-Right) */}
          <div className="pointer-events-none absolute bottom-1 right-2 z-10 text-[11px] font-medium text-slate-500 dark:text-slate-400">
            <KatexMath math={xLabelKatex} />
          </div>

          <svg
            width="100%"
            height="100%"
            className="w-full flex-1 min-h-0 overflow-visible cursor-crosshair touch-none power-scope-svg"
            role="img"
            aria-label="Power electronics waveform scope"
            onPointerMove={handlePointerMove}
            onPointerLeave={handlePointerLeave}
          >
            {/* DCM Discontinuous Window Background Highlight */}
            {dcmWindowStartMs !== undefined && dcmWindowStartMs !== null && (
              <rect
                x={toX(dcmWindowStartMs)}
                y={padding.top}
                width={Math.max(0, padding.left + plotWidth - toX(dcmWindowStartMs))}
                height={plotHeight}
                fill="#7c3aed"
                fillOpacity="0.08"
              />
            )}

            {/* Subtle Grid Lines */}
            <g className="grid-lines" aria-hidden="true">
              {/* Vertical time grid */}
              {tTicks.map((tick) => {
                const xPos = toX(tick);
                return (
                  <line
                    key={`ttick-${tick}`}
                    x1={xPos}
                    y1={padding.top}
                    x2={xPos}
                    y2={padding.top + plotHeight}
                    className="stroke-slate-300/40 dark:stroke-slate-700/40"
                    strokeDasharray="3,3"
                    strokeWidth="1"
                  />
                );
              })}

              {/* Horizontal voltage grid */}
              {vTicks.map((tick) => {
                const yPos = toYVoltage(tick);
                return (
                  <line
                    key={`vtick-${tick}`}
                    x1={padding.left}
                    y1={yPos}
                    x2={padding.left + plotWidth}
                    y2={yPos}
                    className="stroke-slate-300/40 dark:stroke-slate-700/40"
                    strokeDasharray="3,3"
                    strokeWidth="1"
                  />
                );
              })}
            </g>

            {/* Prominent Zero-Crossing Line */}
            {hasNegativeV ? (
              <line
                x1={padding.left}
                y1={zeroYVoltage}
                x2={padding.left + plotWidth}
                y2={zeroYVoltage}
                className="stroke-slate-400/70 dark:stroke-slate-500/70"
                strokeWidth="1.5"
              />
            ) : null}

            {/* Rails */}
            <g className="axes-rails" aria-hidden="true">
              {/* Left Y-axis rail */}
              <line
                x1={padding.left}
                y1={padding.top}
                x2={padding.left}
                y2={padding.top + plotHeight}
                className="stroke-slate-400 dark:stroke-slate-600"
                strokeWidth="1.5"
              />

              {/* Right Y-axis rail (if current axis present) */}
              {hasCurrentAxis && (
                <line
                  x1={padding.left + plotWidth}
                  y1={padding.top}
                  x2={padding.left + plotWidth}
                  y2={padding.top + plotHeight}
                  className="stroke-slate-400 dark:stroke-slate-600"
                  strokeWidth="1.5"
                />
              )}

              {/* Baseline rail */}
              <line
                x1={padding.left}
                y1={hasNegativeV ? padding.top + plotHeight : zeroYVoltage}
                x2={padding.left + plotWidth}
                y2={hasNegativeV ? padding.top + plotHeight : zeroYVoltage}
                className="stroke-slate-400 dark:stroke-slate-600"
                strokeWidth="1.5"
              />
            </g>

            {/* Ticks Text */}
            <g className="ticks-text select-none" aria-hidden="true">
              {/* X tick labels */}
              {tTicks.map((tick) => {
                const xPos = toX(tick);
                return (
                  <text
                    key={`lbl-t-${tick}`}
                    x={xPos}
                    y={padding.top + plotHeight + 16}
                    textAnchor="middle"
                    style={{ fontFamily: "'KaTeX_Main', 'KaTeX_Math', 'Times New Roman', serif" }}
                    className="fill-slate-600 dark:fill-slate-300 text-[11px] font-medium"
                  >
                    {tick.toFixed(tick < 1 ? 2 : 0)}
                  </text>
                );
              })}

              {/* Voltage Y tick labels (Left) */}
              {vTicks.map((tick) => {
                const yPos = toYVoltage(tick);
                return (
                  <text
                    key={`lbl-v-${tick}`}
                    x={padding.left - 6}
                    y={yPos + 4}
                    textAnchor="end"
                    style={{ fontFamily: "'KaTeX_Main', 'KaTeX_Math', 'Times New Roman', serif" }}
                    className="fill-slate-600 dark:fill-slate-300 text-[11px] font-medium"
                  >
                    {Math.round(tick)}
                  </text>
                );
              })}

              {/* Current Y tick labels (Right) */}
              {hasCurrentAxis &&
                iTicks.map((tick) => {
                  const yPos = toYCurrent(tick);
                  return (
                    <text
                      key={`lbl-i-${tick}`}
                      x={padding.left + plotWidth + 6}
                      y={yPos + 4}
                      textAnchor="start"
                      style={{ fontFamily: "'KaTeX_Main', 'KaTeX_Math', 'Times New Roman', serif" }}
                      className="fill-rose-500/90 dark:fill-rose-300 text-[11px] font-medium"
                    >
                      {Number(tick.toFixed(1))}
                    </text>
                  );
                })}
            </g>

            {/* Custom Engineering Annotations */}
            {annotations.map((ann, idx) => {
              const xPos = toX(ann.timeMs);
              return (
                <g key={`ann-${idx}`}>
                  <line
                    x1={xPos}
                    x2={xPos}
                    y1={padding.top}
                    y2={padding.top + plotHeight}
                    stroke={ann.color}
                    strokeDasharray="4,4"
                    strokeWidth="1.2"
                  />
                  <text
                    x={xPos + 4}
                    y={padding.top + 14}
                    fill={ann.color}
                    style={{ fontFamily: "'KaTeX_Main', 'KaTeX_Math', 'Times New Roman', serif" }}
                    fontSize="12"
                    fontWeight="600"
                  >
                    {ann.label}
                  </text>
                </g>
              );
            })}

            {/* DCM Extinction Marker */}
            {dcmExtinctionTimeMs !== undefined && dcmExtinctionTimeMs !== null && dcmExtinctionTimeMs >= 0 && (
              <g className="dcm-marker">
                <line
                  x1={toX(dcmExtinctionTimeMs)}
                  x2={toX(dcmExtinctionTimeMs)}
                  y1={padding.top}
                  y2={padding.top + plotHeight}
                  stroke="#7c3aed"
                  strokeWidth="1.5"
                  strokeDasharray="5,4"
                />
                <text
                  x={toX(dcmExtinctionTimeMs) + 6}
                  y={padding.top + 16}
                  fill="#7c3aed"
                  style={{ fontFamily: "'KaTeX_Main', 'KaTeX_Math', 'Times New Roman', serif" }}
                  fontSize="11"
                  fontWeight="700"
                >
                  {dcmExtinctionLabel}
                </text>
              </g>
            )}

            {/* Signal Curves */}
            <g className="signal-curves">
              {seriesPaths.map((s) => (
                <path
                  key={s.id}
                  d={s.pathD}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={s.strokeWidth ?? 2.5}
                  strokeDasharray={s.dashArray}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </g>

            {/* Crosshair Cursor on Hover */}
            {hoverState && (
              <g className="crosshair-indicator" pointerEvents="none">
                <line
                  x1={hoverState.xScreen}
                  y1={padding.top}
                  x2={hoverState.xScreen}
                  y2={padding.top + plotHeight}
                  className="stroke-slate-400/60 dark:stroke-slate-500/60"
                  strokeWidth="1"
                  strokeDasharray="2,2"
                />

                {hoverState.values.map((v) => {
                  const py = v.axis === "current" ? toYCurrent(v.val) : toYVoltage(v.val);
                  return (
                    <circle
                      key={`hover-dot-${v.seriesId}`}
                      cx={hoverState.xScreen}
                      cy={py}
                      r="3.5"
                      fill={v.color}
                      className="stroke-white dark:stroke-slate-900"
                      strokeWidth="1.5"
                    />
                  );
                })}
              </g>
            )}
          </svg>

          {/* Floating Apple-Style HUD Tooltip */}
          {hoverState && (
            <div
              className="absolute pointer-events-none z-20 backdrop-blur-md bg-white/95 text-slate-900 border border-slate-200/80 shadow-xl shadow-slate-900/10 dark:bg-slate-900/90 dark:text-slate-100 dark:border-slate-700/60 dark:shadow-2xl rounded-xl p-3 text-xs transition-transform duration-75 min-w-44"
              style={{
                left: Math.min(containerSize.width - 200, Math.max(10, hoverState.xScreen + 14)),
                top: Math.min(containerSize.height - 150, Math.max(10, hoverState.yScreen - 30)),
              }}
            >
              {/* Header: Time in KaTeX */}
              <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-700/60 pb-1.5 mb-2 font-mono text-[11px]">
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  <KatexMath math={`t = ${hoverState.tMs.toFixed(2)}\\text{ ms}`} />
                </span>
              </div>

              {/* Signals */}
              <div className="space-y-1.5">
                {hoverState.values.map((v) => (
                  <div key={v.seriesId} className="flex items-center justify-between gap-3 text-[11px]">
                    <span className="flex items-center gap-1.5 truncate">
                      <span
                        className="h-2 w-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: v.color }}
                      />
                      <KatexMath
                        math={`${v.katexName} = ${v.val.toFixed(2)}\\text{ ${v.unit}}`}
                        className="font-serif text-slate-900 dark:text-slate-100 font-medium"
                      />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Harmonic Spectrum View */
        <HarmonicSpectrumView spectrum={spectrum!} />
      )}
    </section>
  );
}

function HarmonicSpectrumView({
  spectrum,
}: {
  spectrum: NonNullable<PowerScopePlotProps["spectrum"]>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({
    width: 650,
    height: 320,
  });

  const [hovered, setHovered] = useState<{ order: number; rms: number; x: number; y: number } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setContainerSize({ width: rect.width, height: rect.height });
      }
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const harmonics = useMemo(() => spectrum.harmonics.filter((h) => h.order <= 25), [spectrum.harmonics]);
  const rawMaxRms = useMemo(
    () => Math.max(1, ...harmonics.map((h) => h.rms), spectrum.fundamentalRms ?? 0),
    [harmonics, spectrum.fundamentalRms]
  );

  const padding = useMemo(
    () => ({
      top: 24,
      right: 36,
      bottom: 32,
      left: 48,
    }),
    []
  );

  const plotWidth = Math.max(10, containerSize.width - padding.left - padding.right);
  const plotHeight = Math.max(10, containerSize.height - padding.top - padding.bottom);

  const { ticks: vTicks, vMax } = useMemo(() => getSpectrumTicks(rawMaxRms), [rawMaxRms]);

  const toX = useCallback(
    (idx: number) => {
      const denom = Math.max(1, harmonics.length - 1);
      return padding.left + (idx / denom) * plotWidth;
    },
    [harmonics.length, padding.left, plotWidth]
  );

  const toY = useCallback(
    (rms: number) => {
      const ratio = Math.max(0, rms) / (vMax || 1);
      return padding.top + (1 - ratio) * plotHeight;
    },
    [padding.top, plotHeight, vMax]
  );

  return (
    <div className="relative flex-1 min-h-0 flex flex-col gap-2.5 mt-2 w-full overflow-hidden">
      {/* Metrics Banner with KaTeX Typography */}
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/70 bg-slate-50/70 px-4 py-2 dark:border-slate-800 dark:bg-slate-900/60 backdrop-blur-sm">
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="block text-xs font-semibold text-slate-500 dark:text-slate-400">
              <KatexMath math="V_{o1,\text{RMS}}" />:
            </span>
            <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
              <KatexMath math={`${(spectrum.fundamentalRms ?? (harmonics[0]?.rms || 0)).toFixed(2)}\\text{ V}`} />
            </span>
          </div>
          {spectrum.thdPercent !== undefined && (
            <div className="flex items-center gap-2">
              <span className="block text-xs font-semibold text-slate-500 dark:text-slate-400">
                <KatexMath math="\text{THD}_v" />:
              </span>
              <span className="text-sm font-bold text-violet-600 dark:text-violet-400">
                <KatexMath math={`${spectrum.thdPercent.toFixed(2)}\\%`} />
              </span>
            </div>
          )}
        </div>
        <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
          <KatexMath math="n = 1, \dots, 25" />
        </div>
      </div>

      {/* SVG Bar / Stem Chart Container (Fits exactly inside available height) */}
      <div ref={containerRef} className="relative flex-1 min-h-0 w-full overflow-hidden select-none">
        {/* Y-Axis KaTeX Label (Top-Left) */}
        <div className="pointer-events-none absolute top-1 left-2 z-10 text-[11px] font-medium text-slate-500 dark:text-slate-400">
          <KatexMath math="V_{n,\text{RMS}}\ [\mathrm{V}]" />
        </div>

        {/* X-Axis KaTeX Label (Bottom-Right) */}
        <div className="pointer-events-none absolute bottom-0.5 right-2 z-10 text-[11px] font-medium text-slate-500 dark:text-slate-400">
          <KatexMath math="n\ \mathrm{[Harmonic\ Order]}" />
        </div>

        <svg
          width="100%"
          height="100%"
          className="w-full h-full cursor-crosshair"
          role="img"
          aria-label="Harmonic spectrum plot"
          onPointerLeave={() => setHovered(null)}
        >
          {/* Horizontal grid lines & Y tick numbers in KaTeX math font */}
          {vTicks.map((tick) => {
            const yPos = toY(tick);
            return (
              <g key={`ytick-${tick}`}>
                <line
                  x1={padding.left}
                  x2={padding.left + plotWidth}
                  y1={yPos}
                  y2={yPos}
                  stroke={tick === 0 ? "rgba(148, 163, 184, 0.35)" : "rgba(148, 163, 184, 0.15)"}
                  strokeDasharray={tick === 0 ? undefined : "3,3"}
                />
                <text
                  x={padding.left - 6}
                  y={yPos + 4}
                  textAnchor="end"
                  style={{ fontFamily: "'KaTeX_Main', 'KaTeX_Math', 'Times New Roman', serif" }}
                  className="fill-slate-600 dark:fill-slate-300 text-[11px] font-medium"
                >
                  {Number(tick.toFixed(tick < 1 ? 2 : (Number.isInteger(tick) ? 0 : 1)))}
                </text>
              </g>
            );
          })}

          {/* Stems & X tick numbers in KaTeX math font */}
          {harmonics.map((h, idx) => {
            const x = toX(idx);
            const y = toY(h.rms);
            const zeroY = toY(0);
            const isFundamental = h.order === 1;
            const isHovered = hovered?.order === h.order;

            return (
              <g
                key={h.order}
                className="cursor-pointer"
                onPointerEnter={() => setHovered({ order: h.order, rms: h.rms, x, y })}
              >
                {/* Stem invisible hit area for touch/hover */}
                <line
                  x1={x}
                  x2={x}
                  y1={zeroY}
                  y2={y}
                  stroke="transparent"
                  strokeWidth="14"
                />

                {/* Stem line */}
                <line
                  x1={x}
                  x2={x}
                  y1={zeroY}
                  y2={y}
                  stroke={isFundamental ? "#2563eb" : "#7c3aed"}
                  strokeWidth={isHovered ? 4 : 2.8}
                  strokeLinecap="round"
                  className="transition-all"
                />

                {/* Lollipop head */}
                <circle
                  cx={x}
                  cy={y}
                  r={isHovered ? 5.5 : 4}
                  fill={isFundamental ? "#2563eb" : "#f43f5e"}
                  stroke="#ffffff"
                  strokeWidth={isHovered ? 1.5 : 1}
                  className="transition-all"
                />

                {/* Order label in KaTeX font */}
                <text
                  x={x}
                  y={padding.top + plotHeight + 16}
                  textAnchor="middle"
                  style={{ fontFamily: "'KaTeX_Main', 'KaTeX_Math', 'Times New Roman', serif" }}
                  className={`text-[11px] transition-colors ${
                    isHovered
                      ? "fill-slate-900 dark:fill-white font-bold"
                      : "fill-slate-600 dark:fill-slate-300 font-medium"
                  }`}
                >
                  {h.order}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Hover Tooltip HUD Card */}
        {hovered && (() => {
          const cardWidth = 175;
          const cardHeight = 65;
          const placeLeft = hovered.x > containerSize.width - cardWidth - 20;
          const left = placeLeft
            ? Math.max(10, hovered.x - cardWidth - 14)
            : Math.min(containerSize.width - cardWidth - 10, hovered.x + 14);
          const top = Math.max(8, Math.min(containerSize.height - cardHeight - 8, hovered.y - 25));

          return (
            <div
              className="pointer-events-none absolute z-20 rounded-xl border border-slate-200/90 bg-white/95 p-2.5 shadow-lg backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/95 transition-all text-xs"
              style={{
                left: `${left}px`,
                top: `${top}px`,
                minWidth: `${cardWidth}px`,
              }}
            >
              <div className="flex items-center gap-2 font-semibold text-slate-800 dark:text-white pb-1 border-b border-slate-100 dark:border-slate-800">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: hovered.order === 1 ? "#2563eb" : "#7c3aed" }}
                />
                <KatexMath math={`n = ${hovered.order}${hovered.order === 1 ? "\\text{ (Fundamental)}" : ""}`} />
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-3 text-[11px]">
                <span className="text-slate-500 dark:text-slate-400">Amplitude:</span>
                <span className="font-bold text-slate-900 dark:text-slate-100">
                  <KatexMath math={`${hovered.rms.toFixed(2)}\\text{ V}`} />
                </span>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

export default PowerScopePlot;
