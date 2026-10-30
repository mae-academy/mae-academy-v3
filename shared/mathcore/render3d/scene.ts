/**
 * 3D scene for Phase 5 (STEPS.md §8.2, D3 lifted 2026-10-30): what the engine Worker draws with the CPU rasterizer.
 *
 * - Axes and the viewing box [−L, L]³; L fits the content (solution points, images of the unit cube), at least
 *   SCENE_MIN_HALF.
 * - A 3×3 system: each plane aᵢ·x = bᵢ clipped to the box (translucent, one palette color per plane), the line where
 *   each pair of planes meets (so parallel or inconsistent planes are visible as separate lines), and a marker at the
 *   unique solution.
 * - A 3×3 matrix: the image of the unit cube (volume |det A|), shaded by orientation like the 2D parallelogram, with
 *   its edges; A·î, A·ĵ, A·k̂; the real eigen-directions as lines through the origin.
 *
 * Text cannot be rasterized here: labels come back as world-space anchors that the page projects and draws.
 */
import type { Mat } from "../linalg/matrix";
import { determinant } from "../linalg/matrix";
import { complexPlane3, eigen3 } from "../linalg/qr";
import { ARC_FRACTION, LABEL_OFFSET, MARKER_FRACTION, SCENE_MARGIN, SCENE_MAX_HALF, SCENE_MIN_HALF as MIN_HALF } from "../constants";
import { parallelepipedMesh, planeInCube, polygonMesh } from "./geometry";
import type { Line3, Mesh, RGB, Vec3 } from "./raster";

/** Smallest half-size of the viewing box. */
export const SCENE_MIN_HALF = MIN_HALF;
/** Opacity of system planes and of the unit cube's image. */
export const PLANE_OPACITY = 0.45;
export const SOLID_OPACITY = 0.35;

export type Scene3Item =
  | { kind: "matrix"; values: Mat; color: RGB; name?: string }
  | { kind: "system"; A: Mat; b: number[]; solution: Vec3 | null; colors: [RGB, RGB, RGB] };

export interface Scene3Colors {
  background: RGB;
  axis: RGB;
  box: RGB;
  positive: RGB;
  negative: RGB;
  arrow: RGB;
  eigen: RGB;
}

export interface Label3 {
  at: Vec3;
  text: string;
}

export interface Scene3 {
  meshes: Mesh[];
  lines: Line3[];
  labels: Label3[];
  /** Half-size of the viewing box. */
  half: number;
}

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const finite3 = (v: Vec3) => v.every(Number.isFinite);
/** Rotation arc drawn with this many segments; a pair of planes counts as parallel below this squared sine. */
const ARC_SEGMENTS = 24;
const PARALLEL_SIN2 = 1e-24;
/** Short plain number for labels. */
const fmt = (v: number) => String(Number(v.toPrecision(4)));

/** Half-size of the box: the content's extent with a margin, rounded up to a whole number, at least SCENE_MIN_HALF. */
export function sceneHalf(items: readonly Scene3Item[]): number {
  let r = 0;
  for (const it of items) {
    if (it.kind === "system") {
      if (it.solution && finite3(it.solution)) r = Math.max(r, ...it.solution.map(Math.abs).filter(Number.isFinite));
    } else {
      // The unit cube's far corner and the column vectors.
      for (let k = 0; k < 8; k++) {
        const p: Vec3 = [k & 1, (k >> 1) & 1, (k >> 2) & 1];
        for (const row of it.values) {
          const v = Math.abs(row[0] * p[0] + row[1] * p[1] + row[2] * p[2]);
          if (Number.isFinite(v)) r = Math.max(r, v);
        }
      }
    }
  }
  // Non-finite content (overflowed products) is ignored rather than turning the box into ∞.
  if (!Number.isFinite(r)) r = 0;
  return Math.min(SCENE_MAX_HALF, Math.max(SCENE_MIN_HALF, Math.ceil(r * SCENE_MARGIN)));
}

/**
 * Segment of the line {p + t·d} inside the box [−L, L]³ (slab clipping), or null if it misses the box.
 */
export function clipLineToBox(p: Vec3, d: Vec3, L: number): [Vec3, Vec3] | null {
  if (d[0] === 0 && d[1] === 0 && d[2] === 0) return null;
  let t0 = -Infinity;
  let t1 = Infinity;
  for (let k = 0; k < 3; k++) {
    if (d[k] === 0) {
      if (p[k] < -L || p[k] > L) return null;
      continue;
    }
    const a = (-L - p[k]) / d[k];
    const b = (L - p[k]) / d[k];
    t0 = Math.max(t0, Math.min(a, b));
    t1 = Math.min(t1, Math.max(a, b));
  }
  if (!(t0 < t1)) return null;
  return [add(p, scale(d, t0)), add(p, scale(d, t1))];
}

/**
 * Line where planes n₁·x = b₁ and n₂·x = b₂ meet: direction n₁ × n₂ and the point of that line closest to the origin,
 * or null for parallel planes.
 */
export function planeIntersection(n1in: Vec3, b1in: number, n2in: Vec3, b2in: number): { point: Vec3; dir: Vec3 } | null {
  // Unit normals first, so the parallel test and the point do not depend on the coefficients' scale.
  const l1 = Math.hypot(...n1in);
  const l2 = Math.hypot(...n2in);
  if (!(l1 > 0 && l2 > 0)) return null;
  const n1 = scale(n1in, 1 / l1);
  const n2 = scale(n2in, 1 / l2);
  const b1 = b1in / l1;
  const b2 = b2in / l2;
  const d = cross(n1, n2);
  const dd = dot(d, d);
  if (!(dd > PARALLEL_SIN2)) return null;
  // p = (b₁ (n₂ × d) + b₂ (d × n₁)) / |d|²
  const point = scale(add(scale(cross(n2, d), b1), scale(cross(d, n1), b2)), 1 / dd);
  return { point, dir: d };
}

export function buildScene3(items: readonly Scene3Item[], colors: Scene3Colors): Scene3 {
  const L = sceneHalf(items);
  const meshes: Mesh[] = [];
  const lines: Line3[] = [];
  const labels: Label3[] = [];

  // Box edges, then axes on top.
  for (let i = 0; i < 8; i++) {
    for (const bit of [1, 2, 4]) {
      const j = i | bit;
      if (j === i) continue;
      const c = (k: number): Vec3 => [k & 1 ? L : -L, k & 2 ? L : -L, k & 4 ? L : -L];
      lines.push({ from: c(i), to: c(j), color: colors.box });
    }
  }
  const axes: Array<[Vec3, string]> = [[[1, 0, 0], "x"], [[0, 1, 0], "y"], [[0, 0, 1], "z"]];
  for (const [e, name] of axes) {
    lines.push({ from: scale(e, -L), to: scale(e, L), color: colors.axis });
    labels.push({ at: scale(e, L * LABEL_OFFSET), text: name });
  }

  for (const it of items) {
    if (it.kind === "system") {
      const normals = it.A.map((r) => [r[0], r[1], r[2]] as Vec3);
      normals.forEach((n, i) => {
        if (n[0] === 0 && n[1] === 0 && n[2] === 0) return;
        const poly = planeInCube(n, it.b[i], L);
        if (poly.length < 3) return;
        meshes.push(polygonMesh(poly, it.colors[i], PLANE_OPACITY));
        for (let k = 0; k < poly.length; k++) lines.push({ from: poly[k], to: poly[(k + 1) % poly.length], color: it.colors[i] });
      });
      for (let i = 0; i < 3; i++) {
        for (let j = i + 1; j < 3; j++) {
          const m = planeIntersection(normals[i], it.b[i], normals[j], it.b[j]);
          const seg = m && clipLineToBox(m.point, m.dir, L);
          if (seg) lines.push({ from: seg[0], to: seg[1], color: colors.arrow });
        }
      }
      const s = it.solution;
      if (s && finite3(s)) {
        const a = MARKER_FRACTION * L;
        for (const e of axes) lines.push({ from: add(s, scale(e[0], -a)), to: add(s, scale(e[0], a)), color: colors.arrow });
        labels.push({ at: add(s, [a, a, a]), text: `(${fmt(s[0])}, ${fmt(s[1])}, ${fmt(s[2])})` });
      }
    } else {
      const A = it.values;
      const det = determinant(A);
      const tint = det.sign < 0 ? colors.negative : colors.positive;
      const solid = parallelepipedMesh(A, tint, SOLID_OPACITY);
      meshes.push(solid);
      // Edges of the image of the unit cube.
      const img = (k: number): Vec3 => {
        const p: Vec3 = [k & 1, (k >> 1) & 1, (k >> 2) & 1];
        return A.map((row) => row[0] * p[0] + row[1] * p[1] + row[2] * p[2]) as Vec3;
      };
      for (let i = 0; i < 8; i++) {
        for (const bit of [1, 2, 4]) if (!(i & bit)) lines.push({ from: img(i), to: img(i | bit), color: it.color });
      }
      const n = it.name ?? "A";
      const names = [`${n}î`, `${n}ĵ`, `${n}k̂`];
      for (let k = 0; k < 3; k++) {
        const col: Vec3 = [A[0][k], A[1][k], A[2][k]];
        lines.push({ from: [0, 0, 0], to: col, color: colors.arrow });
        labels.push({ at: col, text: names[k] });
      }
      if (A.flat().every(Number.isFinite)) {
        const e = eigen3(A);
        for (const v of e.vectors) lines.push({ from: scale(v.vector, -L), to: scale(v.vector, L), color: colors.eigen });
        // A complex pair: the real eigen-direction is the axis; an arc of θ in the invariant plane shows the rotation.
        const pair = e.values.find((v) => v.im > 0);
        const plane = pair && complexPlane3(A, pair);
        if (pair && plane) {
          const theta = Math.atan2(pair.im, pair.re);
          const R = ARC_FRACTION * L;
          const at = (t: number): Vec3 => add(scale(plane.u, R * Math.cos(t)), scale(plane.w, -R * Math.sin(t)));
          for (let k = 0; k < ARC_SEGMENTS; k++) lines.push({ from: at((theta * k) / ARC_SEGMENTS), to: at((theta * (k + 1)) / ARC_SEGMENTS), color: colors.eigen });
          labels.push({ at: at(theta / 2), text: `θ = ${fmt((theta * 180) / Math.PI)}°` });
        }
      }
    }
  }
  return { meshes, lines, labels, half: L };
}
