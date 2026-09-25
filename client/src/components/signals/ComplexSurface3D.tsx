/**
 * MAE Academy / Signals & Systems — Tab E 3D complex-surface studio (Laplace s-plane / Z-transform z-plane).
 * Built on the shared Pseudo3DCanvas (Canvas 2D, zero WebGL): the painter-sorted |H| mesh and ROC curtains
 * render in the `renderSurfaceMesh` pass; slices, the animated cutting plane, pole/zero markers, KaTeX
 * billboards and the raycast tooltip render in the overlay pass. Same controls/animation idiom as the
 * Fourier waterfall.
 */
import { Maximize2, Scissors, Undo2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { KatexMath } from "@/components/ui/KatexMath";
import { GradientButton, SegmentedControl, StudioButton } from "@/components/common/templates";
import {
  CAMERA_PRESETS,
  cullLabels,
  easeInOutCubic,
  placeOverlay,
  Pseudo3DCanvas,
  type Bounds3D,
  type CameraAngles,
  type LabelCandidate,
  type OverlayAnchor,
  type ProjectionFn,
  type Pseudo3DFrame,
  type Pseudo3DHandle,
} from "@/components/common/3d";
import { complexLatex, formatTransferLatex, type PlaneMode, type RocResult, type TransferFunction } from "@/features/signals/engines/laplaceEngine";
import { niceTicks } from "@/lib/plotAutoScale";
import { buildComplexSurface, FLOOR_HEIGHT, heightFor, heightTicks, magnitudeAt, SURFACE_HEIGHT, SURFACE_STOPS, WIRE_EVERY, type ComplexSurface } from "./complexSurfaceModel";
import { SurfaceRaster } from "./surfaceRaster";

type Props = {
  system: TransferFunction;
  roc: RocResult;
  /** Bound to the lab's plane mode (single source of truth for H(s) / H(z)). */
  onModeChange: (mode: PlaneMode) => void;
};

type ViewPreset = "iso" | "top" | "freq";

const DEG = Math.PI / 180;
const ISO: CameraAngles = { theta: 40 * DEG, phi: 28 * DEG };
// True side view (φ = 0): the |H| axis and the σ = 0 cross-section share one screen scale, no parallax.
const FREQ_S: CameraAngles = { theta: 90 * DEG, phi: 0 };
const FREQ_Z: CameraAngles = { theta: 0, phi: 10 * DEG };
/** z of the flat panel the unit-circle DTFT profile unwraps onto (in front of the disc). */
const UNWRAP_Z = 1.42;
const SLICE_COLOR = "#2563EB";
/** ROC: translucent brand cyan with a sky-blue hairline edge. */
const ROC_COLOR = "#06B6D4";
const ROC_EDGE = "#0284C7";

const VIEW_OPTIONS: ReadonlyArray<{ value: ViewPreset; label: string }> = [
  { value: "iso", label: "3D Isometric" },
  { value: "top", label: "Top-Down (Pole-Zero Map)" },
  { value: "freq", label: "Frequency Response (Cross-Section)" },
];

const MODE_OPTIONS: ReadonlyArray<{ value: PlaneMode; label: ReactNode }> = [
  { value: "s", label: <span className="inline-flex items-center gap-1">Continuous 3D Laplace <KatexMath math="[s\text{-Plane}]" /></span> },
  { value: "z", label: <span className="inline-flex items-center gap-1">Discrete 3D Z-Transform <KatexMath math="[z\text{-Plane}]" /></span> },
];

const PALETTE = {
  dark: { floor: "rgba(148,163,184,0.12)", axis: "rgba(148,163,184,0.6)", mesh: "rgba(255,255,255,0.14)", head: "#07101e", glow: "rgba(96,165,250,0.9)" },
  light: { floor: "rgba(100,116,139,0.18)", axis: "rgba(71,85,105,0.6)", mesh: "rgba(15,23,42,0.16)", head: "#f8fafc", glow: "rgba(37,99,235,0.55)" },
} as const;

interface Tween { from: number; to: number; start: number; duration: number }
function tweenValue(t: Tween, now: number): { value: number; done: boolean } {
  const p = t.duration <= 0 ? 1 : (now - t.start) / t.duration;
  if (p <= 0) return { value: t.from, done: false };
  if (p >= 1) return { value: t.to, done: true };
  return { value: t.from + (t.to - t.from) * easeInOutCubic(p), done: false };
}

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

function signedJ(re: number, im: number, digits = 2): string {
  const r = re.toFixed(digits);
  const i = Math.abs(im).toFixed(digits);
  return `${r} ${im < 0 ? "-" : "+"} j${i}`;
}

function magnitudeLatex(m: number): string {
  if (!Number.isFinite(m) || m > 1e6) return "\\infty";
  return m.toFixed(3);
}

type LabelKind = "pole" | "zero" | "x" | "y" | "h" | "title-x" | "title-y" | "title-h" | "uw" | "title-uw" | "unit";
interface LabelDef { id: string; kind: LabelKind; world: [number, number, number]; priority: number; content: ReactNode }

interface HoverState { re: number; im: number; magnitude: number }

interface FrameBuffers {
  /** Vertex screen positions in CSS px (x, y) and view depth, refreshed every frame. */
  screen: Float32Array;
  depth: Float32Array;
  /** Quads with quadCut ≤ cut are drawn/hit-testable. */
  cut: number;
}

export function ComplexSurface3D({ system, roc, onModeChange }: Props) {
  const surface = useMemo<ComplexSurface>(() => buildComplexSurface(system), [system]);
  const mode = system.mode;
  const R = surface.extent;
  const [view, setView] = useState<ViewPreset | null>("iso");
  const [sliceTarget, setSliceTarget] = useState<0 | 1>(0);
  const [unwrapTarget, setUnwrapTarget] = useState<0 | 1>(0);
  const [hover, setHover] = useState<HoverState | null>(null);

  const stage = useRef<Pseudo3DHandle>(null);
  const labelEls = useRef(new Map<string, HTMLElement>());
  const tooltipEl = useRef<HTMLDivElement>(null);
  const hoverRef = useRef<HoverState | null>(null);
  const alpha = useRef(0); // cut sweep: 0 = full surface, 1 = cut at σ = 0 / |z| = 1
  const beta = useRef(0); // z-only: unit-circle profile unwrapped onto the front panel
  const alphaTween = useRef<Tween | null>(null);
  const betaTween = useRef<Tween | null>(null);
  const running = useRef(false);

  // ROC boundaries in the plane's cut coordinate (σ for s, |z| for z) and the shaded side.
  const rocBands = useMemo(() => {
    const outer = roc.boundary;
    const inner = roc.innerBoundary ?? roc.boundary;
    if (roc.kind === "right") return { walls: [outer], lo: outer, hi: Infinity };
    if (roc.kind === "left") return { walls: [inner], lo: mode === "s" ? -Infinity : 0, hi: inner };
    return { walls: [inner, outer], lo: inner, hi: outer };
  }, [mode, roc]);

  const buffers = useRef<FrameBuffers | null>(null);
  const raster = useRef<SurfaceRaster | null>(null);
  const maxStrips = 2 * 48;
  if (!buffers.current || buffers.current.depth.length !== surface.vx.length) {
    const vertices = surface.vx.length;
    buffers.current = { screen: new Float32Array(2 * vertices), depth: new Float32Array(vertices), cut: Infinity };
  }

  const toWorld = useCallback((re: number, im: number): [number, number] => [re / R, -im / R], [R]);

  const advanceTweens = (now: number) => {
    let active = false;
    if (alphaTween.current) {
      const { value, done } = tweenValue(alphaTween.current, now);
      alpha.current = value;
      if (done) alphaTween.current = null; else active = true;
    }
    if (betaTween.current) {
      const { value, done } = tweenValue(betaTween.current, now);
      beta.current = value;
      if (done) betaTween.current = null; else active = true;
    }
    running.current = active;
  };

  /** Cut coordinate for the current sweep: quads beyond it are removed to expose the cross-section. */
  const cutValue = () => (mode === "s" ? (R + 0.01) * (1 - alpha.current) : (R + 0.01) + (1 - (R + 0.01)) * alpha.current);

  // ── Pass 1: floor, ROC tint, painter-sorted mesh + ROC curtains ──
  const renderSurfaceMesh = useCallback((ctx: CanvasRenderingContext2D, project: ProjectionFn, frame: Pseudo3DFrame) => {
    advanceTweens(performance.now());
    const dark = document.documentElement.classList.contains("dark");
    const pal = dark ? PALETTE.dark : PALETTE.light;
    const b = buffers.current!;
    const { vx, vy, vz, quads, quadCut } = surface;
    const vertexCount = vx.length;
    const projectInto = frame.projectInto;
    for (let i = 0; i < vertexCount; i++) b.depth[i] = projectInto(vx[i], vy[i], vz[i], b.screen, 2 * i);
    const polyline = (points: Array<[number, number, number]>, close = false) => {
      points.forEach(([x, y, z], i) => { const p = project(x, y, z); if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
      if (close) ctx.closePath();
    };
    const circle = (r: number, y = 0, n = 96): Array<[number, number, number]> =>
      Array.from({ length: n + 1 }, (_, i) => { const a = (2 * Math.PI * i) / n; return [(r / R) * Math.cos(a), y, -(r / R) * Math.sin(a)] as [number, number, number]; });

    // ROC floor tint.
    ctx.fillStyle = ROC_COLOR;
    ctx.globalAlpha = dark ? 0.14 : 0.16;
    ctx.beginPath();
    if (mode === "s") {
      const lo = Math.max(-R, rocBands.lo) / R;
      const hi = Math.min(R, rocBands.hi) / R;
      if (hi > lo) polyline([[lo, 0, -1], [hi, 0, -1], [hi, 0, 1], [lo, 0, 1]], true);
    } else {
      const inner = Math.max(0, rocBands.lo);
      const outer = Math.min(R, rocBands.hi);
      if (outer > inner) {
        polyline(circle(outer), true);
        if (inner > 0) polyline(circle(inner).reverse(), true);
      }
    }
    ctx.fill();
    ctx.globalAlpha = 1;

    // Floor grid + in-plane axes.
    ctx.strokeStyle = pal.floor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (mode === "s") {
      for (const t of niceTicks(-R, R, 6)) { polyline([[t / R, 0, -1], [t / R, 0, 1]]); polyline([[-1, 0, -t / R], [1, 0, -t / R]]); }
      polyline([[-1, 0, -1], [1, 0, -1], [1, 0, 1], [-1, 0, 1]], true);
    } else {
      for (const r of niceTicks(0, R, 4)) if (r > 0) polyline(circle(r));
      for (let k = 0; k < 12; k++) { const a = (k * Math.PI) / 6; polyline([[0, 0, 0], [Math.cos(a), 0, -Math.sin(a)]]); }
    }
    ctx.stroke();
    ctx.strokeStyle = pal.axis;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    polyline([[-1, 0, 0], [1, 0, 0]]);
    polyline([[0, 0, 1], [0, 0, -1]]);
    const axisZ = 1 + (UNWRAP_Z - 1) * (mode === "z" ? easeInOutCubic(beta.current) : 0);
    const axisBase = project(-1, 0, axisZ);
    const axisTop = project(-1, SURFACE_HEIGHT, axisZ);
    if (Math.hypot(axisTop.x - axisBase.x, axisTop.y - axisBase.y) > 20) {
      polyline([[-1, 0, axisZ], [-1, SURFACE_HEIGHT * 1.08, axisZ]]);
      for (const t of heightTicks(surface)) { const y = heightFor(surface, t); polyline([[-1.025, y, axisZ], [-1, y, axisZ]]); }
    }
    ctx.stroke();

    // ── Software Gouraud surface: continuous per-vertex τ / shade, per-pixel spectral LUT, z-buffered ──
    const cut = cutValue();
    b.cut = cut;
    const SCALE = Math.min(frame.dpr, 1.5);
    const rw = Math.max(1, Math.round(frame.width * SCALE));
    const rh = Math.max(1, Math.round(frame.height * SCALE));
    if (!raster.current) raster.current = new SurfaceRaster();
    const rz = raster.current;
    rz.resize(rw, rh);
    rz.clear();
    const sc = b.screen;
    const dp = b.depth;
    const { vt, vshade } = surface;
    const quadCount = quadCut.length;
    for (let q = 0; q < quadCount; q++) {
      if (quadCut[q] > cut) continue;
      const o = q * 4;
      const ia = quads[o], ib = quads[o + 1], ie = quads[o + 2], id = quads[o + 3];
      rz.triangle(
        sc[2 * ia] * SCALE, sc[2 * ia + 1] * SCALE, dp[ia], vt[ia], vshade[ia],
        sc[2 * ib] * SCALE, sc[2 * ib + 1] * SCALE, dp[ib], vt[ib], vshade[ib],
        sc[2 * ie] * SCALE, sc[2 * ie + 1] * SCALE, dp[ie], vt[ie], vshade[ie],
      );
      rz.triangle(
        sc[2 * ia] * SCALE, sc[2 * ia + 1] * SCALE, dp[ia], vt[ia], vshade[ia],
        sc[2 * ie] * SCALE, sc[2 * ie + 1] * SCALE, dp[ie], vt[ie], vshade[ie],
        sc[2 * id] * SCALE, sc[2 * id + 1] * SCALE, dp[id], vt[id], vshade[id],
      );
    }

    // Faint wireframe (every WIRE_EVERY-th grid line), depth-tested so hidden lines never show through.
    const cols = surface.quadCols;
    const vertCols = cols + 1;
    const wireRgb: readonly [number, number, number] = dark ? [255, 255, 255] : [15, 23, 42];
    const wireAlpha = dark ? 0.07 : 0.1;
    for (let q = 0; q < quadCount; q++) {
      if (quadCut[q] > cut) continue;
      const row = Math.floor(q / cols);
      const col = q - row * cols;
      const doRow = row % WIRE_EVERY === 0;
      const doCol = col % WIRE_EVERY === 0;
      if (!doRow && !doCol) continue;
      const o = q * 4;
      const ia = quads[o], ib = quads[o + 1], id = quads[o + 3];
      if (doRow) rz.line(sc[2 * ia] * SCALE, sc[2 * ia + 1] * SCALE, dp[ia], sc[2 * ib] * SCALE, sc[2 * ib + 1] * SCALE, dp[ib], wireRgb, wireAlpha);
      if (doCol) rz.line(sc[2 * ia] * SCALE, sc[2 * ia + 1] * SCALE, dp[ia], sc[2 * id] * SCALE, sc[2 * id + 1] * SCALE, dp[id], wireRgb, wireAlpha);
    }
    void vertCols;

    // ROC curtains: cyan translucent walls, z-tested against the surface pixel by pixel, sky-blue hairline top edge.
    const veil = 1 - 0.7 * alpha.current;
    const wallTop = FLOOR_HEIGHT * 2.2;
    const strips: Array<Array<[number, number, number]>> = [];
    for (const wall of rocBands.walls) {
      if (mode === "s") {
        if (Math.abs(wall) > R) continue;
        const x = wall / R;
        for (let k = 0; k < 24; k++) { const z0 = -1 + (2 * k) / 24; const z1 = z0 + 2 / 24; strips.push([[x, 0, z0], [x, 0, z1], [x, wallTop, z1], [x, wallTop, z0]]); }
      } else {
        if (wall <= 0 || wall > R) continue;
        const r = wall / R;
        for (let k = 0; k < 48; k++) {
          const a0 = (2 * Math.PI * k) / 48; const a1 = (2 * Math.PI * (k + 1)) / 48;
          strips.push([[r * Math.cos(a0), 0, -r * Math.sin(a0)], [r * Math.cos(a1), 0, -r * Math.sin(a1)], [r * Math.cos(a1), wallTop, -r * Math.sin(a1)], [r * Math.cos(a0), wallTop, -r * Math.sin(a0)]]);
        }
      }
    }
    const rocRgb: readonly [number, number, number] = [6, 182, 212];
    const edgeRgb: readonly [number, number, number] = [2, 132, 199];
    for (const strip of strips.slice(0, maxStrips)) {
      const p = strip.map(([x, y, z]) => project(x, y, z));
      rz.blendedTriangle(p[0].x * SCALE, p[0].y * SCALE, p[0].depth, p[1].x * SCALE, p[1].y * SCALE, p[1].depth, p[2].x * SCALE, p[2].y * SCALE, p[2].depth, rocRgb, 0.18 * veil);
      rz.blendedTriangle(p[0].x * SCALE, p[0].y * SCALE, p[0].depth, p[2].x * SCALE, p[2].y * SCALE, p[2].depth, p[3].x * SCALE, p[3].y * SCALE, p[3].depth, rocRgb, 0.18 * veil);
      rz.line(p[3].x * SCALE, p[3].y * SCALE, p[3].depth, p[2].x * SCALE, p[2].y * SCALE, p[2].depth, edgeRgb, 0.9 * veil);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(rz.finish(), 0, 0, frame.width, frame.height);
  }, [surface, mode, R, rocBands]); // eslint-disable-line react-hooks/exhaustive-deps

  const labels = useMemo<LabelDef[]>(() => {
    const defs: LabelDef[] = [];
    const [xLab, yLab] = mode === "s" ? ["\\sigma", "j\\omega"] : ["\\operatorname{Re}\\{z\\}", "\\operatorname{Im}\\{z\\}"];
    system.poles.forEach((p, i) => {
      const [x, z] = toWorld(p.re, p.im);
      if (Math.abs(x) > 1.02 || Math.abs(z) > 1.02) return;
      defs.push({ id: `pole:${i}`, kind: "pole", world: [x, SURFACE_HEIGHT + 0.03, z], priority: 420 - i * 0.1, content: <KatexMath math={`p_{${i + 1}} = ${complexLatex(p)}`} /> });
    });
    system.zeros.forEach((zr, i) => {
      const [x, z] = toWorld(zr.re, zr.im);
      if (Math.abs(x) > 1.02 || Math.abs(z) > 1.02) return;
      defs.push({ id: `zero:${i}`, kind: "zero", world: [x, 0, z], priority: 400 - i * 0.1, content: <KatexMath math={`z_{${i + 1}} = ${complexLatex(zr)}`} /> });
    });
    for (const t of niceTicks(-R, R, 6)) {
      defs.push({ id: `x:${t}`, kind: "x", world: [t / R, 0, 1.0], priority: 140, content: <KatexMath math={String(Number(t.toPrecision(3)))} /> });
      defs.push({ id: `y:${t}`, kind: "y", world: [-1.0, 0, -t / R], priority: 139, content: <KatexMath math={String(Number(t.toPrecision(3)))} /> });
    }
    for (const t of heightTicks(surface)) defs.push({ id: `h:${t}`, kind: "h", world: [-1.03, heightFor(surface, t), 1], priority: 150, content: <KatexMath math={String(Number(t.toPrecision(3)))} /> });
    defs.push({ id: "title:x", kind: "title-x", world: [0, 0, 1.0], priority: 500, content: <KatexMath math={xLab} /> });
    defs.push({ id: "title:y", kind: "title-y", world: [-1.0, 0, -1.0], priority: 500, content: <KatexMath math={yLab} /> });
    defs.push({ id: "title:h", kind: "title-h", world: [-1, SURFACE_HEIGHT, 1], priority: 500, content: <KatexMath math={mode === "s" ? "|H(s)|" : "|H(z)|"} /> });
    if (mode === "z") {
      defs.push({ id: "unit", kind: "unit", world: [Math.cos(Math.PI / 4) / R, 0, -Math.sin(Math.PI / 4) / R], priority: 300, content: <KatexMath math="|z| = 1" /> });
      const unwrapTicks: Array<[number, string]> = [[-1, "-\\pi"], [-0.5, "-\\tfrac{\\pi}{2}"], [0, "0"], [0.5, "\\tfrac{\\pi}{2}"], [1, "\\pi"]];
      for (const [u, tex] of unwrapTicks) defs.push({ id: `uw:${u}`, kind: "uw", world: [u, 0, UNWRAP_Z], priority: 460, content: <KatexMath math={tex} /> });
      defs.push({ id: "title:uw", kind: "title-uw", world: [0, 0, UNWRAP_Z], priority: 470, content: <KatexMath math="\omega\ (\text{rad/sample})" /> });
    }
    return defs;
  }, [mode, R, surface, system.poles, system.zeros, toWorld]);

  // ── Pass 2: slices, cutting plane, markers, hover, KaTeX overlay ──
  const render = useCallback((frame: Pseudo3DFrame): boolean => {
    const { ctx, project, dark, width, height } = frame;
    const pal = dark ? PALETTE.dark : PALETTE.light;
    const cut = cutValue();
    const cutting = alpha.current > 0.001;
    const unwrap = mode === "z" ? easeInOutCubic(beta.current) : 0;
    const glowLine = (points: Array<{ x: number; y: number }>, color: string, width: number, glow: string) => {
      ctx.save();
      ctx.shadowColor = glow;
      ctx.shadowBlur = 12;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
      ctx.restore();
    };

    // Animated cutting plane / cylinder and its live cross-section |H| profile.
    if (cutting && alpha.current < 0.999) {
      const samples = 180;
      const section: Array<{ x: number; y: number }> = [];
      const outline: Array<{ x: number; y: number }> = [];
      for (let i = 0; i <= samples; i++) {
        let re: number; let im: number;
        if (mode === "s") { re = cut; im = -R + (2 * R * i) / samples; }
        else { const a = -Math.PI + (2 * Math.PI * i) / samples; re = cut * Math.cos(a); im = cut * Math.sin(a); }
        const [x, z] = toWorld(re, im);
        section.push(project(x, heightFor(surface, magnitudeAt(system, re, im)) + 0.004, z));
        outline.push(project(x, SURFACE_HEIGHT, z));
      }
      const base = section.map((_, i) => {
        const re = mode === "s" ? cut : cut * Math.cos(-Math.PI + (2 * Math.PI * i) / samples);
        const im = mode === "s" ? -R + (2 * R * i) / samples : cut * Math.sin(-Math.PI + (2 * Math.PI * i) / samples);
        const [x, z] = toWorld(re, im);
        return project(x, 0, z);
      });
      ctx.fillStyle = SLICE_COLOR;
      ctx.globalAlpha = 0.08;
      ctx.beginPath();
      outline.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      for (let i = base.length - 1; i >= 0; i--) ctx.lineTo(base[i].x, base[i].y);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = SLICE_COLOR;
      ctx.lineWidth = 1;
      ctx.beginPath();
      outline.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
      ctx.globalAlpha = 1;
      glowLine(section, dark ? "#E0E7FF" : "#1D4ED8", 2.4, pal.glow);
    }

    // The Fourier slice itself: |H(jω)| on σ = 0, or |H(e^{jω})| on |z| = 1 (optionally unwrapped flat).
    const slice = surface.slice;
    const slicePoints = slice.points.map((point, i) => {
      const [cx, cz] = toWorld(point.re, point.im);
      const y = heightFor(surface, slice.magnitude[i]) + 0.004;
      if (unwrap <= 0) return project(cx, y, cz);
      const fx = slice.frequency[i] / Math.PI;
      return project(cx + (fx - cx) * unwrap, y, cz + (UNWRAP_Z - cz) * unwrap);
    });
    if (unwrap > 0) {
      ctx.globalAlpha = unwrap;
      ctx.strokeStyle = pal.axis;
      ctx.lineWidth = 1.2;
      const a = project(-1, 0, UNWRAP_Z); const b = project(1, 0, UNWRAP_Z);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      for (const u of [-1, -0.5, 0, 0.5, 1]) { const t0 = project(u, 0, UNWRAP_Z); const t1 = project(u, -0.03, UNWRAP_Z); ctx.moveTo(t0.x, t0.y); ctx.lineTo(t1.x, t1.y); }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // Floor trace of the slice path (jω axis / unit circle) for the top-down map.
    ctx.strokeStyle = SLICE_COLOR;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    slice.points.forEach((point, i) => { const [x, z] = toWorld(point.re, point.im); const p = project(x, 0.002, z); if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
    ctx.stroke();
    ctx.globalAlpha = 1;
    glowLine(slicePoints, SLICE_COLOR, 3.2, pal.glow);
    glowLine(slicePoints, dark ? "#DBEAFE" : "#FFFFFF", 1.1, "transparent");

    // Poles (×) at chimney tops, zeros (○) in their basins.
    for (const p of system.poles) {
      const [x, z] = toWorld(p.re, p.im);
      if (Math.abs(x) > 1.02 || Math.abs(z) > 1.02) continue;
      const s = project(x, SURFACE_HEIGHT + 0.03, z);
      ctx.strokeStyle = pal.head; ctx.lineWidth = 4.2;
      ctx.beginPath(); ctx.moveTo(s.x - 5, s.y - 5); ctx.lineTo(s.x + 5, s.y + 5); ctx.moveTo(s.x + 5, s.y - 5); ctx.lineTo(s.x - 5, s.y + 5); ctx.stroke();
      ctx.strokeStyle = "#E11D48"; ctx.lineWidth = 2.2; ctx.stroke();
    }
    for (const zr of system.zeros) {
      const [x, z] = toWorld(zr.re, zr.im);
      if (Math.abs(x) > 1.02 || Math.abs(z) > 1.02) continue;
      const s = project(x, 0.004, z);
      ctx.beginPath(); ctx.arc(s.x, s.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = pal.head; ctx.fill();
      ctx.strokeStyle = SLICE_COLOR; ctx.lineWidth = 2.2; ctx.stroke();
    }

    // Hover probe: glowing point on the surface with a drop line to the floor.
    const h = hoverRef.current;
    let probe: { x: number; y: number } | null = null;
    if (h) {
      const [x, z] = toWorld(h.re, h.im);
      const top = project(x, heightFor(surface, h.magnitude), z);
      const floor = project(x, 0, z);
      ctx.setLineDash([3, 3]); ctx.strokeStyle = pal.axis; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(floor.x, floor.y); ctx.stroke(); ctx.setLineDash([]);
      ctx.save(); ctx.shadowColor = pal.glow; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(top.x, top.y, 4.5, 0, Math.PI * 2); ctx.fillStyle = "#ffffff"; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = SLICE_COLOR; ctx.stroke(); ctx.restore();
      probe = top;
    }

    // KaTeX billboards with edge-on collapse detection and collision culling.
    const span = (a: [number, number, number], b: [number, number, number]) => { const p0 = project(...a); const p1 = project(...b); return Math.hypot(p1.x - p0.x, p1.y - p0.y); };
    const xCollapsed = span([-1, 0, 1], [1, 0, 1]) < 90;
    const yCollapsed = span([-1, 0, 1], [-1, 0, -1]) < 90;
    const hCollapsed = span([-1, 0, 1], [-1, SURFACE_HEIGHT, 1]) < 50;
    const candidates: LabelCandidate[] = [];
    for (const def of labels) {
      const el = labelEls.current.get(def.id);
      if (!el) continue;
      const hidden =
        ((def.kind === "x" || def.kind === "title-x") && xCollapsed) ||
        ((def.kind === "y" || def.kind === "title-y") && yCollapsed) ||
        ((def.kind === "h" || def.kind === "title-h") && hCollapsed) ||
        ((def.kind === "uw" || def.kind === "title-uw") && unwrap < 0.6) ||
        ((def.kind === "x" || def.kind === "y" || def.kind === "title-x" || def.kind === "title-y") && unwrap > 0.2) ||
        (def.kind === "unit" && unwrap > 0.2);
      if (hidden) { placeOverlay(el, { x: 0, y: 0 }, "center", false); continue; }
      const onAxis = def.kind === "h" || def.kind === "title-h";
      const base = project(def.world[0], def.world[1], onAxis ? 1 + (UNWRAP_Z - 1) * unwrap : def.world[2]);
      let anchor: OverlayAnchor = "center";
      let x = base.x; let y = base.y;
      switch (def.kind) {
        case "pole": anchor = "above"; y -= 8; break;
        case "zero": anchor = "below"; y += 8; break;
        case "x": case "uw": anchor = "below"; y += 5; break;
        case "y": case "h": anchor = "left"; x -= 6; break;
        case "title-x": case "title-uw": anchor = "below"; y += 24; break;
        case "title-y": anchor = "above"; y -= 6; break;
        case "title-h": anchor = "above"; y -= 8; break;
        case "unit": anchor = "above"; y -= 4; break;
      }
      candidates.push({ id: def.id, point: { ...base, x, y }, width: el.offsetWidth, height: el.offsetHeight, anchor, priority: def.priority });
    }
    const shown = cullLabels(candidates, width, height);
    for (const c of candidates) placeOverlay(labelEls.current.get(c.id) ?? null, c.point, c.anchor, shown.has(c.id));

    const tip = tooltipEl.current;
    if (tip && probe) {
      const w = tip.offsetWidth; const th = tip.offsetHeight;
      const flip = probe.y - 14 - th < 4;
      placeOverlay(tip, { x: Math.max(w / 2 + 6, Math.min(width - w / 2 - 6, probe.x)), y: flip ? probe.y + 14 : probe.y - 14 }, flip ? "below" : "above");
    } else {
      placeOverlay(tip, { x: 0, y: 0 }, "above", false);
    }
    return running.current;
  }, [labels, mode, R, surface, system, toWorld]); // eslint-disable-line react-hooks/exhaustive-deps

  // Raycast: nearest (largest view depth) visible triangle under the cursor, barycentric (Re, Im).
  const onHover = useCallback((point: { x: number; y: number } | null) => {
    let next: HoverState | null = null;
    const b = buffers.current;
    if (point && b) {
      const { quads, quadCut } = surface;
      const s = b.screen;
      const d = b.depth;
      let bestDepth = -Infinity;
      const tryTriangle = (i0: number, i1: number, i2: number) => {
        const x0 = s[2 * i0], y0 = s[2 * i0 + 1], x1 = s[2 * i1], y1 = s[2 * i1 + 1], x2 = s[2 * i2], y2 = s[2 * i2 + 1];
        const det = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
        if (Math.abs(det) < 1e-9) return;
        const l0 = ((y1 - y2) * (point.x - x2) + (x2 - x1) * (point.y - y2)) / det;
        const l1 = ((y2 - y0) * (point.x - x2) + (x0 - x2) * (point.y - y2)) / det;
        const l2 = 1 - l0 - l1;
        if (l0 < -1e-6 || l1 < -1e-6 || l2 < -1e-6) return;
        const depth = l0 * d[i0] + l1 * d[i1] + l2 * d[i2];
        if (depth <= bestDepth) return;
        bestDepth = depth;
        const re = (l0 * surface.vx[i0] + l1 * surface.vx[i1] + l2 * surface.vx[i2]) * R;
        const im = -(l0 * surface.vz[i0] + l1 * surface.vz[i1] + l2 * surface.vz[i2]) * R;
        next = { re, im, magnitude: magnitudeAt(system, re, im) };
      };
      for (let q = 0; q < quadCut.length; q++) {
        if (quadCut[q] > b.cut) continue;
        const o = q * 4;
        const i0 = quads[o], i1 = quads[o + 1], i2 = quads[o + 2], i3 = quads[o + 3];
        const minX = Math.min(s[2 * i0], s[2 * i1], s[2 * i2], s[2 * i3]);
        if (point.x < minX - 1 || point.x > Math.max(s[2 * i0], s[2 * i1], s[2 * i2], s[2 * i3]) + 1) continue;
        const minY = Math.min(s[2 * i0 + 1], s[2 * i1 + 1], s[2 * i2 + 1], s[2 * i3 + 1]);
        if (point.y < minY - 1 || point.y > Math.max(s[2 * i0 + 1], s[2 * i1 + 1], s[2 * i2 + 1], s[2 * i3 + 1]) + 1) continue;
        tryTriangle(i0, i1, i2);
        tryTriangle(i0, i2, i3);
      }
    }
    hoverRef.current = next;
    setHover(next);
    stage.current?.invalidate();
  }, [R, surface, system]);

  useEffect(() => { stage.current?.invalidate(); }, [hover]);

  const startTween = (ref: typeof alphaTween, current: number, to: number, duration: number, delay = 0) => {
    ref.current = { from: current, to, start: performance.now() + delay, duration: reducedMotion() ? 0 : duration * Math.abs(to - current) };
    stage.current?.invalidate();
  };

  const selectView = (next: ViewPreset) => {
    setView(next);
    if (next === "freq") {
      stage.current?.tweenTo(mode === "s" ? FREQ_S : FREQ_Z, 850);
      startTween(alphaTween, alpha.current, 1, 1600);
      setSliceTarget(1);
      if (mode === "z") { startTween(betaTween, beta.current, 1, 1100, 1300); setUnwrapTarget(1); }
    } else {
      stage.current?.tweenTo(next === "iso" ? ISO : CAMERA_PRESETS.top, 850);
      if (next === "iso") stage.current?.resetZoom();
      startTween(betaTween, beta.current, 0, 700);
      startTween(alphaTween, alpha.current, 0, 1200);
      setSliceTarget(0);
      setUnwrapTarget(0);
    }
  };

  const toggleSlice = () => {
    const to: 0 | 1 = sliceTarget === 0 ? 1 : 0;
    startTween(betaTween, beta.current, 0, 600);
    setUnwrapTarget(0);
    startTween(alphaTween, alpha.current, to, 2200);
    setSliceTarget(to);
  };

  // A domain switch keeps the chosen view: re-aim the frequency preset for the new plane.
  useEffect(() => {
    hoverRef.current = null;
    setHover(null);
    if (view === "freq") selectView("freq");
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const bounds = useMemo<Bounds3D>(
    () => ({ min: { x: -1.25, y: 0, z: -1.12 }, max: { x: 1.12, y: SURFACE_HEIGHT + 0.12, z: unwrapTarget ? UNWRAP_Z + 0.2 : 1.18 } }),
    [unwrapTarget],
  );

  const registerLabel = (id: string) => (el: HTMLElement | null) => { if (el) labelEls.current.set(id, el); else labelEls.current.delete(id); };
  const rampCss = `linear-gradient(to right, ${SURFACE_STOPS.join(", ")})`;
  const variable = mode === "s" ? "s" : "z";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl<PlaneMode> options={MODE_OPTIONS} value={mode} onChange={onModeChange} size="sm" aria-label="Transform domain" />
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl<ViewPreset | "custom"> options={VIEW_OPTIONS} value={view ?? "custom"} onChange={(v) => v !== "custom" && selectView(v)} size="sm" aria-label="Camera preset" />
          <StudioButton onClick={() => stage.current?.resetZoom()} className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px]" title="Reset zoom to 100%">
            <Maximize2 className="h-3 w-3" />1:1
          </StudioButton>
          <GradientButton size="sm" onClick={toggleSlice} className="inline-flex items-center gap-1.5 rounded-full">
            {sliceTarget === 0 ? <Scissors className="h-3.5 w-3.5" /> : <Undo2 className="h-3.5 w-3.5" />}
            {sliceTarget === 0 ? "Frequency Response Profile" : "Restore Full Surface"}
          </GradientButton>
        </div>
      </div>

      <Pseudo3DCanvas
        ref={stage}
        bounds={bounds}
        initialCamera={ISO}
        maxAspect={view === "top" ? 1 : 2.4}
        renderSurfaceMesh={renderSurfaceMesh}
        render={render}
        onHover={onHover}
        onCameraDetached={() => setView(null)}
        height={500}
        className="rounded-2xl border border-slate-200 shadow-inner dark:border-slate-800"
        canvasClassName={hover ? "cursor-crosshair" : undefined}
        ariaLabel={`Interactive 3D |H(${variable})| surface over the complex ${variable}-plane. Drag to orbit, scroll to zoom, hover the surface to probe it.`}
      >
        <div className="absolute left-3 top-2.5 max-w-[60%] overflow-hidden rounded-lg border border-slate-200/70 bg-white/80 px-2.5 py-1 text-xs text-slate-700 backdrop-blur-md dark:border-slate-700/60 dark:bg-slate-900/70 dark:text-slate-200">
          <KatexMath math={formatTransferLatex(system)} />
        </div>

        {labels.map((def) => (
          <div
            key={def.id}
            ref={registerLabel(def.id)}
            className={
              def.kind === "pole"
                ? "absolute left-0 top-0 whitespace-nowrap rounded-md border border-rose-300/70 bg-white/85 px-1.5 py-0.5 text-[10px] text-rose-700 shadow-sm backdrop-blur-sm dark:border-rose-400/40 dark:bg-slate-900/80 dark:text-rose-200"
                : def.kind === "zero"
                  ? "absolute left-0 top-0 whitespace-nowrap rounded-md border border-blue-300/70 bg-white/85 px-1.5 py-0.5 text-[10px] text-blue-700 shadow-sm backdrop-blur-sm dark:border-blue-400/40 dark:bg-slate-900/80 dark:text-blue-200"
                  : def.kind.startsWith("title") || def.kind === "unit"
                    ? "absolute left-0 top-0 whitespace-nowrap text-[11px] font-semibold text-slate-700 dark:text-slate-200"
                    : "absolute left-0 top-0 whitespace-nowrap text-[10px] text-slate-500 dark:text-slate-400"
            }
            style={{ visibility: "hidden", willChange: "transform" }}
          >
            {def.content}
          </div>
        ))}

        <div
          ref={tooltipEl}
          className="absolute left-0 top-0 min-w-[9.5rem] rounded-xl border border-white/40 bg-white/75 px-3 py-2 text-xs text-slate-700 shadow-lg backdrop-blur-md dark:border-slate-600/50 dark:bg-slate-900/70 dark:text-slate-200"
          style={{ visibility: "hidden", willChange: "transform" }}
        >
          {hover && (
            <div className="space-y-0.5">
              <KatexMath math={`${variable} = ${signedJ(hover.re, hover.im)}`} className="block" />
              <KatexMath math={`|H(${variable})| = ${magnitudeLatex(hover.magnitude)}`} className="block font-semibold" />
              {mode === "z" && <KatexMath math={`|z| = ${Math.hypot(hover.re, hover.im).toFixed(2)},\\; \\angle z = ${Math.atan2(hover.im, hover.re).toFixed(2)}`} className="block text-[10px] opacity-80" />}
            </div>
          )}
        </div>
      </Pseudo3DCanvas>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-200/70 bg-slate-50/70 px-3 py-2 text-[11px] text-slate-600 dark:border-slate-700/60 dark:bg-slate-900/50 dark:text-slate-300">
        <span className="inline-flex items-center gap-2">
          <KatexMath math="|H|\to 0" />
          <span className="h-1.5 w-24 rounded-full" style={{ background: rampCss }} />
          <KatexMath math="|H|\to\infty" />
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-0.5 w-5 rounded-full" style={{ background: SLICE_COLOR, boxShadow: `0 0 6px ${SLICE_COLOR}` }} />
          <KatexMath math={mode === "s" ? "|H(j\\omega)|" : "|H(e^{j\\omega})|"} />
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-2.5 w-3 rounded-sm border" style={{ background: `${ROC_COLOR}2E`, borderColor: ROC_EDGE }} />
          <KatexMath math={roc.latex} />
        </span>
      </div>
    </div>
  );
}

export default ComplexSurface3D;
