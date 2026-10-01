/**
 * |H| complex-surface model for the 3D Laplace / Z-transform studio (pure, framework-free).
 * s-mode: Cartesian mesh over σ + jω; z-mode: polar disc over r·e^{jθ}. Height = a low floor band (linear in
 * |H|, so the jω / unit-circle slice keeps its shape) + a Hill-function spire term that only rises in a tight
 * neighbourhood of each pole. Grid lines cluster at the poles' coordinates so the needle tips stay crisp.
 */
import { evaluateTransfer, type Complex, type TransferFunction } from "@shared/signals/transferFunction";
import { niceCeil } from "@shared/signals/plotAutoScale";
import { SURFACE_SPECTRUM } from "@/lib/spectralPalette";

/** World height of a pole spire's asymptotic tip (≈3× the plane's half-width in relief). */
export const SURFACE_HEIGHT = 2.7;
/** World height of the saturated floor band (the low-lying landscape between poles). */
export const FLOOR_HEIGHT = 0.35;
/** Hill exponent γ of the spire term: larger → narrower, sharper needles. */
export const SPIRE_GAMMA = 2.4;
/** Only the top 0.4 % of the plane's |H| (tight discs around poles) climbs past half spire height. */
const SPIRE_QUANTILE = 0.996;
const S_RESOLUTION = 96; // quads per side (Cartesian) — 97² vertices
const Z_RINGS = 72;
const Z_SECTORS = 144;
/** Every n-th grid line is stroked as wireframe; the rest of the mesh is smooth-filled. */
export const WIRE_EVERY = 4;
const SLICE_SAMPLES = 360;

export function magnitudeAt(system: TransferFunction, re: number, im: number): number {
  const value = evaluateTransfer(system, { re, im });
  const magnitude = Math.hypot(value.re, value.im);
  return Number.isNaN(magnitude) ? Infinity : magnitude;
}

/**
 * Identity below the knee (0.75·C), then a C¹-smooth rational (hyperbolic) saturation
 * h = k + d / (1 + d / (C − k)), d = |H| − k, which approaches C only asymptotically: pole chimneys keep
 * curving upward and taper to a point instead of flattening into a plateau. |H| = 0 maps to exactly 0.
 */
export function softClamp(magnitude: number, ceiling: number): number {
  if (!(magnitude >= 0)) return 0;
  const knee = 0.75 * ceiling;
  if (magnitude <= knee) return magnitude;
  if (!Number.isFinite(magnitude)) return ceiling;
  const room = ceiling - knee;
  const excess = magnitude - knee;
  return knee + excess / (1 + excess / room);
}

/** Hill saturation xᵞ / (1 + xᵞ): ≈0 on the floor, ½ at x = 1, → 1 only as |H| → ∞ (never a plateau). */
export function spireFraction(ratio: number, gamma = SPIRE_GAMMA): number {
  if (!(ratio > 0)) return 0;
  if (!Number.isFinite(ratio)) return 1;
  const p = Math.pow(ratio, gamma);
  return p / (1 + p);
}

/** Rendered height: floor band FLOOR·soft(|H|/M_f) + (H − FLOOR)·hill(|H|/H_s). |H| = 0 → exactly 0. */
export function spireHeight(magnitude: number, floorScale: number, spireScale: number): number {
  if (!(magnitude > 0)) return 0;
  const floor = softClamp(magnitude / floorScale, 1);
  return FLOOR_HEIGHT * floor + (SURFACE_HEIGHT - FLOOR_HEIGHT) * spireFraction(magnitude / spireScale);
}

/**
 * Non-uniform axis: n+1 nodes on [lo, hi] whose density rises (×boost, Gaussian width w) around `centers`,
 * each center snapped onto its nearest node so the |H| = ∞ tip is sampled exactly. `period` wraps distances.
 */
export function refinedAxis(n: number, lo: number, hi: number, centers: number[], width: number, boost: number, period?: number): Float64Array {
  const fine = 4096;
  const cdf = new Float64Array(fine + 1);
  const dist = (u: number, c: number) => {
    const d = Math.abs(u - c);
    return period ? Math.min(d, period - d) : d;
  };
  for (let i = 1; i <= fine; i++) {
    const u = lo + ((hi - lo) * (i - 0.5)) / fine;
    let density = 1;
    for (const c of centers) density += boost * Math.exp(-((dist(u, c) / width) ** 2));
    cdf[i] = cdf[i - 1] + density;
  }
  const nodes = new Float64Array(n + 1);
  let j = 0;
  for (let k = 0; k <= n; k++) {
    const target = (cdf[fine] * k) / n;
    while (j < fine && cdf[j + 1] < target) j++;
    const span = cdf[j + 1] - cdf[j] || 1;
    nodes[k] = lo + ((hi - lo) * (j + (target - cdf[j]) / span)) / fine;
  }
  nodes[0] = lo;
  nodes[n] = hi;
  for (const c of centers) {
    if (c <= lo || c >= hi) continue;
    let best = 1;
    for (let k = 1; k < n; k++) if (Math.abs(nodes[k] - c) < Math.abs(nodes[best] - c)) best = k;
    if (c > nodes[best - 1] && c < nodes[best + 1]) nodes[best] = c;
  }
  return nodes;
}

/** Scientific spectral elevation map (shared platform palette): indigo floor → blue → cyan → emerald → amber → orange → crimson. */
export const SURFACE_STOPS = SURFACE_SPECTRUM;

/**
 * Perceptually equalised colour parameter τ ∈ [0, 1]: τ = ln(1 + |H|/a) / ln(1 + cap/a), a = floorScale/6.
 * |H| falls off like 1/|s − p|, so a logarithmic map spreads the low-lying landscape across indigo → cyan →
 * emerald instead of crushing it into one blue band; |H| = 0 → 0 exactly, a pole (|H| = ∞) → 1.
 */
export function colorParameter(magnitude: number, floorScale: number, ceiling: number): number {
  if (!(magnitude > 0)) return 0;
  if (!Number.isFinite(magnitude)) return 1;
  const a = floorScale / 6;
  return Math.min(1, Math.log1p(magnitude / a) / Math.log1p(ceiling / a));
}

export interface SliceCurve {
  /** Complex points along the slice (s = jω or z = e^{jθ}). */
  points: Complex[];
  /** Frequency parameter per point (ω in rad/s, or θ in rad). */
  frequency: Float64Array;
  magnitude: Float64Array;
}

export interface ComplexSurface {
  mode: TransferFunction["mode"];
  /** Half-extent of the plotted plane: σ, ω ∈ [−R, R] (s) or |z| ≤ R (z). */
  extent: number;
  /** Largest |H| tick shown on the vertical axis (spire tip ≈ 96 % height). */
  ceiling: number;
  /** Floor-band scale M_f and spire half-height scale H_s (|H| units). */
  floorScale: number;
  spireScale: number;
  median: number;
  /** Vertex world coordinates (x = Re/R, z = −Im/R, y = height) and true magnitudes. */
  vx: Float32Array;
  vy: Float32Array;
  vz: Float32Array;
  magnitude: Float64Array;
  /** 4 vertex indices per quad (row-major, `quadCols` quads per row). */
  quads: Uint32Array;
  quadCols: number;
  /** Per quad: the cut coordinate (σ for s, r for z) at its centre, fill colour. */
  quadCut: Float32Array;
  /** Per-vertex colour parameter τ ∈ [0, 1] (continuous — the rasteriser interpolates it per pixel). */
  vt: Float32Array;
  /** Per-vertex Lambert shade ∈ [0, 1] from smooth vertex normals under a fixed world light. */
  vshade: Float32Array;
  slice: SliceCurve;
}

/** Plane extent: roots (with 40% margin) and a readable minimum; z always shows r ∈ [0, 2]. */
export function surfaceExtent(system: TransferFunction): number {
  const roots = [...system.poles, ...system.zeros];
  if (system.mode === "z") {
    const reach = Math.max(0, ...roots.map((r) => Math.hypot(r.re, r.im)));
    return Math.min(8, Math.max(2, niceCeil(1.15 * reach)));
  }
  const reach = Math.max(0, ...roots.map((r) => Math.max(Math.abs(r.re), Math.abs(r.im))));
  return Math.min(20, niceCeil(Math.max(2, 1.4 * reach)));
}

export function frequencySlice(system: TransferFunction, extent: number, samples = SLICE_SAMPLES): SliceCurve {
  const points: Complex[] = [];
  const frequency = new Float64Array(samples + 1);
  const magnitude = new Float64Array(samples + 1);
  for (let i = 0; i <= samples; i++) {
    const f = system.mode === "s" ? -extent + (2 * extent * i) / samples : -Math.PI + (2 * Math.PI * i) / samples;
    const point = system.mode === "s" ? { re: 0, im: f } : { re: Math.cos(f), im: Math.sin(f) };
    points.push(point);
    frequency[i] = f;
    magnitude[i] = magnitudeAt(system, point.re, point.im);
  }
  return { points, frequency, magnitude };
}

function median(values: number[]): number {
  if (!values.length) return 1;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export function buildComplexSurface(system: TransferFunction): ComplexSurface {
  const extent = surfaceExtent(system);
  const cartesian = system.mode === "s";
  const cols = cartesian ? S_RESOLUTION + 1 : Z_SECTORS + 1;
  const rows = cartesian ? S_RESOLUTION + 1 : Z_RINGS + 1;
  const count = rows * cols;
  const re = new Float64Array(count);
  const im = new Float64Array(count);
  const poles = system.poles.filter((p) => Number.isFinite(p.re) && Number.isFinite(p.im));
  const zeros = system.zeros.filter((z) => Number.isFinite(z.re) && Number.isFinite(z.im));
  let ringRadius = new Float64Array(0);
  if (cartesian) {
    // Tensor-product refinement: grid columns crowd at every pole/zero σ, rows at every ω.
    const width = 0.06 * extent;
    const xs = refinedAxis(S_RESOLUTION, -extent, extent, [...poles, ...zeros].map((p) => p.re), width, 5);
    const ys = refinedAxis(S_RESOLUTION, -extent, extent, [...poles, ...zeros].map((p) => p.im), width, 5);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { re[r * cols + c] = xs[c]; im[r * cols + c] = ys[r]; }
  } else {
    const roots = [...poles, ...zeros];
    ringRadius = refinedAxis(Z_RINGS, 0, extent, roots.map((p) => Math.hypot(p.re, p.im)), 0.06 * extent, 5);
    const angles = refinedAxis(Z_SECTORS, -Math.PI, Math.PI, roots.filter((p) => Math.hypot(p.re, p.im) > 1e-6).map((p) => Math.atan2(p.im, p.re)), 0.12, 4, 2 * Math.PI);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { re[r * cols + c] = ringRadius[r] * Math.cos(angles[c]); im[r * cols + c] = ringRadius[r] * Math.sin(angles[c]); }
  }
  const magnitude = new Float64Array(count);
  for (let i = 0; i < count; i++) magnitude[i] = magnitudeAt(system, re[i], im[i]);

  const slice = frequencySlice(system, extent);
  // Scales from a *uniform* sample of the plane (the refined grid over-samples poles and would bias them).
  const uniform: number[] = [];
  const U = 96;
  for (let i = 0; i <= U; i++) for (let k = 0; k <= U; k++) {
    const a = -extent + (2 * extent * i) / U; const b = -extent + (2 * extent * k) / U;
    if (!cartesian && Math.hypot(a, b) > extent) continue;
    const m = magnitudeAt(system, a, b);
    if (Number.isFinite(m) && m > 0) uniform.push(m);
  }
  uniform.sort((a, b) => a - b);
  const quantile = (q: number) => (uniform.length ? uniform[Math.min(uniform.length - 1, Math.floor(q * uniform.length))] : 1);
  const med = quantile(0.5);
  let slicePeak = 0;
  for (let i = 0; i < slice.magnitude.length; i++) if (Number.isFinite(slice.magnitude[i])) slicePeak = Math.max(slicePeak, slice.magnitude[i]);
  // Floor band: linear for the Fourier slice (its peak sits at 1/1.15 of the band), saturating at FLOOR_HEIGHT.
  const floorScale = Math.max(4 * med, 1.15 * Math.min(slicePeak, 12 * med), 1e-9);
  // Spire half-height scale: only the top (1 − SPIRE_QUANTILE) of the plane's area rises past half height.
  const spireScale = Math.max(quantile(SPIRE_QUANTILE), 1.5 * floorScale);
  const ceiling = 4 * spireScale;

  const vx = new Float32Array(count);
  const vy = new Float32Array(count);
  const vz = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    vx[i] = re[i] / extent;
    vz[i] = -im[i] / extent;
    vy[i] = spireHeight(magnitude[i], floorScale, spireScale);
  }
  const vt = new Float32Array(count);
  for (let i = 0; i < count; i++) vt[i] = colorParameter(magnitude[i], floorScale, ceiling);

  // Smooth vertex normals (central differences along grid rows/columns) → per-vertex Lambert shade.
  const vshade = new Float32Array(count);
  const light = [-0.45, 0.8, 0.4];
  const lightLen = Math.hypot(light[0], light[1], light[2]);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const cW = Math.max(0, c - 1), cE = Math.min(cols - 1, c + 1);
      const rS = Math.max(0, r - 1), rN = Math.min(rows - 1, r + 1);
      const iw = r * cols + cW, ie = r * cols + cE, is = rS * cols + c, inn = rN * cols + c;
      const ux = vx[ie] - vx[iw], uy = vy[ie] - vy[iw], uz = vz[ie] - vz[iw];
      const wx = vx[inn] - vx[is], wy = vy[inn] - vy[is], wz = vz[inn] - vz[is];
      let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
      const nLen = Math.hypot(nx, ny, nz);
      vshade[i] = nLen < 1e-12 ? 1 : Math.max(0, (nx * light[0] + ny * light[1] + nz * light[2]) / (nLen * lightLen));
    }
  }

  const quadCount = (rows - 1) * (cols - 1);
  const quads = new Uint32Array(quadCount * 4);
  const quadCut = new Float32Array(quadCount);
  let q = 0;
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c;
      const b = a + 1;
      const d = a + cols;
      const e = d + 1;
      quads.set([a, b, e, d], q * 4);
      quadCut[q] = cartesian ? (re[a] + re[b]) / 2 : (ringRadius[r] + ringRadius[r + 1]) / 2;
      q++;
    }
  }
  return { mode: system.mode, extent, ceiling, floorScale, spireScale, median: med, vx, vy, vz, magnitude, quads, quadCols: cols - 1, quadCut, vt, vshade, slice };
}

/** World height for a true magnitude on a given surface. */
export function heightFor(surface: ComplexSurface, magnitude: number): number {
  return spireHeight(magnitude, surface.floorScale, surface.spireScale);
}

/** |H| tick values at evenly spaced *heights* (the height map is nonlinear), rounded to 2 significant digits. */
export function heightTicks(surface: ComplexSurface, fractions: number[] = [0.08, 0.13, 0.35, 0.6, 0.85]): number[] {
  const ticks: number[] = [];
  for (const f of fractions) {
    const target = f * SURFACE_HEIGHT;
    let lo = 0;
    let hi = surface.ceiling * 64;
    for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (heightFor(surface, mid) < target) lo = mid; else hi = mid; }
    const value = Number(hi.toPrecision(2));
    if (value > 0 && !ticks.includes(value)) ticks.push(value);
  }
  return ticks;
}
