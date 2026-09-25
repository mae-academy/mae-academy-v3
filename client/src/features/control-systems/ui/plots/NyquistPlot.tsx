import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { KatexMath } from "@/components/ui/KatexMath";
import { RotateCcw } from "lucide-react";
import {
  findClosestDecadeStep,
  formatTickNumber,
  formatRealTick,
  getAlignedGridTicks,
} from "./grid-utils";

export interface NyquistPoint {
  re: number;
  im: number;
  omega?: number;
  magnitudeDb?: number;
  phaseDeg?: number;
  phaseUnwrappedDeg?: number;
}

export interface NyquistPlotProps {
  data: NyquistPoint[];
  height?: number | string;
  className?: string;
  title?: string;
  interactive?: boolean;
  showUnitCircle?: boolean;
  showNegativeBranch?: boolean;
}

export function NyquistPlot({
  data,
  height = 520,
  className = "",
  title = "Nyquist Diagram",
  interactive = true,
  showUnitCircle = true,
  showNegativeBranch = true,
}: NyquistPlotProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({
    width: 600,
    height: typeof height === "number" ? height : 520,
  });

  const [viewport, setViewport] = useState<{ scale: number; offsetX: number; offsetY: number }>({
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  });

  // Hover snap state
  const [hoverState, setHoverState] = useState<{
    sx: number;
    sy: number;
    point: NyquistPoint;
    branch: "positive" | "negative";
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
    const observer = new ResizeObserver(updateSize);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const padding = { top: 28, right: 30, bottom: 44, left: 52 };
  const plotWidth = Math.max(10, containerSize.width - padding.left - padding.right);
  const plotHeight = Math.max(10, containerSize.height - padding.top - padding.bottom);

  // Base bounding box with strict 1:1 complex aspect ratio
  const baseBounds = useMemo(() => {
    const valid = data.filter(
      (p) => Number.isFinite(p.re) && Number.isFinite(p.im) && Math.abs(p.re) < 1e5 && Math.abs(p.im) < 1e5
    );

    const reVals = [-1.2, 0, 1.2];
    const imVals = [-1.2, 0, 1.2];

    for (const p of valid) {
      // Clamp outliers to reasonable bounds for auto-fit
      const clampedRe = Math.max(-100, Math.min(100, p.re));
      const clampedIm = Math.max(-100, Math.min(100, p.im));
      reVals.push(clampedRe);
      imVals.push(clampedIm);
      imVals.push(-clampedIm);
    }

    const maxAbsRe = Math.max(1.5, ...reVals.map(Math.abs));
    const maxAbsIm = Math.max(1.5, ...imVals.map(Math.abs));

    // Symmetrical 4-quadrant math span centered squarely at (0, 0)
    const baseSpan = Math.max(maxAbsRe, maxAbsIm) * 1.45;

    const aspect = plotWidth / (plotHeight || 1);
    let spanRe = baseSpan * 2;
    let spanIm = baseSpan * 2;

    if (aspect >= 1) {
      spanRe = baseSpan * 2 * aspect;
      spanIm = baseSpan * 2;
    } else {
      spanRe = baseSpan * 2;
      spanIm = (baseSpan * 2) / aspect;
    }

    return {
      centerRe: 0,
      centerIm: 0,
      spanRe,
      spanIm,
    };
  }, [data, plotWidth, plotHeight]);

  // Coordinate transforms with 1:1 aspect ratio
  const currentSpanRe = baseBounds.spanRe / viewport.scale;
  const currentSpanIm = baseBounds.spanIm / viewport.scale;
  const pixelsPerUnit = plotWidth / (currentSpanRe || 1);

  const centerScreenX = padding.left + plotWidth / 2 + viewport.offsetX;
  const centerScreenY = padding.top + plotHeight / 2 + viewport.offsetY;

  const mathToScreenX = useCallback(
    (re: number) => centerScreenX + (re - baseBounds.centerRe) * pixelsPerUnit,
    [centerScreenX, baseBounds.centerRe, pixelsPerUnit]
  );

  const mathToScreenY = useCallback(
    (im: number) => centerScreenY - (im - baseBounds.centerIm) * pixelsPerUnit,
    [centerScreenY, baseBounds.centerIm, pixelsPerUnit]
  );

  const screenToMath = useCallback(
    (sx: number, sy: number) => {
      const re = baseBounds.centerRe + (sx - centerScreenX) / pixelsPerUnit;
      const im = baseBounds.centerIm - (sy - centerScreenY) / pixelsPerUnit;
      return { re, im };
    },
    [centerScreenX, centerScreenY, baseBounds.centerRe, baseBounds.centerIm, pixelsPerUnit]
  );

  // Wheel zoom listener (non-passive)
  useEffect(() => {
    if (!interactive) return;
    const el = containerRef.current;
    if (!el) return;

    const handleNativeWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
      setViewport((prev) => {
        const nextScale = Math.min(30, Math.max(0.1, prev.scale * zoomFactor));
        const ratio = nextScale / prev.scale;
        const nextOffsetX = mouseX - (mouseX - prev.offsetX) * ratio;
        const nextOffsetY = mouseY - (mouseY - prev.offsetY) * ratio;
        return { scale: nextScale, offsetX: nextOffsetX, offsetY: nextOffsetY };
      });
    };

    el.addEventListener("wheel", handleNativeWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleNativeWheel);
  }, [interactive]);

  // Pointer hover tracking (drag panning disabled to maintain solid locked framing)
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    // Find closest point on curves
    const math = screenToMath(sx, sy);
    let closestPt: NyquistPoint | null = null;
    let closestBranch: "positive" | "negative" = "positive";
    let minDistSq = Infinity;

    for (const pt of data) {
      if (!Number.isFinite(pt.re) || !Number.isFinite(pt.im)) continue;
      // Positive branch distance
      const dPos = (pt.re - math.re) ** 2 + (pt.im - math.im) ** 2;
      if (dPos < minDistSq) {
        minDistSq = dPos;
        closestPt = pt;
        closestBranch = "positive";
      }
      if (showNegativeBranch) {
        // Negative branch distance
        const dNeg = (pt.re - math.re) ** 2 + (-pt.im - math.im) ** 2;
        if (dNeg < minDistSq) {
          minDistSq = dNeg;
          closestPt = { ...pt, im: -pt.im };
          closestBranch = "negative";
        }
      }
    }

    if (closestPt) {
      const snapSx = mathToScreenX(closestPt.re);
      const snapSy = mathToScreenY(closestPt.im);
      const distPixels = Math.hypot(snapSx - sx, snapSy - sy);
      if (distPixels < 40) {
        setHoverState({ sx: snapSx, sy: snapSy, point: closestPt, branch: closestBranch });
      } else {
        setHoverState(null);
      }
    } else {
      setHoverState(null);
    }
  };

  const resetView = () => {
    setViewport({ scale: 1, offsetX: 0, offsetY: 0 });
  };

  // Build SVG paths for positive and negative frequency branches
  const { positivePathD, negativePathD, arrowPoints } = useMemo(() => {
    const valid = data.filter((p) => Number.isFinite(p.re) && Number.isFinite(p.im));
    if (valid.length === 0) return { positivePathD: "", negativePathD: "", arrowPoints: [] };

    let posD = "";
    let negD = "";

    valid.forEach((pt, i) => {
      const px = mathToScreenX(pt.re);
      const py = mathToScreenY(pt.im);
      if (i === 0) posD += `M ${px.toFixed(1)} ${py.toFixed(1)}`;
      else posD += ` L ${px.toFixed(1)} ${py.toFixed(1)}`;

      if (showNegativeBranch) {
        const npy = mathToScreenY(-pt.im);
        if (i === 0) negD += `M ${px.toFixed(1)} ${npy.toFixed(1)}`;
        else negD += ` L ${px.toFixed(1)} ${npy.toFixed(1)}`;
      }
    });

    // Generate directional arrow tangent indicators
    const arrows: { x: number; y: number; angleRad: number; branch: "pos" | "neg" }[] = [];
    const sampleIndices = [
      Math.floor(valid.length * 0.25),
      Math.floor(valid.length * 0.5),
      Math.floor(valid.length * 0.75),
    ].filter((idx) => idx > 0 && idx < valid.length - 1);

    sampleIndices.forEach((idx) => {
      const pPrev = valid[idx - 1];
      const pNext = valid[idx + 1];
      const curr = valid[idx];

      const sxPrev = mathToScreenX(pPrev.re);
      const syPrev = mathToScreenY(pPrev.im);
      const sxNext = mathToScreenX(pNext.re);
      const syNext = mathToScreenY(pNext.im);
      const sxCurr = mathToScreenX(curr.re);
      const syCurr = mathToScreenY(curr.im);

      const dx = sxNext - sxPrev;
      const dy = syNext - syPrev;
      if (Math.hypot(dx, dy) > 2) {
        arrows.push({
          x: sxCurr,
          y: syCurr,
          angleRad: Math.atan2(dy, dx),
          branch: "pos",
        });
      }

      if (showNegativeBranch) {
        const nyPrev = mathToScreenY(-pPrev.im);
        const nyNext = mathToScreenY(-pNext.im);
        const nyCurr = mathToScreenY(-curr.im);
        const ndx = sxNext - sxPrev;
        const ndy = nyNext - nyPrev;
        if (Math.hypot(ndx, ndy) > 2) {
          arrows.push({
            x: sxCurr,
            y: nyCurr,
            angleRad: Math.atan2(ndy, ndx),
            branch: "neg",
          });
        }
      }
    });

    return { positivePathD: posD, negativePathD: negD, arrowPoints: arrows };
  }, [data, showNegativeBranch, mathToScreenX, mathToScreenY]);

  // Compute nice grid lines
  const minMathRe = screenToMath(padding.left, 0).re;
  const maxMathRe = screenToMath(padding.left + plotWidth, 0).re;
  const minMathIm = screenToMath(0, padding.top + plotHeight).im;
  const maxMathIm = screenToMath(0, padding.top).im;

  const targetStep = currentSpanRe / 7;
  const gridStep = findClosestDecadeStep(targetStep);

  const reTicks = useMemo(() => {
    const raw = getAlignedGridTicks(minMathRe, maxMathRe, gridStep);
    return raw.map((val) => ({ val, x: mathToScreenX(val) }));
  }, [minMathRe, maxMathRe, gridStep, mathToScreenX]);

  const imTicks = useMemo(() => {
    const raw = getAlignedGridTicks(minMathIm, maxMathIm, gridStep);
    return raw.map((val) => ({ val, y: mathToScreenY(val) }));
  }, [minMathIm, maxMathIm, gridStep, mathToScreenY]);

  const originX = mathToScreenX(0);
  const originY = mathToScreenY(0);
  const critPointX = mathToScreenX(-1);
  const critPointY = mathToScreenY(0);
  const unitCircleRadius = 1 * pixelsPerUnit;

  return (
    <div
      className={`relative flex flex-col w-full h-full min-h-[380px] md:min-h-[440px] rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 backdrop-blur-sm shadow-sm p-4 ${className}`}
      style={height !== undefined ? { height: typeof height === "number" ? `${height}px` : height } : undefined}
    >
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
        <div className="flex items-center gap-2">
          {title && (
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white">
              {title}
            </h4>
          )}
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            <KatexMath math="\text{Re}(G) \text{ vs. } \text{Im}(G)" />
          </span>
        </div>

        {/* Legend & Controls */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-3 text-xs font-medium text-slate-600 dark:text-slate-300">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-4 bg-[#2563EB] rounded-full" />
              <span>
                <KatexMath math="\omega \ge 0" />
              </span>
            </span>
            {showNegativeBranch && (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-4 border-t-2 border-dashed border-[#7C3AED]" />
                <span>
                  <KatexMath math="\omega < 0" />
                </span>
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 font-semibold text-[11px]">
              <span className="h-2 w-2 rounded-full bg-[#E11D48]" />
              <KatexMath math="-1 + j0" />
            </span>
          </div>

          {interactive && (
            <button
              type="button"
              onClick={resetView}
              title="Reset View"
              aria-label="Reset zoom and pan"
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium border border-slate-200/60 dark:border-slate-700/50 bg-slate-100/80 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 hover:bg-slate-200/80 dark:hover:bg-slate-700 transition-colors"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* SVG Canvas Container */}
      <div
        ref={containerRef}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoverState(null)}
        onContextMenu={(e) => e.preventDefault()}
        className={`relative flex-1 w-full min-h-0 overflow-hidden select-none touch-none ${
          interactive ? "cursor-crosshair" : "cursor-default"
        }`}
      >
        {/* KaTeX Axis Titles */}
        <div className="pointer-events-none absolute top-1 left-2 z-10 text-[11px] font-medium text-slate-500 dark:text-slate-400">
          <KatexMath math="\text{Im}(G(j\omega)) \text{ } (\mathit{j})" />
        </div>
        <div className="pointer-events-none absolute bottom-1 right-2 z-10 text-[11px] font-medium text-slate-500 dark:text-slate-400">
          <KatexMath math="\text{Re}(G(j\omega))" />
        </div>

        <svg
          width="100%"
          height="100%"
          className="w-full flex-1 min-h-0 overflow-visible"
        >
          <defs>
            <marker
              id="nyquist-arrow-blue"
              markerWidth="6"
              markerHeight="6"
              refX="3"
              refY="3"
              orient="auto"
            >
              <path d="M 0 0 L 6 3 L 0 6 z" fill="#2563EB" />
            </marker>
            <marker
              id="nyquist-arrow-violet"
              markerWidth="6"
              markerHeight="6"
              refX="3"
              refY="3"
              orient="auto"
            >
              <path d="M 0 0 L 6 3 L 0 6 z" fill="#7C3AED" />
            </marker>
          </defs>

          {/* Grid lines: Real (vertical) */}
          <g className="re-grid" aria-hidden="true">
            {reTicks.map((t) => (
              <line
                key={`grid-re-${t.val}`}
                x1={t.x}
                y1={padding.top}
                x2={t.x}
                y2={padding.top + plotHeight}
                className={Math.abs(t.val) < 1e-6 ? "stroke-slate-400 dark:stroke-slate-500" : "stroke-slate-200/60 dark:stroke-slate-800/60"}
                strokeDasharray={Math.abs(t.val) < 1e-6 ? undefined : "2 2"}
                strokeWidth={Math.abs(t.val) < 1e-6 ? "1.5" : "1"}
              />
            ))}
          </g>

          {/* Grid lines: Imaginary (horizontal) */}
          <g className="im-grid" aria-hidden="true">
            {imTicks.map((t) => (
              <line
                key={`grid-im-${t.val}`}
                x1={padding.left}
                y1={t.y}
                x2={padding.left + plotWidth}
                y2={t.y}
                className={Math.abs(t.val) < 1e-6 ? "stroke-slate-400 dark:stroke-slate-500" : "stroke-slate-200/60 dark:stroke-slate-800/60"}
                strokeDasharray={Math.abs(t.val) < 1e-6 ? undefined : "2 2"}
                strokeWidth={Math.abs(t.val) < 1e-6 ? "1.5" : "1"}
              />
            ))}
          </g>

          {/* Unit Circle Contour: |G| = 1 */}
          {showUnitCircle && unitCircleRadius > 2 && (
            <g className="unit-circle" aria-hidden="true">
              <circle
                cx={originX}
                cy={originY}
                r={unitCircleRadius}
                fill="none"
                stroke="#94A3B8"
                strokeWidth="1.2"
                strokeDasharray="4,4"
                className="opacity-70 dark:opacity-50"
              />
            </g>
          )}

          {/* Negative Frequency Branch Trace (dashed Violet) */}
          {showNegativeBranch && negativePathD && (
            <path
              d={negativePathD}
              fill="none"
              stroke="#7C3AED"
              strokeWidth="2"
              strokeDasharray="6,4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Positive Frequency Branch Trace (solid Blue) */}
          {positivePathD && (
            <path
              d={positivePathD}
              fill="none"
              stroke="#2563EB"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Directional Arrows along contour */}
          {arrowPoints.map((arr, i) => {
            const rad = arr.angleRad;
            const size = 5;
            const x1 = arr.x - Math.cos(rad) * size;
            const y1 = arr.y - Math.sin(rad) * size;
            const x2 = arr.x + Math.cos(rad) * size;
            const y2 = arr.y + Math.sin(rad) * size;
            const leftX = arr.x - Math.cos(rad - Math.PI / 6) * (size * 1.5);
            const leftY = arr.y - Math.sin(rad - Math.PI / 6) * (size * 1.5);
            const rightX = arr.x - Math.cos(rad + Math.PI / 6) * (size * 1.5);
            const rightY = arr.y - Math.sin(rad + Math.PI / 6) * (size * 1.5);
            const color = arr.branch === "pos" ? "#2563EB" : "#7C3AED";

            return (
              <polygon
                key={`arr-${i}`}
                points={`${x2},${y2} ${leftX},${leftY} ${rightX},${rightY}`}
                fill={color}
              />
            );
          })}

          {/* Critical Point (-1, 0) Marker */}
          <g className="critical-point" aria-label="Critical stability point -1 + j0">
            {/* Halo circle */}
            <circle
              cx={critPointX}
              cy={critPointY}
              r="7"
              fill="#E11D48"
              fillOpacity="0.15"
              stroke="#E11D48"
              strokeWidth="1.5"
            />
            {/* Cross glyph */}
            <line
              x1={critPointX - 4}
              y1={critPointY}
              x2={critPointX + 4}
              y2={critPointY}
              stroke="#E11D48"
              strokeWidth="2"
            />
            <line
              x1={critPointX}
              y1={critPointY - 4}
              x2={critPointX}
              y2={critPointY + 4}
              stroke="#E11D48"
              strokeWidth="2"
            />
          </g>

          {/* Axis Ticks: Imaginary Ticks with italicized j */}
          <g className="im-labels select-none" aria-hidden="true">
            {imTicks.map((t) => {
              if (Math.abs(t.val) < 1e-6) return null;
              const sign = t.val > 0 ? "+" : "-";
              const numStr = formatTickNumber(t.val);
              return (
                <text
                  key={`lbl-im-${t.val}`}
                  x={Math.min(containerSize.width - padding.right, Math.max(padding.left + 30, originX - 6))}
                  y={t.y + 4}
                  textAnchor="end"
                  style={{ fontFamily: "'KaTeX_Main', 'Times New Roman', serif" }}
                  className="fill-slate-600 dark:fill-slate-300 text-[11px] font-medium"
                >
                  {sign}
                  <tspan
                    style={{
                      fontStyle: "italic",
                      fontFamily: "'KaTeX_Math', 'Times New Roman', serif",
                    }}
                  >
                    j
                  </tspan>
                  {numStr}
                </text>
              );
            })}
          </g>

          {/* Axis Ticks: Real Ticks along X */}
          <g className="re-labels select-none" aria-hidden="true">
            {reTicks.map((t) => {
              if (Math.abs(t.val) < 1e-6) return null;
              return (
                <text
                  key={`lbl-re-${t.val}`}
                  x={t.x}
                  y={Math.min(containerSize.height - 4, Math.max(padding.top + 16, originY + 16))}
                  textAnchor="middle"
                  style={{ fontFamily: "'KaTeX_Main', 'Times New Roman', serif" }}
                  className="fill-slate-600 dark:fill-slate-300 text-[11px] font-medium"
                >
                  {formatRealTick(t.val)}
                </text>
              );
            })}
          </g>

          {/* Hover Crosshair & Snap Dot */}
          {hoverState && (
            <g className="hover-crosshair" pointerEvents="none">
              <line
                x1={hoverState.sx}
                y1={padding.top}
                x2={hoverState.sx}
                y2={padding.top + plotHeight}
                className="stroke-slate-400/60 dark:stroke-slate-500/60"
                strokeWidth="1"
                strokeDasharray="2,2"
              />
              <line
                x1={padding.left}
                y1={hoverState.sy}
                x2={padding.left + plotWidth}
                y2={hoverState.sy}
                className="stroke-slate-400/60 dark:stroke-slate-500/60"
                strokeWidth="1"
                strokeDasharray="2,2"
              />
              <circle
                cx={hoverState.sx}
                cy={hoverState.sy}
                r="4.5"
                fill={hoverState.branch === "positive" ? "#2563EB" : "#7C3AED"}
                className="stroke-white dark:stroke-slate-900"
                strokeWidth="1.5"
              />
            </g>
          )}
        </svg>

        {/* KaTeX label for Critical Point: -1 + j0 */}
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full pb-1 text-[11px] font-bold text-rose-600 dark:text-rose-400"
          style={{ left: critPointX, top: critPointY - 4 }}
        >
          <KatexMath math="-1 + j0" />
        </div>

        {/* Floating HUD Tooltip */}
        {hoverState && (
          <div
            className="absolute pointer-events-none z-20 backdrop-blur-md bg-slate-900/90 text-white rounded-lg p-2.5 shadow-xl border border-slate-700/50 text-xs min-w-48"
            style={{
              left: Math.min(containerSize.width - 200, Math.max(10, hoverState.sx + 14)),
              top: Math.min(containerSize.height - 120, Math.max(10, hoverState.sy - 30)),
            }}
          >
            <div className="flex items-center justify-between border-b border-slate-700/60 pb-1.5 mb-2 font-mono text-[11px]">
              <span className="font-semibold text-slate-200">
                <KatexMath math={hoverState.point.omega !== undefined ? `\\omega = ${hoverState.branch === "negative" ? "-" : ""}${hoverState.point.omega.toFixed(2)}\\text{ rad/s}` : "\\text{Point}"} />
              </span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                  hoverState.branch === "positive"
                    ? "bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400"
                    : "bg-violet-50 dark:bg-violet-950 text-violet-600 dark:text-violet-400"
                }`}
              >
                <KatexMath math={hoverState.branch === "positive" ? "\\omega \\ge 0" : "\\omega < 0"} />
              </span>
            </div>
            <div className="space-y-1.5 text-[11px]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500 dark:text-slate-400">
                  <KatexMath math="\text{Re}(G)" />
                </span>
                <span className="font-semibold text-slate-800 dark:text-white">
                  <KatexMath math={`\\text{Re} = ${hoverState.point.re.toFixed(3)}`} />
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500 dark:text-slate-400">
                  <KatexMath math="\text{Im}(G)" />
                </span>
                <span className="font-semibold text-slate-800 dark:text-white">
                  <KatexMath
                    math={`\\text{Im} = ${hoverState.point.im >= 0 ? "+" : ""}${hoverState.point.im.toFixed(3)}\\,\\mathit{j}`}
                  />
                </span>
              </div>
              {hoverState.point.magnitudeDb !== undefined && (
                <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-100 dark:border-slate-800 text-[10px]">
                  <span className="text-slate-500 dark:text-slate-400">
                    <KatexMath math="|G(j\omega)|" />
                  </span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    <KatexMath math={`|G(j\\omega)| = ${hoverState.point.magnitudeDb.toFixed(2)}\\text{ dB}`} />
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
