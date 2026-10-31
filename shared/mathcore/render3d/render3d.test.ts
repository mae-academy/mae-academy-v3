import { describe, expect, it } from "vitest";
import { meshVolume, parallelepipedMesh, planeInCube, polygonMesh } from "./geometry";
import { buildScene3 } from "./scene";
import type { Camera, Mesh } from "./raster";
import { DEFAULT_CAMERA, projector, render, surfaceMesh } from "./raster";

const BG: [number, number, number] = [0, 0, 0];
const RED: [number, number, number] = [200, 0, 0];
const BLUE: [number, number, number] = [0, 0, 200];
const pixel = (f: { rgba: Uint8ClampedArray; width: number }, x: number, y: number) => Array.from(f.rgba.slice(4 * (y * f.width + x), 4 * (y * f.width + x) + 3));

describe("camera and projection", () => {
  it("projects the target to the centre of the screen", () => {
    const p = projector(DEFAULT_CAMERA, 200, 100)([0, 0, 0]);
    expect(p?.[0]).toBeCloseTo(100, 9);
    expect(p?.[1]).toBeCloseTo(50, 9);
    expect(p?.[2]).toBeCloseTo(DEFAULT_CAMERA.distance, 9);
  });
  it("+z is up on screen and points behind the camera are rejected", () => {
    const pr = projector(DEFAULT_CAMERA, 200, 100);
    expect((pr([0, 0, 1]) as number[])[1]).toBeLessThan(50);
    const behind: Camera = { ...DEFAULT_CAMERA, azimuth: 0, elevation: 0, distance: 5 };
    expect(projector(behind, 200, 100)([10, 0, 0])).toBeNull();
  });
});

describe("software rasterizer", () => {
  const cam: Camera = { ...DEFAULT_CAMERA, azimuth: 0, elevation: Math.PI / 2 - 1e-6, distance: 10 };
  const quad = (z: number, color: [number, number, number]): Mesh => ({
    positions: Float32Array.of(-1, -1, z, 1, -1, z, 1, 1, z, -1, 1, z),
    indices: Uint32Array.of(0, 1, 2, 0, 2, 3),
    color,
  });
  it("fills a triangle and leaves the background elsewhere", () => {
    const f = render([quad(0, RED)], [], cam, 100, 100, BG);
    expect(pixel(f, 50, 50)[0]).toBeGreaterThan(100);
    expect(pixel(f, 2, 2)).toEqual([0, 0, 0]);
    expect(f.triangles).toBe(2);
  });
  it("the z-buffer keeps the nearer surface whatever the drawing order", () => {
    for (const order of [[quad(0, RED), quad(1, BLUE)], [quad(1, BLUE), quad(0, RED)]]) {
      const f = render(order, [], cam, 100, 100, BG);
      const [r, , b] = pixel(f, 50, 50);
      expect(b).toBeGreaterThan(r); // the blue quad at z = 1 is closer to a camera looking down
    }
  });
  it("blends a translucent mesh without hiding what is behind", () => {
    const f = render([{ ...quad(1, BLUE), opacity: 0.5 }, quad(0, RED)], [], cam, 100, 100, BG);
    const [r, , b] = pixel(f, 50, 50);
    expect(r).toBeGreaterThan(30);
    expect(b).toBeGreaterThan(30);
  });
  it("draws depth-tested lines in front of the surface they lie on", () => {
    const f = render([quad(0, RED)], [{ from: [-1, 0, 0], to: [1, 0, 0], color: [0, 255, 0] }], cam, 100, 100, BG);
    const greens = Array.from({ length: 100 }, (_, y) => pixel(f, 50, y)[1]).filter((g) => g === 255);
    expect(greens.length).toBeGreaterThan(0);
  });
  it("is deterministic and stays inside the frame for off-screen geometry", () => {
    const far = render([quad(0, RED)], [], { ...cam, distance: 0.5 }, 64, 64, BG);
    expect(far.rgba.length).toBe(64 * 64 * 4);
    const a = render([surfaceMesh((x, y) => Math.sin(x) * Math.cos(y), -3, 3, -3, 3, 20, RED)], [], DEFAULT_CAMERA, 80, 60, BG);
    const b = render([surfaceMesh((x, y) => Math.sin(x) * Math.cos(y), -3, 3, -3, 3, 20, RED)], [], DEFAULT_CAMERA, 80, 60, BG);
    expect(a.rgba).toEqual(b.rgba);
  });
});

describe("meshes", () => {
  it("an n × n surface has 2n² triangles; undefined cells are skipped", () => {
    expect(surfaceMesh((x, y) => x + y, 0, 1, 0, 1, 80, RED).indices.length / 3).toBe(12_800);
    const holed = surfaceMesh((x, y) => Math.sqrt(x * y), -1, 1, -1, 1, 10, RED);
    expect(holed.indices.length / 3).toBeLessThan(200);
  });
  it("the parallelepiped of A has signed volume det A (closed, consistently wound mesh)", () => {
    const A = [[2, 1, 0], [0, 1, 1], [1, 0, 3]];
    const det = 2 * (1 * 3 - 1 * 0) - 1 * (0 * 3 - 1 * 1) + 0;
    expect(meshVolume(parallelepipedMesh(A, RED))).toBeCloseTo(det, 5);
    expect(meshVolume(parallelepipedMesh([[1, 0, 0], [0, 1, 0], [0, 0, 1]], RED))).toBeCloseTo(1, 6);
    // A reflection reverses orientation: negative volume.
    expect(meshVolume(parallelepipedMesh([[-1, 0, 0], [0, 1, 0], [0, 0, 1]], RED))).toBeCloseTo(-1, 6);
  });
  it("a plane clipped to the cube is a convex polygon on the plane and inside the cube", () => {
    const n: [number, number, number] = [1, 2, 3];
    const poly = planeInCube(n, 1, 2);
    expect(poly.length).toBeGreaterThanOrEqual(3);
    expect(poly.length).toBeLessThanOrEqual(6);
    for (const p of poly) {
      expect(n[0] * p[0] + n[1] * p[1] + n[2] * p[2]).toBeCloseTo(1, 5);
      for (const c of p) expect(Math.abs(c)).toBeLessThanOrEqual(2 + 1e-9);
    }
    // z = 0 through the cube is the full square: 4 vertices, area 16.
    const sq = planeInCube([0, 0, 1], 0, 2);
    expect(sq).toHaveLength(4);
    expect(polygonMesh(sq, RED).indices.length / 3).toBe(2);
    expect(planeInCube([0, 0, 1], 5, 2)).toEqual([]);
  });
});

describe("A1: the near plane does not cut surfaces apart when the camera is close to (or inside) them", () => {
  const floor = (z: number, R: number, opacity: number): Mesh => ({
    positions: Float32Array.of(-R, -R, z, R, -R, z, R, R, z, -R, R, z),
    indices: Uint32Array.of(0, 1, 2, 0, 2, 3),
    color: [255, 255, 255],
    opacity,
  });
  /** Pixels whose ray points down (so it meets the floor) but that stayed background. */
  function holes(distance: number, offset: number, opacity: number): { holes: number; expected: number } {
    const el = 0.45;
    const W = 120;
    const H = 90;
    const cam: Camera = { azimuth: 1.1, elevation: el, distance, target: [0, 0, 0], fov: DEFAULT_CAMERA.fov };
    const eyeZ = distance * Math.sin(el);
    const f = render([floor(eyeZ - offset, 1e4, opacity)], [], cam, W, H, BG);
    // Ray of pixel (x, y): forward + px·right + py·up; its z component is cos(el)·py − sin(el) (fwd_z = −sin el, up_z = cos el).
    const focal = H / 2 / Math.tan(cam.fov / 2);
    let missing = 0;
    let expected = 0;
    for (let y = 0; y < H; y++) {
      const dirZ = Math.cos(el) * (-(y + 0.5 - H / 2) / focal) - Math.sin(el);
      if (dirZ > -1e-3) continue; // at or above the horizon: the floor is not seen
      for (let x = 0; x < W; x++) {
        expected++;
        if (pixel(f, x, y)[0] === 0) missing++;
      }
    }
    return { holes: missing, expected };
  }
  for (const opacity of [1, 0.5]) {
    it(`a floor 2e-4 of the camera distance below the eye is drawn on every downward pixel (opacity ${opacity})`, () => {
      for (const distance of [20, 1, 0.25]) {
        const r = holes(distance, 2e-4 * distance, opacity);
        expect(r.expected).toBeGreaterThan(1000);
        expect(r.holes, `distance ${distance}`).toBe(0);
      }
    });
  }
});

describe("A6: lines are composited with translucent surfaces in depth order", () => {
  const cam: Camera = { ...DEFAULT_CAMERA, azimuth: 0, elevation: Math.PI / 2 - 1e-6, distance: 10 };
  const glass = (z: number, color: [number, number, number]): Mesh => ({
    positions: Float32Array.of(-1, -1, z, 1, -1, z, 1, 1, z, -1, 1, z),
    indices: Uint32Array.of(0, 1, 2, 0, 2, 3),
    color,
    opacity: 0.5,
  });
  const line = (z: number) => ({ from: [-0.5, 0, z] as [number, number, number], to: [0.5, 0, z] as [number, number, number], color: [255, 255, 255] as [number, number, number] });
  const near = (got: number[], want: number[]) => got.forEach((v, i) => expect(Math.abs(v - want[i])).toBeLessThanOrEqual(2));

  it("a line behind two translucent planes is tinted by both (camera above: higher z is nearer)", () => {
    const f = render([glass(1, [200, 0, 0]), glass(2, [0, 0, 200])], [line(0)], cam, 101, 101, BG);
    // white · 0.5 + red 100 → (227, 127, 127); · 0.5 + blue 100 → (114, 64, 164)
    near(pixel(f, 50, 50), [114, 64, 164]);
  });
  it("a line between two translucent planes is tinted by the nearer one only", () => {
    const f = render([glass(1, [200, 0, 0]), glass(-1, [0, 0, 200])], [line(0)], cam, 101, 101, BG);
    // blue under the line is covered by the line; red over it: (227, 128, 128)
    near(pixel(f, 50, 50), [227, 128, 128]);
  });
  it("the order of the meshes in the list does not matter", () => {
    const a = render([glass(1, [200, 0, 0]), glass(2, [0, 0, 200])], [line(0)], cam, 101, 101, BG);
    const b = render([glass(2, [0, 0, 200]), glass(1, [200, 0, 0])], [line(0)], cam, 101, 101, BG);
    expect(a.rgba).toEqual(b.rgba);
  });
});

describe("B9: the row blend equals the per-triangle blend", () => {
  it("a translucent-only frame (row blend) matches the same frame drawn per triangle (forced by an opaque triangle far away)", () => {
    const C: [number, number, number] = [40, 40, 40];
    const scene = buildScene3(
      [
        { kind: "system", A: [[1, 1, 1], [1, -1, 0], [0, 1, -1]], b: [3, 0, 0], solution: [1, 1, 1], colors: [[37, 99, 235], [225, 29, 72], [124, 58, 237]] },
        { kind: "matrix", values: [[1, 0.5, 0], [0, 1, 0.3], [0.2, 0, 1]], color: [0, 0, 0] },
      ],
      { background: [255, 255, 255], axis: C, box: C, positive: [37, 99, 235], negative: [225, 29, 72], arrow: C, eigen: C },
    );
    // An opaque triangle behind the camera: it switches the renderer to the per-triangle path but covers nothing.
    const hidden: Mesh = { positions: Float32Array.of(0, 0, 1e6, 1, 0, 1e6, 0, 1, 1e6), indices: Uint32Array.of(0, 1, 2), color: [0, 0, 0] };
    for (const distance of [scene.half * 3.2, scene.half * 0.8]) {
      const cam = { ...DEFAULT_CAMERA, distance };
      const rows = render(scene.meshes, scene.lines, cam, 320, 200, [255, 255, 255]);
      const tri = render([...scene.meshes, hidden], scene.lines, cam, 320, 200, [255, 255, 255]);
      let worst = 0;
      for (let i = 0; i < rows.rgba.length; i++) worst = Math.max(worst, Math.abs(rows.rgba[i] - tri.rgba[i]));
      expect(worst, `distance ${distance}`).toBeLessThanOrEqual(3);
    }
  });
});

describe("B11: 3D lines are never lost to thinness (measured; rendering unchanged)", () => {
  it("a line that projects to a fraction of a pixel still lights at least two pixels; a 0.2-unit line lights more", () => {
    const cam: Camera = { ...DEFAULT_CAMERA, distance: 20, target: [0, 0, 0] };
    const lit = (len: number) => {
      const f = render([], [{ from: [0, 0, 0], to: [len, 0, 0], color: [255, 0, 0] }], cam, 400, 300, BG);
      let n = 0;
      for (let i = 0; i < f.rgba.length; i += 4) if (f.rgba[i] > 0) n++;
      return n;
    };
    expect(lit(1e-3)).toBeGreaterThanOrEqual(2);
    expect(lit(0.01)).toBeGreaterThanOrEqual(2);
    expect(lit(0.2)).toBeGreaterThan(lit(0.01));
  });
});
