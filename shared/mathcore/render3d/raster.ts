/**
 * Software 3D on the CPU (STEPS.md §7.3 "3D", ADR-4: no WebGL/WebGPU/Three.js). Runs in a Worker and returns RGBA
 * pixels for the page to put on its canvas.
 *
 * - Orbit camera with perspective projection.
 * - Triangles filled by scanline rasterization with a Float32Array z-buffer (perspective-correct depth: 1/z is
 *   interpolated linearly in screen space).
 * - Lambert lighting from a light fixed to the camera, plus an ambient term; back faces are lit with the flipped
 *   normal so a single-sided surface reads correctly from below.
 * - Triangles and lines are clipped to a near plane in camera space (NEAR_RELATIVE × camera distance).
 * - Lines (axes, vectors, edges) are depth-tested against opaque surfaces; behind a translucent surface they are
 *   mixed with what is drawn there (LINE_BEHIND_MIX), as if the surface were blended over them.
 * Budget (§7.2): 80×80 grid (≈12,800 triangles) ≤ 25 ms per frame.
 */
import { AMBIENT_LIGHT, CAMERA_FOV, LINE_BEHIND_MIX, LINE_DEPTH_BIAS, MAX_LINE_STEPS, NEAR_RELATIVE } from "../constants";

export type Vec3 = [number, number, number];
export type RGB = [number, number, number];

export interface Camera {
  /** Rotation about the vertical (z) axis, radians. */
  azimuth: number;
  /** Angle above the xy-plane, radians. */
  elevation: number;
  /** Distance from the target. */
  distance: number;
  target: Vec3;
  /** Vertical field of view, radians. */
  fov: number;
}

export interface Mesh {
  /** x, y, z per vertex. */
  positions: Float32Array;
  /** Three vertex indices per triangle. */
  indices: Uint32Array;
  color: RGB;
  /** 0–1; below 1 the mesh is blended over what is behind it (no depth write), drawn after opaque meshes. */
  opacity?: number;
}

export interface Line3 {
  from: Vec3;
  to: Vec3;
  color: RGB;
}

export interface Frame {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
  /** Triangles that survived clipping and were rasterized (for the budget benchmark). */
  triangles: number;
}

/** Ambient light share; the rest is Lambert (diffuse) from the camera direction. */
const AMBIENT = AMBIENT_LIGHT;

export const DEFAULT_CAMERA: Camera = { azimuth: 1.1, elevation: 0.45, distance: 22.5, target: [0, 0, 0], fov: CAMERA_FOV };

/** World → camera basis (right, up, forward) and eye position. */
function basis(cam: Camera) {
  const ce = Math.cos(cam.elevation);
  const eye: Vec3 = [
    cam.target[0] + cam.distance * ce * Math.cos(cam.azimuth),
    cam.target[1] + cam.distance * ce * Math.sin(cam.azimuth),
    cam.target[2] + cam.distance * Math.sin(cam.elevation),
  ];
  const fwd = norm([cam.target[0] - eye[0], cam.target[1] - eye[1], cam.target[2] - eye[2]]);
  const right = norm(cross(fwd, [0, 0, 1]));
  const up = cross(right, fwd);
  return { eye, fwd, right, up };
}

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function norm(v: Vec3): Vec3 {
  const n = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / n, v[1] / n, v[2] / n];
}

/** Projects a world point to screen pixels; returns [sx, sy, depth] or null behind the near plane. */
export function projector(cam: Camera, width: number, height: number) {
  const { eye, fwd, right, up } = basis(cam);
  const f = height / 2 / Math.tan(cam.fov / 2);
  return (p: Vec3): [number, number, number] | null => {
    const d: Vec3 = [p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]];
    const z = dot(d, fwd);
    if (z < NEAR_RELATIVE * cam.distance) return null;
    return [width / 2 + (f * dot(d, right)) / z, height / 2 - (f * dot(d, up)) / z, z];
  };
}

type P3 = [number, number, number];

export function render(meshes: Mesh[], lines: Line3[], cam: Camera, width: number, height: number, background: RGB): Frame {
  const W = Math.max(1, Math.floor(width) || 1);
  const H = Math.max(1, Math.floor(height) || 1);
  const rgba = new Uint8ClampedArray(W * H * 4);
  // Inverse depth 1/z per pixel (0 = nothing yet; larger = nearer), so the inner loop needs no division.
  const izOpaque = new Float32Array(W * H);
  const izTranslucent = new Float32Array(W * H);
  // Background in one 32-bit fill (bytes R, G, B, A in memory order, whatever the platform's endianness).
  const px = new Uint8ClampedArray([background[0], background[1], background[2], 255]);
  new Uint32Array(rgba.buffer).fill(new Uint32Array(px.buffer)[0]);
  const { eye, fwd, right, up } = basis(cam);
  const f = H / 2 / Math.tan(cam.fov / 2);
  // Near plane relative to the camera distance, so a camera inside the scene still sees what is in front of it.
  const near = Math.max(NEAR_RELATIVE * cam.distance, Number.MIN_VALUE);
  const toCamera = (p: Vec3): P3 => {
    const d: Vec3 = [p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]];
    return [dot(d, right), dot(d, up), dot(d, fwd)];
  };
  const toScreen = (q: P3): P3 => [W / 2 + (f * q[0]) / q[2], H / 2 - (f * q[1]) / q[2], 1 / q[2]];
  let triangles = 0;

  /** Camera-space polygon clipped to z ≥ near (Sutherland–Hodgman), then projected and fanned into triangles. */
  const rasterize = (poly: P3[], col: RGB, opacity: number) => {
    const clipped: P3[] = [];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const pin = p[2] >= near;
      const qin = q[2] >= near;
      if (pin) clipped.push(p);
      if (pin !== qin) {
        const t = (near - p[2]) / (q[2] - p[2]);
        clipped.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, near]);
      }
    }
    if (clipped.length < 3) return false;
    const sp = clipped.map(toScreen);
    let drawn = false;
    for (let i = 1; i + 1 < sp.length; i++) {
      drawn = fillTriangle(rgba, izOpaque, izTranslucent, W, H, sp[0], sp[i], sp[i + 1], col, opacity) || drawn;
    }
    return drawn;
  };

  const faces = (mesh: Mesh) => {
    const P = mesh.positions;
    const cam3: P3[] = [];
    for (let v = 0; v < P.length; v += 3) cam3.push(toCamera([P[v], P[v + 1], P[v + 2]]));
    for (let t = 0; t < mesh.indices.length; t += 3) {
      const ia = mesh.indices[t];
      const ib = mesh.indices[t + 1];
      const ic = mesh.indices[t + 2];
      // Face normal in world space for Lambert shading.
      const A: Vec3 = [P[3 * ia], P[3 * ia + 1], P[3 * ia + 2]];
      const B: Vec3 = [P[3 * ib], P[3 * ib + 1], P[3 * ib + 2]];
      const C: Vec3 = [P[3 * ic], P[3 * ic + 1], P[3 * ic + 2]];
      const n = norm(cross([B[0] - A[0], B[1] - A[1], B[2] - A[2]], [C[0] - A[0], C[1] - A[1], C[2] - A[2]]));
      const shade = AMBIENT + (1 - AMBIENT) * Math.abs(dot(n, fwd));
      const col: RGB = [mesh.color[0] * shade, mesh.color[1] * shade, mesh.color[2] * shade];
      if (rasterize([cam3[ia], cam3[ib], cam3[ic]], col, mesh.opacity ?? 1)) triangles++;
    }
  };
  // Opaque surfaces first (z-buffer), then translucent ones blended in order; they record their nearest depth.
  for (const mesh of meshes) if ((mesh.opacity ?? 1) >= 1) faces(mesh);
  for (const mesh of meshes) if ((mesh.opacity ?? 1) < 1) faces(mesh);
  // Lines last: hidden behind opaque surfaces, tinted where a translucent surface is in front of them.
  for (const l of lines) {
    const sg = clipSegment(toCamera(l.from), toCamera(l.to), near);
    if (sg) drawLine(rgba, izOpaque, izTranslucent, W, H, toScreen(sg[0]), toScreen(sg[1]), l.color);
  }
  return { width: W, height: H, rgba, triangles };
}

/** Part of the camera-space segment with z ≥ near, or null. */
function clipSegment(a: P3, b: P3, near: number): [P3, P3] | null {
  if (a[2] < near && b[2] < near) return null;
  if (a[2] >= near && b[2] >= near) return [a, b];
  const t = (near - a[2]) / (b[2] - a[2]);
  const m: P3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, near];
  return a[2] >= near ? [a, m] : [m, b];
}

/**
 * Scanline fill on screen points [x, y, 1/z]; 1/z is linear in screen space (perspective-correct depth). Pixel
 * centres are covered on half-open spans [left, right) and [top, bottom), so two triangles sharing an edge fill it
 * once. Opaque triangles write `izOpaque`; translucent ones (opacity < 1) are blended where they are in front of
 * the opaque surface and record their nearest depth in `izTranslucent`.
 */
function fillTriangle(
  rgba: Uint8ClampedArray,
  izOpaque: Float32Array,
  izTranslucent: Float32Array,
  W: number,
  H: number,
  a: P3,
  b: P3,
  c: P3,
  col: RGB,
  opacity: number,
): boolean {
  // Sort by screen y.
  let [p0, p1, p2] = [a, b, c];
  if (p1[1] < p0[1]) [p0, p1] = [p1, p0];
  if (p2[1] < p0[1]) [p0, p2] = [p2, p0];
  if (p2[1] < p1[1]) [p1, p2] = [p2, p1];
  const area = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p1[1] - p0[1]);
  if (area === 0 || !Number.isFinite(area)) return false;
  const yStart = Math.max(0, Math.ceil(p0[1] - 0.5));
  const yEnd = Math.min(H - 1, Math.ceil(p2[1] - 0.5) - 1);
  if (yStart > yEnd) return false;
  const blend = opacity < 1;
  const keep = 1 - opacity;
  const c0 = col[0] * opacity;
  const c1 = col[1] * opacity;
  const c2 = col[2] * opacity;
  for (let y = yStart; y <= yEnd; y++) {
    const sy = y + 0.5;
    // Long edge p0→p2 and the short edge on this side of p1.
    const tl = (sy - p0[1]) / (p2[1] - p0[1]);
    let xa = p0[0] + (p2[0] - p0[0]) * tl;
    let za = p0[2] + (p2[2] - p0[2]) * tl;
    let xb: number;
    let zb: number;
    if (sy < p1[1]) {
      const ts = (sy - p0[1]) / (p1[1] - p0[1]);
      xb = p0[0] + (p1[0] - p0[0]) * ts;
      zb = p0[2] + (p1[2] - p0[2]) * ts;
    } else {
      const ts = (sy - p1[1]) / (p2[1] - p1[1] || 1);
      xb = p1[0] + (p2[0] - p1[0]) * ts;
      zb = p1[2] + (p2[2] - p1[2]) * ts;
    }
    if (xb < xa) {
      [xa, xb] = [xb, xa];
      [za, zb] = [zb, za];
    }
    const xStart = Math.max(0, Math.ceil(xa - 0.5));
    const xEnd = Math.min(W - 1, Math.ceil(xb - 0.5) - 1);
    if (xStart > xEnd) continue;
    const dz = (zb - za) / (xb - xa || 1);
    let iz = za + dz * (xStart + 0.5 - xa);
    let k = y * W + xStart;
    for (let x = xStart; x <= xEnd; x++, k++, iz += dz) {
      if (iz <= izOpaque[k]) continue;
      const o = 4 * k;
      if (blend) {
        rgba[o] = rgba[o] * keep + c0;
        rgba[o + 1] = rgba[o + 1] * keep + c1;
        rgba[o + 2] = rgba[o + 2] * keep + c2;
        if (iz > izTranslucent[k]) izTranslucent[k] = iz;
      } else {
        izOpaque[k] = iz;
        rgba[o] = col[0];
        rgba[o + 1] = col[1];
        rgba[o + 2] = col[2];
      }
    }
  }
  return true;
}

/**
 * Depth-tested line (DDA) on screen points [x, y, 1/z], drawn as if slightly nearer (LINE_DEPTH_BIAS) so it is not
 * hidden by the surface it lies on. Hidden behind opaque surfaces; behind a translucent surface it is mixed with the
 * color already there (as if the surface were blended over it).
 */
function drawLine(rgba: Uint8ClampedArray, izOpaque: Float32Array, izTranslucent: Float32Array, W: number, H: number, a: P3, b: P3, col: RGB): void {
  // Only the part over the canvas is walked (Liang–Barsky on the screen rectangle, parameter t along a → b).
  let t0 = 0;
  let t1 = 1;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  for (const [pk, qk] of [[-dx, a[0] + 1], [dx, W + 1 - a[0]], [-dy, a[1] + 1], [dy, H + 1 - a[1]]] as const) {
    if (pk === 0) {
      if (qk < 0) return;
      continue;
    }
    const r = qk / pk;
    if (pk < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
  }
  if (!(t0 <= t1)) return;
  const steps = Math.min(MAX_LINE_STEPS, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), 1) * (t1 - t0)) || 1);
  if (!Number.isFinite(steps)) return;
  for (let s = 0; s <= steps; s++) {
    const t = t0 + ((t1 - t0) * s) / steps;
    const x = Math.round(a[0] + dx * t - 0.5);
    const y = Math.round(a[1] + dy * t - 0.5);
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const iz = (a[2] + (b[2] - a[2]) * t) / LINE_DEPTH_BIAS;
    const k = y * W + x;
    if (iz < izOpaque[k]) continue;
    const o = 4 * k;
    if (iz < izTranslucent[k]) {
      rgba[o] = rgba[o] * LINE_BEHIND_MIX + col[0] * (1 - LINE_BEHIND_MIX);
      rgba[o + 1] = rgba[o + 1] * LINE_BEHIND_MIX + col[1] * (1 - LINE_BEHIND_MIX);
      rgba[o + 2] = rgba[o + 2] * LINE_BEHIND_MIX + col[2] * (1 - LINE_BEHIND_MIX);
    } else {
      rgba[o] = col[0];
      rgba[o + 1] = col[1];
      rgba[o + 2] = col[2];
    }
  }
}

/** Grid mesh of z = f(x, y) over [x0, x1] × [y0, y1] with n × n cells (2n² triangles); undefined cells are skipped. */
export function surfaceMesh(f: (x: number, y: number) => number, x0: number, x1: number, y0: number, y1: number, n: number, color: RGB): Mesh {
  const positions = new Float32Array((n + 1) * (n + 1) * 3);
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      const y = y0 + ((y1 - y0) * j) / n;
      const k = 3 * (j * (n + 1) + i);
      positions[k] = x;
      positions[k + 1] = y;
      positions[k + 2] = f(x, y);
    }
  }
  const idx: number[] = [];
  const ok = (i: number, j: number) => Number.isFinite(positions[3 * (j * (n + 1) + i) + 2]);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      if (!(ok(i, j) && ok(i + 1, j) && ok(i, j + 1) && ok(i + 1, j + 1))) continue;
      const a = j * (n + 1) + i;
      const b = a + 1;
      const c = a + n + 1;
      const d = c + 1;
      idx.push(a, b, d, a, d, c);
    }
  }
  return { positions, indices: Uint32Array.from(idx), color };
}
