/**
 * Pseudo-3D (2.5D) projection engine — pure math, zero WebGL.
 * World (x, y, z) → Euler yaw θ (about y) then pitch φ (about x') → orthographic screen space.
 * Shared by every Canvas 2D "3D" scope (Fourier waterfall, Laplace |H(s)| surface, …).
 */

export interface CameraAngles {
  /** Yaw θ (rad), rotation about the vertical world axis. */
  theta: number;
  /** Pitch φ (rad), elevation above the floor plane; clamped to ±π/2. */
  phi: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Bounds3D {
  min: Vec3;
  max: Vec3;
}

/** Screen mapping: X = centerX + scaleX·x', Y = centerY − scaleY·y'. */
export interface Viewport {
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  scaleX: number;
  scaleY: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
  /** z'' — painter's-algorithm key: larger is nearer the viewer. */
  depth: number;
  /** Inside the canvas rectangle (orthographic: nothing is ever behind the camera). */
  visible: boolean;
}

export type ProjectionFn = (x: number, y: number, z: number) => ScreenPoint;

const DEG = Math.PI / 180;

export const CAMERA_PRESETS = {
  isometric: { theta: 40 * DEG, phi: 25 * DEG },
  front: { theta: 0, phi: 0 },
  side: { theta: 90 * DEG, phi: 0 },
  top: { theta: 0, phi: 90 * DEG },
} as const satisfies Record<string, CameraAngles>;

export type CameraPresetId = keyof typeof CAMERA_PRESETS;

export const PITCH_LIMIT = Math.PI / 2;

export function clampPitch(phi: number): number {
  return Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, phi));
}

/** Precomputed camera trigonometry; build once per frame, reuse for every vertex. */
export interface Rotation {
  cosT: number;
  sinT: number;
  cosP: number;
  sinP: number;
}

export function createRotation(camera: CameraAngles): Rotation {
  return { cosT: Math.cos(camera.theta), sinT: Math.sin(camera.theta), cosP: Math.cos(camera.phi), sinP: Math.sin(camera.phi) };
}

/**
 * x' = x cosθ − z sinθ,  z' = x sinθ + z cosθ,  y' = y cosφ − z' sinφ,  z'' = y sinφ + z' cosφ.
 * Writes (x', y', z'') into out[offset..offset+2] — allocation-free for hot loops.
 */
export function rotateInto(x: number, y: number, z: number, r: Rotation, out: Float32Array | number[], offset = 0): void {
  const xr = x * r.cosT - z * r.sinT;
  const zr = x * r.sinT + z * r.cosT;
  out[offset] = xr;
  out[offset + 1] = y * r.cosP - zr * r.sinP;
  out[offset + 2] = y * r.sinP + zr * r.cosP;
}

export interface Projector {
  camera: CameraAngles;
  viewport: Viewport;
  rotation: Rotation;
  project: ProjectionFn;
  /** Writes screen (X, Y) into out[offset], out[offset+1]; returns depth z''. Allocation-free. */
  projectInto: (x: number, y: number, z: number, out: Float32Array, offset: number) => number;
}

export function createProjector(camera: CameraAngles, viewport: Viewport, visibilityMargin = 0): Projector {
  const r = createRotation(camera);
  const { centerX, centerY, scaleX, scaleY, width, height } = viewport;
  const projectInto = (x: number, y: number, z: number, out: Float32Array, offset: number): number => {
    const xr = x * r.cosT - z * r.sinT;
    const zr = x * r.sinT + z * r.cosT;
    out[offset] = centerX + scaleX * xr;
    out[offset + 1] = centerY - scaleY * (y * r.cosP - zr * r.sinP);
    return y * r.sinP + zr * r.cosP;
  };
  const project: ProjectionFn = (x, y, z) => {
    const xr = x * r.cosT - z * r.sinT;
    const zr = x * r.sinT + z * r.cosT;
    const sx = centerX + scaleX * xr;
    const sy = centerY - scaleY * (y * r.cosP - zr * r.sinP);
    const visible = sx >= -visibilityMargin && sx <= width + visibilityMargin && sy >= -visibilityMargin && sy <= height + visibilityMargin;
    return { x: sx, y: sy, depth: y * r.sinP + zr * r.cosP, visible };
  };
  return { camera, viewport, rotation: r, project, projectInto };
}

export interface FitOptions {
  /** Fraction of each dimension kept empty on each side (0.09 → content fills 82%, i.e. ~18% headroom). */
  padding?: number;
  /** Upper bound on scaleX/scaleY (or its inverse) so collapsed views do not stretch into slivers. */
  maxAspect?: number;
}

/** A world bounding box, or a hull point cloud for a tighter fit around sparse content. */
export type FitTarget = Bounds3D | ReadonlyArray<Vec3>;

function isBounds(target: FitTarget): target is Bounds3D {
  return !Array.isArray(target);
}

/**
 * Auto-scale: projects the fit target (8 box corners or every hull point) at the current camera and
 * fits independent X/Y scales so the whole scene lands inside the padded canvas (zero clipping).
 */
export function fitViewport(target: FitTarget, camera: CameraAngles, width: number, height: number, options: FitOptions = {}): Viewport {
  const padding = options.padding ?? 0.09;
  const maxAspect = options.maxAspect ?? 3;
  const r = createRotation(camera);
  const tmp = [0, 0, 0];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const include = (x: number, y: number, z: number) => {
    rotateInto(x, y, z, r, tmp);
    minX = Math.min(minX, tmp[0]);
    maxX = Math.max(maxX, tmp[0]);
    minY = Math.min(minY, tmp[1]);
    maxY = Math.max(maxY, tmp[1]);
  };
  if (isBounds(target)) {
    for (let i = 0; i < 8; i++) include(i & 1 ? target.max.x : target.min.x, i & 2 ? target.max.y : target.min.y, i & 4 ? target.max.z : target.min.z);
  } else {
    for (const p of target) include(p.x, p.y, p.z);
  }
  if (!Number.isFinite(minX)) include(0, 0, 0);
  const reference = Math.max(maxX - minX, maxY - minY, 1e-9);
  // A projected span that collapses (e.g. amplitude in the top-down view) borrows the other axis' span.
  const spanX = maxX - minX > reference * 1e-3 ? maxX - minX : reference;
  const spanY = maxY - minY > reference * 1e-3 ? maxY - minY : reference;
  const usableW = Math.max(1, width * (1 - 2 * padding));
  const usableH = Math.max(1, height * (1 - 2 * padding));
  let scaleX = usableW / spanX;
  let scaleY = usableH / spanY;
  if (scaleX > scaleY * maxAspect) scaleX = scaleY * maxAspect;
  if (scaleY > scaleX * maxAspect) scaleY = scaleX * maxAspect;
  return {
    width,
    height,
    scaleX,
    scaleY,
    centerX: width / 2 - scaleX * ((minX + maxX) / 2),
    centerY: height / 2 + scaleY * ((minY + maxY) / 2),
  };
}

/** Scales a fitted viewport about the canvas centre (user wheel zoom). */
export function zoomViewport(viewport: Viewport, zoom: number): Viewport {
  const cx = viewport.width / 2;
  const cy = viewport.height / 2;
  return {
    ...viewport,
    scaleX: viewport.scaleX * zoom,
    scaleY: viewport.scaleY * zoom,
    centerX: cx + (viewport.centerX - cx) * zoom,
    centerY: cy + (viewport.centerY - cy) * zoom,
  };
}

/** Exponential approach of `current` toward `target`; returns the next viewport and whether it has settled. */
export function dampViewport(current: Viewport, target: Viewport, factor: number): { viewport: Viewport; settled: boolean } {
  const mix = (a: number, b: number) => a + (b - a) * factor;
  const next: Viewport = {
    width: target.width,
    height: target.height,
    centerX: mix(current.centerX, target.centerX),
    centerY: mix(current.centerY, target.centerY),
    scaleX: mix(current.scaleX, target.scaleX),
    scaleY: mix(current.scaleY, target.scaleY),
  };
  const settled =
    Math.abs(next.centerX - target.centerX) < 0.25 &&
    Math.abs(next.centerY - target.centerY) < 0.25 &&
    Math.abs(next.scaleX - target.scaleX) < target.scaleX * 1e-3 &&
    Math.abs(next.scaleY - target.scaleY) < target.scaleY * 1e-3;
  return { viewport: settled ? target : next, settled };
}

export function easeInOutCubic(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

/** Signed shortest angular difference to − from, in (−π, π]. */
export function shortestAngleDelta(from: number, to: number): number {
  const twoPi = 2 * Math.PI;
  let delta = (to - from) % twoPi;
  if (delta > Math.PI) delta -= twoPi;
  if (delta <= -Math.PI) delta += twoPi;
  return delta;
}

export function interpolateCamera(from: CameraAngles, to: CameraAngles, t: number): CameraAngles {
  const e = easeInOutCubic(t);
  return { theta: from.theta + shortestAngleDelta(from.theta, to.theta) * e, phi: from.phi + (to.phi - from.phi) * e };
}

export function resolveCamera(camera: CameraAngles | CameraPresetId): CameraAngles {
  return typeof camera === "string" ? { ...CAMERA_PRESETS[camera] } : { ...camera };
}

export function boundsFromPoints(points: ReadonlyArray<Vec3>): Bounds3D {
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const p of points) {
    min.x = Math.min(min.x, p.x); min.y = Math.min(min.y, p.y); min.z = Math.min(min.z, p.z);
    max.x = Math.max(max.x, p.x); max.y = Math.max(max.y, p.y); max.z = Math.max(max.z, p.z);
  }
  if (!Number.isFinite(min.x)) return { min: { x: -1, y: -1, z: -1 }, max: { x: 1, y: 1, z: 1 } };
  return { min, max };
}
