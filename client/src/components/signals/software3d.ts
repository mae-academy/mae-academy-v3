/**
 * MAE Academy / Signals & Systems — shared software (Canvas 2D) 3D projection engine.
 * Replaces the WebGL-backed Plotly GL3D surfaces: a pure rotate-then-project pipeline
 * that renders identically on every device, with zero GPU/WebGL dependency.
 */

export type Camera3D = { theta: number; phi: number; scale: number };

export type Projected = { u: number; v: number; depth: number };

/**
 * Rotates (x,y,z) by the camera's azimuth (theta) and elevation (phi), then projects to
 * screen-space (u,v) around (centerX,centerY). `depth` is a painter's-algorithm sort key,
 * not a true screen coordinate — larger depth means nearer the camera.
 */
export function project3D(x: number, y: number, z: number, camera: Camera3D, centerX: number, centerY: number): Projected {
  const cosT = Math.cos(camera.theta);
  const sinT = Math.sin(camera.theta);
  const xRot = x * cosT - z * sinT;
  const zRot = x * sinT + z * cosT;
  const cosP = Math.cos(camera.phi);
  const sinP = Math.sin(camera.phi);
  const yRot = y * cosP - zRot * sinP;
  const depth = y * sinP + zRot * cosP;
  return { u: centerX + xRot * camera.scale, v: centerY - yRot * camera.scale, depth };
}

export const DEFAULT_CAMERA: Camera3D = { theta: -0.8, phi: 0.5, scale: 1 };
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 2.6;
/** Clamped so the camera can orbit fully around azimuth but never flip past the poles. */
export const MAX_ELEVATION = 1.45;

/** Linearly interpolates through a multi-stop hex color ramp; t is clamped to [0,1]. */
export function rampColor(stops: readonly string[], t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  const scaled = clamped * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.floor(scaled));
  const local = scaled - index;
  const a = hexToRgb(stops[index]);
  const b = hexToRgb(stops[index + 1]);
  const r = Math.round(a.r + (b.r - a.r) * local);
  const g = Math.round(a.g + (b.g - a.g) * local);
  const bch = Math.round(a.b + (b.b - a.b) * local);
  return `rgb(${r}, ${g}, ${bch})`;
}
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  return { r: parseInt(clean.slice(0, 2), 16), g: parseInt(clean.slice(2, 4), 16), b: parseInt(clean.slice(4, 6), 16) };
}
