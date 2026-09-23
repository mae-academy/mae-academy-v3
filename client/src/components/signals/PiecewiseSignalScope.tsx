/**
 * MAE Academy / Signals & Systems — Piecewise Signal Scope.
 * Vector SVG implementation matching the platform's StandardStepPlot gold standard.
 *
 * Renders pure SVG vectors with dynamic 1-quadrant / 2-quadrant dynamic range,
 * zero-crossing hairline axes, authentic TeX typography ticks, vector Dirac impulses,
 * and an Apple-style floating HUD tooltip.
 */
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
  sample?: (model: ScopeModel, from: number, to: number) => SignalSegment[];
  yLabelKatex?: string;
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

  const start = Math.floor(min / step) * step;
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
}: PiecewiseSignalScopeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
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
    const el = containerRef.current;
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

  // Layout Paddings
  const padding = {
    top: 24,
    right: 28,
    bottom: 38,
    left: 52,
  };

  const plotWidth = Math.max(10, containerSize.width - padding.left - padding.right);
  const plotHeight = Math.max(10, containerSize.height - padding.top - padding.bottom);

  // Auto-detect time horizon based on breakpoints and signal shifts
  const { xMin, xMax } = useMemo(() => {
    const rawMin = Math.min(-5, ...model.breakpoints.map((b) => b - 1), ...model.impulses.map((i) => i.time - 1));
    const rawMax = Math.max(5, ...model.breakpoints.map((b) => b + 1), ...model.impulses.map((i) => i.time + 1));
    const maxT = Math.max(5, Math.min(10, Math.ceil(Math.max(Math.abs(rawMin), Math.abs(rawMax)))));
    return { xMin: -maxT, xMax: maxT };
  }, [model.breakpoints, model.impulses]);

  // Sample piecewise continuous segments within active time window
  const segments = useMemo(() => {
    return sample ? sample(model, xMin, xMax) : samplePiecewiseSignal(model as PiecewiseSignalModel, xMin, xMax, 1200);
  }, [model, xMin, xMax, sample]);

  // Dynamic 1-Quadrant vs. 2-Quadrant Bounds Evaluation
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

    // Determine 1-Quadrant (strictly non-negative) vs. 2-Quadrant (bipolar)
    const hasNegative = minVal < -0.05;
    let computedYMin = 0;
    let computedYMax = 1;

    if (hasNegative) {
      // 2-Quadrant / Bipolar: symmetric or nice zero-centered bounds
      const absMax = Math.max(Math.abs(minVal), Math.abs(maxVal));
      const margin = Math.max(0.2, absMax * 0.15);
      const span = Math.max(1, absMax + margin);
      computedYMin = -span;
      computedYMax = span;
    } else {
      // 1-Quadrant Mode: strictly pinned at y = 0
      computedYMin = 0;
      const margin = Math.max(0.1, maxVal * 0.15);
      computedYMax = Math.max(1, maxVal + margin);
    }

    return {
      yMin: computedYMin,
      yMax: computedYMax,
      isBipolar: hasNegative,
    };
  }, [segments, model.impulses]);

  // Coordinate transforms
  const toX = useCallback(
    (t: number) => {
      const ratio = (t - xMin) / (xMax - xMin || 1);
      return padding.left + ratio * plotWidth;
    },
    [xMin, xMax, padding.left, plotWidth]
  );

  const toY = useCallback(
    (val: number) => {
      const ratio = (val - yMin) / (yMax - yMin || 1);
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
  const xTicks = useMemo(() => getNiceTicks(xMin, xMax, 7), [xMin, xMax]);
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
      mouseX < padding.left ||
      mouseX > padding.left + plotWidth ||
      mouseY < padding.top ||
      mouseY > padding.top + plotHeight
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
      ref={containerRef}
      className={`relative flex flex-col w-full h-full min-h-[420px] rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 backdrop-blur-sm shadow-sm p-4 ${className}`}
      style={height !== undefined ? { height: typeof height === "number" ? `${height}px` : height } : undefined}
    >
      {/* Top KaTeX Axis Titles */}
      <div className="pointer-events-none absolute top-2 left-4 z-10 text-[11px] font-medium text-slate-500 dark:text-slate-400">
        <KatexMath math={yLabelKatex} />
      </div>
      <div className="pointer-events-none absolute bottom-2 right-4 z-10 text-[11px] font-medium text-slate-500 dark:text-slate-400">
        <KatexMath math="t\text{ (s)}" />
      </div>

      <svg
        width="100%"
        height="100%"
        className="w-full flex-1 min-h-0 overflow-visible cursor-crosshair touch-none select-none"
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

        {/* Clean Hairline Axes crossing at (0, 0) */}
        <g className="axes-hairlines" aria-hidden="true">
          {/* Horizontal Zero Axis */}
          <line
            x1={padding.left}
            y1={zeroY}
            x2={padding.left + plotWidth}
            y2={zeroY}
            className="stroke-slate-400 dark:stroke-slate-500"
            strokeWidth="1.5"
          />

          {/* Vertical Zero Axis */}
          <line
            x1={zeroX}
            y1={padding.top}
            x2={zeroX}
            y2={padding.top + plotHeight}
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
                y={padding.top + plotHeight + 16}
                textAnchor="middle"
                style={{ fontFamily: "'KaTeX_Main', 'KaTeX_Math', 'Times New Roman', serif" }}
                className="fill-slate-600 dark:fill-slate-300 text-[11px] font-medium"
              >
                {tick.toFixed(tick % 1 === 0 ? 0 : 1)}
              </text>
            );
          })}

          {/* Y-axis tick labels */}
          {yTicks.map((tick) => {
            const yPos = toY(tick);
            return (
              <text
                key={`lbl-y-${tick}`}
                x={padding.left - 6}
                y={yPos + 4}
                textAnchor="end"
                style={{ fontFamily: "'KaTeX_Main', 'KaTeX_Math', 'Times New Roman', serif" }}
                className="fill-slate-600 dark:fill-slate-300 text-[11px] font-medium"
              >
                {tick.toFixed(tick % 1 === 0 ? 0 : 1)}
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
              y1={padding.top}
              x2={hoverState.xScreen}
              y2={padding.top + plotHeight}
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

          if (ix < padding.left - 20 || ix > padding.left + plotWidth + 20) return null;

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
  );
}

export default PiecewiseSignalScope;
