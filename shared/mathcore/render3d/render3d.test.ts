import { describe, expect, it } from "vitest";
import { meshVolume, parallelepipedMesh, planeInCube, polygonMesh } from "./geometry";
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
