/**
 * 3D geometry for linear algebra (STEPS.md §8.2, Phase 5): planes aᵢ·x = bᵢ of a 3×3 system clipped to a viewing
 * cube (their common point is the solution), and the image of the unit cube under a 3×3 matrix.
 */
import type { Mesh, RGB, Vec3 } from "./raster";

const EDGES: Array<[number, number]> = [
  [0, 1], [1, 3], [3, 2], [2, 0], [4, 5], [5, 7], [7, 6], [6, 4], [0, 4], [1, 5], [2, 6], [3, 7],
];

/** Corner i of the cube [−L, L]³ (bit 0 → x, bit 1 → y, bit 2 → z). */
const corner = (i: number, L: number): Vec3 => [i & 1 ? L : -L, i & 2 ? L : -L, i & 4 ? L : -L];

/**
 * Polygon where the plane n·p = d cuts the cube [−L, L]³, ordered around its centre; empty if they do not meet.
 * Vertices are the plane's crossings with the cube's 12 edges.
 */
export function planeInCube(n: Vec3, d: number, L: number): Vec3[] {
  const pts: Vec3[] = [];
  const side = (p: Vec3) => n[0] * p[0] + n[1] * p[1] + n[2] * p[2] - d;
  for (const [i, j] of EDGES) {
    const a = corner(i, L);
    const b = corner(j, L);
    const sa = side(a);
    const sb = side(b);
    if (sa === 0) pts.push(a);
    if ((sa < 0 && sb > 0) || (sa > 0 && sb < 0)) {
      const t = sa / (sa - sb);
      pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
    }
  }
  // Remove duplicates (a plane through a corner touches three edges there).
  const uniq: Vec3[] = [];
  for (const p of pts) if (!uniq.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < 1e-12 * Math.max(1, L))) uniq.push(p);
  if (uniq.length < 3) return [];
  const c: Vec3 = [0, 1, 2].map((k) => uniq.reduce((s, p) => s + p[k], 0) / uniq.length) as Vec3;
  // In-plane basis (u, v) to sort by angle.
  const nn = Math.hypot(...n);
  const nu: Vec3 = [n[0] / nn, n[1] / nn, n[2] / nn];
  const helper: Vec3 = Math.abs(nu[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = cross(nu, helper);
  const v = cross(nu, u);
  return uniq.sort((p, q) => angle(p, c, u, v) - angle(q, c, u, v));
}

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const angle = (p: Vec3, c: Vec3, u: Vec3, v: Vec3) => {
  const d: Vec3 = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
  return Math.atan2(d[0] * v[0] + d[1] * v[1] + d[2] * v[2], d[0] * u[0] + d[1] * u[1] + d[2] * u[2]);
};

/** Triangle fan of a convex polygon. */
export function polygonMesh(poly: Vec3[], color: RGB, opacity = 1): Mesh {
  const positions = Float32Array.from(poly.flat());
  const idx: number[] = [];
  for (let i = 1; i + 1 < poly.length; i++) idx.push(0, i, i + 1);
  return { positions, indices: Uint32Array.from(idx), color, opacity };
}

/** Image of the unit cube [0, 1]³ under A (a parallelepiped with volume |det A|): 12 triangles. */
export function parallelepipedMesh(A: number[][], color: RGB, opacity = 1): Mesh {
  const img = (i: number): Vec3 => {
    const p: Vec3 = [i & 1 ? 1 : 0, i & 2 ? 1 : 0, i & 4 ? 1 : 0];
    return [0, 1, 2].map((r) => A[r][0] * p[0] + A[r][1] * p[1] + A[r][2] * p[2]) as Vec3;
  };
  const positions = Float32Array.from(Array.from({ length: 8 }, (_, i) => img(i)).flat());
  // Faces x = 0, x = 1, y = 0, y = 1, z = 0, z = 1, each wound counter-clockwise seen from outside, so the mesh is
  // closed and consistently oriented (its signed volume is det A).
  const faces = [
    [0, 4, 6, 2], [1, 3, 7, 5], [0, 1, 5, 4], [2, 6, 7, 3], [0, 2, 3, 1], [4, 5, 7, 6],
  ];
  const idx = faces.flatMap(([a, b, c, d]) => [a, b, c, a, c, d]);
  return { positions, indices: Uint32Array.from(idx), color, opacity };
}

/** Signed volume of a closed triangle mesh (divergence theorem); |det A| for the parallelepiped. */
export function meshVolume(m: Mesh): number {
  let v = 0;
  const P = m.positions;
  for (let t = 0; t < m.indices.length; t += 3) {
    const [a, b, c] = [m.indices[t], m.indices[t + 1], m.indices[t + 2]].map((i) => [P[3 * i], P[3 * i + 1], P[3 * i + 2]] as Vec3);
    v += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }
  return v;
}
