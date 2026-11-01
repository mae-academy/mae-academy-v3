/**
 * Point-on-curve and tracing (STEPS.md §4 Interaction): the nearest point of a sampled curve to the pointer.
 */
import type { Polyline } from "./adaptive";

export interface ClosestPoint {
  segment: number;
  x: number;
  y: number;
  distance: number;
}

/** Nearest point on the polylines to (px, py), using the given x/y scale so distance is measured in pixels. */
export function closestPoint(segments: readonly Polyline[], px: number, py: number, sx = 1, sy = 1): ClosestPoint | null {
  let best: ClosestPoint | null = null;
  for (let s = 0; s < segments.length; s++) {
    const p = segments[s];
    if (p.length === 2) {
      const d = Math.hypot((p[0] - px) * sx, (p[1] - py) * sy);
      if (!best || d < best.distance) best = { segment: s, x: p[0], y: p[1], distance: d };
      continue;
    }
    for (let i = 0; i + 3 < p.length; i += 2) {
      const ax = p[i];
      const ay = p[i + 1];
      const bx = p[i + 2];
      const by = p[i + 3];
      const dx = (bx - ax) * sx;
      const dy = (by - ay) * sy;
      const len2 = dx * dx + dy * dy;
      let u = len2 === 0 ? 0 : (((px - ax) * sx) * dx + ((py - ay) * sy) * dy) / len2;
      u = Math.max(0, Math.min(1, u));
      const cx = ax + u * (bx - ax);
      const cy = ay + u * (by - ay);
      const d = Math.hypot((cx - px) * sx, (cy - py) * sy);
      if (!best || d < best.distance) best = { segment: s, x: cx, y: cy, distance: d };
    }
  }
  return best;
}
