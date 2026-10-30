import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ParseWorkerLike } from "./parseClient";
import { createParseClient } from "./parseClient";
import type { ParseRequest, ParseResponse } from "./parseProtocol";

/**
 * A fake parse Worker: answers `x` instantly, never answers `slow`, answers `bad` with an error, crashes on `crash`,
 * and answers "could not load" to everything while `offline` is set.
 */
class FakeParseWorker implements ParseWorkerLike {
  static created = 0;
  static offline = false;
  terminated = false;
  onmessage: ((event: { data: ParseResponse }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  constructor() {
    FakeParseWorker.created++;
  }
  postMessage(m: ParseRequest) {
    if (m.latex === "slow") return;
    if (m.latex === "crash") {
      queueMicrotask(() => this.onerror?.(new Error("crash")));
      return;
    }
    if (FakeParseWorker.offline) {
      queueMicrotask(() => this.onmessage?.({ data: { seq: m.seq, latex: m.latex, ok: false, message: "could not load", unavailable: true } }));
      return;
    }
    queueMicrotask(() =>
      this.onmessage?.({ data: m.latex === "bad" ? { seq: m.seq, latex: m.latex, ok: false, message: "syntax" } : { seq: m.seq, latex: m.latex, ok: true, raw: ["Raw", m.latex] } }),
    );
  }
  terminate() {
    this.terminated = true;
  }
}

describe("parse client (STEPS.md §9: 200 ms parse timeout in the parse Worker)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeParseWorker.created = 0;
    FakeParseWorker.offline = false;
  });
  afterEach(() => vi.useRealTimers());

  it("parses each distinct string once and caches it", async () => {
    const c = createParseClient({ createWorker: () => new FakeParseWorker() });
    const r = await c.parseAll(["x", "y", "x"]);
    expect(r).toEqual({ x: { ok: true, raw: ["Raw", "x"] }, y: { ok: true, raw: ["Raw", "y"] } });
    const again = await c.parseAll(["x"]);
    expect(again.x).toEqual({ ok: true, raw: ["Raw", "x"] });
    expect(FakeParseWorker.created).toBe(1);
  });

  it("reports parser errors per string", async () => {
    const c = createParseClient({ createWorker: () => new FakeParseWorker() });
    expect((await c.parseAll(["bad"])).bad).toEqual({ ok: false, message: "syntax" });
  });

  it("stops a parse after 200 ms, replaces the Worker, and continues with the next string", async () => {
    const c = createParseClient({ createWorker: () => new FakeParseWorker() });
    await c.parseAll(["x"]); // the Worker is warm now
    const p = c.parseAll(["slow", "y"]);
    await vi.advanceTimersByTimeAsync(200);
    const r = await p;
    expect(r.slow).toEqual({ ok: false, message: "Parsing took longer than 200 ms" });
    expect(r.y).toEqual({ ok: true, raw: ["Raw", "y"] });
    expect(FakeParseWorker.created).toBe(2);
  });

  it("gives a fresh Worker (Compute Engine download) the long limit", async () => {
    const c = createParseClient({ createWorker: () => new FakeParseWorker() });
    const p = c.parseAll(["slow"]);
    await vi.advanceTimersByTimeAsync(1000);
    let settled = false;
    void p.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(30_000);
    expect((await p).slow).toEqual({ ok: false, message: "The math parser did not start in time" });
  });

  it("an unavailable parser (offline) is not cached and does not count as started", async () => {
    const c = createParseClient({ createWorker: () => new FakeParseWorker() });
    FakeParseWorker.offline = true;
    expect((await c.parseAll(["x"])).x).toEqual({ ok: false, message: "could not load" });
    FakeParseWorker.offline = false;
    // Back online: the same line parses, and a slow line still gets the long start-up limit.
    expect((await c.parseAll(["x"])).x).toEqual({ ok: true, raw: ["Raw", "x"] });
  });

  it("the next line after an offline reply still gets the start-up limit", async () => {
    const c = createParseClient({ createWorker: () => new FakeParseWorker() });
    FakeParseWorker.offline = true;
    await c.parseAll(["y"]);
    FakeParseWorker.offline = false;
    const p = c.parseAll(["slow"]);
    await vi.advanceTimersByTimeAsync(1000);
    let settled = false;
    void p.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(30_000);
    await p;
  });

  it("a crash is not cached; the line is parsed again by a new Worker", async () => {
    const c = createParseClient({ createWorker: () => new FakeParseWorker() });
    expect((await c.parseAll(["crash"])).crash).toEqual({ ok: false, message: "The math parser stopped unexpectedly" });
    const before = FakeParseWorker.created;
    expect((await c.parseAll(["crash"])).crash.ok).toBe(false);
    expect(FakeParseWorker.created).toBe(before + 1);
  });

  it("a timeout on a running parser is cached only after it happens twice; a start-up timeout never", async () => {
    const c = createParseClient({ createWorker: () => new FakeParseWorker() });
    let n = 0;
    // A string not parsed before starts (and warms) a replacement Worker.
    const warmUp = () => c.parseAll([`w${++n}`]);
    const cold = c.parseAll(["slow"]);
    await vi.advanceTimersByTimeAsync(30_000);
    expect((await cold).slow).toEqual({ ok: false, message: "The math parser did not start in time" });
    await warmUp();
    const first = c.parseAll(["slow"]);
    await vi.advanceTimersByTimeAsync(200);
    expect((await first).slow).toEqual({ ok: false, message: "Parsing took longer than 200 ms" });
    await warmUp();
    const second = c.parseAll(["slow"]);
    await vi.advanceTimersByTimeAsync(200);
    expect((await second).slow.ok).toBe(false);
    // Now cached: no Worker is asked again.
    const created = FakeParseWorker.created;
    expect((await c.parseAll(["slow"])).slow).toEqual({ ok: false, message: "Parsing took longer than 200 ms" });
    expect(FakeParseWorker.created).toBe(created);
  });
});
