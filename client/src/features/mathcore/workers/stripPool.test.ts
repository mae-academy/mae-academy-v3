import { describe, expect, it } from "vitest";
import { bindImplicit } from "@shared/mathcore/implicit/source";
import type { ImplicitSource } from "@shared/mathcore/implicit/source";
import { implicitField } from "@shared/mathcore/implicit/strips";
import type { FieldOptions } from "@shared/mathcore/implicit/strips";
import type { StripRequest, StripResponse } from "./stripProtocol";
import { createStripPool } from "./stripPool";
import type { StripWorkerLike } from "./stripPool";

/** Runs the strip Worker's code in-process, answering asynchronously; `fail` makes it crash. */
class FakeStripWorker implements StripWorkerLike {
  static fail = false;
  static jobs = 0;
  onmessage: ((event: { data: StripResponse }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  terminated = false;
  postMessage(m: StripRequest) {
    FakeStripWorker.jobs++;
    setTimeout(() => {
      if (FakeStripWorker.fail) return this.onerror?.(new Error("crash"));
      const result = implicitField(bindImplicit(m.source), m.viewport, m.options);
      this.onmessage?.({ data: { id: m.id, ok: true, result } });
    }, 0);
  }
  terminate() {
    this.terminated = true;
  }
}

// x² + y² + a·sin(3x) < 9 with the parameter a = 1 in the environment.
const source: ImplicitSource = {
  F: ["Subtract", ["Add", ["Power", "x", 2], ["Power", "y", 2], ["Multiply", "a", ["Sin", ["Multiply", 3, "x"]]]], 9],
  variables: ["x", "y", "a"],
  env: [1],
  functions: [],
};
const vp = { xmin: -5, xmax: 5, ymin: -3.125, ymax: 3.125, aspect: "equal" as const };
const o: FieldOptions = { width: 800, height: 500, cellPx: 6, refine: 4, stride: 1, relation: "<" };

describe("strip pool (STEPS.md §7.1 technique 4)", () => {
  it("splits one field over the Workers and matches the single-Worker field", async () => {
    FakeStripWorker.fail = false;
    FakeStripWorker.jobs = 0;
    const pool = createStripPool(4, () => new FakeStripWorker());
    const merged = await pool.run(source, vp, o);
    expect(FakeStripWorker.jobs).toBe(4);
    const single = implicitField(bindImplicit(source), vp, o);
    expect(merged.polylines.length).toBe(single.polylines.length);
    expect(merged.mask?.data.length).toBe(single.mask?.data.length);
    let diff = 0;
    single.mask?.data.forEach((v, i) => (diff += v === merged.mask?.data[i] ? 0 : 1));
    expect(diff / (single.mask?.data.length ?? 1)).toBeLessThan(1e-3);
    pool.dispose();
  });

  it("rejects when a strip Worker crashes (the engine then computes the field itself)", async () => {
    FakeStripWorker.fail = true;
    const pool = createStripPool(3, () => new FakeStripWorker());
    await expect(pool.run(source, vp, o)).rejects.toThrow(/stopped/);
    pool.dispose();
    FakeStripWorker.fail = false;
  });

  it("dispose rejects pending runs and terminates the Workers", async () => {
    const workers: FakeStripWorker[] = [];
    const pool = createStripPool(2, () => (workers.push(new FakeStripWorker()), workers[workers.length - 1]));
    const p = pool.run(source, vp, o);
    pool.dispose();
    await expect(p).rejects.toThrow(/closed/);
    expect(workers.every((w) => w.terminated)).toBe(true);
  });
});
