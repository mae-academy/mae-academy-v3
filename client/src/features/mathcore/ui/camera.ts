/** Orbit camera of the 3D view (Phase 5). */
import type { Camera3 } from "@shared/mathcore/ir/types";
import { CAMERA_LIMITS } from "@shared/mathcore/ir/types";

/** Camera after an orbit (azimuth, elevation change) or a zoom (distance factor), within CAMERA_LIMITS. */
export function moveCamera(c: Camera3, dAzimuth: number, dElevation: number, distanceFactor = 1): Camera3 {
  return {
    azimuth: c.azimuth + dAzimuth,
    elevation: Math.max(-CAMERA_LIMITS.elevation, Math.min(CAMERA_LIMITS.elevation, c.elevation + dElevation)),
    distance: Math.max(CAMERA_LIMITS.distanceMin, Math.min(CAMERA_LIMITS.distanceMax, c.distance * distanceFactor)),
  };
}
