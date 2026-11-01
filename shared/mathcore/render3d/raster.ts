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
 * - Translucent triangles are blended far to near (sorted by depth). Lines (axes, vectors, edges) are depth-tested
 *   against opaque surfaces and take part in the blend pass at their own depth: on a pixel with a line, the line and
 *   every translucent fragment there are composited in exact per-pixel depth order, so a line behind two translucent
 *   planes is tinted by both and one between them by the nearer one only.
 * Budget (§7.2): 80×80 grid (≈12,800 triangles) ≤ 25 ms per frame.
 */
import { AMBIENT_LIGHT, CAMERA_FOV, LINE_DEPTH_BIAS, MAX_LINE_STEPS, NEAR_RELATIVE } from "../constants";

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

/** Bytes R, G, B, A of a pixel as one 32-bit word in memory order (whatever the platform's endianness). */
const packBytes = new Uint8ClampedArray(4);
const packWord = new Uint32Array(packBytes.buffer);
function pack(r: number, g: number, b: number): number {
  packBytes[0] = r;
  packBytes[1] = g;
  packBytes[2] = b;
  packBytes[3] = 255;
  return packWord[0];
}

const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
/** Frames up to this many pixels reuse their depth and line buffers between calls (a Worker renders one frame at a time). */
const CACHED_PIXELS = 4_000_000;

interface Buffers {
  n: number;
  izOpaque: Float32Array;
  /** Nearest line fragment per pixel (1/z, 0 = none), its packed color, a one-byte presence flag, and the head of the pixel's waiting list. */
  izLine: Float32Array;
  lineCol: Uint32Array;
  hasLine: Uint8Array;
  head: Int32Array;
}
let cached: Buffers | null = null;
const allocate = (n: number): Buffers => ({
  n,
  izOpaque: new Float32Array(n),
  izLine: new Float32Array(n),
  lineCol: new Uint32Array(n),
  hasLine: new Uint8Array(n),
  head: new Int32Array(n).fill(-1),
});
/** Buffers for n pixels with izOpaque zeroed; the line buffers are all clear (render restores them after each frame). */
function buffersFor(n: number): Buffers {
  if (n > CACHED_PIXELS) return allocate(n);
  if (!cached || cached.n < n) cached = allocate(n);
  cached.izOpaque.fill(0, 0, n);
  return cached;
}

/**
 * Translucent fragments that landed on a pixel that also holds a line, as parallel growable arrays and a linked list
 * per pixel. Lines are sparse, so this stays small; every other pixel is blended immediately.
 */
class Waiting {
  n = 0;
  iz = new Float32Array(1 << 16);
  r = new Float32Array(1 << 16);
  g = new Float32Array(1 << 16);
  b = new Float32Array(1 << 16);
  o = new Float32Array(1 << 16);
  next = new Int32Array(1 << 16);
  push(iz: number, r: number, g: number, b: number, o: number, next: number): number {
    if (this.n === this.iz.length) this.grow();
    const i = this.n++;
    this.iz[i] = iz;
    this.r[i] = r;
    this.g[i] = g;
    this.b[i] = b;
    this.o[i] = o;
    this.next[i] = next;
    return i;
  }
  private grow(): void {
    const size = this.iz.length * 2;
    const f = (a: Float32Array) => {
      const bigger = new Float32Array(size);
      bigger.set(a);
      return bigger;
    };
    this.iz = f(this.iz);
    this.r = f(this.r);
    this.g = f(this.g);
    this.b = f(this.b);
    this.o = f(this.o);
    const nx = new Int32Array(size);
    nx.set(this.next);
    this.next = nx;
  }
}

export function render(meshes: Mesh[], lines: Line3[], cam: Camera, width: number, height: number, background: RGB): Frame {
  const W = Math.max(1, Math.floor(width) || 1);
  const H = Math.max(1, Math.floor(height) || 1);
  const rgba = new Uint8ClampedArray(W * H * 4);
  const px32 = new Uint32Array(rgba.buffer);
  const px8 = new Uint8Array(rgba.buffer);
  // Inverse depth 1/z per pixel (0 = nothing yet; larger = nearer), so the inner loop needs no division.
  const buf = buffersFor(W * H);
  const { izOpaque, izLine, lineCol, hasLine, head } = buf;
  px32.fill(pack(background[0], background[1], background[2]));
  const { eye, fwd, right, up } = basis(cam);
  const f = H / 2 / Math.tan(cam.fov / 2);
  // Near plane relative to the camera distance, so a camera inside the scene still sees what is in front of it.
  const near = Math.max(NEAR_RELATIVE * cam.distance, Number.MIN_VALUE);
  const toCamera = (p: Vec3): P3 => {
    const d: Vec3 = [p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]];
    return [dot(d, right), dot(d, up), dot(d, fwd)];
  };
  const toScreen = (q: P3): P3 => [W / 2 + (f * q[0]) / q[2], H / 2 - (f * q[1]) / q[2], 1 / q[2]];

  // The pixels that hold a line (the line buffers are cleared at those pixels only, when the frame is done).
  const glassMeshes = meshes.filter((m) => (m.opacity ?? 1) < 1);
  const linePixels: number[] = [];
  const waiting = new Waiting();
  let triangles = 0;

  // Reused per-triangle state (the fill runs synchronously inside `emit`).
  const fill: FillState = { px8, px32, izOpaque, hasLine, head, waiting, W, H, depthTest: meshes.some((m) => (m.opacity ?? 1) >= 1) };

  /** Camera-space triangle clipped to z ≥ near (Sutherland–Hodgman), then projected and filled as a fan. */
  let sink: GlassItem[] | null = null;
  const put = (a: P3, b: P3, c: P3, col: RGB, opacity: number): boolean => (sink ? addItem(sink, fill.H, a, b, c, col, opacity) : fillTriangle(fill, a, b, c, col, opacity));
  const emit = (p0: P3, p1: P3, p2: P3, col: RGB, opacity: number): boolean => {
    if (p0[2] >= near && p1[2] >= near && p2[2] >= near) return put(toScreen(p0), toScreen(p1), toScreen(p2), col, opacity);
    const poly = [p0, p1, p2];
    const clipped: P3[] = [];
    for (let i = 0; i < 3; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % 3];
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
    for (let i = 1; i + 1 < sp.length; i++) drawn = put(sp[0], sp[i], sp[i + 1], col, opacity) || drawn;
    return drawn;
  };

  const cameraVertices = (mesh: Mesh): P3[] => {
    const P = mesh.positions;
    const out: P3[] = [];
    for (let v = 0; v < P.length; v += 3) out.push(toCamera([P[v], P[v + 1], P[v + 2]]));
    return out;
  };
  /** Lambert shade of triangle t of a mesh (light along the view direction; back faces lit with the flipped normal). */
  const shadeOf = (mesh: Mesh, t: number): number => {
    const P = mesh.positions;
    const ia = 3 * mesh.indices[t];
    const ib = 3 * mesh.indices[t + 1];
    const ic = 3 * mesh.indices[t + 2];
    const n = norm(cross([P[ib] - P[ia], P[ib + 1] - P[ia + 1], P[ib + 2] - P[ia + 2]], [P[ic] - P[ia], P[ic + 1] - P[ia + 1], P[ic + 2] - P[ia + 2]]));
    return AMBIENT + (1 - AMBIENT) * Math.abs(dot(n, fwd));
  };

  // Opaque surfaces first (z-buffer).
  const col: RGB = [0, 0, 0];
  for (const mesh of meshes) {
    if ((mesh.opacity ?? 1) < 1) continue;
    const cam3 = cameraVertices(mesh);
    for (let t = 0; t < mesh.indices.length; t += 3) {
      const shade = shadeOf(mesh, t);
      col[0] = mesh.color[0] * shade;
      col[1] = mesh.color[1] * shade;
      col[2] = mesh.color[2] * shade;
      if (emit(cam3[mesh.indices[t]], cam3[mesh.indices[t + 1]], cam3[mesh.indices[t + 2]], col, 1)) triangles++;
    }
  }
  // Lines next, into the line buffer only: hidden behind opaque surfaces, otherwise resolved after the blend pass.
  try {
    for (const l of lines) {
      const sg = clipSegment(toCamera(l.from), toCamera(l.to), near);
      if (sg) drawLine(izOpaque, izLine, lineCol, hasLine, linePixels, W, H, toScreen(sg[0]), toScreen(sg[1]), l.color);
    }
  // Translucent triangles of all meshes, blended from the farthest to the nearest (by mean depth).
  if (glassMeshes.length) {
    const glass: Array<{ mesh: Mesh; cam3: P3[]; t: number; depth: number }> = [];
    for (const mesh of glassMeshes) {
      const cam3 = cameraVertices(mesh);
      for (let t = 0; t < mesh.indices.length; t += 3) {
        const depth = (cam3[mesh.indices[t]][2] + cam3[mesh.indices[t + 1]][2] + cam3[mesh.indices[t + 2]][2]) / 3;
        glass.push({ mesh, cam3, t, depth });
      }
    }
    glass.sort((u, v) => v.depth - u.depth);
    // Translucent-only frames with few triangles (the linear-algebra scenes) are blended row by row, one write per pixel.
    const rows = !fill.depthTest && LITTLE_ENDIAN && glass.length <= ROW_BLEND_MAX_ITEMS;
    const items: GlassItem[] = [];
    if (rows) sink = items;
    for (const g of glass) {
      const shade = shadeOf(g.mesh, g.t);
      col[0] = g.mesh.color[0] * shade;
      col[1] = g.mesh.color[1] * shade;
      col[2] = g.mesh.color[2] * shade;
      const i = g.mesh.indices;
      if (emit(g.cam3[i[g.t]], g.cam3[i[g.t + 1]], g.cam3[i[g.t + 2]], col, g.mesh.opacity ?? 1)) triangles++;
    }
    sink = null;
    if (rows) {
      if (items.length <= ROW_BLEND_MAX_ITEMS) blendRows(fill, items);
      else for (const it of items) fillTriangle(fill, it.p0, it.p1, it.p2, it.col, it.opacity);
    }
  }
    resolveLines(px8, linePixels, izLine, lineCol, head, waiting);
  } finally {
    for (const k of linePixels) {
      izLine[k] = 0;
      lineCol[k] = 0;
      hasLine[k] = 0;
      head[k] = -1;
    }
  }
  return { width: W, height: H, rgba, triangles };
}

/**
 * Pixels that hold a line: the line (opaque, replaces what is behind it) and the translucent fragments that waited
 * there are composited over the pixel's opaque/background color in depth order, farthest first.
 */
function resolveLines(px8: Uint8Array, linePixels: number[], izLine: Float32Array, lineCol: Uint32Array, head: Int32Array, w: Waiting): void {
  const px32 = new Uint32Array(px8.buffer, px8.byteOffset, px8.length >> 2);
  const lineBytes = new Uint8Array(4);
  const lineWord = new Uint32Array(lineBytes.buffer);
  // Indices of one pixel's entries (−1 stands for the line itself), sorted by 1/z ascending, i.e. farthest first.
  let order = new Int32Array(64);
  let depth = new Float32Array(64);
  for (let n = 0; n < linePixels.length; n++) {
    const k = linePixels[n];
    // Nothing translucent on this pixel: the line replaces what is there.
    if (head[k] < 0) {
      px32[k] = lineCol[k];
      continue;
    }
    let count = 0;
    for (let i = head[k]; i >= 0; i = w.next[i]) count++;
    if (count + 1 > order.length) {
      order = new Int32Array(2 * (count + 1));
      depth = new Float32Array(2 * (count + 1));
    }
    let m = 0;
    for (let i = head[k]; i >= 0; i = w.next[i]) {
      // Insertion sort as the entries arrive.
      const z = w.iz[i];
      let j = m - 1;
      while (j >= 0 && depth[j] > z) {
        order[j + 1] = order[j];
        depth[j + 1] = depth[j];
        j--;
      }
      order[j + 1] = i;
      depth[j + 1] = z;
      m++;
    }
    // The line itself.
    {
      const z = izLine[k];
      let j = m - 1;
      while (j >= 0 && depth[j] > z) {
        order[j + 1] = order[j];
        depth[j + 1] = depth[j];
        j--;
      }
      order[j + 1] = -1;
      depth[j + 1] = z;
      m++;
    }
    const o = 4 * k;
    let r = px8[o];
    let g = px8[o + 1];
    let bl = px8[o + 2];
    for (let j = 0; j < m; j++) {
      const i = order[j];
      if (i < 0) {
        lineWord[0] = lineCol[k];
        r = lineBytes[0];
        g = lineBytes[1];
        bl = lineBytes[2];
      } else {
        const keep = 1 - w.o[i];
        r = r * keep + w.r[i];
        g = g * keep + w.g[i];
        bl = bl * keep + w.b[i];
      }
    }
    px8[o] = Math.round(r);
    px8[o + 1] = Math.round(g);
    px8[o + 2] = Math.round(bl);
  }
}

/** Row blending is used for translucent-only frames of at most this many screen triangles (cost grows as items²). */
const ROW_BLEND_MAX_ITEMS = 32;

/** A translucent screen triangle waiting for the row blend: vertices sorted by y, rows it covers, premultiplied color. */
interface GlassItem {
  p0: P3;
  p1: P3;
  p2: P3;
  col: RGB;
  opacity: number;
  keep: number;
  y0: number;
  y1: number;
  /** Color · opacity per channel. */
  r: number;
  g: number;
  b: number;
}

function addItem(items: GlassItem[], H: number, a: P3, b: P3, c: P3, col: RGB, opacity: number): boolean {
  let [p0, p1, p2] = [a, b, c];
  if (p1[1] < p0[1]) [p0, p1] = [p1, p0];
  if (p2[1] < p0[1]) [p0, p2] = [p2, p0];
  if (p2[1] < p1[1]) [p1, p2] = [p2, p1];
  const area = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p1[1] - p0[1]);
  if (area === 0 || !Number.isFinite(area)) return false;
  const y0 = Math.max(0, Math.ceil(p0[1] - 0.5));
  const y1 = Math.min(H - 1, Math.ceil(p2[1] - 0.5) - 1);
  if (y0 > y1) return false;
  items.push({ p0, p1, p2, col: [col[0], col[1], col[2]], opacity, keep: 1 - opacity, y0, y1, r: col[0] * opacity, g: col[1] * opacity, b: col[2] * opacity });
  return true;
}

/**
 * Blends translucent items (already sorted far to near) row by row. On each row the items' spans split the row into
 * segments with a fixed set of covering items; their composite over a pixel is dst · K + C (K the product of the
 * items' keep factors, C their accumulated premultiplied colors), so every pixel is read and written once however
 * many layers cover it. Pixels that hold a line take the individual fragments instead (exact order, see resolveLines).
 */
function blendRows(st: FillState, items: GlassItem[]): void {
  const { px32, hasLine, head, waiting, W } = st;
  const n = items.length;
  if (n === 0) return;
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const it of items) {
    yMin = Math.min(yMin, it.y0);
    yMax = Math.max(yMax, it.y1);
  }
  const xs = new Int32Array(n);
  const xe = new Int32Array(n);
  const at = new Int32Array(n);
  const izStart = new Float64Array(n);
  const izStep = new Float64Array(n);
  const bounds = new Int32Array(2 * n);
  for (let y = yMin; y <= yMax; y++) {
    const sy = y + 0.5;
    let m = 0;
    for (let i = 0; i < n; i++) {
      const it = items[i];
      if (y < it.y0 || y > it.y1) continue;
      const { p0, p1, p2 } = it;
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
      xs[m] = xStart;
      xe[m] = xEnd + 1;
      at[m] = i;
      izStart[m] = za + dz * (xStart + 0.5 - xa);
      izStep[m] = dz;
      m++;
    }
    if (m === 0) continue;
    // Sorted distinct segment boundaries.
    let nb = 0;
    for (let j = 0; j < m; j++) {
      bounds[nb++] = xs[j];
      bounds[nb++] = xe[j];
    }
    for (let a = 1; a < nb; a++) {
      const v = bounds[a];
      let b = a - 1;
      while (b >= 0 && bounds[b] > v) {
        bounds[b + 1] = bounds[b];
        b--;
      }
      bounds[b + 1] = v;
    }
    for (let q = 0; q + 1 < nb; q++) {
      const x0 = bounds[q];
      const x1 = bounds[q + 1];
      if (x0 === x1) continue;
      let K = 1;
      let cr = 0;
      let cg = 0;
      let cb = 0;
      let covering = 0;
      for (let j = 0; j < m; j++) {
        if (xs[j] > x0 || xe[j] < x1) continue;
        const it = items[at[j]];
        K *= it.keep;
        cr = cr * it.keep + it.r;
        cg = cg * it.keep + it.g;
        cb = cb * it.keep + it.b;
        covering++;
      }
      if (covering === 0) continue;
      const K256 = Math.round(K * 256);
      const srcRB = (Math.round(cr * 256) + 128 + ((Math.round(cb * 256) + 128) << 16)) | 0;
      const srcGA = (Math.round(cg * 256) + 128 + ((255 * (256 - K256) + 128) << 16)) | 0;
      let k = y * W + x0;
      for (let x = x0; x < x1; x++, k++) {
        if (hasLine[k] !== 0) {
          for (let j = 0; j < m; j++) {
            if (xs[j] > x || xe[j] <= x) continue;
            const it = items[at[j]];
            head[k] = waiting.push(izStart[j] + izStep[j] * (x - xs[j]), it.r, it.g, it.b, it.opacity, head[k]);
          }
          continue;
        }
        const d = px32[k];
        const rb = ((Math.imul(d & 0x00ff00ff, K256) + srcRB) | 0) >>> 8 & 0x00ff00ff;
        const ga = ((Math.imul((d >>> 8) & 0x00ff00ff, K256) + srcGA) | 0) >>> 8 & 0x00ff00ff;
        px32[k] = rb | (ga << 8);
      }
    }
  }
}

/** Part of the camera-space segment with z ≥ near, or null. */
function clipSegment(a: P3, b: P3, near: number): [P3, P3] | null {
  if (a[2] < near && b[2] < near) return null;
  if (a[2] >= near && b[2] >= near) return [a, b];
  const t = (near - a[2]) / (b[2] - a[2]);
  const m: P3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, near];
  return a[2] >= near ? [a, m] : [m, b];
}

interface FillState {
  px8: Uint8Array;
  px32: Uint32Array;
  izOpaque: Float32Array;
  /** One-byte "this pixel holds a line" flags (all clear when the frame has no lines). */
  hasLine: Uint8Array;
  head: Int32Array;
  waiting: Waiting;
  W: number;
  H: number;
  /** False when the frame has no opaque surface: translucent fragments then need no depth test. */
  depthTest: boolean;
}

/**
 * Scanline fill on screen points [x, y, 1/z]; 1/z is linear in screen space (perspective-correct depth). Pixel
 * centres are covered on half-open spans [left, right) and [top, bottom), so two triangles sharing an edge fill it
 * once. Opaque triangles write `izOpaque`; translucent ones (opacity < 1) are blended where they are in front of the
 * opaque surface (8.8 fixed point), except on pixels that hold a line: there the fragment waits for the exact-order
 * resolve.
 */
function fillTriangle(st: FillState, a: P3, b: P3, c: P3, col: RGB, opacity: number): boolean {
  const { px8, px32, izOpaque, hasLine, head, waiting, W, H, depthTest } = st;
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
  // Opaque: one packed store. Translucent: result = (dst · keep + src · opacity · 256 + 128) >> 8 per channel.
  const packed = pack(col[0], col[1], col[2]);
  const opacity256 = Math.round(opacity * 256);
  const keep256 = 256 - opacity256;
  const c0 = Math.round(col[0] * opacity256) + 128;
  const c1 = Math.round(col[1] * opacity256) + 128;
  const c2 = Math.round(col[2] * opacity256) + 128;
  // Translucent blend on packed words, two channels per multiply (R and B in one lane pair, G and A in the other):
  // result = (dst · keep + src · opacity · 256 + 128) >> 8 per lane; each lane stays below 2¹⁶, so lanes do not carry.
  const srcRB = (Math.round(col[0] * opacity256) + 128 + ((Math.round(col[2] * opacity256) + 128) << 16)) | 0;
  const srcGA = (Math.round(col[1] * opacity256) + 128 + ((255 * opacity256 + 128) << 16)) | 0;
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
    if (!blend) {
      for (let x = xStart; x <= xEnd; x++, k++, iz += dz) {
        if (iz <= izOpaque[k]) continue;
        izOpaque[k] = iz;
        px32[k] = packed;
      }
    } else if (LITTLE_ENDIAN && !depthTest) {
      // Only translucent surfaces: no depth test; 1/z is needed only where a line waits.
      for (let x = xStart; x <= xEnd; x++, k++) {
        if (hasLine[k] !== 0) {
          head[k] = waiting.push(iz + dz * (x - xStart), (c0 - 128) / 256, (c1 - 128) / 256, (c2 - 128) / 256, opacity, head[k]);
          continue;
        }
        const d = px32[k];
        const rb = ((Math.imul(d & 0x00ff00ff, keep256) + srcRB) | 0) >>> 8 & 0x00ff00ff;
        const ga = ((Math.imul((d >>> 8) & 0x00ff00ff, keep256) + srcGA) | 0) >>> 8 & 0x00ff00ff;
        px32[k] = rb | (ga << 8);
      }
    } else if (LITTLE_ENDIAN) {
      for (let x = xStart; x <= xEnd; x++, k++, iz += dz) {
        if (iz <= izOpaque[k]) continue;
        if (hasLine[k] !== 0) {
          head[k] = waiting.push(iz, (c0 - 128) / 256, (c1 - 128) / 256, (c2 - 128) / 256, opacity, head[k]);
          continue;
        }
        const d = px32[k];
        const rb = ((Math.imul(d & 0x00ff00ff, keep256) + srcRB) | 0) >>> 8 & 0x00ff00ff;
        const ga = ((Math.imul((d >>> 8) & 0x00ff00ff, keep256) + srcGA) | 0) >>> 8 & 0x00ff00ff;
        px32[k] = rb | (ga << 8);
      }
    } else {
      for (let x = xStart; x <= xEnd; x++, k++, iz += dz) {
        if (iz <= izOpaque[k]) continue;
        if (hasLine[k] !== 0) {
          head[k] = waiting.push(iz, (c0 - 128) / 256, (c1 - 128) / 256, (c2 - 128) / 256, opacity, head[k]);
          continue;
        }
        const o = k << 2;
        px8[o] = (px8[o] * keep256 + c0) >> 8;
        px8[o + 1] = (px8[o + 1] * keep256 + c1) >> 8;
        px8[o + 2] = (px8[o + 2] * keep256 + c2) >> 8;
      }
    }
  }
  return true;
}

/**
 * Depth-tested line (DDA) on screen points [x, y, 1/z], treated as slightly nearer (LINE_DEPTH_BIAS) so it is not
 * hidden by the surface it lies on. Pixels behind an opaque surface are dropped; the others are recorded in the line
 * buffer (the nearest fragment per pixel wins) and composited after the blend pass.
 */
function drawLine(
  izOpaque: Float32Array,
  izLine: Float32Array,
  lineCol: Uint32Array,
  hasLine: Uint8Array,
  linePixels: number[],
  W: number,
  H: number,
  a: P3,
  b: P3,
  col: RGB,
): void {
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
  const packed = pack(col[0], col[1], col[2]);
  // Walk t0 → t1 in `steps` equal steps, incrementally: pixel column/row = floor of the screen position.
  const dt = (t1 - t0) / steps;
  let x = a[0] + dx * t0;
  let y = a[1] + dy * t0;
  let z = a[2] + (b[2] - a[2]) * t0;
  const sx = dx * dt;
  const sy = dy * dt;
  const sz = (b[2] - a[2]) * dt;
  for (let s = 0; s <= steps; s++, x += sx, y += sy, z += sz) {
    const px = Math.floor(x);
    const py = Math.floor(y);
    if (px < 0 || py < 0 || px >= W || py >= H) continue;
    const iz = z / LINE_DEPTH_BIAS;
    const k = py * W + px;
    if (iz < izOpaque[k] || iz <= izLine[k]) continue;
    if (izLine[k] === 0) linePixels.push(k);
    hasLine[k] = 1;
    izLine[k] = iz;
    lineCol[k] = packed;
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
