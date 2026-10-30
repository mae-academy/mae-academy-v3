/** Orbit camera of the 3D view (Phase 5). */
import type { Camera3 } from "@shared/mathcore/ir/types";
import { CAMERA_MAX_RELATIVE, CAMERA_MIN_RELATIVE } from "@shared/mathcore/constants";
import { CAMERA_LIMITS } from "@shared/mathcore/ir/types";

/**
 * Camera after an orbit (azimuth, elevation change) or a zoom (distance factor). Elevation stays within
 * CAMERA_LIMITS; distance within [CAMERA_MIN_RELATIVE, CAMERA_MAX_RELATIVE] × the scene's box half-size `half`.
 */
export function moveCamera(c: Camera3, dAzimuth: number, dElevation: number, distanceFactor = 1, half = 1): Camera3 {
  return {
    azimuth: c.azimuth + dAzimuth,
    elevation: Math.max(-CAMERA_LIMITS.elevation, Math.min(CAMERA_LIMITS.elevation, c.elevation + dElevation)),
    distance: Math.max(CAMERA_MIN_RELATIVE * half, Math.min(CAMERA_MAX_RELATIVE * half, c.distance * distanceFactor)),
  };
}
