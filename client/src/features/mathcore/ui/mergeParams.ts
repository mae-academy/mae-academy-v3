/**
 * Takes the engine Worker's document into the page's (ADR-9: the page holds the one Graph IR). The Worker decides
 * which sliders exist (it creates and removes them); the page keeps its own ranges, steps and animation, which the
 * user may have edited after the request was sent. Values come from the Worker only for a `load`: retyping `a = 2`
 * as `a = 5` moves the slider, a drag does not. A value outside the page's range widens the range, so the document
 * always stays valid (min ≤ value ≤ max).
 */
import type { GraphIR, Param } from "@shared/mathcore/ir/types";

export function mergeParams(page: GraphIR, worker: GraphIR, cause: "load" | "param" | "view"): GraphIR {
  const next: Record<string, Param> = {};
  for (const [name, theirs] of Object.entries(worker.params)) {
    const mine = page.params[name];
    if (!mine) {
      next[name] = theirs;
      continue;
    }
    const value = cause === "load" ? theirs.value : mine.value;
    next[name] = { ...mine, value, min: Math.min(mine.min, value), max: Math.max(mine.max, value) };
  }
  return JSON.stringify(next) === JSON.stringify(page.params) ? page : { ...page, params: next };
}
