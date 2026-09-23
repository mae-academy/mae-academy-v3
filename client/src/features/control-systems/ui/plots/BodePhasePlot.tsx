import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { KatexMath } from "@/components/ui/KatexMath";
import { RotateCcw } from "lucide-react";
import type { FrequencyPoint, StabilityMargins } from "@/features/control/frequencyResponseMath";

export interface BodePhasePlotProps {
  data: FrequencyPoint[];
  margins?: StabilityMargins;
  height?: number | string;
  className?: string;
  title?: string;
  showAsymptote?: boolean;
  interactive?: boolean;
  hoverOmega?: number | null;
  onHoverOmegaChange?: (omega: number | null) => void;
}

export function BodePhasePlot({
  data,
  margins,
  height = 300,
  className = "",
  title = "Bode Phase",
  showAsymptote = true,
  interactive = true,
  hoverOmega,
  onHoverOmegaChange,
}: BodePhasePlotProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({
    width: 600,
    height: typeof height === "number" ? height : 300,
  });

  const [internalHoverOmega, setInternalHoverOmega] = useState<number | null>(null);
  const activeHoverOmega = hoverOmega !== undefined ? hoverOmega : internalHoverOmega;
  const [isDirectHovered, setIsDirectHovered] = useState(false);

  const [viewport, setViewport] = useState<{ scaleX: number; scaleY: number; offsetX: number; offsetY: number }>({
    scaleX: 1,
    scaleY: 1,
    offsetX: 0,
    offsetY: 0,
  });

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

  // Safe padding (left allows degree numbers like -180, -225)
  const padding = { top: 24, right: 24, bottom: 36, left: 48 };
  const plotWidth = Math.max(10, containerSize.width - padding.left - padding.right);
  const plotHeight = Math.max(10, containerSize.height - padding.top - padding.bottom);

  // Compute logarithmic frequency bounds and nice phase degree bounds
  const { minOmega, maxOmega, minDecade, maxDecade, minDeg, maxDeg } = useMemo(() => {
    if (!data || data.length === 0) {
      return { minOmega: 0.01, maxOmega: 1000, minDecade: -2, maxDecade: 3, minDeg: -225, maxDeg: 0 };
    }
    const oMin = Math.max(1e-4, data[0].omega);
    const oMax = Math.max(oMin * 10, data[data.length - 1].omega);
    const dMin = Math.floor(Math.log10(oMin));
    const dMax = Math.ceil(Math.log10(oMax));

    let loDeg = Infinity;
    let hiDeg = -Infinity;
    for (const pt of data) {
      if (Number.isFinite(pt.phaseUnwrappedDeg)) {
        if (pt.phaseUnwrappedDeg < loDeg) loDeg = pt.phaseUnwrappedDeg;
        if (pt.phaseUnwrappedDeg > hiDeg) hiDeg = pt.phaseUnwrappedDeg;
      }
      if (showAsymptote && Number.isFinite(pt.asymPhaseDeg)) {
        if (pt.asymPhaseDeg < loDeg) loDeg = pt.asymPhaseDeg;
        if (pt.asymPhaseDeg > hiDeg) hiDeg = pt.asymPhaseDeg;
      }
    }
    if (!Number.isFinite(loDeg) || !Number.isFinite(hiDeg)) {
      loDeg = -180;
      hiDeg = 0;
    }

    // Always include -180 deg reference line
    if (loDeg > -180) loDeg = -180;
    if (hiDeg < -180) hiDeg = -180;

    const span = hiDeg - loDeg;
    const margin = Math.max(15, span * 0.15);
    const step = span > 200 ? 90 : 45;
    const niceMinDeg = Math.floor((loDeg - margin) / step) * step;
    const niceMaxDeg = Math.ceil((hiDeg + margin) / step) * step;

    return {
      minOmega: Math.pow(10, dMin),
      maxOmega: Math.pow(10, dMax),
      minDecade: dMin,
      maxDecade: dMax,
      minDeg: niceMinDeg,
      maxDeg: niceMaxDeg,
    };
  }, [data, showAsymptote]);

  // Coordinate transforms
  const logMinOmega = Math.log10(minOmega);
  const logMaxOmega = Math.log10(maxOmega);
  const logSpan = Math.max(0.1, logMaxOmega - logMinOmega);

  const omegaToScreenX = useCallback(
    (w: number) => {
      if (w <= 0) return padding.left;
      const ratio = (Math.log10(w) - logMinOmega) / logSpan;
      const baseX = padding.left + ratio * plotWidth;
      return baseX * viewport.scaleX + viewport.offsetX;
    },
    [logMinOmega, logSpan, padding.left, plotWidth, viewport.scaleX, viewport.offsetX]
  );

  const degToScreenY = useCallback(
    (deg: number) => {
      const ratio = (deg - minDeg) / (maxDeg - minDeg || 1);
      const baseY = padding.top + (1 - ratio) * plotHeight;
      return baseY * viewport.scaleY + viewport.offsetY;
    },
    [minDeg, maxDeg, padding.top, plotHeight, viewport.scaleY, viewport.offsetY]
  );

  const screenXToOmega = useCallback(
    (sx: number) => {
      const unscaledX = (sx - viewport.offsetX) / viewport.scaleX;
      const ratio = (unscaledX - padding.left) / (plotWidth || 1);
      const logW = logMinOmega + ratio * logSpan;
      return Math.pow(10, logW);
    },
    [viewport.offsetX, viewport.scaleX, padding.left, plotWidth, logMinOmega, logSpan]
  );

  // Wheel zoom listener (non-passive, preventing window scroll)
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
    const w = screenXToOmega(sx);
    if (onHoverOmegaChange) onHoverOmegaChange(w);
    else setInternalHoverOmega(w);
  };

  const resetView = () => {
    setViewport({ scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 });
  };

  // Build SVG paths for exact curve and asymptote
  const { exactPathD, asymPathD } = useMemo(() => {
    if (!data || data.length === 0) return { exactPathD: "", asymPathD: "" };
    let ex = "";
    let as = "";

    data.forEach((pt, i) => {
      const sx = omegaToScreenX(pt.omega);
      const sy = degToScreenY(pt.phaseUnwrappedDeg);
      if (i === 0) ex += `M ${sx.toFixed(1)} ${sy.toFixed(1)}`;
      else ex += ` L ${sx.toFixed(1)} ${sy.toFixed(1)}`;

      if (showAsymptote && Number.isFinite(pt.asymPhaseDeg)) {
        const asY = degToScreenY(pt.asymPhaseDeg);
        if (i === 0) as += `M ${sx.toFixed(1)} ${asY.toFixed(1)}`;
        else as += ` L ${sx.toFixed(1)} ${asY.toFixed(1)}`;
      }
    });

    return { exactPathD: ex, asymPathD: as };
  }, [data, omegaToScreenX, degToScreenY, showAsymptote]);

  // Generate decade ticks and sub-decade lines
  const decadeTicks = useMemo(() => {
    const ticks: { decade: number; omega: number; x: number }[] = [];
    for (let d = minDecade; d <= maxDecade; d++) {
      const w = Math.pow(10, d);
      ticks.push({ decade: d, omega: w, x: omegaToScreenX(w) });
    }
    return ticks;
  }, [minDecade, maxDecade, omegaToScreenX]);

  const subDecadeLines = useMemo(() => {
    const lines: number[] = [];
    for (let d = minDecade; d < maxDecade; d++) {
      const base = Math.pow(10, d);
      for (let m = 2; m <= 9; m++) {
        lines.push(omegaToScreenX(m * base));
      }
    }
    return lines;
  }, [minDecade, maxDecade, omegaToScreenX]);

  // Generate degree vertical ticks
  const degTicks = useMemo(() => {
    const ticks: { deg: number; y: number }[] = [];
    const span = maxDeg - minDeg;
    const step = span > 200 ? 90 : 45;
    for (let deg = minDeg; deg <= maxDeg; deg += step) {
      ticks.push({ deg, y: degToScreenY(deg) });
    }
    return ticks;
  }, [minDeg, maxDeg, degToScreenY]);

  // Filter visible ticks to plot canvas area
  const visibleDecadeTicks = useMemo(() => {
    return decadeTicks.filter((t) => t.x >= padding.left - 5 && t.x <= containerSize.width - padding.right + 5);
  }, [decadeTicks, padding.left, padding.right, containerSize.width]);

  const visibleDegTicks = useMemo(() => {
    return degTicks.filter((t) => t.y >= padding.top - 5 && t.y <= containerSize.height - padding.bottom + 5);
  }, [degTicks, padding.top, padding.bottom, containerSize.height]);

  // Interpolated hover point
  const hoverPoint = useMemo(() => {
    if (!activeHoverOmega || !data || data.length === 0) return null;
    let closest = data[0];
    let minDiff = Infinity;
    for (const pt of data) {
      const diff = Math.abs(Math.log10(pt.omega) - Math.log10(activeHoverOmega));
      if (diff < minDiff) {
        minDiff = diff;
        closest = pt;
      }
    }
    const sx = omegaToScreenX(closest.omega);
    const sy = degToScreenY(closest.phaseUnwrappedDeg);
    return { ...closest, sx, sy };
  }, [activeHoverOmega, data, omegaToScreenX, degToScreenY]);

  // Crossover indicators
  const gainCrossoverX = margins?.gainCrossover ? omegaToScreenX(margins.gainCrossover.omega) : null;
  const gainCrossoverY = margins?.gainCrossover ? degToScreenY(margins.gainCrossover.phaseDeg) : null;
  const phaseCrossoverX = margins?.phaseCrossover ? omegaToScreenX(margins.phaseCrossover.omega) : null;
  const minus180DegY = degToScreenY(-180);

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
            <KatexMath math="\angle G(j\omega) \text{ } (^\circ)" />
          </span>
        </div>

        {/* Legend & Controls */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-3 text-xs font-medium text-slate-600 dark:text-slate-300">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-4 bg-[#7C3AED] rounded-full" />
              <span>Phase</span>
            </span>
            {showAsymptote && (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-4 border-t-2 border-dashed border-[#F43F5E]" />
                <span className="text-slate-500">Asymptote</span>
              </span>
            )}
            {margins?.gainCrossover && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-950/60 dark:to-purple-950/60 border border-violet-200/80 dark:border-violet-800/60 text-violet-700 dark:text-violet-300 font-semibold text-[11px] shadow-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
                <KatexMath math={`P_m = ${margins.gainCrossover.phaseMarginDeg.toFixed(1)}^\\circ`} />
              </span>
            )}
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
        onPointerEnter={() => setIsDirectHovered(true)}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => {
          setIsDirectHovered(false);
          if (!hoverOmega && onHoverOmegaChange) onHoverOmegaChange(null);
          setInternalHoverOmega(null);
        }}
        onContextMenu={(e) => e.preventDefault()}
        className={`relative flex-1 w-full min-h-0 overflow-hidden select-none touch-none ${interactive ? "cursor-crosshair" : "cursor-default"}`}
      >
        {/* KaTeX Axis Titles */}
        <div className="pointer-events-none absolute top-1 left-2 z-10 text-[11px] font-medium text-slate-500 dark:text-slate-400">
          <KatexMath math="\angle G(j\omega) \text{ } (^\circ)" />
        </div>
        <div className="pointer-events-none absolute bottom-1 right-2 z-10 text-[11px] font-medium text-slate-500 dark:text-slate-400">
          <KatexMath math="\omega \text{ (rad/s)}" />
        </div>

        <svg
          width="100%"
          height="100%"
          className="w-full flex-1 min-h-0 overflow-visible"
        >
          {/* Sub-decade logarithmic grid lines */}
          <g className="sub-decade-grid" aria-hidden="true">
            {subDecadeLines.map((x, i) => (
              <line
                key={`sub-${i}`}
                x1={x}
                y1={padding.top}
                x2={x}
                y2={padding.top + plotHeight}
                className="stroke-slate-200/40 dark:stroke-slate-800/50"
                strokeWidth="0.75"
                strokeDasharray="2,3"
              />
            ))}
          </g>

          {/* Main decade grid lines */}
          <g className="decade-grid" aria-hidden="true">
            {decadeTicks.map((t) => (
              <line
                key={`dec-${t.decade}`}
                x1={t.x}
                y1={padding.top}
                x2={t.x}
                y2={padding.top + plotHeight}
                className="stroke-slate-200 dark:stroke-slate-800"
                strokeWidth="1.2"
              />
            ))}
          </g>

          {/* Degree horizontal grid lines */}
          <g className="deg-grid" aria-hidden="true">
            {degTicks.map((t) => (
              <line
                key={`deg-${t.deg}`}
                x1={padding.left}
                y1={t.y}
                x2={padding.left + plotWidth}
                y2={t.y}
                className={t.deg === -180 ? "stroke-slate-400 dark:stroke-slate-600" : "stroke-slate-200 dark:stroke-slate-800"}
                strokeWidth={t.deg === -180 ? "1.5" : "1"}
                strokeDasharray={t.deg === -180 ? "4,4" : undefined}
              />
            ))}
          </g>

          {/* Crossover Frequency Reference Lines */}
          {gainCrossoverX !== null && (
            <line
              x1={gainCrossoverX}
              y1={padding.top}
              x2={gainCrossoverX}
              y2={padding.top + plotHeight}
              stroke="#7C3AED"
              strokeWidth="1.5"
              strokeDasharray="4,3"
            />
          )}
          {phaseCrossoverX !== null && (
            <line
              x1={phaseCrossoverX}
              y1={padding.top}
              x2={phaseCrossoverX}
              y2={padding.top + plotHeight}
              stroke="#E11D48"
              strokeWidth="1.5"
              strokeDasharray="4,3"
            />
          )}

          {/* Phase Margin Vertical Bracket at Gain Crossover Frequency */}
          {gainCrossoverX !== null && gainCrossoverY !== null && (
            <g className="phase-margin-bracket">
              <line
                x1={gainCrossoverX}
                y1={minus180DegY}
                x2={gainCrossoverX}
                y2={gainCrossoverY}
                stroke="#7C3AED"
                strokeWidth="2.5"
              />
              <circle cx={gainCrossoverX} cy={minus180DegY} r="3" fill="#7C3AED" />
              <circle cx={gainCrossoverX} cy={gainCrossoverY} r="3" fill="#7C3AED" />
            </g>
          )}

          {/* Signal Curve Paths */}
          {showAsymptote && asymPathD && (
            <path
              d={asymPathD}
              fill="none"
              stroke="#F43F5E"
              strokeWidth="1.75"
              strokeDasharray="6,4"
              strokeLinecap="round"
            />
          )}
          {exactPathD && (
            <path
              d={exactPathD}
              fill="none"
              stroke="#7C3AED"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Hover Crosshair & Indicator Point */}
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
              {isDirectHovered && (
                <circle
                  cx={hoverPoint.sx}
                  cy={hoverPoint.sy}
                  r="4"
                  fill="#7C3AED"
                  className="stroke-white dark:stroke-slate-900"
                  strokeWidth="1.5"
                />
              )}
            </g>
          )}
        </svg>

        {/* Ticks rendered strictly via KatexMath */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden select-none" aria-hidden="true">
          {visibleDecadeTicks.map((t) => (
            <div
              key={`katex-dec-${t.decade}`}
              className="absolute -translate-x-1/2 text-center text-[10px] font-medium text-slate-600 dark:text-slate-300"
              style={{ left: t.x, top: padding.top + plotHeight + 4 }}
            >
              <KatexMath math={`10^{${t.decade}}`} />
            </div>
          ))}
          {visibleDegTicks.map((t) => (
            <div
              key={`katex-deg-${t.deg}`}
              className="absolute -translate-y-1/2 pr-1.5 text-right text-[10px] font-medium text-slate-600 dark:text-slate-300"
              style={{ left: 0, width: padding.left - 2, top: t.y }}
            >
              <KatexMath math={`${t.deg}^\\circ`} />
            </div>
          ))}
        </div>

        {/* Floating HUD Tooltip */}
        {isDirectHovered && hoverPoint && (
          <div
            className="absolute pointer-events-none z-20 backdrop-blur-md bg-white/95 text-slate-900 border border-slate-200/80 shadow-xl shadow-slate-900/10 dark:bg-slate-900/90 dark:text-slate-100 dark:border-slate-700/60 dark:shadow-2xl rounded-xl p-3 text-xs min-w-44"
            style={{
              left: Math.min(containerSize.width - 190, Math.max(10, hoverPoint.sx + 14)),
              top: Math.min(containerSize.height - 110, Math.max(10, hoverPoint.sy - 30)),
            }}
          >
            <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-700/60 pb-1.5 mb-2 font-mono text-[11px]">
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                <KatexMath math={`\\omega = ${hoverPoint.omega.toFixed(2)}\\text{ rad/s}`} />
              </span>
            </div>
            <div className="space-y-1.5 text-[11px]">
              <div className="flex items-center justify-between gap-2 text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[#2563EB]" />
                  <KatexMath math="|G(j\omega)|" />
                </span>
                <span className="font-medium text-slate-800 dark:text-slate-200">
                  <KatexMath math={`|G(j\\omega)| = ${hoverPoint.magnitudeDb.toFixed(2)}\\text{ dB}`} />
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                  <span className="h-2 w-2 rounded-full bg-[#7C3AED]" />
                  <KatexMath math="\angle G(j\omega)" />
                </span>
                <span className="font-bold text-slate-800 dark:text-white">
                  <KatexMath math={`\\angle G(j\\omega) = ${hoverPoint.phaseUnwrappedDeg.toFixed(1)}^\\circ`} />
                </span>
              </div>
              {showAsymptote && Number.isFinite(hoverPoint.asymPhaseDeg) && (
                <div className="flex items-center justify-between gap-2 text-rose-500 text-[10px] pt-1 border-t border-slate-100 dark:border-slate-800">
                  <KatexMath math="\text{Asymptote}" />
                  <KatexMath math={`${hoverPoint.asymPhaseDeg.toFixed(1)}^\\circ`} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
