/**
 * MAE Academy / Signals & Systems — Tab D time–frequency–harmonic waterfall studio.
 * Canvas 2D on the shared Pseudo3DCanvas engine (no WebGL): harmonic ribbons y_k(t) sit on depth
 * lanes, a spectrum wall carries the line spectrum, and every label is a KaTeX DOM billboard placed
 * per frame. Synthesize/Decompose slides the harmonics onto the front plane where they sum to x_N(t).
 */
import { HARMONIC_SPECTRUM, spectrumCss } from "@/lib/spectralPalette";
import { Maximize2, Merge, Split } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { KatexMath } from "@/components/ui/KatexMath";
import { GradientButton, SegmentedControl, StudioButton, StudioSlider } from "@/components/common/templates";
import {
  cullLabels,
  easeInOutCubic,
  placeOverlay,
  Pseudo3DCanvas,
  type Vec3,
  type CameraPresetId,
  type LabelCandidate,
  type OverlayAnchor,
  type Pseudo3DFrame,
  type Pseudo3DHandle,
} from "@/components/common/3d";
import type { FourierSeriesResult } from "@/features/signals/engines/fourierEngine";
import { periodTicks, type PeriodTick, type TimeWindow, type WindowPreset } from "./fourierWindow";
import { niceTicks } from "@/lib/plotAutoScale";
import {
  buildWaterfallScene,
  harmonicProgress,
  laneDepth,
  mergeWeight,
  synthesisDuration,
  WATERFALL_MAX_HARMONICS,
  COLOR_RAMP_MAX,
  type SpectrumMode,
  type WaterfallHarmonic,
  type WaterfallScene,
} from "./fourierWaterfallModel";

/** Controlled by FourierAnalysisLab: N, T₀ (via `series`) and the observation window are shared state. */
type Props = {
  series: FourierSeriesResult;
  harmonics: number;
  onHarmonicsChange: (n: number) => void;
  harmonicLimits: { min: number; max: number };
  timeWindow: TimeWindow;
  windowPreset: WindowPreset;
  onWindowPresetChange: (preset: WindowPreset) => void;
};

const WINDOW_OPTIONS: ReadonlyArray<{ value: WindowPreset; label: string }> = [
  { value: "one", label: "1 Period" },
  { value: "two", label: "2 Periods" },
];

const RAIL_X = 1.12;
const HIT_RADIUS = 10;

const PALETTE = {
  dark: { grid: "rgba(148,163,184,0.13)", axis: "rgba(148,163,184,0.6)", plane: "rgba(148,163,184,0.22)", ghost: "rgba(96,165,250,0.8)", halo: "rgba(255,255,255,0.22)", glow: "rgba(255,255,255,0.85)", headFill: "#07101e" },
  light: { grid: "rgba(100,116,139,0.16)", axis: "rgba(71,85,105,0.6)", plane: "rgba(100,116,139,0.28)", ghost: "rgba(37,99,235,0.7)", halo: "rgba(15,23,42,0.1)", glow: "rgba(37,99,235,0.45)", headFill: "#f8fafc" },
} as const;

const SPECTRUM_OPTIONS: ReadonlyArray<{ value: SpectrumMode; label: ReactNode }> = [
  { value: "positive", label: <span className="inline-flex items-center gap-1">Positive <KatexMath math="[0,+\infty)" /></span> },
  { value: "bilateral", label: <span className="inline-flex items-center gap-1">Bilateral <KatexMath math="(-\infty,+\infty)" /></span> },
];

const CAMERA_OPTIONS: ReadonlyArray<{ value: CameraPresetId; label: string }> = [
  { value: "isometric", label: "3D Isometric" },
  { value: "front", label: "Time Domain (Front)" },
  { value: "side", label: "Frequency Domain (Side)" },
];

interface CurveGeometry {
  h: WaterfallHarmonic;
  order: number;
  laneZ: number;
  stride: number;
  count: number;
  xs: Float32Array;
  ys: Float32Array;
  screen: Float32Array;
  peakIndex: number;
  /** Per-frame state written by the renderer and read by hit-testing / overlays. */
  zNow: number;
  visibility: number;
  stemHead: Float32Array;
}

interface Geometry {
  scene: WaterfallScene;
  curves: CurveGeometry[];
  byK: Map<number, CurveGeometry>;
  zFront: number;
  zBack: number;
  laneZ: number[];
  compositeX: Float32Array;
  ghostY: Float32Array;
  accY: Float32Array;
  compositeScreen: Float32Array;
  timeTicks: PeriodTick[];
  /** Maps physical time (s) to world x ∈ [−1, 1] across the observation window. */
  tToX: (t: number) => number;
  ampTicks: number[];
  /** Hull for the auto-fit: every lane envelope, the stems, the axes and label room. */
  hull: Vec3[];
}

/** Largest divisor of `total` not exceeding `limit` (keeps every subsampled grid aligned with the composite grid). */
function alignedStride(total: number, limit: number): number {
  for (let d = Math.max(1, Math.floor(limit)); d > 1; d--) if (total % d === 0) return d;
  return 1;
}

function buildGeometry(scene: WaterfallScene): Geometry {
  const samples = scene.time.length;
  const intervals = samples - 1;
  const bound = scene.amplitudeBound;
  const { start, end } = scene.window;
  const span = end - start;
  const tToX = (t: number) => -1 + (2 * (t - start)) / span;
  const zFront = laneDepth(0, scene.laneCount);
  const zBack = laneDepth(scene.laneCount - 1, scene.laneCount);
  const curves = scene.harmonics.map((h, order): CurveGeometry => {
    // ≥ 32 vertices per cycle across the window; DC and low harmonics need far fewer.
    const cycles = Math.max(1, (Math.abs(h.k) * span) / scene.period);
    const stride = alignedStride(intervals, intervals / (32 * cycles));
    const count = Math.floor(intervals / stride) + 1;
    const xs = new Float32Array(count);
    const ys = new Float32Array(count);
    let peakIndex = 0;
    for (let i = 0; i < count; i++) {
      const src = i * stride;
      xs[i] = -1 + (2 * src) / intervals;
      ys[i] = h.values[src] / bound;
      if (ys[i] > ys[peakIndex]) peakIndex = i;
    }
    const laneZ = laneDepth(h.lane, scene.laneCount);
    return { h, order, laneZ, stride, count, xs, ys, screen: new Float32Array(2 * count), peakIndex, zNow: laneZ, visibility: 1, stemHead: new Float32Array(2) };
  });
  const compositeX = new Float32Array(samples);
  const ghostY = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    compositeX[i] = -1 + (2 * i) / intervals;
    ghostY[i] = scene.composite[i] / bound;
  }
  return {
    scene,
    curves,
    byK: new Map(curves.map((c) => [c.h.k, c])),
    zFront,
    zBack,
    laneZ: Array.from({ length: scene.laneCount }, (_, lane) => laneDepth(lane, scene.laneCount)),
    compositeX,
    ghostY,
    accY: new Float32Array(samples),
    compositeScreen: new Float32Array(2 * samples),
    timeTicks: periodTicks(scene.window, scene.period),
    tToX,
    ampTicks: niceTicks(-bound, bound, 4),
    hull: buildHull(curves, zFront, zBack, bound),
  };
}

function buildHull(curves: CurveGeometry[], zFront: number, zBack: number, bound: number): Vec3[] {
  const hull: Vec3[] = [];
  // Front synthesis plane (the composite may reach ±1) plus room for amplitude/time labels and titles.
  for (const y of [-1.18, 1.12]) for (const x of [-1.3, 1]) hull.push({ x, y, z: zFront });
  // Depth rail with label room past its ends.
  hull.push({ x: RAIL_X + 0.42, y: 0, z: zFront }, { x: RAIL_X + 0.42, y: 0, z: zBack }, { x: RAIL_X, y: 0, z: zBack - 0.18 });
  for (const c of curves) {
    let envelope = 0;
    for (let i = 0; i < c.count; i++) envelope = Math.max(envelope, Math.abs(c.ys[i]));
    const stem = Math.max(envelope, c.h.amplitude / bound);
    hull.push({ x: -1, y: envelope, z: c.laneZ }, { x: -1, y: -envelope, z: c.laneZ }, { x: RAIL_X, y: stem, z: c.laneZ }, { x: RAIL_X, y: -envelope, z: c.laneZ });
  }
  return hull;
}

function segmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function polylineDistance(screen: Float32Array, count: number, px: number, py: number): number {
  let best = Infinity;
  for (let i = 0; i + 1 < count; i++) {
    const d = segmentDistance(px, py, screen[2 * i], screen[2 * i + 1], screen[2 * i + 2], screen[2 * i + 3]);
    if (d < best) best = d;
  }
  return best;
}

function tickText(value: number): string {
  return Number(value.toPrecision(3)).toString();
}

type LabelKind = "rail" | "time" | "amp" | "title-t" | "title-a" | "title-k";
interface LabelDef {
  id: string;
  kind: LabelKind;
  world: [number, number, number];
  priority: number;
  k?: number;
  content: ReactNode;
}

export function FourierWaterfall3D({ series, harmonics, onHarmonicsChange, harmonicLimits, timeWindow, windowPreset, onWindowPresetChange }: Props) {
  const available = useMemo(
    () => Math.max(1, Math.min(WATERFALL_MAX_HARMONICS, Math.max(0, ...series.coefficients.map((c) => Math.abs(c.harmonic))))),
    [series],
  );
  const n = Math.max(1, Math.min(available, Math.round(harmonics)));
  const [mode, setMode] = useState<SpectrumMode>("positive");
  const [preset, setPreset] = useState<CameraPresetId | null>("isometric");
  const [synthTarget, setSynthTarget] = useState<0 | 1>(0);
  const [hovered, setHovered] = useState<number | null>(null);

  const scene = useMemo(
    () => buildWaterfallScene(series, n, mode, { window: timeWindow }),
    [series, n, mode, timeWindow.start, timeWindow.end], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const geometry = useMemo(() => buildGeometry(scene), [scene]);

  const stage = useRef<Pseudo3DHandle>(null);
  const labelEls = useRef(new Map<string, HTMLElement>());
  const tooltipEl = useRef<HTMLDivElement>(null);
  const hoveredRef = useRef<number | null>(null);
  const alpha = useRef(0);
  const anim = useRef<{ from: number; to: number; start: number; duration: number } | null>(null);

  const labels = useMemo<LabelDef[]>(() => {
    const g = geometry;
    const defs: LabelDef[] = [];
    const nTop = `x_{${n}}(t)`;
    defs.push({ id: "rail:composite", kind: "rail", world: [RAIL_X, 0, g.zFront], priority: 420, content: <KatexMath math={nTop} /> });
    for (const c of g.curves) {
      defs.push({
        id: `rail:${c.h.k}`,
        kind: "rail",
        k: c.h.k,
        world: [RAIL_X, 0, c.laneZ],
        priority: 300 - Math.abs(c.h.k) - (c.h.k < 0 ? 0.5 : 0),
        content: (
          <span className="flex items-stretch gap-1.5">
            <span className="w-[3px] rounded-full" style={{ background: c.h.color }} />
            <span className="flex flex-col leading-tight">
              <KatexMath math={`k = ${c.h.k}`} />
              <KatexMath math={`${c.h.omega.toFixed(1)}\\text{ rad/s}`} className="text-[9px] opacity-80" />
            </span>
          </span>
        ),
      });
    }
    for (const t of g.timeTicks) defs.push({ id: `time:${t.value}`, kind: "time", world: [g.tToX(t.value), -1, g.zFront], priority: 140 - Math.abs(t.value) * 1e-3, content: <KatexMath math={t.latex} /> });
    for (const a of g.ampTicks) defs.push({ id: `amp:${a}`, kind: "amp", world: [-1.03, a / scene.amplitudeBound, g.zFront], priority: 150 - Math.abs(a) * 1e-3, content: <KatexMath math={tickText(a)} /> });
    defs.push({ id: "title:t", kind: "title-t", world: [0, -1, g.zFront], priority: 500, content: <KatexMath math={`t\\text{ (s)},\\; T_0 = ${Number(scene.period.toPrecision(4))}\\text{ s}`} /> });
    defs.push({ id: "title:a", kind: "title-a", world: [-1, 1, g.zFront], priority: 500, content: <KatexMath math={mode === "positive" ? "A_k" : "\\operatorname{Re}\\{c_k e^{jk\\omega_0 t}\\}"} /> });
    defs.push({ id: "title:k", kind: "title-k", world: [RAIL_X, 0, g.zBack], priority: 500, content: <KatexMath math="k\omega_0\text{ (rad/s)}" /> });
    return defs;
  }, [geometry, mode, n, scene.amplitudeBound, scene.period]);

  const render = useCallback((frame: Pseudo3DFrame): boolean => {
    const { ctx, project, projectInto, dark, now, width, height } = frame;
    const g = geometry;
    const pal = dark ? PALETTE.dark : PALETTE.light;
    // Synthesis timeline α ∈ [0, 1].
    let running = false;
    const a = anim.current;
    if (a) {
      const p = a.duration <= 0 ? 1 : Math.min(1, Math.max(0, (now - a.start) / a.duration));
      alpha.current = a.from + (a.to - a.from) * easeInOutCubic(p);
      if (p >= 1) anim.current = null;
      else running = true;
    }
    const alphaNow = alpha.current;

    const tmp = new Float32Array(4);
    const line = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => {
      projectInto(x0, y0, z0, tmp, 0);
      projectInto(x1, y1, z1, tmp, 2);
      ctx.moveTo(tmp[0], tmp[1]);
      ctx.lineTo(tmp[2], tmp[3]);
    };

    // Floor lattice on y = 0 (time ticks × depth lanes).
    ctx.lineWidth = 1;
    ctx.strokeStyle = pal.grid;
    ctx.beginPath();
    for (const t of g.timeTicks) line(g.tToX(t.value), 0, g.zFront, g.tToX(t.value), 0, g.zBack);
    const laneStep = g.laneZ.length > 30 ? 2 : 1;
    for (let lane = 0; lane < g.laneZ.length; lane += laneStep) line(-1, 0, g.laneZ[lane], 1, 0, g.laneZ[lane]);
    ctx.stroke();

    // Front synthesis plane frame (right/top edges dashed).
    ctx.strokeStyle = pal.plane;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    line(1, -1, g.zFront, 1, 1, g.zFront);
    line(1, 1, g.zFront, -1, 1, g.zFront);
    ctx.stroke();
    ctx.setLineDash([]);

    // Hairline axes: t along the plane's bottom edge, amplitude at its left edge, y = 0 zero line,
    // and the kω₀ depth rail under the spectrum wall.
    const bound = g.scene.amplitudeBound;
    ctx.strokeStyle = pal.axis;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    line(-1, -1, g.zFront, 1, -1, g.zFront);
    line(-1, 0, g.zFront, 1, 0, g.zFront);
    line(-1, -1, g.zFront, -1, 1, g.zFront);
    line(RAIL_X, 0, g.zFront, RAIL_X, 0, g.zBack);
    for (const t of g.timeTicks) line(g.tToX(t.value), -1, g.zFront, g.tToX(t.value), -1.035, g.zFront);
    // t = 0 zero-crossing reference on the synthesis plane (when inside the window).
    const x0 = g.tToX(0);
    if (x0 > -1 + 1e-6 && x0 < 1 - 1e-6) line(x0, -1, g.zFront, x0, 1, g.zFront);
    for (const amp of g.ampTicks) line(-1.02, amp / bound, g.zFront, -1, amp / bound, g.zFront);
    ctx.stroke();

    // Per-harmonic synthesis state + back-to-front ordering.
    type Item = { depth: number; draw: () => void };
    const items: Item[] = [];
    let merged = 0;
    const accY = g.accY;
    accY.fill(0);
    for (const c of g.curves) {
      const progress = harmonicProgress(alphaNow, c.order, g.curves.length);
      const eased = easeInOutCubic(progress);
      const w = mergeWeight(progress);
      c.zNow = c.laneZ + (g.zFront - c.laneZ) * eased;
      c.visibility = 1 - w;
      if (w > 0) {
        merged += w;
        const values = c.h.values;
        const bound = g.scene.amplitudeBound;
        for (let i = 0; i < accY.length; i++) accY[i] += (w * values[i]) / bound;
      }
      const isHovered = hoveredRef.current === c.h.k;
      if (c.visibility > 0.01) {
        items.push({
          depth: project(0, 0, c.zNow).depth,
          draw: () => {
            const z = c.zNow;
            for (let i = 0; i < c.count; i++) projectInto(c.xs[i], c.ys[i], z, c.screen, 2 * i);
            projectInto(1, 0, z, tmp, 0);
            projectInto(-1, 0, z, tmp, 2);
            ctx.globalAlpha = c.visibility;
            // Translucent ribbon down to the y = 0 baseline.
            ctx.beginPath();
            ctx.moveTo(c.screen[0], c.screen[1]);
            for (let i = 1; i < c.count; i++) ctx.lineTo(c.screen[2 * i], c.screen[2 * i + 1]);
            ctx.lineTo(tmp[0], tmp[1]);
            ctx.lineTo(tmp[2], tmp[3]);
            ctx.closePath();
            ctx.fillStyle = c.h.color;
            ctx.globalAlpha = 0.12 * c.visibility;
            ctx.fill();
            ctx.globalAlpha = c.visibility;
            const path = () => {
              ctx.beginPath();
              ctx.moveTo(c.screen[0], c.screen[1]);
              for (let i = 1; i < c.count; i++) ctx.lineTo(c.screen[2 * i], c.screen[2 * i + 1]);
            };
            if (c.h.k < 0) ctx.setLineDash([6, 4]);
            if (isHovered) {
              path();
              ctx.strokeStyle = pal.halo;
              ctx.lineWidth = 7;
              ctx.lineJoin = "round";
              ctx.lineCap = "round";
              ctx.shadowColor = pal.glow;
              ctx.shadowBlur = 14;
              ctx.stroke();
              ctx.shadowBlur = 0;
            }
            path();
            ctx.strokeStyle = c.h.color;
            ctx.lineWidth = isHovered ? 3.5 : 2.2;
            ctx.lineJoin = "round";
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.globalAlpha = 1;
          },
        });
      }
      // Spectrum wall stem at the lane (static: it is the line spectrum, it does not travel).
      const stemTop = c.h.amplitude / g.scene.amplitudeBound;
      items.push({
        depth: project(RAIL_X, 0, c.laneZ).depth,
        draw: () => {
          projectInto(RAIL_X, 0, c.laneZ, tmp, 0);
          projectInto(RAIL_X, stemTop, c.laneZ, tmp, 2);
          c.stemHead[0] = tmp[2];
          c.stemHead[1] = tmp[3];
          ctx.strokeStyle = c.h.color;
          ctx.lineWidth = isHovered ? 2.4 : 1.4;
          ctx.beginPath();
          ctx.moveTo(tmp[0], tmp[1]);
          ctx.lineTo(tmp[2], tmp[3]);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(tmp[2], tmp[3], isHovered ? 4.6 : 3.4, 0, Math.PI * 2);
          ctx.fillStyle = c.h.color;
          ctx.fill();
          ctx.lineWidth = 1.2;
          ctx.strokeStyle = pal.headFill;
          ctx.stroke();
        },
      });
    }

    // Composite on the front plane: dashed x_N(t) reference + solid accumulated Σ w_k y_k(t).
    items.push({
      depth: project(0, 0, g.zFront).depth + 1e-6,
      draw: () => {
        const sc = g.compositeScreen;
        const count = g.compositeX.length;
        for (let i = 0; i < count; i++) projectInto(g.compositeX[i], g.ghostY[i], g.zFront, sc, 2 * i);
        ctx.beginPath();
        ctx.moveTo(sc[0], sc[1]);
        for (let i = 1; i < count; i++) ctx.lineTo(sc[2 * i], sc[2 * i + 1]);
        ctx.strokeStyle = pal.ghost;
        ctx.lineWidth = 1.6;
        ctx.setLineDash([5, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
        if (merged > 1e-4) {
          for (let i = 0; i < count; i++) projectInto(g.compositeX[i], accY[i], g.zFront, sc, 2 * i);
          projectInto(-1, 0, g.zFront, tmp, 0);
          projectInto(1, 0, g.zFront, tmp, 2);
          const span = Math.hypot(tmp[2] - tmp[0], tmp[3] - tmp[1]);
          if (span > 4) {
            const gradient = ctx.createLinearGradient(tmp[0], tmp[1], tmp[2], tmp[3]);
            HARMONIC_SPECTRUM.forEach((stop, index) => gradient.addColorStop(index / (HARMONIC_SPECTRUM.length - 1), stop));
            ctx.strokeStyle = gradient;
          } else {
            ctx.strokeStyle = "#2563EB";
          }
          ctx.lineWidth = 3;
          ctx.lineJoin = "round";
          ctx.beginPath();
          ctx.moveTo(sc[0], sc[1]);
          for (let i = 1; i < count; i++) ctx.lineTo(sc[2 * i], sc[2 * i + 1]);
          ctx.stroke();
        }
      },
    });

    items.sort((p, q) => p.depth - q.depth);
    for (const item of items) item.draw();

    // ── DOM/KaTeX overlay pass ──
    const railFront = project(RAIL_X, 0, g.zFront);
    const railBack = project(RAIL_X, 0, g.zBack);
    const rdx = railBack.x - railFront.x;
    const rdy = railBack.y - railFront.y;
    const railLen = Math.hypot(rdx, rdy);
    const railAnchor: OverlayAnchor = Math.abs(rdx) > Math.abs(rdy) * 1.2 ? "below" : "right";
    // Labels of an axis seen edge-on would all pile onto one point: hide them instead.
    const span = (a: [number, number, number], b: [number, number, number]) => {
      const p0 = project(a[0], a[1], a[2]);
      const p1 = project(b[0], b[1], b[2]);
      return Math.hypot(p1.x - p0.x, p1.y - p0.y);
    };
    const timeCollapsed = span([-1, -1, g.zFront], [1, -1, g.zFront]) < 80;
    const ampCollapsed = span([-1, -1, g.zFront], [-1, 1, g.zFront]) < 60;
    const railCollapsed = railLen < 50;
    const candidates: LabelCandidate[] = [];
    for (const def of labels) {
      const el = labelEls.current.get(def.id);
      if (!el) continue;
      const hidden =
        ((def.kind === "time" || def.kind === "title-t") && timeCollapsed) ||
        ((def.kind === "amp" || def.kind === "title-a") && ampCollapsed) ||
        (railCollapsed && (def.kind === "title-k" || (def.kind === "rail" && def.k !== undefined && def.k !== hoveredRef.current)));
      if (hidden) {
        placeOverlay(el, { x: 0, y: 0 }, "center", false);
        continue;
      }
      const base = project(def.world[0], def.world[1], def.world[2]);
      let anchor: OverlayAnchor = "center";
      let x = base.x;
      let y = base.y;
      switch (def.kind) {
        case "rail":
          anchor = railAnchor;
          if (railAnchor === "right") x += 8; else y += 8;
          break;
        case "time": anchor = "below"; y += 5; break;
        case "amp": anchor = "left"; x -= 5; break;
        case "title-t": anchor = "below"; y += 24; break;
        case "title-a": anchor = "above"; y -= 6; break;
        case "title-k":
          anchor = "center";
          if (railLen > 1) { x += (rdx / railLen) * 26; y += (rdy / railLen) * 26; } else { y += 42; }
          break;
      }
      const priority = def.k !== undefined && def.k === hoveredRef.current ? 1000 : def.priority;
      candidates.push({ id: def.id, point: { ...base, x, y }, width: el.offsetWidth, height: el.offsetHeight, anchor, priority });
    }
    const shown = cullLabels(candidates, width, height);
    for (const c of candidates) placeOverlay(labelEls.current.get(c.id) ?? null, c.point, c.anchor, shown.has(c.id));

    // Hover tooltip anchored above the hovered harmonic's peak.
    const tip = tooltipEl.current;
    const hk = hoveredRef.current;
    const hc = hk === null ? undefined : g.byK.get(hk);
    if (tip && hc && hc.visibility > 0.3) {
      const peak = project(hc.xs[hc.peakIndex], hc.ys[hc.peakIndex], hc.zNow);
      const w = tip.offsetWidth;
      const h = tip.offsetHeight;
      const flip = peak.y - 14 - h < 4;
      const x = Math.max(w / 2 + 6, Math.min(width - w / 2 - 6, peak.x));
      placeOverlay(tip, { x, y: flip ? peak.y + 14 : peak.y - 14 }, flip ? "below" : "above");
    } else {
      placeOverlay(tip, { x: 0, y: 0 }, "above", false);
    }

    return running;
  }, [geometry, labels]);

  const onHover = useCallback((point: { x: number; y: number } | null) => {
    let next: number | null = null;
    if (point) {
      let best = HIT_RADIUS;
      for (const c of geometry.curves) {
        const head = Math.hypot(point.x - c.stemHead[0], point.y - c.stemHead[1]);
        if (head < best) { best = head; next = c.h.k; }
        if (c.visibility < 0.3) continue;
        const d = polylineDistance(c.screen, c.count, point.x, point.y);
        if (d < best) { best = d; next = c.h.k; }
      }
    }
    if (next !== hoveredRef.current) {
      hoveredRef.current = next;
      setHovered(next);
      stage.current?.invalidate();
    }
  }, [geometry]);

  // The tooltip is measured for placement: repaint once React has committed its new content.
  useEffect(() => {
    stage.current?.invalidate();
  }, [hovered]);

  // Scene rebuilds drop a hover that no longer exists.
  useEffect(() => {
    if (hoveredRef.current !== null && !geometry.byK.has(hoveredRef.current)) {
      hoveredRef.current = null;
      setHovered(null);
    }
  }, [geometry]);

  const selectPreset = (id: CameraPresetId) => {
    setPreset(id);
    if (id === "isometric") stage.current?.resetZoom();
    stage.current?.tweenTo(id);
  };

  const toggleSynthesis = () => {
    const to: 0 | 1 = synthTarget === 0 ? 1 : 0;
    const from = alpha.current;
    const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    anim.current = { from, to, start: performance.now(), duration: reduced ? 0 : synthesisDuration(geometry.curves.length) * Math.abs(to - from) };
    setSynthTarget(to);
    stage.current?.invalidate();
  };

  const registerLabel = (id: string) => (el: HTMLElement | null) => {
    if (el) labelEls.current.set(id, el);
    else labelEls.current.delete(id);
  };

  const hoveredHarmonic = hovered === null ? undefined : geometry.byK.get(hovered)?.h;
  const compositeFormula =
    mode === "positive"
      ? `x_N(t)=\\sum_{k=0}^{N} A_k\\cos(k\\omega_0 t+\\phi_k),\\;A_k=2|c_k|\\;(k\\ge 1)`
      : `x_N(t)=\\sum_{k=-N}^{N} c_k\\,e^{jk\\omega_0 t}`;
  const spectralKey = spectrumCss(HARMONIC_SPECTRUM);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl<SpectrumMode> options={SPECTRUM_OPTIONS} value={mode} onChange={setMode} size="sm" aria-label="Spectrum range" />
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl<CameraPresetId | "custom">
            options={CAMERA_OPTIONS}
            value={preset ?? "custom"}
            onChange={(value) => value !== "custom" && selectPreset(value)}
            size="sm"
            aria-label="Camera preset"
          />
          <StudioButton onClick={() => stage.current?.resetZoom()} className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px]" title="Reset zoom to 100%">
            <Maximize2 className="h-3 w-3" />1:1
          </StudioButton>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <StudioSlider
          className="min-w-[14rem] flex-1"
          label="Harmonic density"
          variant="spectral"
          min={harmonicLimits.min}
          max={Math.min(harmonicLimits.max, available)}
          step={1}
          value={n}
          onChange={(value) => onHarmonicsChange(Math.round(value))}
          valueDisplay={<span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-800"><KatexMath math={`N = ${n}`} /></span>}
        />
        <SegmentedControl<WindowPreset> options={WINDOW_OPTIONS} value={windowPreset} onChange={onWindowPresetChange} size="sm" aria-label="Observation window" />
        <GradientButton size="sm" onClick={toggleSynthesis} className="inline-flex items-center gap-1.5 rounded-full">
          {synthTarget === 0 ? <Merge className="h-3.5 w-3.5" /> : <Split className="h-3.5 w-3.5" />}
          {synthTarget === 0 ? "Animate: Synthesize" : "Animate: Decompose"}
        </GradientButton>
      </div>

      <Pseudo3DCanvas
        ref={stage}
        bounds={geometry.hull}
        render={render}
        onHover={onHover}
        onCameraDetached={() => setPreset(null)}
        height={480}
        className="rounded-2xl border border-slate-200 shadow-inner dark:border-slate-800"
        canvasClassName={hovered !== null ? "cursor-crosshair" : undefined}
        ariaLabel="Interactive 3D time–frequency harmonic waterfall. Drag to orbit, scroll to zoom, hover a harmonic to inspect it."
      >
        <div className="absolute left-3 top-2.5 rounded-lg border border-slate-200/70 bg-white/80 px-2.5 py-1 text-xs text-slate-700 backdrop-blur-md dark:border-slate-700/60 dark:bg-slate-900/70 dark:text-slate-200">
          <KatexMath math={compositeFormula} />
        </div>
        <div className="absolute bottom-2.5 left-3 flex items-center gap-2 rounded-lg border border-slate-200/70 bg-white/80 px-2.5 py-1 text-[10px] text-slate-600 backdrop-blur-md dark:border-slate-700/60 dark:bg-slate-900/70 dark:text-slate-300">
          <KatexMath math="k=1" />
          <span className="h-1.5 w-24 rounded-full" style={{ background: spectralKey }} />
          <KatexMath math={`k\\ge ${COLOR_RAMP_MAX}`} />
          <span className="ml-1 inline-block h-0 w-5 border-t-2 border-dashed border-blue-500" />
          <KatexMath math="x_N(t)" />
        </div>

        {labels.map((def) => (
          <div
            key={def.id}
            ref={registerLabel(def.id)}
            className={
              def.kind === "rail"
                ? "absolute left-0 top-0 whitespace-nowrap rounded-md border border-slate-200/70 bg-white/85 px-1.5 py-0.5 text-[10px] text-slate-700 shadow-sm backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-900/80 dark:text-slate-200"
                : def.kind.startsWith("title")
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
          {hoveredHarmonic && (
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5 font-semibold">
                <span className="h-2 w-2 rounded-full" style={{ background: hoveredHarmonic.color }} />
                <KatexMath math={`\\text{Harmonic } k = ${hoveredHarmonic.k}`} />
              </div>
              <KatexMath math={`\\omega_k = ${hoveredHarmonic.omega.toFixed(2)}\\text{ rad/s}`} className="block" />
              <KatexMath math={`A_k = ${hoveredHarmonic.amplitude.toFixed(3)}`} className="block" />
              <KatexMath math={`\\phi_k = ${hoveredHarmonic.phase.toFixed(2)}\\text{ rad}`} className="block" />
            </div>
          )}
        </div>
      </Pseudo3DCanvas>
    </div>
  );
}

export default FourierWaterfall3D;
