import { describe, expect, it } from "vitest";
import { moveCamera } from "./camera";

describe("3D orbit camera", () => {
  it("orbits and zooms within the IR limits", () => {
    const c = { azimuth: 1, elevation: 0.4, distance: 20 };
    expect(moveCamera(c, 0.5, 0.1)).toEqual({ azimuth: 1.5, elevation: 0.5, distance: 20 });
    expect(moveCamera(c, 0, 5).elevation).toBe(1.5);
    expect(moveCamera(c, 0, -5).elevation).toBe(-1.5);
    expect(moveCamera(c, 0, 0, 1000).distance).toBe(200);
    expect(moveCamera(c, 0, 0, 0.001).distance).toBe(2);
  });
});
