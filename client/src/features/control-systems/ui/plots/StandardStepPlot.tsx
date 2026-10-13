import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { tickText } from "@/components/common/templates/SvgKatexTick";
import { KatexMath } from "@/components/ui/KatexMath";
import type { StandardStepPlotProps, PlotPoint, PlotSeries } from "./types";

/**
 * Computes nice round tick intervals.
 */
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
    // Avoid floating point precision oddities like -0.00000000001
    const clean = Math.abs(val) < 1e-9 ? 0 : Number(val.toFixed(6));
    ticks.push(clean);
  }
  return ticks;
}

/**
 * Linearly interpolate y value at time x from sorted data points.
 */
function interpolateY(data: PlotPoint[], xTarget: number): number | null {
  if (!data || data.length === 0) return null;
  if (xTarget <= data[0].x) return data[0].y;
  if (xTarget >= data[data.length - 1].x) return data[data.length - 1].y;

  // Binary search for surrounding points
  let low = 0;
  let high = data.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (data[mid].x === xTarget) return data[mid].y;
    if (data[mid].x < xTarget) low = mid + 1;
    else high = mid - 1;
  }

  const p0 = data[high];
  const p1 = data[low];
  if (!p0 || !p1) return null;
  const dx = p1.x - p0.x;
  if (dx === 0) return p0.y;
  const fraction = (xTarget - p0.x) / dx;
  return p0.y + fraction * (p1.y - p0.y);
}

export function StandardStepPlot({
  series,
  xLabelKatex = "t \\text{ (s)}",
  yLabelKatex = "y(t)",
  height = 380,
  forceBipolar = false,
  showLegend = true,
  className = "",
  title,
  headerRight,
  steadyStateValue,
  showSteadyState = false,
  xDomain,
  yDomain,
  yTickLabels,
  cursorKatex = "t",
  cursorUnitKatex = "\\text{ s}",
}: StandardStepPlotProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({
    width: 600,
    height: typeof height === "number" ? height : 380,
  });

  // Toggle series visibility state
  const [hiddenSeries, setHiddenSeries] = useState<Record<string, boolean>>({});

  const toggleSeries = useCallback((id: string) => {
    setHiddenSeries((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  // Tooltip interaction state
  const [hoverState, setHoverState] = useState<{
    xScreen: number;
    yScreen: number;
    t: number;
    values: { seriesId: string; katexName: string; color: string; y: number; unit?: string }[];
  } | null>(null);

  // ResizeObserver for exact SVG dimensions
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

  // Filter visible series
  const visibleSeries = useMemo(() => {
    return series.filter((s) => !hiddenSeries[s.id]);
  }, [series, hiddenSeries]);

  // Layout Paddings with generous breathing room
  const padding = {
    top: 28,
    right: 32,
    bottom: 44,
    left: 54,
  };

  const plotWidth = Math.max(10, containerSize.width - padding.left - padding.right);
  const plotHeight = Math.max(10, containerSize.height - padding.top - padding.bottom);

  // Dynamic 1-Quadrant vs. Symmetrical 4-Quadrant Bounds Evaluation
  const { xMin, xMax, yMin, yMax, isBipolar, hasNegativeTime } = useMemo(() => {
    let minT = Infinity;
    let maxT = -Infinity;
    let minVal = Infinity;
    let maxVal = -Infinity;

    for (const s of visibleSeries) {
      for (const p of s.data) {
        if (p.x < minT) minT = p.x;
        if (p.x > maxT) maxT = p.x;
        if (p.y < minVal) minVal = p.y;
        if (p.y > maxVal) maxVal = p.y;
      }
    }

    if (minT === Infinity || maxT === -Infinity) {
      minT = 0;
      maxT = 10;
    }
    if (minVal === Infinity || maxVal === -Infinity) {
      minVal = 0;
      maxVal = 1.2;
    }

    if (steadyStateValue !== undefined && showSteadyState) {
      if (steadyStateValue > maxVal) maxVal = steadyStateValue;
      if (steadyStateValue < minVal) minVal = steadyStateValue;
    }

    // Determine 1-Quadrant vs. Symmetrical 4-Quadrant
    const hasNegativeTime = minT < -0.001;
    const hasUndershoot = minVal < -0.001;
    const bipolar = forceBipolar || hasUndershoot;

    let computedYMin = 0;
    let computedYMax = 1;

    if (bipolar) {
      // Symmetrical 4-Quadrant vertical span centered at y = 0
      const maxAbsY = Math.max(Math.abs(maxVal), Math.abs(minVal), 0.1);
      const margin = Math.max(0.1, maxAbsY * 0.15);
      const yBound = maxAbsY + margin;
      computedYMin = -yBound;
      computedYMax = yBound;
    } else {
      // 1-Quadrant Mode: Strictly pinned at y = 0
      computedYMin = 0;
      const margin = Math.max(0.05, maxVal * 0.12);
      computedYMax = maxVal <= 0 ? 1 : maxVal + margin;
    }

    let computedXMin = 0;
    let computedXMax = 10;

    if (hasNegativeTime) {
      // Symmetrical bilateral time domain centered at t = 0
      const maxAbsX = Math.max(Math.abs(maxT), Math.abs(minT), 0.5);
      const margin = maxAbsX * 0.08;
      const xBound = maxAbsX + margin;
      computedXMin = -xBound;
      computedXMax = xBound;
    } else {
      computedXMin = 0;
      computedXMax = maxT <= 0 ? 1 : maxT;
    }

    if (xDomain) { computedXMin = xDomain[0]; computedXMax = xDomain[1]; }
    if (yDomain) { computedYMin = yDomain[0]; computedYMax = yDomain[1]; }
    return {
      xMin: computedXMin,
      xMax: computedXMax,
      yMin: computedYMin,
      yMax: computedYMax,
      isBipolar: yDomain ? yDomain[0] < 0 : bipolar,
      hasNegativeTime: xDomain ? xDomain[0] < 0 : hasNegativeTime,
    };
  }, [visibleSeries, forceBipolar, steadyStateValue, showSteadyState, xDomain, yDomain]);

  // Coordinate transforms
  const toX = useCallback(
    (t: number) => {
      const ratio = (t - xMin) / (xMax - xMin || 1);
      return padding.left + ratio * plotWidth;
    },
    [xMin, xMax, padding.left, plotWidth]
  );

  const toY = useCallback(
    (y: number) => {
      const ratio = (y - yMin) / (yMax - yMin || 1);
      return padding.top + (1 - ratio) * plotHeight;
    },
    [yMin, yMax, padding.top, plotHeight]
  );

  const toTFromX = useCallback(
    (pixelX: number) => {
      const clampedX = Math.max(padding.left, Math.min(padding.left + plotWidth, pixelX));
      const ratio = (clampedX - padding.left) / plotWidth;
      return xMin + ratio * (xMax - xMin);
    },
    [padding.left, plotWidth, xMin, xMax]
  );

  // Ticks
  const xTicks = useMemo(() => getNiceTicks(xMin, xMax, 5), [xMin, xMax]);
  const yTicks = useMemo(() => (yTickLabels ? yTickLabels.map((tick) => tick.value) : getNiceTicks(yMin, yMax, 6)), [yMin, yMax, yTickLabels]);

  // Zero-crossing Y coordinate
  const zeroY = toY(0);

  // Build SVG paths for each series
  const seriesPaths = useMemo(() => {
    return visibleSeries.map((s) => {
      if (s.data.length === 0) return { ...s, pathD: "" };
      let d = "";
      for (let i = 0; i < s.data.length; i++) {
        const pt = s.data[i];
        const px = toX(pt.x);
        const py = toY(pt.y);
        if (i === 0) {
          d += `M ${px.toFixed(1)} ${py.toFixed(1)}`;
        } else {
          d += ` L ${px.toFixed(1)} ${py.toFixed(1)}`;
        }
      }
      return {
        ...s,
        pathD: d,
      };
    });
  }, [visibleSeries, toX, toY]);

  // Mouse move handler for Apple HUD tooltip and vertical cursor
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

    const t = toTFromX(mouseX);
    const values: { seriesId: string; katexName: string; color: string; y: number; unit?: string }[] = [];

    for (const s of visibleSeries) {
      const interpolated = interpolateY(s.data, t);
      if (interpolated !== null) {
        values.push({
          seriesId: s.id,
          katexName: s.katexName,
          color: s.color,
          y: interpolated,
          unit: s.unit,
        });
      }
    }

    setHoverState({
      xScreen: mouseX,
      yScreen: mouseY,
      t,
      values,
    });
  };

  const handlePointerLeave = () => {
    setHoverState(null);
  };

  // Compute Error if both reference r(t) and output y(t) exist
  const computedError = useMemo(() => {
    if (!hoverState) return null;
    const rVal = hoverState.values.find((v) => v.seriesId.toLowerCase().includes("r") || v.katexName.includes("r("));
    const yVal = hoverState.values.find((v) => v.seriesId.toLowerCase().includes("y") || v.katexName.includes("y("));
    if (rVal !== undefined && yVal !== undefined) {
      return rVal.y - yVal.y;
    }
    return null;
  }, [hoverState]);

  return (
    <div
      className={`relative flex flex-col w-full h-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 backdrop-blur-sm shadow-sm p-4 ${height === undefined ? "min-h-[320px] md:min-h-[360px]" : ""} ${className}`}
      style={height !== undefined ? { height: typeof height === "number" ? `${height}px` : height, minHeight: typeof height === "number" ? `${height}px` : height } : undefined}
    >
      {/* Header Bar: Title + Legend Badges */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
        <div className="flex items-center gap-2">
          {title && (
            <h4 className={`text-xs font-bold tracking-wider text-slate-800 dark:text-white ${typeof title === "string" ? "uppercase" : "normal-case"}`}>
              {title}
            </h4>
          )}
        </div>

        {/* Top Controls: Signal Bar (Legend) & Header Controls */}
        <div className="flex items-center gap-3">
          {showLegend && series.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5" role="toolbar" aria-label="Signal toggles">
              {series.map((s) => {
                const isHidden = !!hiddenSeries[s.id];
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleSeries(s.id)}
                    aria-pressed={!isHidden}
                    className={`group inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 max-sm:min-h-11 text-xs font-medium transition-all select-none ${isHidden
                      ? "border border-dashed border-slate-300 dark:border-slate-700 bg-slate-100/50 dark:bg-slate-800/40 text-slate-400 opacity-50 hover:opacity-80"
                      : "border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 shadow-sm hover:border-slate-300 dark:hover:border-slate-600"
                      }`}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full transition-transform group-hover:scale-110"
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
        </div>
      </div>

      {/* SVG Plot Container */}
      <div ref={containerRef} className="relative flex-1 w-full min-h-0 overflow-hidden select-none">
        {/* KaTeX Y-Axis Label (Top-Left) */}
        <div className="pointer-events-none absolute top-1 left-2 z-10 text-[11px] font-medium text-slate-500 dark:text-slate-400">
          <KatexMath math={yLabelKatex} />
        </div>

        {/* KaTeX X-Axis Label (Bottom-Right) */}
        <div className="pointer-events-none absolute bottom-1 right-2 z-10 text-[11px] font-medium text-slate-500 dark:text-slate-400">
          <KatexMath math={xLabelKatex} />
        </div>

        <svg
          width="100%"
          height="100%"
          className="w-full flex-1 min-h-0 overflow-visible cursor-crosshair touch-none"
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
        >
          {/* Subtle Grid Lines */}
          <g className="grid-lines" aria-hidden="true">
            {/* Vertical grid lines (t) */}
            {xTicks.map((tick) => {
              const xPos = toX(tick);
              return (
                <line
                  key={`xtick-${tick}`}
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

            {/* Horizontal grid lines (y) */}
            {yTicks.map((tick) => {
              const yPos = toY(tick);
              return (
                <line
                  key={`ytick-${tick}`}
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

          {/* Prominent Horizontal Zero-Crossing Axis Line (Bipolar / Undershoot / 4-Quadrant Mode) */}
          {isBipolar && (
            <line
              x1={padding.left}
              y1={zeroY}
              x2={padding.left + plotWidth}
              y2={zeroY}
              className="stroke-slate-400 dark:stroke-slate-500"
              strokeWidth="1.5"
            />
          )}

          {/* Prominent Vertical Zero-Crossing Axis Line (Bilateral / 4-Quadrant Mode) */}
          {hasNegativeTime && (
            <line
              x1={toX(0)}
              y1={padding.top}
              x2={toX(0)}
              y2={padding.top + plotHeight}
              className="stroke-slate-400 dark:stroke-slate-500"
              strokeWidth="1.5"
            />
          )}

          {/* Steady State Reference Line */}
          {steadyStateValue !== undefined && showSteadyState && (
            <line
              x1={padding.left}
              y1={toY(steadyStateValue)}
              x2={padding.left + plotWidth}
              y2={toY(steadyStateValue)}
              stroke="#10B981"
              strokeDasharray="4,4"
              strokeWidth="1.5"
              className="opacity-70"
            />
          )}

          {/* Axes Lines (Rails) */}
          <g className="axes-rails" aria-hidden="true">
            {/* Left Y-axis rail (when not 4-quadrant centered) */}
            {!hasNegativeTime && (
              <line
                x1={padding.left}
                y1={padding.top}
                x2={padding.left}
                y2={padding.top + plotHeight}
                className="stroke-slate-400 dark:stroke-slate-600"
                strokeWidth="1.5"
              />
            )}

            {/* Bottom X-axis baseline rail (or zero line in 1-quadrant mode) */}
            <line
              x1={padding.left}
              y1={isBipolar ? padding.top + plotHeight : zeroY}
              x2={padding.left + plotWidth}
              y2={isBipolar ? padding.top + plotHeight : zeroY}
              className="stroke-slate-400 dark:stroke-slate-600"
              strokeWidth="1.5"
            />
          </g>

          {/* Ticks Text (Labels) */}
          <g className="ticks-text select-none" aria-hidden="true">
            {/* X-axis tick labels */}
            {xTicks.map((tick) => {
              const xPos = toX(tick);
              return (
                <text
                  key={`lbl-x-${tick}`}
                  x={xPos}
                  y={padding.top + plotHeight + 18}
                  textAnchor="middle"
                  style={{ fontFamily: "'KaTeX_Main', 'KaTeX_Math', 'Times New Roman', serif" }}
                  className="fill-slate-600 dark:fill-slate-300 text-[11px] font-medium"
                >
                  {Math.abs(tick) < 1e-9 ? "0" : Number(tick.toFixed(Math.abs(tick) < 1 ? 2 : 1)).toString()}
                </text>
              );
            })}

            {/* Y-axis tick labels (KaTeX when custom labels are supplied) */}
            {yTickLabels && yTickLabels.map((tick) => (
              <text key={`lbl-yk-${tick.value}`} x={padding.left - 8} y={toY(tick.value)} textAnchor="end" dominantBaseline="central" pointerEvents="none" fontSize={12} style={{ fontFamily: "KaTeX_Main, 'Times New Roman', serif" }} className="fill-slate-600 dark:fill-slate-300">
                {tickText(tick.katex)}
              </text>
            ))}
            {!yTickLabels && yTicks.map((tick) => {
              const yPos = toY(tick);
              return (
                <text
                  key={`lbl-y-${tick}`}
                  x={padding.left - 8}
                  y={yPos + 4}
                  textAnchor="end"
                  style={{ fontFamily: "'KaTeX_Main', 'KaTeX_Math', 'Times New Roman', serif" }}
                  className="fill-slate-600 dark:fill-slate-300 text-[11px] font-medium"
                >
                  {Math.abs(tick) < 1e-9 ? "0" : Number(tick.toFixed(2)).toString()}
                </text>
              );
            })}
          </g>

          {/* Signal Curve Paths */}
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
              />
            ))}
          </g>

          {/* Crosshair Cursor on Hover */}
          {hoverState && (
            <g className="crosshair-indicator" pointerEvents="none">
              {/* Vertical line along X */}
              <line
                x1={hoverState.xScreen}
                y1={padding.top}
                x2={hoverState.xScreen}
                y2={padding.top + plotHeight}
                className="stroke-slate-400/60 dark:stroke-slate-500/60"
                strokeWidth="1"
                strokeDasharray="2,2"
              />

              {/* Minimalist Solid Center Snap Dots on each curve */}
              {hoverState.values.map((v) => {
                const py = toY(v.y);
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

        {/* Apple-Style Floating HUD Tooltip */}
        {hoverState && (
          <div
            className="absolute pointer-events-none z-20 backdrop-blur-md bg-white/95 text-slate-900 border border-slate-200/80 shadow-xl shadow-slate-900/10 dark:bg-slate-900/90 dark:text-slate-100 dark:border-slate-700/60 dark:shadow-2xl rounded-xl p-3 text-xs transition-transform duration-75 min-w-40"
            style={{
              left: Math.min(containerSize.width - 190, Math.max(10, hoverState.xScreen + 14)),
              top: Math.min(containerSize.height - 140, Math.max(10, hoverState.yScreen - 30)),
            }}
          >
            {/* Header: Time t in KaTeX */}
            <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-700/60 pb-1.5 mb-2 font-mono text-[11px]">
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                <KatexMath math={`${cursorKatex} = ${hoverState.t.toFixed(2)}${cursorUnitKatex}`} />
              </span>
            </div>

            {/* Active Signal Values in KaTeX */}
            <div className="space-y-1.5">
              {hoverState.values.map((v) => (
                <div key={v.seriesId} className="flex items-center justify-between gap-3 text-[11px]">
                  <span className="flex items-center gap-1.5 truncate">
                    <span
                      className="h-2 w-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: v.color }}
                    />
                    <KatexMath
                      math={`${v.katexName} = ${v.y.toFixed(2)}${v.unit ? `\\text{ ${v.unit}}` : ""}`}
                      className="font-serif text-slate-900 dark:text-slate-100 font-medium"
                    />
                  </span>
                </div>
              ))}

              {/* Error readout if both r(t) and y(t) exist */}
              {computedError !== null && (
                <div className="flex items-center justify-between gap-3 text-[11px] pt-1.5 mt-1.5 border-t border-slate-200/80 dark:border-slate-700/60 text-rose-600 dark:text-rose-400">
                  <span className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                    <KatexMath
                      math={`e(t) = ${computedError >= 0 ? "+" : ""}${computedError.toFixed(2)}`}
                      className="font-serif font-bold text-rose-600 dark:text-rose-400"
                    />
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
