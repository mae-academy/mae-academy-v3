import { describe, expect, it } from "vitest";
import {
  CAMERA_PRESETS,
  createProjector,
  fitViewport,
  interpolateCamera,
  shortestAngleDelta,
  zoomViewport,
  type Bounds3D,
  type Viewport,
} from "@/components/common/3d/projection";
import { cullLabels } from "@/components/common/3d/overlay";

const unit: Viewport = { width: 200, height: 200, centerX: 100, centerY: 100, scaleX: 10, scaleY: 10 };
const box: Bounds3D = { min: { x: -1, y: -1, z: -2 }, max: { x: 1, y: 1, z: 2 } };

describe("pseudo-3D projection", () => {
  it("front view is the identity on (x, y) and uses z as depth", () => {
    const p = createProjector(CAMERA_PRESETS.front, unit).project(2, 3, 5);
    expect(p.x).toBeCloseTo(120);
    expect(p.y).toBeCloseTo(70);
    expect(p.depth).toBeCloseTo(5);
  });

  it("side view maps depth onto the horizontal axis (x' = −z)", () => {
    const p = createProjector(CAMERA_PRESETS.side, unit).project(7, 1, 2);
    expect(p.x).toBeCloseTo(100 - 20);
    expect(p.y).toBeCloseTo(90);
  });

  it("top-down view maps depth onto the vertical axis (y' = −z) and collapses amplitude", () => {
    const pr = createProjector(CAMERA_PRESETS.top, unit);
    const a = pr.project(1, 0, 3);
    const b = pr.project(1, 5, 3);
    expect(a.x).toBeCloseTo(110);
    expect(a.y).toBeCloseTo(130);
    expect(b.x).toBeCloseTo(a.x);
    expect(b.y).toBeCloseTo(a.y);
  });

  it("projectInto matches project without allocating", () => {
    const pr = createProjector({ theta: 0.7, phi: 0.4 }, unit);
    const out = new Float32Array(2);
    const depth = pr.projectInto(0.3, -0.8, 1.1, out, 0);
    const ref = pr.project(0.3, -0.8, 1.1);
    expect(out[0]).toBeCloseTo(ref.x, 4);
    expect(out[1]).toBeCloseTo(ref.y, 4);
    expect(depth).toBeCloseTo(ref.depth, 5);
  });

  it("auto-fit keeps every corner inside the padded canvas for any camera", () => {
    const padding = 0.09;
    for (const cam of [CAMERA_PRESETS.isometric, CAMERA_PRESETS.front, CAMERA_PRESETS.side, CAMERA_PRESETS.top, { theta: 2.4, phi: -0.9 }]) {
      const vp = fitViewport(box, cam, 900, 480, { padding });
      const pr = createProjector(cam, vp);
      for (let i = 0; i < 8; i++) {
        const p = pr.project(i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 2 : -2);
        expect(p.x).toBeGreaterThanOrEqual(900 * padding - 1e-6);
        expect(p.x).toBeLessThanOrEqual(900 * (1 - padding) + 1e-6);
        expect(p.y).toBeGreaterThanOrEqual(480 * padding - 1e-6);
        expect(p.y).toBeLessThanOrEqual(480 * (1 - padding) + 1e-6);
        expect(p.visible).toBe(true);
      }
    }
  });

  it("zoom scales about the canvas centre", () => {
    const vp = zoomViewport({ ...unit, centerX: 120 }, 2);
    expect(vp.scaleX).toBe(20);
    expect(vp.centerX).toBe(140);
  });

  it("camera tweening takes the shortest yaw path and lands exactly on the target", () => {
    expect(shortestAngleDelta(3, -3)).toBeCloseTo(2 * Math.PI - 6);
    const end = interpolateCamera({ theta: 0, phi: 0 }, CAMERA_PRESETS.side, 1);
    expect(end.theta).toBeCloseTo(CAMERA_PRESETS.side.theta);
    const mid = interpolateCamera({ theta: 0, phi: 0 }, { theta: 1, phi: 1 }, 0.5);
    expect(mid.theta).toBeCloseTo(0.5);
  });
});

describe("overlay label culling", () => {
  it("keeps the higher-priority label when two collide and drops off-canvas labels", () => {
    const shown = cullLabels(
      [
        { id: "low", point: { x: 50, y: 50, depth: 0, visible: true }, width: 40, height: 16, anchor: "center", priority: 1 },
        { id: "high", point: { x: 55, y: 52, depth: 0, visible: true }, width: 40, height: 16, anchor: "center", priority: 9 },
        { id: "far", point: { x: 150, y: 50, depth: 0, visible: true }, width: 40, height: 16, anchor: "center", priority: 0 },
        { id: "off", point: { x: 199, y: 50, depth: 0, visible: true }, width: 40, height: 16, anchor: "center", priority: 5 },
      ],
      200,
      100,
    );
    expect([...shown].sort()).toEqual(["far", "high"]);
  });
});
