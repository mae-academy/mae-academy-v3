import { ComputeEngine } from "@cortex-js/compute-engine";
import { describe, expect, it } from "vitest";
import { GraphEngine } from "../engine/graphEngine";
import { emptyGraph } from "../ir/types";
import type { Frame3Colors } from "./frame";
import { fitDistance, renderFrame3 } from "./frame";
import { projector, DEFAULT_CAMERA } from "./raster";
import type { Vec3 } from "./raster";

const ce = new ComputeEngine();
const parser = (latex: string): unknown => ce.parse(latex, { form: "raw" }).json;
const engine = (latex: string[], hidden: number[] = []) =>
  new GraphEngine(parser, { ...emptyGraph(), items: latex.map((l, i) => ({ id: `i${i}`, latex: l, ...(hidden.includes(i) ? { style: { hidden: true } } : {}) })) });
const colors: Frame3Colors = {
  background: [0, 0, 0], axis: [100, 100, 100], box: [60, 60, 60], positive: [37, 99, 235], negative: [225, 29, 72], arrow: [255, 255, 255], eigen: [124, 58, 237],
  planes: [[37, 99, 235], [225, 29, 72], [124, 58, 237]], items: { i0: [10, 200, 10] },
};
const painted = (rgba: Uint8ClampedArray) => {
  let n = 0;
  for (let i = 0; i < rgba.length; i += 4) if (rgba[i] || rgba[i + 1] || rgba[i + 2]) n++;
  return n / (rgba.length / 4);
};

describe("3D frame of a document (Phase 5)", () => {
  it("a 3×3 system: planes painted, solution label projected inside the canvas, camera fitted", () => {
    const e = engine(["\\begin{cases}x+y+z=3\\\\x-y=0\\\\y-z=0\\end{cases}"]);
    const f = renderFrame3(e, { width: 400, height: 300, quality: "full" }, colors);
    expect([f.width, f.height]).toEqual([400, 300]);
    expect(painted(f.rgba)).toBeGreaterThan(0.2);
    const sol = f.labels.find((l) => l.text === "(1, 1, 1)");
    expect(sol).toBeDefined();
    expect(sol && sol.x > 0 && sol.x < 400 && sol.y > 0 && sol.y < 300).toBe(true);
    expect(f.camera.distance).toBeCloseTo(fitDistance(5, 400, 300), 12);
    expect(f.half).toBe(5);
  });

  it("drag frames are half size; a given camera is used as is", () => {
    const e = engine(["M=\\begin{bmatrix}1&0&0\\\\0&2&0\\\\0&0&3\\end{bmatrix}"]);
    const camera = { azimuth: 0.3, elevation: -0.2, distance: 30 };
    const f = renderFrame3(e, { width: 400, height: 300, quality: "drag", camera }, colors);
    expect([f.width, f.height]).toEqual([200, 150]);
    expect(f.camera).toEqual(camera);
    expect(f.labels.map((l) => l.text)).toEqual(["x", "y", "z", "Mî", "Mĵ", "Mk̂"]);
  });

  it("2D items, 2×2 matrices, errors and hidden items add nothing but the axes", () => {
    const e = engine(["y=x^2", "M=\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}", "\\begin{cases}x^2+y+z=1\\\\x=0\\\\y=0\\end{cases}", "\\begin{cases}x=1\\\\y=2\\\\z=3\\end{cases}"], [3]);
    const f = renderFrame3(e, { width: 200, height: 150, quality: "full" }, colors);
    expect(f.labels.map((l) => l.text)).toEqual(["x", "y", "z"]);
  });

  it("an inconsistent system draws its planes and no solution label", () => {
    const e = engine(["\\begin{cases}x+y+z=1\\\\x+y+z=2\\\\x-y=0\\end{cases}"]);
    const f = renderFrame3(e, { width: 300, height: 200, quality: "full" }, colors);
    expect(f.labels.length).toBe(3);
    expect(painted(f.rgba)).toBeGreaterThan(0.2);
  });
});

describe("Phase 5 review regressions", () => {
  it("the fitted camera shows the whole box on wide, square and narrow canvases", () => {
    for (const [w, h] of [[1600, 1000], [600, 600], [360, 500], [300, 600]]) {
      const d = fitDistance(5, w, h);
      const project = projector({ ...DEFAULT_CAMERA, azimuth: 1.1, elevation: 0.45, distance: d, target: [0, 0, 0] }, w, h);
      for (let i = 0; i < 8; i++) {
        const c: Vec3 = [i & 1 ? 5 : -5, i & 2 ? 5 : -5, i & 4 ? 5 : -5];
        const p = project(c);
        expect(p && p[0] >= 0 && p[0] <= w && p[1] >= 0 && p[1] <= h, `${w}×${h} corner ${i}`).toBe(true);
      }
    }
  });

  it("a camera inside the box still draws the planes in front of it (near-plane clipping)", () => {
    const e = engine(["\\begin{cases}x+y+z=3\\\\x-y=0\\\\y-z=0\\end{cases}"]);
    for (const distance of [22, 5, 2, 0.5]) {
      const f = renderFrame3(e, { width: 300, height: 200, quality: "full", camera: { azimuth: 1.1, elevation: 0.45, distance } }, colors);
      expect(painted(f.rgba), `distance ${distance}`).toBeGreaterThan(0.2);
    }
  });

  it("a large scene keeps a finite fitted camera; frame sizes 0 or NaN give a 1×1 frame", () => {
    const big = engine(["M=\\begin{bmatrix}100&0&0\\\\0&1&0\\\\0&0&1\\end{bmatrix}"]);
    const f = renderFrame3(big, { width: 300, height: 200, quality: "full" }, colors);
    expect(f.half).toBe(125);
    expect(Number.isFinite(f.camera.distance)).toBe(true);
    const tiny = renderFrame3(big, { width: 0, height: Number.NaN, quality: "full" }, colors);
    expect([tiny.width, tiny.height]).toEqual([1, 1]);
  });

  it("a 3×3 complex pair shows its rotation: an arc label with θ", () => {
    const e = engine(["R=\\begin{bmatrix}0&-1&0\\\\1&0&0\\\\0&0&2\\end{bmatrix}"]);
    const f = renderFrame3(e, { width: 300, height: 200, quality: "full" }, colors);
    expect(f.labels.some((l) => l.text === "θ = 90°")).toBe(true);
  });
});

describe("A5 and A7: camera limits and fit follow the scene, not absolute numbers", () => {
  const big = (digits: number) => "1" + "0".repeat(digits);
  for (const digits of [20, 39, 45, 100]) {
    it(`a scene of size 1e${digits} (past the Float32 range when 39 or more) is drawn, labelled in world units and fitted`, () => {
      const e = engine([`\\begin{cases}x=${big(digits)}\\\\y=${big(digits)}\\\\z=${big(digits)}\\end{cases}`, `M=\\begin{bmatrix}${big(digits)}&0&0\\\\0&${big(digits)}&0\\\\0&0&${big(digits)}\\end{bmatrix}`]);
      const f = renderFrame3(e, { width: 400, height: 300, quality: "full" }, colors);
      expect(f.half).toBeGreaterThan(10 ** digits);
      expect(Number.isFinite(f.camera.distance)).toBe(true);
      expect(painted(f.rgba), "painted share").toBeGreaterThan(0.05);
      const sol = f.labels.find((l) => l.text.startsWith("("));
      const v = String(Number((10 ** digits).toPrecision(4)));
      expect(sol?.text).toBe(`(${v}, ${v}, ${v})`);
      expect(sol && sol.x > 0 && sol.x < 400 && sol.y > 0 && sol.y < 300).toBe(true);
    });
  }
  it("the axis labels of the fitted view are inside a wide and a tall canvas", () => {
    const e = engine(["M=\\begin{bmatrix}2&0&0\\\\0&1&0.5\\\\0&0.5&1\\end{bmatrix}"]);
    for (const [w, h] of [[1600, 500], [500, 1600]]) {
      const f = renderFrame3(e, { width: w, height: h, quality: "full" }, colors);
      for (const name of ["x", "y", "z"]) {
        const l = f.labels.find((q) => q.text === name);
        expect(l && l.x > 0 && l.x < w && l.y > 0 && l.y < h, `${w}×${h} label ${name}`).toBe(true);
      }
    }
  });
});
