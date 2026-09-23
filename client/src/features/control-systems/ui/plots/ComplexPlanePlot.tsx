import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { KatexMath } from "@/components/ui/KatexMath";
import { RotateCcw } from "lucide-react";
import type { ComplexPlanePlotProps, ComplexCoordinate } from "./types";
import {
  findClosestDecadeStep,
  formatTickNumber,
  formatRealTick,
  getAlignedGridTicks,
} from "./grid-utils";

export function ComplexPlanePlot({
  poles,
  zeros,
  locusBranches = [],
  height = 440,
  interactive = true,
  currentRoots = [],
  breakawayPoints = [],
  asymptotes = [],
  imagCrossings = [],
  gridMode: initialGridMode = "cartesian",
  onGridModeChange,
  highlightedStep,
  className = "",
  title,
  reLabelKatex = "\\text{Re}(s) \\text{ } (\\sigma)",
  imLabelKatex = "\\text{Im}(s) \\text{ } (\\mathit{j}\\omega)",
  onPointHover,
}: ComplexPlanePlotProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({
    width: 600,
    height: typeof height === "number" ? height : 440,
  });

  const [gridMode, setGridMode] = useState<"cartesian" | "polar">(initialGridMode);

  useEffect(() => {
    if (initialGridMode) {
      setGridMode(initialGridMode);
    }
  }, [initialGridMode]);
  const [viewport, setViewport] = useState<{ scale: number; offsetX: number; offsetY: number }>({
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  });

  const [isPanning, setIsPanning] = useState(false);
  const isPanningRef = useRef(false);
  const startPanRef = useRef({ x: 0, y: 0 });

  // Tooltip & snap state
  const [hoverData, setHoverData] = useState<{
    screenX: number;
    screenY: number;
    s: ComplexCoordinate;
    wn: number;
    zeta: number;
    thetaDeg: number;
    k?: number;
    kind: "pole" | "zero" | "branch" | "root" | "breakaway";
  } | null>(null);

  // ResizeObserver for dynamic responsiveness
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

  const padding = { top: 20, right: 20, bottom: 20, left: 20 };
  const plotWidth = Math.max(10, containerSize.width - padding.left - padding.right);
  const plotHeight = Math.max(10, containerSize.height - padding.top - padding.bottom);

  // Compute base coordinate limits based on active open-loop poles, zeros, breakaways, and origin,
  // extended by ~1.5x of the pole-zero bounding box with strict 1:1 aspect ratio.
  // Note: currentRoots is intentionally excluded to ensure viewport remains completely fixed while dragging gain K.
  const baseBounds = useMemo(() => {
    const pzPoints: { re: number; im: number }[] = [...poles, ...zeros].filter(
      (p) => isFinite(p.re) && isFinite(p.im)
    );
    for (const bp of breakawayPoints) {
      pzPoints.push({ re: bp, im: 0 });
    }
    // Always include origin (0, 0)
    pzPoints.push({ re: 0, im: 0 });

    const minPzRe = Math.min(...pzPoints.map((p) => p.re));
    const maxPzRe = Math.max(...pzPoints.map((p) => p.re));
    const maxPzIm = Math.max(1.0, ...pzPoints.map((p) => Math.abs(p.im)));

    const pzWidth = Math.max(1.5, maxPzRe - minPzRe);
    const pzHeight = Math.max(1.5, 2 * maxPzIm);
    const pzCenterRe = (maxPzRe + minPzRe) / 2;

    // Extend by ~1.5x of the pole-zero/breakaway bounding box
    const extensionFactor = 1.5;
    const spanReRaw = pzWidth * extensionFactor;
    const spanImRaw = pzHeight * extensionFactor;

    // Reconcile with canvas aspect ratio so 1 unit Re === 1 unit Im in pixels (1:1 round circles)
    const aspect = plotWidth / (plotHeight || 1);
    let finalSpanRe = spanReRaw;
    let finalSpanIm = spanImRaw;

    if (spanReRaw / spanImRaw < aspect) {
      // Container is wider than math span: expand Re to preserve 1:1 aspect
      finalSpanRe = spanImRaw * aspect;
    } else {
      // Container is taller than math span: expand Im to preserve 1:1 aspect
      finalSpanIm = spanReRaw / aspect;
    }

    const xMin = pzCenterRe - finalSpanRe / 2;
    const xMax = pzCenterRe + finalSpanRe / 2;
    const yMax = finalSpanIm / 2;
    const yMin = -yMax;

    return { xMin, xMax, yMin, yMax };
  }, [poles, zeros, breakawayPoints, plotWidth, plotHeight]);

  // Active real axis segments for Step 2 visual highlighting
  const realAxisSegments = useMemo(() => {
    if (highlightedStep !== "real_axis") return [];
    // Collect all real open-loop poles and zeros (im === 0)
    const realPts = [
      ...poles.filter((p) => Math.abs(p.im) < 1e-4).map((p) => p.re),
      ...zeros.filter((z) => Math.abs(z.im) < 1e-4).map((z) => z.re),
    ].sort((a, b) => b - a); // descending order (right to left)

    const segments: { start: number; end: number }[] = [];
    for (let i = 0; i < realPts.length; i += 2) {
      const start = realPts[i];
      const end = i + 1 < realPts.length ? realPts[i + 1] : baseBounds.xMin - 10;
      segments.push({ start, end });
    }
    return segments;
  }, [highlightedStep, poles, zeros, baseBounds.xMin]);

  // Coordinate transforms
  const mathToScreenX = useCallback(
    (re: number) => {
      const ratio = (re - baseBounds.xMin) / (baseBounds.xMax - baseBounds.xMin || 1);
      const baseX = padding.left + ratio * plotWidth;
      return baseX * viewport.scale + viewport.offsetX;
    },
    [baseBounds.xMin, baseBounds.xMax, padding.left, plotWidth, viewport.scale, viewport.offsetX]
  );

  const mathToScreenY = useCallback(
    (im: number) => {
      const ratio = (im - baseBounds.yMin) / (baseBounds.yMax - baseBounds.yMin || 1);
      const baseY = padding.top + (1 - ratio) * plotHeight;
      return baseY * viewport.scale + viewport.offsetY;
    },
    [baseBounds.yMin, baseBounds.yMax, padding.top, plotHeight, viewport.scale, viewport.offsetY]
  );

  const screenToMathX = useCallback(
    (px: number) => {
      const unscaledPx = (px - viewport.offsetX) / viewport.scale;
      const ratio = (unscaledPx - padding.left) / plotWidth;
      return baseBounds.xMin + ratio * (baseBounds.xMax - baseBounds.xMin);
    },
    [viewport.offsetX, viewport.scale, padding.left, plotWidth, baseBounds.xMin, baseBounds.xMax]
  );

  const screenToMathY = useCallback(
    (py: number) => {
      const unscaledPy = (py - viewport.offsetY) / viewport.scale;
      const ratio = 1 - (unscaledPy - padding.top) / plotHeight;
      return baseBounds.yMin + ratio * (baseBounds.yMax - baseBounds.yMin);
    },
    [viewport.offsetY, viewport.scale, padding.top, plotHeight, baseBounds.yMin, baseBounds.yMax]
  );

  // Dynamic visible bounds in math space
  const visibleMathBounds = useMemo(() => {
    const leftX = screenToMathX(0);
    const rightX = screenToMathX(containerSize.width);
    const bottomY = screenToMathY(containerSize.height);
    const topY = screenToMathY(0);
    return {
      minRe: Math.min(leftX, rightX),
      maxRe: Math.max(leftX, rightX),
      minIm: Math.min(bottomY, topY),
      maxIm: Math.max(bottomY, topY),
    };
  }, [screenToMathX, screenToMathY, containerSize.width, containerSize.height]);

  // Origin Coordinates on screen
  const originScreenX = mathToScreenX(0);
  const originScreenY = mathToScreenY(0);

  // Dynamic Cartesian Grid Lines & Ticks strictly snapped to 1-2-5 decade scale
  const { gridLinesX, gridLinesY, stepX, stepY } = useMemo(() => {
    const spanX = visibleMathBounds.maxRe - visibleMathBounds.minRe;
    const spanY = visibleMathBounds.maxIm - visibleMathBounds.minIm;
    const autoStepX = findClosestDecadeStep(spanX / 8);
    const autoStepY = findClosestDecadeStep(spanY / 8);

    const ticksX = getAlignedGridTicks(visibleMathBounds.minRe, visibleMathBounds.maxRe, autoStepX);
    const ticksY = getAlignedGridTicks(visibleMathBounds.minIm, visibleMathBounds.maxIm, autoStepY);

    const linesX = ticksX.map((val) => ({ val, px: mathToScreenX(val) }));
    const linesY = ticksY.map((val) => ({ val, py: mathToScreenY(val) }));

    return { gridLinesX: linesX, gridLinesY: linesY, stepX: autoStepX, stepY: autoStepY };
  }, [visibleMathBounds, mathToScreenX, mathToScreenY]);

  // Polar Grid concentric circles & damping lines
  const polarGridItems = useMemo(() => {
    if (gridMode !== "polar") return { circles: [], dampingLines: [] };
    const maxRadius = Math.max(
      Math.abs(visibleMathBounds.minRe),
      Math.abs(visibleMathBounds.maxRe),
      Math.abs(visibleMathBounds.maxIm)
    );
    const stepR = stepX;
    const circles: { r: number; screenRadius: number; labelX: number; labelY: number }[] = [];
    for (let r = stepR; r <= maxRadius * 1.5; r += stepR) {
      const screenR = Math.abs(mathToScreenX(r) - originScreenX);
      // Place label at 135 deg on circle arc in left-half plane
      const rad135 = (135 * Math.PI) / 180;
      const lx = mathToScreenX(Math.cos(rad135) * r);
      const ly = mathToScreenY(Math.sin(rad135) * r);
      circles.push({ r: Number(r.toFixed(3)), screenRadius: screenR, labelX: lx, labelY: ly });
    }

    // Standard damping ratios: zeta in [0.2, 0.4, 0.6, 0.8]
    const zetas = [0.2, 0.4, 0.6, 0.8];
    const dampingLines: {
      zeta: number;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      labelX?: number;
      labelY?: number;
    }[] = [];

    for (const zeta of zetas) {
      const angle = Math.acos(zeta); // radians
      const length = maxRadius * 2;
      const xEnd = -Math.cos(angle) * length;
      const yEnd1 = Math.sin(angle) * length;
      const yEnd2 = -Math.sin(angle) * length;

      // Label placed along upper radial ray in 2nd quadrant
      const rLabel = Math.min(maxRadius * 0.75, Math.abs(visibleMathBounds.minRe) * 0.85);
      const lx = mathToScreenX(-Math.cos(angle) * rLabel);
      const ly = mathToScreenY(Math.sin(angle) * rLabel);

      // Upper ray (with KaTeX zeta label)
      dampingLines.push({
        zeta,
        x1: originScreenX,
        y1: originScreenY,
        x2: mathToScreenX(xEnd),
        y2: mathToScreenY(yEnd1),
        labelX: lx,
        labelY: ly,
      });
      // Lower ray (symmetric)
      dampingLines.push({
        zeta,
        x1: originScreenX,
        y1: originScreenY,
        x2: mathToScreenX(xEnd),
        y2: mathToScreenY(yEnd2),
      });
    }

    return { circles, dampingLines };
  }, [gridMode, visibleMathBounds, stepX, mathToScreenX, mathToScreenY, originScreenX, originScreenY]);

  // SVG Paths for Locus Branches
  const branchPaths = useMemo(() => {
    return locusBranches.map((branch) => {
      if (branch.length === 0) return "";
      let d = "";
      for (let i = 0; i < branch.length; i++) {
        const pt = branch[i];
        if (!isFinite(pt.re) || !isFinite(pt.im)) continue;
        const sx = mathToScreenX(pt.re);
        const sy = mathToScreenY(pt.im);
        if (d === "") {
          d += `M ${sx.toFixed(1)} ${sy.toFixed(1)}`;
        } else {
          d += ` L ${sx.toFixed(1)} ${sy.toFixed(1)}`;
        }
      }
      return d;
    });
  }, [locusBranches, mathToScreenX, mathToScreenY]);

  // Non-passive native wheel listener to completely stop page scroll hijacking
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !interactive) return;

    const handleNativeWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Dampen wheel zoom rate to eliminate twitchy/aggressive scaling
      const zoomFactor = Math.exp(-e.deltaY * 0.001);
      setViewport((prev) => {
        const newScale = Math.max(0.1, Math.min(60, prev.scale * zoomFactor));
        const newOffsetX = mouseX - (mouseX - prev.offsetX) * (newScale / prev.scale);
        const newOffsetY = mouseY - (mouseY - prev.offsetY) * (newScale / prev.scale);
        return { scale: newScale, offsetX: newOffsetX, offsetY: newOffsetY };
      });
    };

    el.addEventListener("wheel", handleNativeWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", handleNativeWheel);
    };
  }, [interactive]);

  // Pan interaction handlers supporting primary (button 0) and right-click (button 2) drag
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (e.button !== 0 && e.button !== 2) return;
    isPanningRef.current = true;
    setIsPanning(true);
    startPanRef.current = { x: e.clientX - viewport.offsetX, y: e.clientY - viewport.offsetY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isPanningRef.current) {
      setViewport((prev) => ({
        ...prev,
        offsetX: e.clientX - startPanRef.current.x,
        offsetY: e.clientY - startPanRef.current.y,
      }));
      return;
    }

    // Snapping detection for Apple HUD tooltip
    const rect = e.currentTarget.getBoundingClientRect();
    const mousePx = e.clientX - rect.left;
    const mousePy = e.clientY - rect.top;

    let closestDist = 24; // snap threshold in screen pixels
    let closestItem: typeof hoverData = null;

    // Check poles
    for (const p of poles) {
      const sx = mathToScreenX(p.re);
      const sy = mathToScreenY(p.im);
      const dist = Math.hypot(mousePx - sx, mousePy - sy);
      if (dist < closestDist) {
        closestDist = dist;
        const wn = Math.hypot(p.re, p.im);
        const zeta = wn > 0 ? -p.re / wn : 1;
        const thetaDeg = (Math.atan2(Math.abs(p.im), -p.re) * 180) / Math.PI;
        closestItem = {
          screenX: sx,
          screenY: sy,
          s: { re: p.re, im: p.im, k: 0 },
          wn,
          zeta,
          thetaDeg,
          k: 0,
          kind: "pole",
        };
      }
    }

    // Check zeros
    for (const z of zeros) {
      const sx = mathToScreenX(z.re);
      const sy = mathToScreenY(z.im);
      const dist = Math.hypot(mousePx - sx, mousePy - sy);
      if (dist < closestDist) {
        closestDist = dist;
        const wn = Math.hypot(z.re, z.im);
        const zeta = wn > 0 ? -z.re / wn : 1;
        const thetaDeg = (Math.atan2(Math.abs(z.im), -z.re) * 180) / Math.PI;
        closestItem = {
          screenX: sx,
          screenY: sy,
          s: { re: z.re, im: z.im },
          wn,
          zeta,
          thetaDeg,
          kind: "zero",
        };
      }
    }

    // Check current roots
    for (const cr of currentRoots) {
      const sx = mathToScreenX(cr.re);
      const sy = mathToScreenY(cr.im);
      const dist = Math.hypot(mousePx - sx, mousePy - sy);
      if (dist < closestDist) {
        closestDist = dist;
        const wn = Math.hypot(cr.re, cr.im);
        const zeta = wn > 0 ? -cr.re / wn : 1;
        const thetaDeg = (Math.atan2(Math.abs(cr.im), -cr.re) * 180) / Math.PI;
        closestItem = {
          screenX: sx,
          screenY: sy,
          s: { re: cr.re, im: cr.im },
          wn,
          zeta,
          thetaDeg,
          kind: "root",
        };
      }
    }

    // Check branches
    if (!closestItem && locusBranches.length > 0) {
      for (const branch of locusBranches) {
        for (let i = 0; i < branch.length; i += 2) {
          const pt = branch[i];
          const sx = mathToScreenX(pt.re);
          const sy = mathToScreenY(pt.im);
          const dist = Math.hypot(mousePx - sx, mousePy - sy);
          if (dist < closestDist) {
            closestDist = dist;
            const wn = Math.hypot(pt.re, pt.im);
            const zeta = wn > 0 ? -pt.re / wn : 1;
            const thetaDeg = (Math.atan2(Math.abs(pt.im), -pt.re) * 180) / Math.PI;
            closestItem = {
              screenX: sx,
              screenY: sy,
              s: { re: pt.re, im: pt.im, k: pt.k },
              wn,
              zeta,
              thetaDeg,
              k: pt.k,
              kind: "branch",
            };
          }
        }
      }
    }

    setHoverData(closestItem);
    if (onPointHover) {
      onPointHover(
        closestItem
          ? {
            s: closestItem.s,
            wn: closestItem.wn,
            zeta: closestItem.zeta,
            k: closestItem.k,
          }
          : null
      );
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isPanningRef.current) {
      isPanningRef.current = false;
      setIsPanning(false);
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // Pointer capture release safety
      }
    }
  };

  const resetView = () => {
    setViewport({ scale: 1, offsetX: 0, offsetY: 0 });
    setHoverData(null);
  };

  // Math formatting for complex coordinate s in HUD (e.g. s = -0.423 \pm \mathit{j}1.577)
  const sKaTeX = useMemo(() => {
    if (!hoverData) return "";
    const re = hoverData.s.re;
    const im = hoverData.s.im;
    const reStr = Number(re.toFixed(3)).toString();
    const imAbs = Number(Math.abs(im).toFixed(3)).toString();
    if (Math.abs(im) < 0.001) {
      return `s = ${reStr}`;
    }
    if (Math.abs(re) < 0.001) {
      return `s = \\pm \\mathit{j}${imAbs}`;
    }
    return `s = ${reStr} \\pm \\mathit{j}${imAbs}`;
  }, [hoverData]);

  return (
    <div
      className={`relative flex flex-col w-full h-full min-h-0 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 backdrop-blur-sm shadow-sm p-4 ${className}`}
      style={height !== undefined ? { height: typeof height === "number" ? `${height}px` : height } : undefined}
    >
      {/* Plot Top Header & Controls */}
      <div className="flex items-center justify-between gap-2 pb-2">
        <div className="flex items-center gap-2">
          {title && (
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white">
              {title}
            </h4>
          )}
          <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
            s-Plane
          </span>
        </div>

        {/* View Controls Toolbar */}
        <div className="flex items-center gap-2" role="toolbar" aria-label="Complex plane tools">
          {/* Platform Standard Pill Segmented Control */}
          <div
            role="tablist"
            aria-label="Grid mode"
            className="inline-flex p-1 rounded-full bg-slate-100/80 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/50"
          >
            <button
              type="button"
              role="tab"
              aria-selected={gridMode === "cartesian"}
              onClick={() => {
                setGridMode("cartesian");
                onGridModeChange?.("cartesian");
              }}
              className={`cursor-pointer select-none whitespace-nowrap transition-all inline-flex items-center ${gridMode === "cartesian"
                ? "bg-gradient-to-br from-[#2563EB] via-[#7C3AED] to-[#E11D48] text-white font-semibold rounded-full px-3.5 py-1 text-xs shadow-sm"
                : "rounded-full px-3.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
            >
              Cartesian
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={gridMode === "polar"}
              onClick={() => {
                setGridMode("polar");
                onGridModeChange?.("polar");
              }}
              className={`cursor-pointer select-none whitespace-nowrap transition-all inline-flex items-center ${gridMode === "polar"
                ? "bg-gradient-to-br from-[#2563EB] via-[#7C3AED] to-[#E11D48] text-white font-semibold rounded-full px-3.5 py-1 text-xs shadow-sm"
                : "rounded-full px-3.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
            >
              Polar
            </button>
          </div>

          {/* Reset Zoom / Pan */}
          {interactive && (
            <button
              type="button"
              onClick={resetView}
              title="Reset Zoom & Pan"
              aria-label="Reset zoom and pan"
              className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium border border-slate-200/60 dark:border-slate-700/50 bg-slate-100/80 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 hover:bg-slate-200/80 dark:hover:bg-slate-700 transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* SVG Complex Plane Canvas Container */}
      <div
        ref={containerRef}
        data-testid="complex-plane-canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => setHoverData(null)}
        onLostPointerCapture={() => {
          isPanningRef.current = false;
          setIsPanning(false);
        }}
        onContextMenu={(e) => e.preventDefault()}
        className={`relative flex-1 w-full min-h-0 overflow-hidden select-none touch-none ${interactive ? (isPanning ? "cursor-grabbing" : "cursor-grab") : "cursor-default"
          }`}
      >
        {/* KaTeX Axis Title: Imaginary Axis (Top) */}
        <div className="pointer-events-none absolute top-1 left-3 z-10 text-[11px] font-medium text-slate-600 dark:text-slate-300">
          <KatexMath math={imLabelKatex} />
        </div>

        {/* KaTeX Axis Title: Real Axis (Right) */}
        <div className="pointer-events-none absolute bottom-1 right-3 z-10 text-[11px] font-medium text-slate-600 dark:text-slate-300">
          <KatexMath math={reLabelKatex} />
        </div>

        <svg
          width="100%"
          height="100%"
          className="w-full flex-1 min-h-0 overflow-hidden"
          viewBox={`0 0 ${containerSize.width} ${containerSize.height}`}
        >
          <style>{`
            @keyframes step1MarkerPulse {
              0% { transform: scale(1); }
              35% { transform: scale(1.6); }
              70% { transform: scale(1.6); }
              100% { transform: scale(1); }
            }
            .animate-step1-pulse {
              transform-origin: 0px 0px;
              animation: step1MarkerPulse 1.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
              transition: all 400ms cubic-bezier(0.4, 0, 0.2, 1);
            }
            @keyframes step2SegmentPulse {
              0% { stroke-width: 2.5px; opacity: 0.9; }
              35% { stroke-width: 5px; opacity: 1; }
              70% { stroke-width: 5px; opacity: 1; }
              100% { stroke-width: 2.5px; opacity: 0.9; }
            }
            .animate-step2-pulse {
              animation: step2SegmentPulse 1.6s ease-in-out forwards;
              transition: stroke-width 400ms cubic-bezier(0.4, 0, 0.2, 1);
            }
            @keyframes step5BreakawayPulse {
              0% { transform: scale(1); }
              35% { transform: scale(1.5); }
              70% { transform: scale(1.5); }
              100% { transform: scale(1); }
            }
            .animate-step5-pulse {
              transform-origin: 0px 0px;
              animation: step5BreakawayPulse 1.6s ease-in-out forwards;
              transition: all 400ms cubic-bezier(0.4, 0, 0.2, 1);
            }
          `}</style>

          {/* Subtle Grid System */}
          <g className="grid-system" aria-hidden="true">
            {gridMode === "cartesian" ? (
              <>
                {/* Cartesian Vertical grid lines */}
                {gridLinesX.map((line) => (
                  <line
                    key={`grid-x-${line.val}`}
                    x1={line.px}
                    y1={0}
                    x2={line.px}
                    y2={containerSize.height}
                    className="stroke-slate-300/70 dark:stroke-slate-700/70"
                    strokeDasharray="3,3"
                    strokeWidth="1"
                  />
                ))}

                {/* Cartesian Horizontal grid lines */}
                {gridLinesY.map((line) => (
                  <line
                    key={`grid-y-${line.val}`}
                    x1={0}
                    y1={line.py}
                    x2={containerSize.width}
                    y2={line.py}
                    className="stroke-slate-300/70 dark:stroke-slate-700/70"
                    strokeDasharray="3,3"
                    strokeWidth="1"
                  />
                ))}
              </>
            ) : (
              <>
                {/* Polar Concentric Circles (constant wn) */}
                {polarGridItems.circles.map((c) => (
                  <circle
                    key={`polar-c-${c.r}`}
                    cx={originScreenX}
                    cy={originScreenY}
                    r={c.screenRadius}
                    fill="none"
                    className="stroke-slate-400/60 dark:stroke-slate-600/60"
                    strokeDasharray="4,4"
                    strokeWidth="1.25"
                  />
                ))}

                {/* Polar Radial Damping Lines (constant zeta) */}
                {polarGridItems.dampingLines.map((dl, idx) => (
                  <line
                    key={`polar-dl-${idx}`}
                    x1={dl.x1}
                    y1={dl.y1}
                    x2={dl.x2}
                    y2={dl.y2}
                    className="stroke-slate-400/60 dark:stroke-slate-600/60"
                    strokeDasharray="4,4"
                    strokeWidth="1.25"
                  />
                ))}

                {/* Readable KaTeX labels for polar omega_n circles */}
                {polarGridItems.circles.map((c) => {
                  if (
                    c.labelX < 15 ||
                    c.labelX > containerSize.width - 25 ||
                    c.labelY < 20 ||
                    c.labelY > containerSize.height - 20
                  ) {
                    return null;
                  }
                  return (
                    <text
                      key={`polar-c-lbl-${c.r}`}
                      x={c.labelX}
                      y={c.labelY}
                      textAnchor="middle"
                      style={{ fontFamily: "'KaTeX_Main', 'Times New Roman', serif" }}
                      className="fill-slate-600 dark:fill-slate-300 text-[10.5px] font-semibold select-none drop-shadow-sm pointer-events-none"
                    >
                      <tspan
                        style={{
                          fontStyle: "italic",
                          fontFamily: "'KaTeX_Math', 'Times New Roman', serif",
                        }}
                      >
                        &omega;
                      </tspan>
                      <tspan style={{ fontSize: "8.5px" }}>n</tspan>
                      {` = ${formatTickNumber(c.r)}`}
                    </text>
                  );
                })}

                {/* Readable KaTeX labels for polar zeta damping lines */}
                {polarGridItems.dampingLines.map((dl, idx) => {
                  if (!dl.labelX || !dl.labelY) return null;
                  if (
                    dl.labelX < 15 ||
                    dl.labelX > containerSize.width - 25 ||
                    dl.labelY < 20 ||
                    dl.labelY > containerSize.height - 20
                  ) {
                    return null;
                  }
                  return (
                    <text
                      key={`polar-dl-lbl-${idx}`}
                      x={dl.labelX}
                      y={dl.labelY}
                      textAnchor="end"
                      style={{ fontFamily: "'KaTeX_Main', 'Times New Roman', serif" }}
                      className="fill-slate-600 dark:fill-slate-300 text-[10.5px] font-semibold select-none drop-shadow-sm pointer-events-none"
                    >
                      <tspan
                        style={{
                          fontStyle: "italic",
                          fontFamily: "'KaTeX_Math', 'Times New Roman', serif",
                        }}
                      >
                        &zeta;
                      </tspan>
                      {` = ${dl.zeta}`}
                    </text>
                  );
                })}
              </>
            )}
          </g>

          {/* Centered 4-Quadrant Axes Crossing at (0, 0) */}
          <g className="centered-origin-axes" aria-hidden="true">
            {/* Real Axis (Horizontal) */}
            <line
              x1={0}
              y1={originScreenY}
              x2={containerSize.width}
              y2={originScreenY}
              className="stroke-slate-400 dark:stroke-slate-500"
              strokeWidth="1.75"
            />

            {/* Imaginary Axis (Vertical) */}
            <line
              x1={originScreenX}
              y1={0}
              x2={originScreenX}
              y2={containerSize.height}
              className="stroke-slate-400 dark:stroke-slate-500"
              strokeWidth="1.75"
            />
          </g>

          {/* Dynamic Axis Ticks Numbers */}
          <g className="axis-tick-labels select-none" aria-hidden="true">
            {/* Real Ticks along horizontal axis (-4, -3, -2, -1, 0, 1) */}
            {gridLinesX.map((line) => {
              const label = formatRealTick(line.val);
              return (
                <text
                  key={`lbl-re-${line.val}`}
                  x={line.px}
                  y={Math.min(containerSize.height - 6, Math.max(16, originScreenY + 14))}
                  textAnchor="middle"
                  style={{ fontFamily: "'KaTeX_Main', 'Times New Roman', serif" }}
                  className="fill-slate-600 dark:fill-slate-300 text-[11px] font-medium"
                >
                  {label}
                </text>
              );
            })}

            {/* Imaginary Ticks along vertical axis (+j2, +j1, -j1, -j2) */}
            {gridLinesY.map((line) => {
              if (Math.abs(line.val) < 1e-6) {
                // If origin is already rendered on real axis, avoid duplicate
                const originOnReal = gridLinesX.some((lx) => Math.abs(lx.val) < 1e-6);
                if (originOnReal) return null;
                return (
                  <text
                    key="lbl-im-0"
                    x={Math.min(containerSize.width - 6, Math.max(32, originScreenX - 6))}
                    y={line.py + 4}
                    textAnchor="end"
                    style={{ fontFamily: "'KaTeX_Main', 'Times New Roman', serif" }}
                    className="fill-slate-600 dark:fill-slate-300 text-[11px] font-medium"
                  >
                    0
                  </text>
                );
              }

              const sign = line.val > 0 ? "+" : "-";
              const numStr = formatTickNumber(line.val);
              return (
                <text
                  key={`lbl-im-${line.val}`}
                  x={Math.min(containerSize.width - 6, Math.max(32, originScreenX - 6))}
                  y={line.py + 4}
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

          {/* Step 2 Analytical Highlighting: Real Axis Segments (Standard Locus Blue #2563EB, strokeWidth=4) */}
          {highlightedStep === "real_axis" && realAxisSegments.length > 0 && (
            <g className="highlight-real-axis" pointerEvents="none">
              {realAxisSegments.map((seg, idx) => (
                <g key={`seg-hl-${idx}`}>
                  <line
                    x1={mathToScreenX(seg.start)}
                    y1={originScreenY}
                    x2={mathToScreenX(seg.end)}
                    y2={originScreenY}
                    stroke="#2563EB"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeOpacity="0.25"
                    className="animate-pulse"
                  />
                  <line
                    x1={mathToScreenX(seg.start)}
                    y1={originScreenY}
                    x2={mathToScreenX(seg.end)}
                    y2={originScreenY}
                    stroke="#2563EB"
                    strokeWidth="4"
                    strokeLinecap="round"
                    className="animate-step2-pulse opacity-100"
                  />
                </g>
              ))}
            </g>
          )}

          {/* Asymptotes (Step 4 Highlighted bold/high-contrast if active) */}
          {asymptotes.map((asym, idx) => {
            const rad = (asym.angleDeg * Math.PI) / 180;
            const length = 5000;
            const x2 = mathToScreenX(asym.centroid + Math.cos(rad) * length);
            const y2 = mathToScreenY(Math.sin(rad) * length);
            const isHighlighted = highlightedStep === "asymptotes";
            return (
              <line
                key={`asym-${idx}`}
                x1={mathToScreenX(asym.centroid)}
                y1={originScreenY}
                x2={x2}
                y2={y2}
                stroke={isHighlighted ? "#7C3AED" : "#64748B"}
                strokeWidth={isHighlighted ? "2.5" : "1.25"}
                strokeDasharray={isHighlighted ? "8,4" : "6,4"}
                className={`transition-all duration-300 ${isHighlighted ? "opacity-100" : "opacity-60"}`}
              />
            );
          })}

          {/* Asymptote Centroid Marker when Step 4 is highlighted */}
          {highlightedStep === "asymptotes" && asymptotes.length > 0 && (
            <g transform={`translate(${mathToScreenX(asymptotes[0].centroid)}, ${originScreenY})`} pointerEvents="none" className="transition-all duration-300">
              <circle r="6" fill="#7C3AED" stroke="#FFFFFF" strokeWidth="2" className="dark:stroke-slate-900 transition-all duration-300" />
            </g>
          )}

          {/* Locus Branch Vector Curves */}
          <g className="locus-branches">
            {branchPaths.map((pathD, idx) => (
              <path
                key={`branch-${idx}`}
                d={pathD}
                fill="none"
                stroke="#2563EB"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="dark:stroke-blue-400"
              />
            ))}
          </g>

          {/* Step 6 Analytical Highlighting: Imaginary Axis Crossings */}
          {imagCrossings && imagCrossings.map((cross, idx) => {
            const isHighlighted = highlightedStep === "imag_crossings";
            const syPos = mathToScreenY(cross.omega);
            const syNeg = mathToScreenY(-cross.omega);
            return (
              <g key={`cross-${idx}`} pointerEvents="none">
                {/* Upper Crossing */}
                <g transform={`translate(${originScreenX}, ${syPos})`}>
                  {isHighlighted && (
                    <circle r="12" fill="#E11D48" fillOpacity="0.2" stroke="#E11D48" strokeWidth="2" className="animate-pulse" />
                  )}
                  <circle r={isHighlighted ? "5.5" : "4"} fill="#E11D48" stroke="#FFFFFF" strokeWidth="1.5" className="dark:stroke-slate-900" />
                  {isHighlighted && (
                    <text
                      x="10"
                      y="4"
                      style={{ fontFamily: "'KaTeX_Main', 'Times New Roman', serif" }}
                      className="fill-rose-600 dark:fill-rose-400 text-xs font-bold"
                    >
                      +j{cross.omega.toFixed(3)} (K={cross.k.toFixed(2)})
                    </text>
                  )}
                </g>
                {/* Lower Crossing */}
                <g transform={`translate(${originScreenX}, ${syNeg})`}>
                  {isHighlighted && (
                    <circle r="12" fill="#E11D48" fillOpacity="0.2" stroke="#E11D48" strokeWidth="2" className="animate-pulse" />
                  )}
                  <circle r={isHighlighted ? "5.5" : "4"} fill="#E11D48" stroke="#FFFFFF" strokeWidth="1.5" className="dark:stroke-slate-900" />
                  {isHighlighted && (
                    <text
                      x="10"
                      y="4"
                      style={{ fontFamily: "'KaTeX_Main', 'Times New Roman', serif" }}
                      className="fill-rose-600 dark:fill-rose-400 text-xs font-bold"
                    >
                      -j{cross.omega.toFixed(3)}
                    </text>
                  )}
                </g>
              </g>
            );
          })}

          {/* Breakaway Points (Step 5 Enhanced Diamond / Rhombus Marker in Rose/Pink) */}
          {breakawayPoints.map((bp, idx) => {
            const sx = mathToScreenX(bp);
            const sy = mathToScreenY(0);
            const isHighlighted = highlightedStep === "breakaway";
            return (
              <g key={`bp-${idx}`} transform={`translate(${sx}, ${sy})`}>
                {isHighlighted && (
                  <rect
                    x="-9"
                    y="-9"
                    width="18"
                    height="18"
                    transform="rotate(45)"
                    fill="#F43F5E"
                    fillOpacity="0.25"
                    stroke="#F43F5E"
                    strokeWidth="1.5"
                    className="animate-pulse"
                  />
                )}
                <g className={isHighlighted ? "animate-step5-pulse" : ""}>
                  <rect
                    x={isHighlighted ? "-6" : "-4.5"}
                    y={isHighlighted ? "-6" : "-4.5"}
                    width={isHighlighted ? "12" : "9"}
                    height={isHighlighted ? "12" : "9"}
                    transform="rotate(45)"
                    fill="#F43F5E"
                    stroke="#FFFFFF"
                    strokeWidth="1.5"
                    className="stroke-white dark:stroke-slate-900"
                  />
                </g>
              </g>
            );
          })}

          {/* Open-Loop Zeros: Scale-Independent Crisp Vector Glyphs '○' (Standardized Blue, Step 1 Ring) */}
          <g className="open-loop-zeros">
            {zeros.map((z, idx) => {
              const sx = mathToScreenX(z.re);
              const sy = mathToScreenY(z.im);
              const isHighlighted = highlightedStep === "poles_zeros";
              const r = isHighlighted ? 7 : 5;
              return (
                <g key={`zero-${idx}`} transform={`translate(${sx}, ${sy})`}>
                  {isHighlighted && (
                    <>
                      <circle
                        r="16"
                        fill="#2563EB"
                        fillOpacity="0.2"
                        stroke="#2563EB"
                        strokeWidth="2"
                        className="animate-pulse"
                      />
                      <circle
                        r="22"
                        fill="none"
                        stroke="#2563EB"
                        strokeWidth="1.5"
                        strokeDasharray="4,3"
                        className="animate-spin"
                        style={{ animationDuration: "6s" }}
                      />
                    </>
                  )}
                  <g className={isHighlighted ? "animate-step1-pulse" : ""}>
                    <circle
                      cx="0"
                      cy="0"
                      r={r}
                      fill="none"
                      stroke="#2563EB"
                      strokeWidth={isHighlighted ? "3.2" : "2.2"}
                      className="transition-all duration-300"
                    />
                  </g>
                </g>
              );
            })}
          </g>

          {/* Open-Loop Poles: Scale-Independent Crisp Vector Glyphs '×' (Step 1 Ring) */}
          <g className="open-loop-poles">
            {poles.map((p, idx) => {
              const sx = mathToScreenX(p.re);
              const sy = mathToScreenY(p.im);
              const isHighlighted = highlightedStep === "poles_zeros";
              const s = isHighlighted ? 7 : 5;
              return (
                <g key={`pole-${idx}`} transform={`translate(${sx}, ${sy})`}>
                  {isHighlighted && (
                    <>
                      <circle
                        r="16"
                        fill="#E11D48"
                        fillOpacity="0.2"
                        stroke="#E11D48"
                        strokeWidth="2"
                        className="animate-pulse"
                      />
                      <circle
                        r="22"
                        fill="none"
                        stroke="#E11D48"
                        strokeWidth="1.5"
                        strokeDasharray="4,3"
                        className="animate-spin"
                        style={{ animationDuration: "6s" }}
                      />
                    </>
                  )}
                  <g className={isHighlighted ? "animate-step1-pulse" : ""}>
                    <line
                      x1={-s}
                      y1={-s}
                      x2={s}
                      y2={s}
                      stroke="#E11D48"
                      strokeWidth={isHighlighted ? "3.5" : "2.4"}
                      strokeLinecap="round"
                      className="transition-all duration-300"
                    />
                    <line
                      x1={-s}
                      y1={s}
                      x2={s}
                      y2={-s}
                      stroke="#E11D48"
                      strokeWidth={isHighlighted ? "3.5" : "2.4"}
                      strokeLinecap="round"
                      className="transition-all duration-300"
                    />
                  </g>
                </g>
              );
            })}
          </g>

          {/* Current Operating Closed-Loop Roots (Gain K) - Clean Diamond / Rhombus (معين) in Rose/Pink */}
          <g className="current-roots">
            {currentRoots.map((cr, idx) => {
              const sx = mathToScreenX(cr.re);
              const sy = mathToScreenY(cr.im);
              return (
                <g key={`cl-root-${idx}`} transform={`translate(${sx}, ${sy})`}>
                  <rect
                    x="-5.5"
                    y="-5.5"
                    width="11"
                    height="11"
                    transform="rotate(45)"
                    fill="#F43F5E"
                    stroke="#FFFFFF"
                    className="stroke-white dark:stroke-slate-900"
                    strokeWidth="1.5"
                  />
                </g>
              );
            })}
          </g>

          {/* Sharp Minimalist Snap Cursor & Hairlines */}
          {hoverData && (
            <g className="snap-indicator" pointerEvents="none">
              {/* Hairline to Real Axis */}
              <line
                x1={hoverData.screenX}
                y1={hoverData.screenY}
                x2={hoverData.screenX}
                y2={originScreenY}
                className="stroke-slate-400/50 dark:stroke-slate-500/50"
                strokeWidth="1"
                strokeDasharray="2,2"
              />
              {/* Hairline to Imaginary Axis */}
              <line
                x1={hoverData.screenX}
                y1={hoverData.screenY}
                x2={originScreenX}
                y2={hoverData.screenY}
                className="stroke-slate-400/50 dark:stroke-slate-500/50"
                strokeWidth="1"
                strokeDasharray="2,2"
              />
              {/* Solid Center Snap Dot */}
              <circle
                cx={hoverData.screenX}
                cy={hoverData.screenY}
                r="3.5"
                fill="#7C3AED"
                className="stroke-white dark:stroke-slate-900"
                strokeWidth="1.5"
              />
            </g>
          )}
        </svg>

        {/* Step 4 KaTeX Centroid & Angle Badges */}
        {highlightedStep === "asymptotes" && asymptotes.length > 0 && (
          <div
            className="pointer-events-none absolute z-10 px-2 py-0.5 rounded-md bg-white/95 dark:bg-slate-900/95 border border-purple-500/40 text-purple-600 dark:text-purple-400 text-xs font-bold shadow-md transform -translate-x-1/2 -translate-y-full transition-all duration-300 animate-fade-in"
            style={{
              left: `${mathToScreenX(asymptotes[0].centroid)}px`,
              top: `${originScreenY - 10}px`,
            }}
          >
            <KatexMath math={`\\sigma_a = ${asymptotes[0].centroid.toFixed(2)}`} />
          </div>
        )}
        {highlightedStep === "asymptotes" && asymptotes.map((asym, idx) => {
          const rad = (asym.angleDeg * Math.PI) / 180;
          const dist = Math.min(plotWidth, plotHeight) * 0.38;
          const lx = mathToScreenX(asym.centroid) + Math.cos(rad) * dist;
          const ly = originScreenY - Math.sin(rad) * dist;
          if (lx < 20 || lx > containerSize.width - 50 || ly < 20 || ly > containerSize.height - 30) return null;
          return (
            <div
              key={`asym-angle-${idx}`}
              className="pointer-events-none absolute z-10 px-1.5 py-0.5 rounded bg-white/90 dark:bg-slate-900/90 border border-purple-400/30 text-purple-600 dark:text-purple-400 text-[11px] shadow-sm transform -translate-x-1/2 -translate-y-1/2 transition-all duration-300 animate-fade-in"
              style={{ left: `${lx}px`, top: `${ly}px` }}
            >
              <KatexMath math={`\\psi_${idx + 1} = ${asym.angleDeg.toFixed(0)}^\\circ`} />
            </div>
          );
        })}

        {/* Step 5 KaTeX Breakaway Coordinate Badges */}
        {highlightedStep === "breakaway" && breakawayPoints.map((bp, idx) => (
          <div
            key={`bp-badge-${idx}`}
            className="pointer-events-none absolute z-10 px-2 py-0.5 rounded-md bg-white/95 dark:bg-slate-900/95 border border-rose-500/40 text-rose-600 dark:text-rose-400 text-xs font-bold shadow-md transform -translate-x-1/2 -translate-y-full transition-all duration-300 animate-fade-in"
            style={{
              left: `${mathToScreenX(bp)}px`,
              top: `${originScreenY - 10}px`,
            }}
          >
            <KatexMath math={`s = ${bp.toFixed(4)}`} />
          </div>
        ))}

        {/* Step 6 KaTeX Imaginary Crossings Badges */}
        {highlightedStep === "imag_crossings" && imagCrossings && imagCrossings.map((cross, idx) => (
          <React.Fragment key={`ic-badge-${idx}`}>
            <div
              className="pointer-events-none absolute z-10 px-2 py-0.5 rounded-md bg-white/95 dark:bg-slate-900/95 border border-rose-500/40 text-rose-600 dark:text-rose-400 text-xs font-bold shadow-md transform translate-x-2 -translate-y-1/2 transition-all duration-300 animate-fade-in"
              style={{
                left: `${originScreenX + 8}px`,
                top: `${mathToScreenY(cross.omega)}px`,
              }}
            >
              <KatexMath math={`s = +\\mathit{j}${cross.omega.toFixed(3)} \\text{ } (K = ${cross.k.toFixed(2)})`} />
            </div>
            <div
              className="pointer-events-none absolute z-10 px-2 py-0.5 rounded-md bg-white/95 dark:bg-slate-900/95 border border-rose-500/40 text-rose-600 dark:text-rose-400 text-xs font-bold shadow-md transform translate-x-2 -translate-y-1/2 transition-all duration-300 animate-fade-in"
              style={{
                left: `${originScreenX + 8}px`,
                top: `${mathToScreenY(-cross.omega)}px`,
              }}
            >
              <KatexMath math={`s = -\\mathit{j}${cross.omega.toFixed(3)}`} />
            </div>
          </React.Fragment>
        ))}

        {/* Apple-Style Floating HUD Tooltip */}
        {hoverData && (
          <div
            className="absolute pointer-events-none z-20 backdrop-blur-md bg-white/95 text-slate-900 border border-slate-200/80 shadow-xl shadow-slate-900/10 dark:bg-slate-900/90 dark:text-slate-100 dark:border-slate-700/60 dark:shadow-2xl rounded-xl p-3 text-xs transition-transform duration-75 min-w-48"
            style={{
              left: Math.min(containerSize.width - 220, Math.max(10, hoverData.screenX + 14)),
              top: Math.min(containerSize.height - 150, Math.max(10, hoverData.screenY - 30)),
            }}
          >
            {/* Header: Type and Coordinate s */}
            <div className="border-b border-slate-200/80 dark:border-slate-700/60 pb-2 mb-2">
              <div className="flex items-center justify-between gap-2 text-[10px] font-sans font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                <span>
                  {hoverData.kind === "pole"
                    ? "Open-Loop Pole"
                    : hoverData.kind === "zero"
                      ? "Open-Loop Zero"
                      : hoverData.kind === "root"
                        ? "Operating Root"
                        : "Locus Branch"}
                </span>
                {hoverData.k !== undefined && hoverData.k >= 0 && (
                  <span className="text-rose-600 dark:text-rose-400 font-bold">
                    <KatexMath math={`K = ${hoverData.k.toFixed(2)}`} />
                  </span>
                )}
              </div>
              <div className="mt-1">
                <KatexMath math={sKaTeX} className="text-blue-600 dark:text-blue-400 font-bold text-sm" />
              </div>
            </div>

            {/* Control Parameters */}
            <div className="space-y-1.5 font-mono text-[11px]">
              <div className="flex items-center justify-between gap-3">
                <span className="font-sans font-medium text-slate-500 dark:text-slate-400">Natural Freq:</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  <KatexMath math={`\\omega_n = ${hoverData.wn.toFixed(2)}\\text{ rad/s}`} />
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="font-sans font-medium text-slate-500 dark:text-slate-400">Damping:</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  <KatexMath math={`\\zeta = ${hoverData.zeta.toFixed(3)}`} />
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="font-sans font-medium text-slate-500 dark:text-slate-400">Pole Angle:</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  <KatexMath math={`\\theta = ${hoverData.thetaDeg.toFixed(1)}^\\circ`} />
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
