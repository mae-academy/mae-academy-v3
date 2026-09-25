/**
 * Imperative DOM placement for overlay badges: positions are written straight to `style.transform`
 * from the render loop, so rotating the camera never re-renders React or re-typesets KaTeX.
 */
import type { ScreenPoint } from "./projection";

export type OverlayAnchor = "center" | "above" | "below" | "left" | "right";

const ANCHOR_TRANSFORM: Record<OverlayAnchor, string> = {
  center: "translate(-50%, -50%)",
  above: "translate(-50%, -100%)",
  below: "translate(-50%, 0)",
  left: "translate(-100%, -50%)",
  right: "translate(0, -50%)",
};

export function placeOverlay(el: HTMLElement | null, point: { x: number; y: number }, anchor: OverlayAnchor = "center", show = true): void {
  if (!el) return;
  if (!show) {
    if (el.style.visibility !== "hidden") el.style.visibility = "hidden";
    return;
  }
  el.style.transform = `translate3d(${point.x.toFixed(1)}px, ${point.y.toFixed(1)}px, 0) ${ANCHOR_TRANSFORM[anchor]}`;
  if (el.style.visibility !== "visible") el.style.visibility = "visible";
}

export interface LabelCandidate {
  id: string;
  point: ScreenPoint;
  width: number;
  height: number;
  anchor: OverlayAnchor;
  priority: number;
}

function anchorRect(c: LabelCandidate) {
  const { x, y } = c.point;
  const w = c.width;
  const h = c.height;
  switch (c.anchor) {
    case "above": return { l: x - w / 2, t: y - h, r: x + w / 2, b: y };
    case "below": return { l: x - w / 2, t: y, r: x + w / 2, b: y + h };
    case "left": return { l: x - w, t: y - h / 2, r: x, b: y + h / 2 };
    case "right": return { l: x, t: y - h / 2, r: x + w, b: y + h / 2 };
    default: return { l: x - w / 2, t: y - h / 2, r: x + w / 2, b: y + h / 2 };
  }
}

/**
 * Greedy collision culling: highest priority first, a label is kept only if its box (plus `gap`)
 * clears every label already kept and lies inside the canvas. Returns the ids to show.
 */
export function cullLabels(candidates: ReadonlyArray<LabelCandidate>, width: number, height: number, gap = 3): Set<string> {
  const kept: Array<{ l: number; t: number; r: number; b: number }> = [];
  const shown = new Set<string>();
  const sorted = [...candidates].sort((a, b) => b.priority - a.priority);
  for (const c of sorted) {
    const box = anchorRect(c);
    if (box.l < 2 || box.t < 2 || box.r > width - 2 || box.b > height - 2) continue;
    const overlaps = kept.some((k) => box.l < k.r + gap && box.r + gap > k.l && box.t < k.b + gap && box.b + gap > k.t);
    if (overlaps) continue;
    kept.push(box);
    shown.add(c.id);
  }
  return shown;
}
