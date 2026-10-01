/**
 * MAE Academy / Signals & Systems — Piecewise Signal Scope.
 * Vector SVG implementation matching the platform's StandardStepPlot gold standard.
 *
 * Renders pure SVG vectors with dynamic 1-quadrant / 2-quadrant dynamic range,
 * zero-crossing hairline axes, authentic TeX typography ticks, vector Dirac impulses,
 * and an Apple-style floating HUD tooltip.
 */
import { symmetricYBound } from "@shared/signals/plotAutoScale";
import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { KatexMath } from "@/components/ui/KatexMath";
import {
  samplePiecewiseSignal,
  type PiecewiseSignalModel,
  type SignalSegment,
  type SymbolicImpulse,
} from "@/utils/signalsEngine";

/** Structural subset any sampled time-domain model satisfies — piecewise or composite. */
export type ScopeModel = {
  breakpoints: number[];
  impulses: ReadonlyArray<Pick<SymbolicImpulse, "time" | "weight" | "latex">>;
  valueAt: (time: number) => number;
};

export interface PiecewiseSignalScopeProps {
  model: PiecewiseSignalModel | ScopeModel;
  height?: number | string;
  className?: string;
  /** Overrides the default sampler (piecewise-only breakpoint segmentation). */
  sample?: (model: ScopeModel, from: number, to: number, sampleCount?: number) => SignalSegment[];
  yLabelKatex?: string;
  /** Fundamental period T0 (in seconds) from academic analysis for period-aware time domain scaling */
  fundamentalPeriod?: number | null;
  /** Optional custom time range [-timeRange, timeRange] override */
  timeRange?: number;
}

/**
 * Computes adaptive time ticks based on tRange:
 * - When tRange <= 0.75: step = 0.25 s
 * - When tRange <= 1.5: step = 0.5 s
 * - When 1.5 < tRange <= 5: step = 1 s
 * - When tRange > 5: step = 2 s
 */
function getTimeTicks(tMin: number, tMax: number): number[] {
  const tRange = Math.max(Math.abs(tMin), Math.abs(tMax));
  let step: number;
  if (tRange <= 0.75) {
    step = 0.25;
  } else if (tRange <= 1.5) {
    step = 0.5;
  } else if (tRange <= 5) {
    step = 1;
  } else {
    step = 2;
  }

  const start = Math.ceil((tMin - 1e-9) / step) * step;
  const ticks: number[] = [];
  for (let val = start; val <= tMax + step * 0.001; val += step) {
    const clean = Math.abs(val) < 1e-9 ? 0 : Number(val.toFixed(4));
    ticks.push(clean);
  }
  return ticks;
}

/**
 * Computes round, clean tick intervals for axis labels.
 */
function getNiceTicks(min: number, max: number, maxTicks = 6): number[] {
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

  const start = Math.ceil((min - 1e-9) / step) * step;
  const ticks: number[] = [];
  for (let val = start; val <= max + step * 0.001; val += step) {
    const clean = Math.abs(val) < 1e-9 ? 0 : Number(val.toFixed(6));
    ticks.push(clean);
  }
  return ticks;
}

export function PiecewiseSignalScope({
  model,
  height = 420,
  className = "",
  sample,
  yLabelKatex = "y(t)",
  fundamentalPeriod,
  timeRange,
}: PiecewiseSignalScopeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({
    width: 700,
    height: typeof height === "number" ? height : 420,
  });

  // Tooltip interaction state
  const [hoverState, setHoverState] = useState<{
    xScreen: number;
    yScreen: number;
    t: number;
    y: number;
  } | null>(null);

  // ResizeObserver for dynamic SVG responsiveness
  useEffect(() => {
    const el = svgRef.current || containerRef.current;
    if (!el) return;
    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setContainerSize({ width: rect.width, height: rect.height });
      }
    };
    updateSize();
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(updateSize);
      observer.observe(el);
      return () => observer.disconnect();
    }
  }, []);

  // Layout Margins with ample breathing room
  const margin = {
    top: 28,     // Ample clearance above positive peak (+2) and label
    right: 30,
    bottom: 44,  // Generous clearance for x-axis ticks (t) and lowest y-tick (-2)
    left: 48,    // Ample clearance for negative y-axis labels (-2, -1, 0, 1, 2)
  };

  const plotWidth = Math.max(10, containerSize.width - margin.left - margin.right);
  const plotHeight = Math.max(10, containerSize.height - margin.top - margin.bottom);

  // Intelligent Fundamental Period-Aware Dynamic Domain (T0 Scaling & Pulse Scaling)
  const { xMin, xMax, tRange } = useMemo(() => {
    if (timeRange && Number.isFinite(timeRange) && timeRange > 0) {
      const clamped = Math.min(Math.max(timeRange, 0.5), 10);
      return { xMin: -clamped, xMax: clamped, tRange: clamped };
    }

    const T0 =
      fundamentalPeriod !== undefined
        ? fundamentalPeriod
        : (model as any).analysis?.fundamentalPeriodSeconds ??
          (model as any).analysis?.fundamentalPeriod ??
          (model as any).fundamentalPeriod ??
          null;

    let computedRange = 3;

    if (T0 && Number.isFinite(T0) && T0 > 0) {
      // 1. Periodic Signals: Target displaying ~3 full periods across the screen
      const periodsToShow = 3;
      computedRange = (T0 * periodsToShow) / 2;
    } else {
      // 2. Aperiodic / Pulse Signals (e.g. rect, tri, pulses):
      // Auto-scale domain to fit active pulse width plus 50% symmetric margin on both sides
      const featurePoints = [
        ...(model.breakpoints ?? []),
        ...(model.impulses ?? []).map((i) => i.time),
      ].filter(Number.isFinite);

      if (featurePoints.length > 0) {
        const minFeature = Math.min(...featurePoints);
        const maxFeature = Math.max(...featurePoints);
        const activeWidth = Math.max(maxFeature - minFeature, 0.5);
        const marginSide = 0.5 * activeWidth;
        computedRange = Math.max(Math.abs(minFeature - marginSide), Math.abs(maxFeature + marginSide));
      }
    }

    // Clamp bounds to prevent extremes on ultra-high or ultra-low frequencies
    computedRange = Math.min(Math.max(computedRange, 0.5), 10);
    computedRange = Number(computedRange.toFixed(3));

    return { xMin: -computedRange, xMax: computedRange, tRange: computedRange };
  }, [timeRange, fundamentalPeriod, model]);

  // Sample piecewise continuous segments within active time window with dynamic sampling density
  const segments = useMemo(() => {
    const sampleCount = Math.max(1000, Math.round(plotWidth * 2));
    return sample
      ? sample(model, xMin, xMax, sampleCount)
      : samplePiecewiseSignal(model as PiecewiseSignalModel, xMin, xMax, sampleCount);
  }, [model, xMin, xMax, plotWidth, sample]);

  // Dynamic 1-Quadrant vs. 2-Quadrant Bounds Evaluation with clean headroom
  const { yMin, yMax, isBipolar } = useMemo(() => {
    let minVal = Infinity;
    let maxVal = -Infinity;

    for (const segment of segments) {
      for (const pt of segment) {
        if (Number.isFinite(pt.value)) {
          if (pt.value < minVal) minVal = pt.value;
          if (pt.value > maxVal) maxVal = pt.value;
        }
      }
    }

    for (const imp of model.impulses) {
      if (imp.weight > 0 && imp.weight > maxVal) maxVal = imp.weight;
      if (imp.weight < 0 && imp.weight < minVal) minVal = imp.weight;
    }

    if (minVal === Infinity || maxVal === -Infinity) {
      minVal = -1;
      maxVal = 1;
    }

    // Proportional headroom (20%) snapped to a clean bound: 0.1·sin(t) and 15·cos(2t) both fill the frame without clipping.
    const maxAbsY = Math.max(Math.abs(maxVal), Math.abs(minVal));
    const yDomainLimit = symmetricYBound(maxAbsY);

    return {
      yMin: -yDomainLimit,
      yMax: yDomainLimit,
      isBipolar: true,
    };
  }, [segments, model.impulses]);

  // Coordinate transforms
  const toX = useCallback(
    (t: number) => {
      const ratio = (t - xMin) / (xMax - xMin || 1);
      return margin.left + ratio * plotWidth;
    },
    [xMin, xMax, margin.left, plotWidth]
  );

  const toY = useCallback(
    (val: number) => {
      const ratio = (val - yMin) / (yMax - yMin || 1);
      return margin.top + (1 - ratio) * plotHeight;
    },
    [yMin, yMax, margin.top, plotHeight]
  );

  const toTFromX = useCallback(
    (pixelX: number) => {
      const clampedX = Math.max(margin.left, Math.min(margin.left + plotWidth, pixelX));
      const ratio = (clampedX - margin.left) / plotWidth;
      return xMin + ratio * (xMax - xMin);
    },
    [margin.left, plotWidth, xMin, xMax]
  );

  // Ticks
  const xTicks = useMemo(() => getTimeTicks(xMin, xMax), [xMin, xMax]);
  const yTicks = useMemo(() => getNiceTicks(yMin, yMax, 6), [yMin, yMax]);

  // Zero-crossing coordinates
  const zeroX = toX(0);
  const zeroY = toY(0);

  // Build SVG path data for continuous piecewise segments
  const pathStrings = useMemo(() => {
    return segments.map((seg) => {
      let d = "";
      for (let i = 0; i < seg.length; i++) {
        const pt = seg[i];
        const px = toX(pt.time);
        const py = toY(pt.value);
        if (i === 0) {
          d += `M ${px.toFixed(1)} ${py.toFixed(1)}`;
        } else {
          d += ` L ${px.toFixed(1)} ${py.toFixed(1)}`;
        }
      }
      return d;
    });
  }, [segments, toX, toY]);

  // Mouse move handler for Apple HUD tooltip and vertical cursor
  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (
      mouseX < margin.left ||
      mouseX > margin.left + plotWidth ||
      mouseY < margin.top ||
      mouseY > margin.top + plotHeight
    ) {
      setHoverState(null);
      return;
    }

    const t = toTFromX(mouseX);
    const y = model.valueAt(t);

    setHoverState({
      xScreen: mouseX,
      yScreen: mouseY,
      t,
      y: Number.isFinite(y) ? y : 0,
    });
  };

  const handlePointerLeave = () => {
    setHoverState(null);
  };

  return (
    <div
      className={`relative flex flex-col w-full h-full min-h-[420px] rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 backdrop-blur-sm shadow-sm p-2 sm:p-3 ${className}`}
      style={height !== undefined ? { height: typeof height === "number" ? `${height}px` : height } : undefined}
    >
      <div ref={containerRef} className="relative flex-1 w-full h-full min-h-0">
        {/* Top KaTeX Axis Titles */}
        <div className="pointer-events-none absolute top-1 left-2 z-10 text-[11px] font-medium text-slate-500 dark:text-slate-400">
          <KatexMath math={yLabelKatex} />
        </div>
        <div className="pointer-events-none absolute bottom-2 right-2 z-10 text-[11px] font-medium text-slate-500 dark:text-slate-400">
          <KatexMath math="t\text{ (s)}" />
        </div>

        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          className="w-full h-full overflow-visible cursor-crosshair touch-none select-none"
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
                  y1={margin.top}
                  x2={xPos}
                  y2={margin.top + plotHeight}
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
                  x1={margin.left}
                  y1={yPos}
                  x2={margin.left + plotWidth}
                  y2={yPos}
                  className="stroke-slate-300/40 dark:stroke-slate-700/40"
                  strokeDasharray="3,3"
                  strokeWidth="1"
                />
              );
            })}
          </g>

          {/* Clean Hairline Axes crossing at (0, 0) */}
          <g className="axes-hairlines" aria-hidden="true">
            {/* Horizontal Zero Axis */}
            <line
              x1={margin.left}
              y1={zeroY}
              x2={margin.left + plotWidth}
              y2={zeroY}
              className="stroke-slate-400 dark:stroke-slate-500"
              strokeWidth="1.5"
            />

            {/* Vertical Zero Axis */}
            <line
              x1={zeroX}
              y1={margin.top}
              x2={zeroX}
              y2={margin.top + plotHeight}
              className="stroke-slate-400 dark:stroke-slate-500"
              strokeWidth="1.5"
            />
          </g>

          {/* Ticks Text (Labels) with Authentic TeX Math Typography */}
          <g className="ticks-text select-none" aria-hidden="true">
            {/* X-axis tick labels */}
            {xTicks.map((tick) => {
              const xPos = toX(tick);
              return (
                <text
                  key={`lbl-x-${tick}`}
                  x={xPos}
                  y={margin.top + plotHeight + 16}
                  textAnchor="middle"
                  style={{ fontFamily: "'KaTeX_Main', 'KaTeX_Math', 'Times New Roman', serif" }}
                  className="fill-slate-600 dark:fill-slate-300 text-[11px] font-medium"
                >
                  {Number(tick.toFixed(2)).toString()}
                </text>
              );
            })}

            {/* Y-axis tick labels */}
            {yTicks.map((tick) => {
              const yPos = toY(tick);
              return (
                <text
                  key={`lbl-y-${tick}`}
                  x={margin.left - 10}
                  y={yPos}
                  textAnchor="end"
                  dominantBaseline="central"
                  style={{ fontFamily: "'KaTeX_Main', 'KaTeX_Math', 'Times New Roman', serif" }}
                  className="fill-slate-600 dark:fill-slate-300 text-[11px] font-medium"
                >
                  {Number(tick.toPrecision(3)).toString()}
                </text>
              );
            })}
          </g>

          {/* Signal Curve Paths (Crisp Vector Waveforms) */}
          <g className="signal-curves">
            {pathStrings.map((d, index) => (
              <path
                key={`curve-${index}`}
                d={d}
                fill="none"
                stroke="#2563EB"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="dark:stroke-blue-400"
              />
            ))}
          </g>

          {/* Symbolic Dirac Impulse Arrows */}
          {model.impulses.map((impulse, index) => {
            const ix = toX(impulse.time);
            const baselineY = zeroY;
            const arrowLength = Math.sign(impulse.weight || 1) * Math.min(plotHeight * 0.42, Math.max(34, Math.abs(impulse.weight) * 34));
            const endpointY = baselineY - arrowLength;
            const dir = Math.sign(arrowLength) || 1;

            return (
              <g key={`impulse-${impulse.time}-${index}`} className="dirac-impulse">
                {/* Arrow shaft */}
                <line
                  x1={ix}
                  y1={baselineY}
                  x2={ix}
                  y2={endpointY}
                  stroke="#E11D48"
                  strokeWidth="2.5"
                />
                {/* Arrowhead */}
                <polygon
                  points={`${ix},${endpointY} ${ix - 5},${endpointY + dir * 8} ${ix + 5},${endpointY + dir * 8}`}
                  fill="#E11D48"
                />
              </g>
            );
          })}

          {/* Crosshair Cursor on Hover */}
          {hoverState && (
            <g className="crosshair-indicator" pointerEvents="none">
              {/* Vertical crosshair line along X */}
              <line
                x1={hoverState.xScreen}
                y1={margin.top}
                x2={hoverState.xScreen}
                y2={margin.top + plotHeight}
                className="stroke-slate-400/60 dark:stroke-slate-500/60"
                strokeWidth="1"
                strokeDasharray="2,2"
              />

              {/* Snap Dot on Curve */}
              <circle
                cx={hoverState.xScreen}
                cy={toY(hoverState.y)}
                r="3.5"
                fill="#2563EB"
                className="stroke-white dark:stroke-slate-900"
                strokeWidth="1.5"
              />
            </g>
          )}
        </svg>

        {/* Dirac Impulse Floating Labels with Authentic TeX Math Typography */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          {model.impulses.map((impulse, index) => {
            const ix = toX(impulse.time);
            const baselineY = zeroY;
            const arrowLength = Math.sign(impulse.weight || 1) * Math.min(plotHeight * 0.42, Math.max(34, Math.abs(impulse.weight) * 34));
            const endpointY = baselineY - arrowLength;

            if (ix < margin.left - 20 || ix > margin.left + plotWidth + 20) return null;

            return (
              <div
                key={`label-${impulse.time}-${index}`}
                className="absolute rounded-lg border border-rose-400/35 bg-slate-950/85 px-2 py-0.5 text-[11px] text-rose-100 shadow-md backdrop-blur-sm"
                style={{
                  left: `${ix + 8}px`,
                  top: `${Math.min(containerSize.height - 35, Math.max(12, endpointY - 14))}px`,
                }}
              >
                <KatexMath math={impulse.latex} />
              </div>
            );
          })}
        </div>

        {/* Apple-Style Floating HUD Tooltip */}
        {hoverState && (
          <div
            className="absolute pointer-events-none z-20 backdrop-blur-md bg-white/95 text-slate-900 border border-slate-200/80 shadow-xl shadow-slate-900/10 dark:bg-slate-900/90 dark:text-slate-100 dark:border-slate-700/60 dark:shadow-2xl rounded-xl p-3 text-xs transition-transform duration-75 min-w-36"
            style={{
              left: Math.min(containerSize.width - 170, Math.max(12, hoverState.xScreen + 14)),
              top: Math.min(containerSize.height - 100, Math.max(12, hoverState.yScreen - 30)),
            }}
          >
            {/* Header: Time t in KaTeX */}
            <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-700/60 pb-1.5 mb-2 font-mono text-[11px]">
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                <KatexMath math={`t = ${hoverState.t.toFixed(2)}\\text{ s}`} />
              </span>
            </div>

            {/* Signal Value y(t) in KaTeX */}
            <div className="flex items-center gap-2 text-[11px]">
              <span className="h-2 w-2 rounded-full bg-[#2563EB] shrink-0" />
              <KatexMath
                math={`${yLabelKatex} = ${hoverState.y.toFixed(2)}`}
                className="font-serif text-slate-900 dark:text-slate-100 font-medium"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default PiecewiseSignalScope;
