import { describe, expect, it } from "vitest";
import { meshVolume } from "./geometry";
import { DEFAULT_CAMERA, render } from "./raster";
import type { RGB, Vec3 } from "./raster";
import { buildScene3, clipLineToBox, planeIntersection, sceneHalf } from "./scene";
import type { Scene3Colors } from "./scene";

const colors: Scene3Colors = {
  background: [255, 255, 255], axis: [100, 100, 100], box: [220, 220, 220], positive: [37, 99, 235], negative: [225, 29, 72], arrow: [15, 23, 42], eigen: [124, 58, 237],
};
const P: [RGB, RGB, RGB] = [[37, 99, 235], [225, 29, 72], [124, 58, 237]];

describe("3D scene (Phase 5)", () => {
  it("planeIntersection: the line lies on both planes; parallel planes give null", () => {
    const n1: Vec3 = [1, 2, -1];
    const n2: Vec3 = [0, 1, 3];
    const m = planeIntersection(n1, 4, n2, -2);
    if (!m) throw new Error("expected a line");
    for (const t of [-3, 0, 2.5]) {
      const p: Vec3 = [m.point[0] + t * m.dir[0], m.point[1] + t * m.dir[1], m.point[2] + t * m.dir[2]];
      expect(n1[0] * p[0] + n1[1] * p[1] + n1[2] * p[2]).toBeCloseTo(4, 12);
      expect(n2[0] * p[0] + n2[1] * p[1] + n2[2] * p[2]).toBeCloseTo(-2, 12);
    }
    expect(planeIntersection([1, 1, 1], 1, [2, 2, 2], 5)).toBeNull();
  });

  it("clipLineToBox: ends on the box surface, null when the line misses it", () => {
    const seg = clipLineToBox([0, 0, 0], [1, 2, 0.5], 5);
    if (!seg) throw new Error("expected a segment");
    for (const e of seg) expect(Math.max(...e.map(Math.abs))).toBeCloseTo(5, 12);
    expect(clipLineToBox([0, 9, 0], [1, 0, 0], 5)).toBeNull();
    expect(clipLineToBox([0, 0, 0], [0, 0, 1], 5)).toEqual([[0, 0, -5], [0, 0, 5]]);
  });

  it("a 3×3 system: three translucent planes, three intersection lines, a solution marker and label", () => {
    const A = [[2, 1, -1], [-3, -1, 2], [-2, 1, 2]];
    const s = buildScene3([{ kind: "system", A, b: [8, -11, -3], solution: [2, 3, -1], colors: P }], colors);
    expect(s.meshes.length).toBe(3);
    expect(s.meshes.every((m) => m.opacity !== undefined && m.opacity < 1)).toBe(true);
    expect(s.labels.map((l) => l.text)).toEqual(["x", "y", "z", "(2, 3, -1)"]);
    // Every plane polygon vertex satisfies its equation.
    s.meshes.forEach((m, i) => {
      for (let v = 0; v < m.positions.length; v += 3) {
        expect(A[i][0] * m.positions[v] + A[i][1] * m.positions[v + 1] + A[i][2] * m.positions[v + 2]).toBeCloseTo([8, -11, -3][i], 4);
      }
    });
  });

  it("inconsistent and dependent systems still draw their planes and lines; no marker", () => {
    const none = buildScene3([{ kind: "system", A: [[1, 1, 1], [1, 1, 1], [1, -1, 0]], b: [1, 2, 0], solution: null, colors: P }], colors);
    expect(none.meshes.length).toBe(3);
    expect(none.labels.length).toBe(3);
    const zeroRow = buildScene3([{ kind: "system", A: [[0, 0, 0], [1, 0, 0], [0, 1, 0]], b: [0, 1, 1], solution: null, colors: P }], colors);
    expect(zeroRow.meshes.length).toBe(2);
  });

  it("a 3×3 matrix: the unit cube's image has volume |det A|, shaded by orientation; column vectors labelled", () => {
    const A = [[2, 0, 0], [0, 3, 4], [0, 4, 9]];
    const s = buildScene3([{ kind: "matrix", values: A, color: [0, 0, 0] }], colors);
    expect(Math.abs(meshVolume(s.meshes[0]))).toBeCloseTo(22, 4);
    expect(s.meshes[0].color).toEqual(colors.positive);
    expect(s.labels.map((l) => l.text)).toEqual(["x", "y", "z", "Aî", "Aĵ", "Ak̂"]);
    const reflected = buildScene3([{ kind: "matrix", values: [[1, 0, 0], [0, 1, 0], [0, 0, -1]], color: [0, 0, 0] }], colors);
    expect(reflected.meshes[0].color).toEqual(colors.negative);
    // Box fits the content: the far corner (2, 7, 13) → L = ceil(13 × 1.25) = 17.
    expect(s.half).toBe(17);
  });

  it("sceneHalf keeps at least 5 and fits a far solution", () => {
    expect(sceneHalf([])).toBe(5);
    expect(sceneHalf([{ kind: "system", A: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], b: [40, 0, 0], solution: [40, 0, 0], colors: P }])).toBe(50);
  });

  it("renders within the 3D budget at 800×500 (planes + matrix) and paints the planes", () => {
    const scene = buildScene3(
      [
        { kind: "system", A: [[1, 1, 1], [1, -1, 0], [0, 1, -1]], b: [3, 0, 0], solution: [1, 1, 1], colors: P },
        { kind: "matrix", values: [[1, 0.5, 0], [0, 1, 0.3], [0.2, 0, 1]], color: [0, 0, 0] },
      ],
      colors,
    );
    const cam = { ...DEFAULT_CAMERA, distance: scene.half * 3.2 };
    const t0 = performance.now();
    const f = render(scene.meshes, scene.lines, cam, 800, 500, colors.background);
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(100);
    let painted = 0;
    for (let i = 0; i < f.rgba.length; i += 4) if (f.rgba[i] !== 255 || f.rgba[i + 1] !== 255 || f.rgba[i + 2] !== 255) painted++;
    expect(painted / (800 * 500)).toBeGreaterThan(0.05);
  });
});
