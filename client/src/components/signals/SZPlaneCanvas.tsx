/**
 * MAE Academy / Signals & Systems — Tab E S/Z-plane Vector Scope.
 * Vector SVG implementation consuming the unified architecture of StandardRootLocusPlot.
 * Supports interactive pole/zero vector dragging with conjugate symmetry,
 * KaTeX axis typography, Region of Convergence (ROC) vector fills,
 * and canonical floating HUD readout.
 */
import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { KatexMath } from "@/components/ui/KatexMath";
import {
  type Complex,
  type RocResult,
  type TransferFunction,
  withMovedRoot,
} from "@/features/signals/engines/laplaceEngine";

type Props = {
  system: TransferFunction;
  roc: RocResult;
  extractSlice: boolean;
  onPreview: (system: TransferFunction) => void;
  onCommit: (system: TransferFunction) => void;
};

type View = { x: number; y: number; unit: number };
type Drag =
  | { type: "pan"; startX: number; startY: number; initViewX: number; initViewY: number }
  | { type: "root"; family: "poles" | "zeros"; index: number }
  | null;

const makePoint = (x: number, y: number): Complex => ({ re: x, im: y });

export function SZPlaneCanvas({ system, roc, extractSlice, onPreview, onCommit }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 600, height: 460 });

  // View state: (x, y) center and math units per screen pixel
  const [view, setView] = useState<View>({ x: 0, y: 0, unit: 0.025 });
  const viewRef = useRef(view);
  viewRef.current = view;

  // Active drag state
  const dragRef = useRef<Drag>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Active hover data for Apple-style HUD
  const [hoverData, setHoverData] = useState<{
    screenX: number;
    screenY: number;
    family: "pole" | "zero";
    root: Complex;
    index: number;
  } | null>(null);

  // Measure container dimensions
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setSize({ width: rect.width, height: rect.height });
      }
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Coordinate mappers
  const mx = useCallback(
    (value: number) => size.width / 2 + (value - view.x) / view.unit,
    [size.width, view.x, view.unit]
  );
  const my = useCallback(
    (value: number) => size.height / 2 - (value - view.y) / view.unit,
    [size.height, view.y, view.unit]
  );
  const inv = useCallback(
    (screenX: number, screenY: number): Complex =>
      makePoint(
        view.x + (screenX - size.width / 2) * view.unit,
        view.y - (screenY - size.height / 2) * view.unit
      ),
    [size.width, size.height, view.x, view.y, view.unit]
  );

  // Wheel zoom with passive: false to prevent scrolling parent container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const rect = el.getBoundingClientRect();
      const mouseScreenX = e.clientX - rect.left;
      const mouseScreenY = e.clientY - rect.top;

      const currentView = viewRef.current;
      const mathBefore = {
        re: currentView.x + (mouseScreenX - rect.width / 2) * currentView.unit,
        im: currentView.y - (mouseScreenY - rect.height / 2) * currentView.unit,
      };

      const factor = e.deltaY > 0 ? 1.12 : 0.89;
      const nextUnit = Math.max(0.003, Math.min(0.18, currentView.unit * factor));

      const nextX = mathBefore.re - (mouseScreenX - rect.width / 2) * nextUnit;
      const nextY = mathBefore.im + (mouseScreenY - rect.height / 2) * nextUnit;

      setView({ x: nextX, y: nextY, unit: nextUnit });
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  // Pointer interactions
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const clickCoord = inv(mouseX, mouseY);
    const hitThreshold = 14 * view.unit;

    // Check hit test against poles and zeros
    for (const family of ["poles", "zeros"] as const) {
      const idx = system[family].findIndex(
        (root) => Math.hypot(root.re - clickCoord.re, root.im - clickCoord.im) < hitThreshold
      );
      if (idx >= 0) {
        dragRef.current = { type: "root", family, index: idx };
        setIsDragging(true);
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }
    }

    // Otherwise pan the plane
    dragRef.current = {
      type: "pan",
      startX: e.clientX,
      startY: e.clientY,
      initViewX: view.x,
      initViewY: view.y,
    };
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const currentDrag = dragRef.current;
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (currentDrag) {
      if (currentDrag.type === "pan") {
        const dx = e.clientX - currentDrag.startX;
        const dy = e.clientY - currentDrag.startY;
        setView((prev) => ({
          ...prev,
          x: currentDrag.initViewX - dx * prev.unit,
          y: currentDrag.initViewY + dy * prev.unit,
        }));
        return;
      }

      if (currentDrag.type === "root") {
        const targetMath = inv(mouseX, mouseY);
        const next = withMovedRoot(system, currentDrag.family, currentDrag.index, targetMath);
        onPreview(next);

        const currentRoot = next[currentDrag.family][currentDrag.index];
        if (currentRoot) {
          setHoverData({
            screenX: mouseX,
            screenY: mouseY,
            family: currentDrag.family === "poles" ? "pole" : "zero",
            root: currentRoot,
            index: currentDrag.index,
          });
        }
        return;
      }
    }

    // Hover detection when not dragging
    const hitThreshold = 12 * view.unit;
    const currentCoord = inv(mouseX, mouseY);
    let found = false;

    for (const family of ["poles", "zeros"] as const) {
      const idx = system[family].findIndex(
        (root) => Math.hypot(root.re - currentCoord.re, root.im - currentCoord.im) < hitThreshold
      );
      if (idx >= 0) {
        const root = system[family][idx];
        setHoverData({
          screenX: mx(root.re),
          screenY: my(root.im),
          family: family === "poles" ? "pole" : "zero",
          root,
          index: idx,
        });
        found = true;
        break;
      }
    }
    if (!found && !dragRef.current) {
      setHoverData(null);
    }
  };

  const handlePointerUp = () => {
    if (dragRef.current?.type === "root") {
      onCommit(system);
    }
    dragRef.current = null;
    setIsDragging(false);
  };

  // Generate grid lines
  const gridElements = useMemo(() => {
    const lines: React.ReactNode[] = [];
    const leftMath = inv(0, 0).re;
    const rightMath = inv(size.width, 0).re;
    const bottomMath = inv(0, size.height).im;
    const topMath = inv(0, 0).im;

    if (system.mode === "s") {
      const step = Math.pow(10, Math.floor(Math.log10(Math.max(view.unit * 95, 0.1))));
      const xStart = Math.floor(leftMath / step) * step;
      for (let xVal = xStart; xVal <= rightMath; xVal += step) {
        const sx = mx(xVal);
        lines.push(
          <line
            key={`s-grid-x-${xVal}`}
            x1={sx}
            y1={0}
            x2={sx}
            y2={size.height}
            stroke="currentColor"
            strokeDasharray="2 4"
            className="text-slate-300 dark:text-slate-700/60"
            strokeWidth={1}
          />
        );
      }
      const yStart = Math.floor(bottomMath / step) * step;
      for (let yVal = yStart; yVal <= topMath; yVal += step) {
        const sy = my(yVal);
        lines.push(
          <line
            key={`s-grid-y-${yVal}`}
            x1={0}
            y1={sy}
            x2={size.width}
            y2={sy}
            stroke="currentColor"
            strokeDasharray="2 4"
            className="text-slate-300 dark:text-slate-700/60"
            strokeWidth={1}
          />
        );
      }
    } else {
      // Discrete Z-Plane polar concentric rings and spokes
      const centerSx = mx(0);
      const centerSy = my(0);
      const radiusPixel = 1 / view.unit;

      for (let ring = 1; ring <= 4; ring++) {
        const r = (radiusPixel * ring) / 2;
        lines.push(
          <circle
            key={`z-ring-${ring}`}
            cx={centerSx}
            cy={centerSy}
            r={r}
            fill="none"
            stroke="currentColor"
            strokeDasharray="2 4"
            className="text-slate-300 dark:text-slate-700/60"
            strokeWidth={1}
          />
        );
      }

      for (let angleDeg = 0; angleDeg < 360; angleDeg += 30) {
        const rad = (angleDeg * Math.PI) / 180;
        const maxR = radiusPixel * 2.5;
        lines.push(
          <line
            key={`z-spoke-${angleDeg}`}
            x1={centerSx}
            y1={centerSy}
            x2={centerSx + Math.cos(rad) * maxR}
            y2={centerSy - Math.sin(rad) * maxR}
            stroke="currentColor"
            strokeDasharray="2 4"
            className="text-slate-300 dark:text-slate-700/50"
            strokeWidth={1}
          />
        );
      }
    }

    return lines;
  }, [system.mode, inv, size.width, size.height, view.unit, mx, my]);

  // Generate Region of Convergence (ROC) SVG geometry
  const rocSvg = useMemo(() => {
    if (!roc) return null;
    const boundarySx = mx(roc.boundary);

    if (system.mode === "s") {
      let rectX = 0;
      let rectW = 0;
      if (roc.kind === "right") {
        rectX = boundarySx;
        rectW = Math.max(0, size.width - boundarySx);
      } else if (roc.kind === "left") {
        rectX = 0;
        rectW = Math.max(0, boundarySx);
      } else {
        const innerSx = mx(roc.innerBoundary ?? 0);
        rectX = Math.min(innerSx, boundarySx);
        rectW = Math.abs(boundarySx - innerSx);
      }
      return (
        <rect
          x={rectX}
          y={0}
          width={rectW}
          height={size.height}
          fill="rgba(139, 92, 246, 0.14)"
          className="transition-all duration-150"
        />
      );
    }

    // Z-Plane polar ROC
    const centerSx = mx(0);
    const centerSy = my(0);
    const outerR = Math.abs(roc.boundary / view.unit);
    const innerR = Math.abs((roc.innerBoundary ?? 0) / view.unit);

    if (roc.kind === "right") {
      // Outside boundary disk
      return (
        <path
          d={`M 0,0 L ${size.width},0 L ${size.width},${size.height} L 0,${size.height} Z M ${centerSx},${centerSy} m -${outerR},0 a ${outerR},${outerR} 0 1,0 ${outerR * 2},0 a ${outerR},${outerR} 0 1,0 -${outerR * 2},0`}
          fill="rgba(139, 92, 246, 0.14)"
          fillRule="evenodd"
        />
      );
    } else if (roc.kind === "left") {
      // Inside boundary disk
      return (
        <circle
          cx={centerSx}
          cy={centerSy}
          r={outerR}
          fill="rgba(139, 92, 246, 0.14)"
        />
      );
    } else {
      // Annular ring between innerR and outerR
      return (
        <path
          d={`M ${centerSx},${centerSy} m -${outerR},0 a ${outerR},${outerR} 0 1,0 ${outerR * 2},0 a ${outerR},${outerR} 0 1,0 -${outerR * 2},0 M ${centerSx},${centerSy} m -${innerR},0 a ${innerR},${innerR} 0 1,0 ${innerR * 2},0 a ${innerR},${innerR} 0 1,0 -${innerR * 2},0`}
          fill="rgba(139, 92, 246, 0.14)"
          fillRule="evenodd"
        />
      );
    }
  }, [roc, system.mode, mx, size.width, size.height, my, view.unit]);

  const zeroSx = mx(0);
  const zeroSy = my(0);
  const unitCircleRadius = 1 / view.unit;

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className={`relative h-[460px] w-full select-none overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-inner dark:border-slate-800 dark:bg-[#07101e] ${
        isDragging ? "cursor-grabbing" : "cursor-crosshair"
      }`}
      aria-label="Interactive pole-zero complex vector plane: drag poles and zeros, pan and scroll zoom."
    >
      <svg className="absolute inset-0 h-full w-full pointer-events-none">
        {/* Background Grid */}
        <g>{gridElements}</g>

        {/* Region of Convergence (ROC) Vector Fill */}
        {rocSvg}

        {/* Zero-Crossing Axes */}
        <g className="stroke-slate-400 dark:stroke-slate-500">
          {/* Real Axis */}
          <line
            x1={0}
            y1={zeroSy}
            x2={size.width}
            y2={zeroSy}
            stroke="currentColor"
            strokeWidth={1.5}
          />
          {/* Imaginary Axis */}
          <line
            x1={zeroSx}
            y1={0}
            x2={zeroSx}
            y2={size.height}
            stroke="currentColor"
            strokeWidth={1.5}
          />
        </g>

        {/* Highlighted frequency slice or Unit Circle */}
        {system.mode === "z" ? (
          <circle
            cx={zeroSx}
            cy={zeroSy}
            r={unitCircleRadius}
            fill="none"
            stroke={extractSlice ? "#F59E0B" : "#3B82F6"}
            strokeWidth={extractSlice ? 2.8 : 2}
            className="transition-colors duration-200"
          />
        ) : (
          extractSlice && (
            <line
              x1={zeroSx}
              y1={0}
              x2={zeroSx}
              y2={size.height}
              stroke="#F59E0B"
              strokeWidth={3}
            />
          )
        )}

        {/* Zeros (circles) */}
        {system.zeros.map((root, index) => {
          const sx = mx(root.re);
          const sy = my(root.im);
          const isSelected =
            hoverData?.family === "zero" && hoverData.index === index;
          return (
            <g key={`zero-${index}-${root.re}-${root.im}`} className="transition-transform">
              <circle
                cx={sx}
                cy={sy}
                r={isSelected ? 8.5 : 7}
                fill="none"
                stroke="#2563EB"
                strokeWidth={isSelected ? 3 : 2.5}
                className="cursor-pointer"
              />
              <text
                x={sx + 10}
                y={sy - 10}
                fill="#2563EB"
                className="font-mono text-[10px] font-bold"
              >
                z{index + 1}
              </text>
            </g>
          );
        })}

        {/* Poles (crosses) */}
        {system.poles.map((root, index) => {
          const sx = mx(root.re);
          const sy = my(root.im);
          const isSelected =
            hoverData?.family === "pole" && hoverData.index === index;
          const arm = isSelected ? 8.5 : 7;
          return (
            <g key={`pole-${index}-${root.re}-${root.im}`} className="transition-transform">
              <line
                x1={sx - arm}
                y1={sy - arm}
                x2={sx + arm}
                y2={sy + arm}
                stroke="#EF4444"
                strokeWidth={isSelected ? 3.2 : 2.5}
                strokeLinecap="round"
                className="cursor-pointer"
              />
              <line
                x1={sx + arm}
                y1={sy - arm}
                x2={sx - arm}
                y2={sy + arm}
                stroke="#EF4444"
                strokeWidth={isSelected ? 3.2 : 2.5}
                strokeLinecap="round"
                className="cursor-pointer"
              />
              <text
                x={sx + 10}
                y={sy - 10}
                fill="#EF4444"
                className="font-mono text-[10px] font-bold"
              >
                p{index + 1}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Axis KaTeX Badges */}
      <div className="pointer-events-none absolute right-3 top-3 rounded-lg border border-slate-200/80 bg-white/80 px-2.5 py-1 text-xs font-bold text-slate-700 backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-900/80 dark:text-slate-300">
        <KatexMath
          math={
            system.mode === "s"
              ? "\\text{Im}(s) \\text{ } (j\\omega)"
              : "\\text{Im}(z)"
          }
        />
      </div>
      <div className="pointer-events-none absolute bottom-3 right-3 rounded-lg border border-slate-200/80 bg-white/80 px-2.5 py-1 text-xs font-bold text-slate-700 backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-900/80 dark:text-slate-300">
        <KatexMath
          math={
            system.mode === "s"
              ? "\\text{Re}(s) \\text{ } (\\sigma)"
              : "\\text{Re}(z)"
          }
        />
      </div>

      {/* ROC status pill */}
      <div className="pointer-events-none absolute left-3 top-3 rounded-lg border border-violet-200/80 bg-violet-50/90 px-3 py-1.5 text-xs font-bold text-violet-900 shadow-sm backdrop-blur-md dark:border-violet-900/60 dark:bg-violet-950/80 dark:text-violet-200">
        <span>{roc.kind === "right" ? "ROC →" : roc.kind === "left" ? "← ROC" : "ROC Band"}</span>
        <span className="mx-2 text-slate-400">•</span>
        <span className={roc.stable ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
          {roc.stable ? "BIBO Stable" : "Unstable"}
        </span>
      </div>

      {/* Floating Apple-Style HUD Tooltip */}
      {hoverData && (
        <div
          style={{
            left: `${Math.min(size.width - 190, Math.max(12, hoverData.screenX + 16))}px`,
            top: `${Math.min(size.height - 110, Math.max(12, hoverData.screenY - 70))}px`,
          }}
          className="pointer-events-none absolute z-30 rounded-xl border border-slate-200/90 bg-white/95 p-3 text-xs shadow-xl backdrop-blur-md dark:border-slate-700/80 dark:bg-slate-900/95"
        >
          <div className="flex items-center gap-2 font-mono font-bold">
            <span
              className={`h-2 w-2 rounded-full ${
                hoverData.family === "pole" ? "bg-rose-500" : "bg-blue-500"
              }`}
            />
            <span className="text-slate-900 dark:text-white uppercase">
              {hoverData.family} {hoverData.index + 1}
            </span>
          </div>
          <div className="mt-1.5 space-y-1 font-mono text-[11px] text-slate-600 dark:text-slate-300">
            <div>
              Coord:{" "}
              <span className="font-semibold text-slate-900 dark:text-white">
                {hoverData.root.re.toFixed(3)}{" "}
                {hoverData.root.im >= 0 ? "+" : "-"}{" "}
                {Math.abs(hoverData.root.im).toFixed(3)}j
              </span>
            </div>
            <div>
              |s|:{" "}
              <span className="font-semibold text-slate-900 dark:text-white">
                {Math.hypot(hoverData.root.re, hoverData.root.im).toFixed(3)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SZPlaneCanvas;
