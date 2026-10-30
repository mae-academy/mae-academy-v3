import { describe, expect, it } from "vitest";
import type { EngineRequest } from "./protocol";
import { superseded } from "./requestQueue";

const view = { viewport: { xmin: -1, xmax: 1, ymin: -1, ymax: 1, aspect: "equal" as const }, width: 10, height: 10, quality: "full" as const };
const load: EngineRequest = { type: "load", seq: 9, graph: { version: "1.0", viewport: view.viewport, params: {}, items: [], view: { mode: "2d", grid: true, showSteps: false, locale: "en" } }, parsed: {}, view };
const v: EngineRequest = { type: "view", seq: 2, view };
const pa: EngineRequest = { type: "param", seq: 3, name: "a", value: 1, view };
const pb: EngineRequest = { type: "param", seq: 4, name: "b", value: 1, view };
const tr: EngineRequest = { type: "trace", seq: 1, id: "f", x: 0 };
const bench: EngineRequest = { type: "bench", seq: 5 };

describe("engine request queue", () => {
  it("a later load replaces loads, views and slider moves", () => {
    expect(superseded(load, [load])).toBe(true);
    expect(superseded(v, [load])).toBe(true);
    expect(superseded(pa, [load])).toBe(true);
  });
  it("a later view replaces only views; a later param replaces only the same slider", () => {
    expect(superseded(v, [v])).toBe(true);
    expect(superseded(pa, [v])).toBe(false);
    expect(superseded(pa, [pa])).toBe(true);
    expect(superseded(pa, [pb])).toBe(false);
  });
  it("never skips a trace or a benchmark, and nothing is skipped with an empty queue", () => {
    expect(superseded(tr, [load, v, pa])).toBe(false);
    expect(superseded(bench, [load])).toBe(false);
    expect(superseded(load, [])).toBe(false);
  });
});
