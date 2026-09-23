import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { KatexMath } from "@/components/ui/KatexMath";
import { RotateCcw } from "lucide-react";

export interface NicholsPoint {
  phase: number;
  magnitude: number;
  omega?: number;
}

export interface NicholsPlotProps {
  data: NicholsPoint[];
  height?: number | string;
  className?: string;
  title?: string;
  interactive?: boolean;
}

export function NicholsPlot({
  data,
  height = 520,
  className = "",
  title = "Nichols Diagram",
  interactive = true,
}: NicholsPlotProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({
    width: 600,
    height: typeof height === "number" ? height : 520,
  });

  const [viewport, setViewport] = useState<{ scaleX: number; scaleY: number; offsetX: number; offsetY: number }>({
    scaleX: 1,
    scaleY: 1,
    offsetX: 0,
    offsetY: 0,
  });

  const [hoverPoint, setHoverPoint] = useState<{
    sx: number;
    sy: number;
    point: NicholsPoint;
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

  const padding = { top: 24, right: 24, bottom: 36, left: 48 };
  const plotWidth = Math.max(10, containerSize.width - padding.left - padding.right);
  const plotHeight = Math.max(10, containerSize.height - padding.top - padding.bottom);

  // Compute nice phase and dB bounds
  const { minPhase, maxPhase, minDb, maxDb } = useMemo(() => {
    if (!data || data.length === 0) {
      return { minPhase: -270, maxPhase: 0, minDb: -60, maxDb: 20 };
    }

    let loPh = Infinity;
    let hiPh = -Infinity;
    let loDb = Infinity;
    let hiDb = -Infinity;

    for (const pt of data) {
      if (Number.isFinite(pt.phase)) {
        if (pt.phase < loPh) loPh = pt.phase;
        if (pt.phase > hiPh) hiPh = pt.phase;
      }
      if (Number.isFinite(pt.magnitude)) {
        if (pt.magnitude < loDb) loDb = pt.magnitude;
        if (pt.magnitude > hiDb) hiDb = pt.magnitude;
      }
    }

    // Always include critical point (-180 deg, 0 dB)
    if (loPh > -180) loPh = -180;
    if (hiPh < -180) hiPh = -180;
    if (loDb > 0) loDb = -10;
    if (hiDb < 0) hiDb = 10;

    const phaseSpan = hiPh - loPh;
    const phaseMargin = Math.max(20, phaseSpan * 0.15);
    const niceMinPhase = Math.floor((loPh - phaseMargin) / 45) * 45;
    const niceMaxPhase = Math.ceil((hiPh + phaseMargin) / 45) * 45;

    const dbSpan = hiDb - loDb;
    const dbMargin = Math.max(10, dbSpan * 0.15);
    const niceMinDb = Math.floor((loDb - dbMargin) / 20) * 20;
    const niceMaxDb = Math.ceil((hiDb + dbMargin) / 20) * 20;

    return {
      minPhase: niceMinPhase,
      maxPhase: niceMaxPhase,
      minDb: niceMinDb,
      maxDb: niceMaxDb,
    };
  }, [data]);

  // Coordinate transforms
  const phaseToScreenX = useCallback(
    (ph: number) => {
      const ratio = (ph - minPhase) / (maxPhase - minPhase || 1);
      const baseX = padding.left + ratio * plotWidth;
      return baseX * viewport.scaleX + viewport.offsetX;
    },
    [minPhase, maxPhase, padding.left, plotWidth, viewport.scaleX, viewport.offsetX]
  );

  const dbToScreenY = useCallback(
    (db: number) => {
      const ratio = (db - minDb) / (maxDb - minDb || 1);
      const baseY = padding.top + (1 - ratio) * plotHeight;
      return baseY * viewport.scaleY + viewport.offsetY;
    },
    [minDb, maxDb, padding.top, plotHeight, viewport.scaleY, viewport.offsetY]
  );

  const screenToMath = useCallback(
    (sx: number, sy: number) => {
      const unscaledX = (sx - viewport.offsetX) / viewport.scaleX;
      const ratioX = (unscaledX - padding.left) / (plotWidth || 1);
      const phase = minPhase + ratioX * (maxPhase - minPhase);

      const unscaledY = (sy - viewport.offsetY) / viewport.scaleY;
      const ratioY = 1 - (unscaledY - padding.top) / (plotHeight || 1);
      const magnitude = minDb + ratioY * (maxDb - minDb);

      return { phase, magnitude };
    },
    [viewport, padding, plotWidth, plotHeight, minPhase, maxPhase, minDb, maxDb]
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
        const nextScaleX = Math.min(20, Math.max(0.2, prev.scaleX * zoomFactor));
        const nextScaleY = Math.min(20, Math.max(0.2, prev.scaleY * zoomFactor));
        const ratioX = nextScaleX / prev.scaleX;
        const ratioY = nextScaleY / prev.scaleY;
        const nextOffsetX = mouseX - (mouseX - prev.offsetX) * ratioX;
        const nextOffsetY = mouseY - (mouseY - prev.offsetY) * ratioY;
        return { scaleX: nextScaleX, scaleY: nextScaleY, offsetX: nextOffsetX, offsetY: nextOffsetY };
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

    // Find closest curve point
    let closest: NicholsPoint | null = null;
    let minDistSq = Infinity;
    for (const pt of data) {
      if (!Number.isFinite(pt.phase) || !Number.isFinite(pt.magnitude)) continue;
      const px = phaseToScreenX(pt.phase);
      const py = dbToScreenY(pt.magnitude);
      const dSq = (px - sx) ** 2 + (py - sy) ** 2;
      if (dSq < minDistSq) {
        minDistSq = dSq;
        closest = pt;
      }
    }
    if (closest && Math.sqrt(minDistSq) < 40) {
      const snapX = phaseToScreenX(closest.phase);
      const snapY = dbToScreenY(closest.magnitude);
      setHoverPoint({ sx: snapX, sy: snapY, point: closest });
    } else {
      setHoverPoint(null);
    }
  };

  const resetView = () => {
    setViewport({ scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 });
  };

  // Build SVG path
  const curvePathD = useMemo(() => {
    if (!data || data.length === 0) return "";
    let d = "";
    data.forEach((pt, i) => {
      if (!Number.isFinite(pt.phase) || !Number.isFinite(pt.magnitude)) return;
      const sx = phaseToScreenX(pt.phase);
      const sy = dbToScreenY(pt.magnitude);
      if (d === "") d += `M ${sx.toFixed(1)} ${sy.toFixed(1)}`;
      else d += ` L ${sx.toFixed(1)} ${sy.toFixed(1)}`;
    });
    return d;
  }, [data, phaseToScreenX, dbToScreenY]);

  // Phase ticks (every 45 degrees)
  const phaseTicks = useMemo(() => {
    const ticks: { ph: number; x: number }[] = [];
    for (let ph = minPhase; ph <= maxPhase; ph += 45) {
      ticks.push({ ph, x: phaseToScreenX(ph) });
    }
    return ticks;
  }, [minPhase, maxPhase, phaseToScreenX]);

  // dB ticks (every 20 dB)
  const dbTicks = useMemo(() => {
    const ticks: { db: number; y: number }[] = [];
    const step = maxDb - minDb > 120 ? 40 : 20;
    for (let db = minDb; db <= maxDb; db += step) {
      ticks.push({ db, y: dbToScreenY(db) });
    }
    return ticks;
  }, [minDb, maxDb, dbToScreenY]);

  const visiblePhaseTicks = useMemo(() => {
    return phaseTicks.filter((t) => t.x >= padding.left - 5 && t.x <= containerSize.width - padding.right + 5);
  }, [phaseTicks, padding.left, padding.right, containerSize.width]);

  const visibleDbTicks = useMemo(() => {
    return dbTicks.filter((t) => t.y >= padding.top - 5 && t.y <= containerSize.height - padding.bottom + 5);
  }, [dbTicks, padding.top, padding.bottom, containerSize.height]);

  const critPointX = phaseToScreenX(-180);
  const critPointY = dbToScreenY(0);

  return (
    <div
      className={`relative flex flex-col w-full h-full min-h-0 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 backdrop-blur-sm shadow-sm p-4 ${className}`}
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
            <KatexMath math="|G(j\omega)| \text{ vs. } \angle G(j\omega)" />
          </span>
        </div>

        {/* Legend & Controls */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-3 text-xs font-medium text-slate-600 dark:text-slate-300">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-4 bg-[#2563EB] rounded-full" />
              <span>Trace</span>
            </span>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 font-semibold text-[11px]">
              <span className="h-2 w-2 rounded-full bg-[#E11D48]" />
              <KatexMath math="(-180^\circ, 0\text{ dB})" />
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
        onPointerLeave={() => setHoverPoint(null)}
        onContextMenu={(e) => e.preventDefault()}
        className={`relative flex-1 w-full min-h-0 overflow-hidden select-none touch-none ${
          interactive ? "cursor-crosshair" : "cursor-default"
        }`}
      >
        {/* KaTeX Axis Titles */}
        <div className="pointer-events-none absolute top-1 left-2 z-10 text-[11px] font-medium text-slate-500 dark:text-slate-400">
          <KatexMath math="|G(j\omega)| \text{ (dB)}" />
        </div>
        <div className="pointer-events-none absolute bottom-1 right-2 z-10 text-[11px] font-medium text-slate-500 dark:text-slate-400">
          <KatexMath math="\angle G(j\omega) \text{ } (^\circ)" />
        </div>

        <svg
          width="100%"
          height="100%"
          className="w-full flex-1 min-h-0 overflow-visible"
        >
          {/* Phase Grid Lines (vertical) */}
          <g className="phase-grid" aria-hidden="true">
            {phaseTicks.map((t) => (
              <line
                key={`grid-ph-${t.ph}`}
                x1={t.x}
                y1={padding.top}
                x2={t.x}
                y2={padding.top + plotHeight}
                className={t.ph === -180 ? "stroke-rose-400/80 dark:stroke-rose-600/80" : "stroke-slate-200 dark:stroke-slate-800"}
                strokeWidth={t.ph === -180 ? "1.5" : "1"}
                strokeDasharray={t.ph === -180 ? "4,4" : undefined}
              />
            ))}
          </g>

          {/* dB Grid Lines (horizontal) */}
          <g className="db-grid" aria-hidden="true">
            {dbTicks.map((t) => (
              <line
                key={`grid-db-${t.db}`}
                x1={padding.left}
                y1={t.y}
                x2={padding.left + plotWidth}
                y2={t.y}
                className={t.db === 0 ? "stroke-slate-400 dark:stroke-slate-500" : "stroke-slate-200 dark:stroke-slate-800"}
                strokeWidth={t.db === 0 ? "1.5" : "1"}
                strokeDasharray={t.db === 0 ? "4,4" : undefined}
              />
            ))}
          </g>

          {/* Signal Trace */}
          {curvePathD && (
            <path
              d={curvePathD}
              fill="none"
              stroke="#2563EB"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Critical Point (-180, 0) Marker */}
          <g className="critical-point" aria-label="Critical stability point -180 deg, 0 dB">
            <circle
              cx={critPointX}
              cy={critPointY}
              r="7"
              fill="#E11D48"
              fillOpacity="0.15"
              stroke="#E11D48"
              strokeWidth="1.5"
            />
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

          {/* Hover Crosshair & Snap Dot */}
          {hoverPoint && (
            <g className="hover-crosshair" pointerEvents="none">
              <line
                x1={hoverPoint.sx}
                y1={padding.top}
                x2={hoverPoint.sx}
                y2={padding.top + plotHeight}
                className="stroke-slate-400/60 dark:stroke-slate-500/60"
                strokeWidth="1"
                strokeDasharray="2,2"
              />
              <line
                x1={padding.left}
                y1={hoverPoint.sy}
                x2={padding.left + plotWidth}
                y2={hoverPoint.sy}
                className="stroke-slate-400/60 dark:stroke-slate-500/60"
                strokeWidth="1"
                strokeDasharray="2,2"
              />
              <circle
                cx={hoverPoint.sx}
                cy={hoverPoint.sy}
                r="4.5"
                fill="#2563EB"
                className="stroke-white dark:stroke-slate-900"
                strokeWidth="1.5"
              />
            </g>
          )}
        </svg>

        {/* Ticks rendered strictly via KatexMath */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden select-none" aria-hidden="true">
          {visiblePhaseTicks.map((t) => (
            <div
              key={`katex-ph-${t.ph}`}
              className="absolute -translate-x-1/2 text-center text-[10px] font-medium text-slate-600 dark:text-slate-300"
              style={{ left: t.x, top: padding.top + plotHeight + 4 }}
            >
              <KatexMath math={`${t.ph}^\\circ`} />
            </div>
          ))}
          {visibleDbTicks.map((t) => (
            <div
              key={`katex-db-${t.db}`}
              className="absolute -translate-y-1/2 pr-1.5 text-right text-[10px] font-medium text-slate-600 dark:text-slate-300"
              style={{ left: 0, width: padding.left - 2, top: t.y }}
            >
              <KatexMath math={t.db > 0 ? `+${t.db}` : `${t.db}`} />
            </div>
          ))}
        </div>

        {/* Floating HUD Tooltip */}
        {hoverPoint && (
          <div
            className="absolute pointer-events-none z-20 backdrop-blur-md bg-white/95 text-slate-900 border border-slate-200/80 shadow-xl shadow-slate-900/10 dark:bg-slate-900/90 dark:text-slate-100 dark:border-slate-700/60 dark:shadow-2xl rounded-xl p-3 text-xs min-w-44"
            style={{
              left: Math.min(containerSize.width - 190, Math.max(10, hoverPoint.sx + 14)),
              top: Math.min(containerSize.height - 110, Math.max(10, hoverPoint.sy - 30)),
            }}
          >
            <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-700/60 pb-1.5 mb-2 font-mono text-[11px]">
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                {hoverPoint.point.omega !== undefined ? (
                  <KatexMath math={`\\omega = ${hoverPoint.point.omega.toFixed(2)}\\text{ rad/s}`} />
                ) : (
                  <span>Nichols Point</span>
                )}
              </span>
            </div>
            <div className="space-y-1.5 text-[11px]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500 dark:text-slate-400">
                  <KatexMath math="|G(j\omega)| \text{ (dB)}" />
                </span>
                <span className="font-bold text-slate-800 dark:text-white">
                  <KatexMath math={`|G(j\\omega)| = ${hoverPoint.point.magnitude.toFixed(2)}\\text{ dB}`} />
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500 dark:text-slate-400">
                  <KatexMath math="\angle G(j\omega) \text{ } (^\circ)" />
                </span>
                <span className="font-medium text-slate-800 dark:text-slate-200">
                  <KatexMath math={`\\angle G(j\\omega) = ${hoverPoint.point.phase.toFixed(1)}^\\circ`} />
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
