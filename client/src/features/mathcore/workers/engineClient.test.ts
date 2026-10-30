import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkerLike } from "./engineClient";
import { createEngineClient } from "./engineClient";
import type { EngineRequest, EngineResponse } from "./protocol";

class FakeWorker implements WorkerLike {
  sent: EngineRequest[] = [];
  terminated = false;
  onmessage: ((event: { data: EngineResponse }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  postMessage(m: EngineRequest) {
    this.sent.push(m);
  }
  terminate() {
    this.terminated = true;
  }
  reply(data: EngineResponse) {
    this.onmessage?.({ data });
  }
}

const view = { viewport: { xmin: -1, xmax: 1, ymin: -1, ymax: 1, aspect: "equal" as const }, width: 100, height: 100, quality: "full" as const };
const result = (seq: number): EngineResponse => ({ type: "result", seq, graph: { version: "1.0", viewport: view.viewport, params: {}, items: [], view: { mode: "2d", grid: true, showSteps: false, locale: "en" } }, items: [], evaluations: 0, reevaluated: [], cause: "view", ms: 0 });

describe("engine client (STEPS.md §7.1, §7.3, §9)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("numbers requests and drops stale responses", () => {
    const workers: FakeWorker[] = [];
    const got: number[] = [];
    const c = createEngineClient({ createWorker: () => (workers.push(new FakeWorker()), workers[workers.length - 1]), onResult: (r) => got.push(r.seq), onRestart: () => {} });
    c.send({ type: "view", view });
    c.send({ type: "view", view });
    workers[0].reply(result(1));
    workers[0].reply(result(2));
    expect(got).toEqual([2]);
    expect(workers[0].sent.map((m) => m.seq)).toEqual([1, 2]);
  });

  it("replaces a running Worker after 5 seconds without an answer", () => {
    const workers: FakeWorker[] = [];
    const restarts: string[] = [];
    const c = createEngineClient({ createWorker: () => (workers.push(new FakeWorker()), workers[workers.length - 1]), onResult: () => {}, onRestart: (r) => restarts.push(r) });
    c.send({ type: "view", view });
    workers[0].reply(result(1)); // the Worker has started
    c.send({ type: "view", view });
    vi.advanceTimersByTime(4999);
    expect(restarts).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(restarts).toEqual(["timeout"]);
    expect(workers[0].terminated).toBe(true);
    c.send({ type: "view", view });
    expect(workers).toHaveLength(2);
  });

  it("a request sent while the Worker is still starting keeps the long limit (Phase 3 review)", () => {
    const restarts: string[] = [];
    const c = createEngineClient({ createWorker: () => new FakeWorker(), onResult: () => {}, onRestart: (r) => restarts.push(r) });
    c.send({ type: "load", graph: (result(0) as Extract<EngineResponse, { type: "result" }>).graph, parsed: {}, view });
    vi.advanceTimersByTime(20);
    c.send({ type: "view", view });
    vi.advanceTimersByTime(10_000);
    expect(restarts).toEqual([]);
  });

  it("an error reply counts as a started Worker: later requests get the 5 s limit (Phase 3 re-review)", () => {
    const w = new FakeWorker();
    const restarts: string[] = [];
    const c = createEngineClient({ createWorker: () => w, onResult: () => {}, onRestart: (r) => restarts.push(r) });
    c.send({ type: "view", view });
    w.reply({ type: "error", seq: 1, message: "boom" });
    c.send({ type: "view", view });
    vi.advanceTimersByTime(5000);
    expect(restarts).toEqual(["timeout"]);
  });

  it("a partial (progressive) frame is delivered but keeps the watchdog for the full frame", () => {
    const workers: FakeWorker[] = [];
    const restarts: string[] = [];
    const seen: boolean[] = [];
    const c = createEngineClient({
      createWorker: () => (workers.push(new FakeWorker()), workers[workers.length - 1]),
      onResult: (r) => r.type === "result" && seen.push(!!r.partial),
      onRestart: (r) => restarts.push(r),
    });
    c.send({ type: "view", view });
    workers[0].reply(result(1));
    c.send({ type: "view", view });
    workers[0].reply({ ...(result(2) as Extract<EngineResponse, { type: "result" }>), partial: true });
    vi.advanceTimersByTime(5000);
    expect(seen).toEqual([false, true]);
    expect(restarts).toEqual(["timeout"]);
  });

  it("a skipped reply (no document yet) stops the watchdog and is not delivered", () => {
    const w = new FakeWorker();
    const restarts: string[] = [];
    const results: unknown[] = [];
    const c = createEngineClient({ createWorker: () => w, onResult: (r) => results.push(r), onRestart: (r) => restarts.push(r) });
    c.send({ type: "view", view });
    w.reply({ type: "skipped", seq: 1 });
    vi.advanceTimersByTime(60_000);
    expect(restarts).toEqual([]);
    expect(results).toEqual([]);
  });

  it("gives the first load (Compute Engine download) a longer limit", () => {
    const restarts: string[] = [];
    const c = createEngineClient({ createWorker: () => new FakeWorker(), onResult: () => {}, onRestart: (r) => restarts.push(r) });
    c.send({ type: "load", graph: (result(0) as Extract<EngineResponse, { type: "result" }>).graph, parsed: {}, view });
    vi.advanceTimersByTime(10_000);
    expect(restarts).toEqual([]);
  });

  it("keeps trace answers on their own sequence", () => {
    const w = new FakeWorker();
    const traces: number[] = [];
    const results: number[] = [];
    const c = createEngineClient({ createWorker: () => w, onResult: (r) => results.push(r.seq), onTrace: (t) => traces.push(t.x), onRestart: () => {} });
    c.send({ type: "view", view });
    c.trace("f", 1);
    c.trace("f", 2);
    w.reply({ type: "trace", seq: 1, id: "f", x: 1, y: 0, slope: 1 });
    w.reply({ type: "trace", seq: 2, id: "f", x: 2, y: 0, slope: 1 });
    w.reply(result(1));
    expect(traces).toEqual([2]);
    expect(results).toEqual([1]);
  });

  it("the full answer to the latest load is delivered even after a newer view request (slider values)", () => {
    const w = new FakeWorker();
    const seen: Array<[number, string]> = [];
    const c = createEngineClient({
      createWorker: () => w,
      onResult: (r) => r.type === "result" && seen.push([r.seq, r.cause]),
      onRestart: () => {},
    });
    const load = result(1) as Extract<EngineResponse, { type: "result" }>;
    c.send({ type: "load", graph: load.graph, parsed: {}, view });
    c.send({ type: "view", view });
    w.reply({ ...load, seq: 1, cause: "load", partial: true });
    w.reply({ ...load, seq: 1, cause: "load" });
    w.reply({ ...load, seq: 2, cause: "view" });
    expect(seen).toEqual([[1, "load"], [2, "view"]]);
    // An older load (a newer load exists) is still dropped.
    c.send({ type: "load", graph: load.graph, parsed: {}, view });
    c.send({ type: "load", graph: load.graph, parsed: {}, view });
    w.reply({ ...load, seq: 3, cause: "load" });
    expect(seen.length).toBe(2);
  });
});
