/**
 * Software 3D on the CPU (STEPS.md §7.3 "3D", ADR-4: no WebGL/WebGPU/Three.js). Runs in a Worker and returns RGBA
 * pixels for the page to put on its canvas.
 *
 * - Orbit camera with perspective projection.
 * - Triangles filled by scanline rasterization with a Float32Array z-buffer (perspective-correct depth: 1/z is
 *   interpolated linearly in screen space).
 * - Lambert lighting from a light fixed to the camera, plus an ambient term; back faces are lit with the flipped
 *   normal so a single-sided surface reads correctly from below.
 * - Lines (axes, vectors, edges) are depth-tested and drawn after the triangles.
 * Budget (§7.2): 80×80 grid (≈12,800 triangles) ≤ 25 ms per frame.
 */

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
const AMBIENT = 0.3;
/** Points closer than this to the camera plane are clipped (avoids division by ~0). */
const NEAR = 1e-3;

export const DEFAULT_CAMERA: Camera = { azimuth: Math.PI / 4, elevation: Math.PI / 6, distance: 12, target: [0, 0, 0], fov: Math.PI / 4 };

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
    if (z < NEAR) return null;
    return [width / 2 + (f * dot(d, right)) / z, height / 2 - (f * dot(d, up)) / z, z];
  };
}

export function render(meshes: Mesh[], lines: Line3[], cam: Camera, width: number, height: number, background: RGB): Frame {
  const rgba = new Uint8ClampedArray(width * height * 4);
  const depth = new Float32Array(width * height).fill(Infinity);
  for (let i = 0; i < width * height; i++) {
    rgba[4 * i] = background[0];
    rgba[4 * i + 1] = background[1];
    rgba[4 * i + 2] = background[2];
    rgba[4 * i + 3] = 255;
  }
  const project = projector(cam, width, height);
  const { fwd } = basis(cam);
  let triangles = 0;

  const ordered = meshes.slice().sort((a, b) => (a.opacity ?? 1) - (b.opacity ?? 1)).reverse(); // opaque first
  for (const mesh of ordered) {
    const opacity = mesh.opacity ?? 1;
    const P = mesh.positions;
    const proj: Array<[number, number, number] | null> = [];
    for (let v = 0; v < P.length; v += 3) proj.push(project([P[v], P[v + 1], P[v + 2]]));
    for (let t = 0; t < mesh.indices.length; t += 3) {
      const ia = mesh.indices[t];
      const ib = mesh.indices[t + 1];
      const ic = mesh.indices[t + 2];
      const a = proj[ia];
      const b = proj[ib];
      const c = proj[ic];
      if (!a || !b || !c) continue;
      // Face normal in world space for Lambert shading.
      const A: Vec3 = [P[3 * ia], P[3 * ia + 1], P[3 * ia + 2]];
      const B: Vec3 = [P[3 * ib], P[3 * ib + 1], P[3 * ib + 2]];
      const C: Vec3 = [P[3 * ic], P[3 * ic + 1], P[3 * ic + 2]];
      const n = norm(cross([B[0] - A[0], B[1] - A[1], B[2] - A[2]], [C[0] - A[0], C[1] - A[1], C[2] - A[2]]));
      const lambert = Math.abs(dot(n, fwd));
      const shade = AMBIENT + (1 - AMBIENT) * lambert;
      const col: RGB = [mesh.color[0] * shade, mesh.color[1] * shade, mesh.color[2] * shade];
      if (fillTriangle(rgba, depth, width, height, a, b, c, col, opacity)) triangles++;
    }
  }
  for (const l of lines) drawLine(rgba, depth, width, height, project(l.from), project(l.to), l.color);
  return { width, height, rgba, triangles };
}

/** Scanline fill with a z-buffer; 1/z interpolated linearly in screen space (perspective-correct depth). */
function fillTriangle(
  rgba: Uint8ClampedArray,
  depth: Float32Array,
  W: number,
  H: number,
  a: [number, number, number],
  b: [number, number, number],
  c: [number, number, number],
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
  const yEnd = Math.min(H - 1, Math.floor(p2[1] - 0.5));
  if (yStart > yEnd) return false;
  const iz0 = 1 / p0[2];
  const iz1 = 1 / p1[2];
  const iz2 = 1 / p2[2];
  const blend = opacity < 1;
  for (let y = yStart; y <= yEnd; y++) {
    const sy = y + 0.5;
    // Long edge p0→p2 and the short edge on this side of p1.
    const tl = (sy - p0[1]) / (p2[1] - p0[1]);
    let xa = p0[0] + (p2[0] - p0[0]) * tl;
    let za = iz0 + (iz2 - iz0) * tl;
    let xb: number;
    let zb: number;
    if (sy < p1[1]) {
      const ts = (sy - p0[1]) / (p1[1] - p0[1]);
      xb = p0[0] + (p1[0] - p0[0]) * ts;
      zb = iz0 + (iz1 - iz0) * ts;
    } else {
      const ts = (sy - p1[1]) / (p2[1] - p1[1] || 1);
      xb = p1[0] + (p2[0] - p1[0]) * ts;
      zb = iz1 + (iz2 - iz1) * ts;
    }
    if (xb < xa) {
      [xa, xb] = [xb, xa];
      [za, zb] = [zb, za];
    }
    const xStart = Math.max(0, Math.ceil(xa - 0.5));
    const xEnd = Math.min(W - 1, Math.floor(xb - 0.5));
    const span = xb - xa || 1;
    for (let x = xStart; x <= xEnd; x++) {
      const iz = za + ((zb - za) * (x + 0.5 - xa)) / span;
      const z = 1 / iz;
      const k = y * W + x;
      if (z >= depth[k]) continue;
      if (!blend) depth[k] = z;
      const o = 4 * k;
      if (blend) {
        rgba[o] = rgba[o] * (1 - opacity) + col[0] * opacity;
        rgba[o + 1] = rgba[o + 1] * (1 - opacity) + col[1] * opacity;
        rgba[o + 2] = rgba[o + 2] * (1 - opacity) + col[2] * opacity;
      } else {
        rgba[o] = col[0];
        rgba[o + 1] = col[1];
        rgba[o + 2] = col[2];
      }
    }
  }
  return true;
}

/** Depth-tested line (DDA), drawn slightly in front so it is not hidden by the surface it lies on. */
function drawLine(
  rgba: Uint8ClampedArray,
  depth: Float32Array,
  W: number,
  H: number,
  a: [number, number, number] | null,
  b: [number, number, number] | null,
  col: RGB,
): void {
  if (!a || !b) return;
  const steps = Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), 1));
  // Lines win depth ties against faces they sit on.
  const bias = 0.999;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const x = Math.round(a[0] + (b[0] - a[0]) * t - 0.5);
    const y = Math.round(a[1] + (b[1] - a[1]) * t - 0.5);
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const z = 1 / (1 / a[2] + (1 / b[2] - 1 / a[2]) * t);
    const k = y * W + x;
    if (z * bias > depth[k]) continue;
    const o = 4 * k;
    rgba[o] = col[0];
    rgba[o + 1] = col[1];
    rgba[o + 2] = col[2];
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
