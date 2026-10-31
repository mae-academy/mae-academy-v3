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

const sameCamera = (a: Camera3, b: Camera3) => a.azimuth === b.azimuth && a.elevation === b.elevation && a.distance === b.distance;

/**
 * Which camera the next orbit or zoom step starts from. A step starts from the camera last asked for, not from the last
 * camera the page or the Worker reported, so quick key presses and wheel ticks add up. The page reports its camera back
 * through props one render later, and a render can show an earlier step of ours (a passive effect can run after a newer
 * step was already taken, because wheel events are not discrete React events): that must not take the newer step back.
 * So recent steps are remembered, and a camera in the props that is one of them leaves the ref alone. Only a camera that
 * is none of ours (a loaded link, Reset view) replaces it.
 */
export class CameraSync {
  private ref: Camera3 | null = null;
  /** The last steps asked for, oldest first. */
  private steps: Camera3[] = [];
  /** The previous sync saw a document camera: a later absence means Reset view, not "not stored yet". */
  private hadCamera = false;

  current(): Camera3 | null {
    return this.ref;
  }

  /** A step: the camera asked for. */
  emit(c: Camera3): void {
    this.ref = c;
    this.steps.push(c);
    if (this.steps.length > CAMERA_STEPS_REMEMBERED) this.steps.shift();
  }

  /** The props after a render: the document's camera (undefined: fitted by the Worker) and the Worker frame's camera. */
  sync(documentCamera: Camera3 | undefined, frameCamera: Camera3 | undefined): void {
    if (documentCamera ? this.steps.some((c) => sameCamera(c, documentCamera)) : this.steps.length > 0 && !this.hadCamera) {
      // One of our own steps came back (the ref is that step or a newer one), or our first step is not stored yet.
      if (documentCamera) this.hadCamera = true;
      return;
    }
    this.steps = [];
    this.hadCamera = documentCamera !== undefined;
    this.ref = documentCamera ?? frameCamera ?? null;
  }
}

/** Steps kept to recognise a stale prop: far more than the renders that can be in flight. */
const CAMERA_STEPS_REMEMBERED = 64;
