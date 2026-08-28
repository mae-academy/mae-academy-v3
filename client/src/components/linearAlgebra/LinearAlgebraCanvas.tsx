/** MAE Linear Algebra Studio: sharp Canvas vector field, no third-party rendering engine. */
import { useEffect, useRef, useState } from "react";
import type { EigenPair } from "@/lib/linearAlgebraMath";
import { BasisFrameGeometry } from "@/lib/BasisFrameGeometry";

type Props = { original: number[]; transformed: number[]; eigenpairs?: EigenPair[]; nullBasis?: number[][]; columnBasis?: number[][]; operation: string };
type Point = [number, number, number];

const asPoint = (values: number[]): Point => [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0];

export function LinearAlgebraCanvas({ original, transformed, eigenpairs = [], nullBasis = [], columnBasis = [], operation }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef({ x: 0, y: 0, yaw: -0.78, pitch: 0.48 });
  const [rotation, setRotation] = useState({ yaw: -0.78, pitch: 0.48 });
  const [showBasisFrame, setShowBasisFrame] = useState(true);
  const is3D = original.length > 2 || transformed.length > 2;

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const context = canvas.getContext("2d"); if (!context) return;
    let frame = 0; let animationFrame = 0;
    const render = () => {
      const rect = canvas.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.floor(rect.width * dpr) || canvas.height !== Math.floor(rect.height * dpr)) { canvas.width = Math.floor(rect.width * dpr); canvas.height = Math.floor(rect.height * dpr); }
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      const width = rect.width; const height = rect.height;
      const dark = document.documentElement.classList.contains("dark");
      context.fillStyle = dark ? "#020617" : "#f8fafc"; context.fillRect(0, 0, width, height);
      const project = ([x, y, z]: Point) => {
        if (!is3D) {
          const scale = Math.min(width, height) * 0.105;
          return { x: width / 2 + x * scale, y: height / 2 - y * scale };
        }
        const cy = Math.cos(rotation.yaw); const sy = Math.sin(rotation.yaw); const cp = Math.cos(rotation.pitch); const sp = Math.sin(rotation.pitch);
        const xr = x * cy - z * sy; const zr = x * sy + z * cy; const yr = y * cp - zr * sp; const depth = zr * cp + y * sp;
        const scale = Math.min(width, height) * 0.105 / Math.max(0.55, 1 + depth * 0.08);
        return { x: width / 2 + xr * scale, y: height / 2 - yr * scale };
      };
      const line = (from: Point, to: Point, color: string, widthPx = 1, dashed = false) => { const a = project(from); const b = project(to); context.strokeStyle = color; context.lineWidth = widthPx; context.setLineDash(dashed ? [4, 5] : []); context.beginPath(); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y); context.stroke(); context.setLineDash([]); };
      const axis = dark ? "rgba(255,255,255,.82)" : "rgba(15,23,42,.9)"; const grid = dark ? "rgba(148,163,184,.18)" : "rgba(71,85,105,.18)";
      for (let coordinate = -4; coordinate <= 4; coordinate++) { line([coordinate, -4, 0], [coordinate, 4, 0], grid); line([-4, coordinate, 0], [4, coordinate, 0], grid); }
      line([-4, 0, 0], [4, 0, 0], axis, 1.3); line([0, -4, 0], [0, 4, 0], axis, 1.3); if (is3D) line([0, 0, -4], [0, 0, 4], axis, 1.3);
      const arrow = (vector: Point, color: string, label: string, widthPx = 2.5) => { const originPoint = project([0, 0, 0]); const point = project(vector); context.strokeStyle = color; context.fillStyle = color; context.lineWidth = widthPx; context.beginPath(); context.moveTo(originPoint.x, originPoint.y); context.lineTo(point.x, point.y); context.stroke(); const angle = Math.atan2(point.y - originPoint.y, point.x - originPoint.x); context.beginPath(); context.moveTo(point.x, point.y); context.lineTo(point.x - 9 * Math.cos(angle - .48), point.y - 9 * Math.sin(angle - .48)); context.lineTo(point.x - 9 * Math.cos(angle + .48), point.y - 9 * Math.sin(angle + .48)); context.closePath(); context.fill(); context.font = "700 10px ui-monospace, SFMono-Regular, Menlo, monospace"; context.fillText(label, point.x + 7, point.y - 7); };
      const originPoint = project([0, 0, 0]);
      context.strokeStyle = dark ? "rgba(124,58,237,.72)" : "rgba(124,58,237,.56)"; context.lineWidth = 1; context.setLineDash([3, 4]); context.beginPath(); context.moveTo(originPoint.x - 24, originPoint.y + 20); context.lineTo(originPoint.x, originPoint.y - 22); context.lineTo(originPoint.x + 24, originPoint.y + 20); context.lineTo(originPoint.x + 7, originPoint.y - 2); context.lineTo(originPoint.x - 7, originPoint.y - 2); context.lineTo(originPoint.x - 24, originPoint.y + 20); context.stroke(); context.setLineDash([]);
      context.fillStyle = "#e11d48"; context.beginPath(); context.arc(originPoint.x, originPoint.y, 3.5, 0, Math.PI * 2); context.fill();
      context.fillStyle = dark ? "#c4b5fd" : "#6d28d9"; context.font = "700 8px ui-monospace, SFMono-Regular, Menlo, monospace"; context.fillText("M-PLANE · O₀", originPoint.x + 10, originPoint.y + 31);
      const displayedColumns = columnBasis.slice(0, 3).map(asPoint);
      if (!is3D && displayedColumns.length >= 2) { const c1 = project(displayedColumns[0]); const c2 = project(displayedColumns[1]); const sum = project([displayedColumns[0][0] + displayedColumns[1][0], displayedColumns[0][1] + displayedColumns[1][1], 0]); context.fillStyle = dark ? "rgba(14,165,233,.11)" : "rgba(14,165,233,.14)"; context.beginPath(); context.moveTo(originPoint.x, originPoint.y); context.lineTo(c1.x, c1.y); context.lineTo(sum.x, sum.y); context.lineTo(c2.x, c2.y); context.closePath(); context.fill(); context.strokeStyle = dark ? "rgba(14,165,233,.55)" : "rgba(2,132,199,.5)"; context.lineWidth = 1; context.setLineDash([4, 4]); context.stroke(); context.setLineDash([]); }
      if (is3D && showBasisFrame && displayedColumns.length === 3) {
        try {
          const basisMatrix = Array.from({ length: 3 }, (_, row) => displayedColumns.map((column) => column[row]));
          const frameGeometry = new BasisFrameGeometry(basisMatrix);
          frameGeometry.edges.forEach((edge) => line(edge.from, edge.to, dark ? "rgba(125,211,252,.6)" : "rgba(2,132,199,.55)", 1.15, true));
          const framePath = frameGeometry.coordinatePath([1, 1, 1]);
          framePath.slice(0, -1).forEach((point, index) => line(point, framePath[index + 1], dark ? "rgba(196,181,253,.78)" : "rgba(109,40,217,.68)", 1.5));
          context.fillStyle = dark ? "#bae6fd" : "#0369a1"; context.font = "700 8px ui-monospace, SFMono-Regular, Menlo, monospace"; context.fillText(`B-FRAME · |det B|=${Math.abs(frameGeometry.volume).toFixed(2)}`, 12, 18);
        } catch { /* The analytical solver already reports invalid bases; the canvas simply omits an invalid frame. */ }
      }
      displayedColumns.forEach((basis, index) => arrow(basis.map((value) => value * 0.8) as Point, index === 0 ? "#0284c7" : "#7c3aed", `c${index + 1}`, 1.7));
      nullBasis.forEach((basis, index) => { const direction = asPoint(basis); const extent: Point = [direction[0] * 3.5, direction[1] * 3.5, direction[2] * 3.5]; line([-extent[0], -extent[1], -extent[2]], extent, "#16a34a", 1.5, true); arrow(asPoint(basis.map((value) => value * 2.5)), "#16a34a", `n${index + 1}`, 2); });
      const t = operation === "transform" ? Math.min(1, frame / 38) : 1;
      const eased = 1 - Math.pow(1 - t, 3); const originalPoint = asPoint(original); const targetPoint = asPoint(transformed);
      const animated: Point = [originalPoint[0] + (targetPoint[0] - originalPoint[0]) * eased, originalPoint[1] + (targetPoint[1] - originalPoint[1]) * eased, originalPoint[2] + (targetPoint[2] - originalPoint[2]) * eased];
      if (operation === "transform") {
        line(originalPoint, animated, dark ? "rgba(244,63,94,.85)" : "rgba(225,29,72,.72)", 1.4, true);
        line([originalPoint[0], 0, originalPoint[2]], originalPoint, dark ? "rgba(56,189,248,.58)" : "rgba(2,132,199,.54)", 1, true);
        line([0, originalPoint[1], originalPoint[2]], originalPoint, dark ? "rgba(56,189,248,.58)" : "rgba(2,132,199,.54)", 1, true);
        line([animated[0], 0, animated[2]], animated, dark ? "rgba(167,139,250,.62)" : "rgba(124,58,237,.55)", 1, true);
        line([0, animated[1], animated[2]], animated, dark ? "rgba(167,139,250,.62)" : "rgba(124,58,237,.55)", 1, true);
        context.fillStyle = dark ? "#a5b4fc" : "#6d28d9"; context.font = "700 8px ui-monospace, SFMono-Regular, Menlo, monospace"; context.fillText("B-FRAME / T-PATH", originPoint.x - 49, originPoint.y - 34);
      }
      arrow(originalPoint, "#e11d48", "v"); arrow(animated, "#7c3aed", "Av", 3);
      eigenpairs.forEach((pair, index) => arrow(asPoint(pair.vector.map((value) => value * Math.min(3, Math.max(1, Math.abs(pair.value))))), "#0284c7", `λ${index + 1}v${index + 1}`, 2));
      context.fillStyle = dark ? "#cbd5e1" : "#475569"; context.font = "700 10px ui-monospace, SFMono-Regular, Menlo, monospace"; context.fillText("x", width - 24, height / 2 - 4); context.fillText("y", width / 2 + 6, 18); if (is3D) context.fillText("z", 16, height - 16);
      if (frame < 42 && operation === "transform") { frame++; animationFrame = requestAnimationFrame(render); }
    };
    render(); return () => cancelAnimationFrame(animationFrame);
  }, [columnBasis, eigenpairs, is3D, nullBasis, operation, original, rotation, showBasisFrame, transformed]);

  return <div className="relative overflow-hidden rounded-xl border border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-950"><canvas ref={canvasRef} className={`h-[24rem] w-full ${is3D ? "touch-none" : ""}`} onPointerDown={(event) => { if (!is3D) return; event.currentTarget.setPointerCapture(event.pointerId); dragRef.current.x = event.clientX; dragRef.current.y = event.clientY; setDragging(true); }} onPointerMove={(event) => { if (!is3D || !dragging) return; const next = { yaw: dragRef.current.yaw + (event.clientX - dragRef.current.x) * .012, pitch: Math.max(-1.15, Math.min(1.15, dragRef.current.pitch + (event.clientY - dragRef.current.y) * .012)) }; setRotation(next); }} onPointerUp={(event) => { if (!is3D) return; event.currentTarget.releasePointerCapture(event.pointerId); dragRef.current = { x: 0, y: 0, yaw: rotation.yaw, pitch: rotation.pitch }; setDragging(false); }} />{is3D && <div className="absolute right-3 top-3 flex gap-1"><button type="button" onClick={() => { const next = { yaw: -0.78, pitch: 0.48 }; dragRef.current = { x: 0, y: 0, ...next }; setRotation(next); }} className="rounded border border-slate-300 bg-white/90 px-2 py-1 font-mono text-[8px] font-bold tracking-[.1em] text-slate-600 transition hover:border-violet-400 hover:text-violet-700 dark:border-slate-700 dark:bg-slate-950/90 dark:text-slate-300">RESET VIEW</button><button type="button" aria-pressed={showBasisFrame} onClick={() => setShowBasisFrame((current) => !current)} className="rounded border border-slate-300 bg-white/90 px-2 py-1 font-mono text-[8px] font-bold tracking-[.1em] text-slate-600 transition hover:border-violet-400 hover:text-violet-700 dark:border-slate-700 dark:bg-slate-950/90 dark:text-slate-300">{showBasisFrame ? "FRAME ON" : "FRAME OFF"}</button></div>}<p className="pointer-events-none absolute bottom-3 left-3 rounded border border-slate-300 bg-white/85 px-2 py-1 font-mono text-[9px] font-bold tracking-[.12em] text-slate-500 dark:border-slate-700 dark:bg-slate-950/85 dark:text-slate-400">{is3D ? "DRAG TO ROTATE / 3D BASIS FRAME" : "2D M-PLANE / BASIS FIELD"}</p></div>;
}
