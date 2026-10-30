import { describe, expect, it } from "vitest";
import { moveCamera } from "./camera";

describe("3D orbit camera", () => {
  it("orbits and zooms within the IR limits", () => {
    const c = { azimuth: 1, elevation: 0.4, distance: 20 };
    expect(moveCamera(c, 0.5, 0.1)).toEqual({ azimuth: 1.5, elevation: 0.5, distance: 20 });
    expect(moveCamera(c, 0, 5).elevation).toBe(1.5);
    expect(moveCamera(c, 0, -5).elevation).toBe(-1.5);
    // Zoom limits are relative to the box half-size: 0.05·L to 200·L.
    expect(moveCamera(c, 0, 0, 1000, 5).distance).toBe(1000);
    expect(moveCamera(c, 0, 0, 0.001, 5).distance).toBe(0.25);
    // A large scene (L = 125, fitted far beyond 200) can still be orbited and zoomed out.
    expect(moveCamera({ ...c, distance: 600 }, 0.01, 0, 1.2, 125).distance).toBeCloseTo(720, 9);
  });
});
