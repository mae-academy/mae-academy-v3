import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PLOT_MAX_CODE_CHARS, PlotError, type PlotRequest, type PlotResponse, type PlotStage, type PlotSummary } from "./plotProtocol";
import { createPlotRunner, type PlotWorkerLike } from "./plotRunner";
import { prefilterPlotCode } from "./plotValidate";
import { clearPlotCaches, startPlot } from "./plotJobs";
import { setPlotRunnerForTests } from "./plotRunner";

const SUMMARY: PlotSummary = { axes: [], suptitle: "", figsize: [8, 4.5] };

class FakeWorker implements PlotWorkerLike {
  static instances: FakeWorker[] = [];
  onmessage: PlotWorkerLike["onmessage"] = null;
  onerror: PlotWorkerLike["onerror"] = null;
  requests: PlotRequest[] = [];
  terminated = false;
  constructor() {
    FakeWorker.instances.push(this);
  }
  postMessage(message: PlotRequest) {
    this.requests.push(message);
  }
  terminate() {
    this.terminated = true;
  }
  emit(response: PlotResponse) {
    this.onmessage?.({ data: response });
  }
  result(id: number) {
    this.emit({ type: "result", id, png: new Uint8Array([137, 80, 78, 71]).buffer, width: 10, height: 5, dpi: 300, summary: SUMMARY, warnings: [] });
  }
}

const OK = "import numpy as np\nimport matplotlib.pyplot as plt\nplt.plot([1])\n";

beforeEach(() => {
  FakeWorker.instances = [];
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  setPlotRunnerForTests(null);
  clearPlotCaches();
});

describe("JS prefilter", () => {
  it("accepts a normal script", () => {
    expect(prefilterPlotCode(OK)).toBeNull();
  });

  it.each([
    ["empty", "   \n", /empty/],
    ["oversized", "x = 1\n".repeat(PLOT_MAX_CODE_CHARS), /too long/],
    ["too many lines", "x=1\n".repeat(700), /too many lines/],
    ["null byte", "x = 1\u0000", /null/],
    ["import os", "import numpy as np\nimport os\n", /"os"/],
    ["from subprocess", "from subprocess import run", /"subprocess"/],
    ["indented import js", "if True:\n    import js\n", /"js"/],
    ["import pyodide.ffi", "import pyodide.ffi", /"pyodide"/],
  ])("refuses %s", (_name, code, message) => {
    expect(prefilterPlotCode(code)?.message).toMatch(message);
  });

  it("reports the line of a forbidden import", () => {
    expect(prefilterPlotCode("import numpy as np\n\nimport os\n")?.line).toBe(3);
  });

  it("does not block names that merely start like a forbidden module", () => {
    expect(prefilterPlotCode("import numpy as np\nosc = np.arange(3)\nsystem = 1\n")).toBeNull();
  });
});

describe("plot runner with a fake worker", () => {
  const make = (overrides: { timeoutMs?: number; loadTimeoutMs?: number } = {}) => createPlotRunner({ createWorker: () => new FakeWorker(), ...overrides });

  it("creates the worker lazily and resolves with the PNG", async () => {
    const runner = make();
    expect(FakeWorker.instances).toHaveLength(0);
    const promise = runner.run(OK);
    const worker = FakeWorker.instances[0];
    expect(worker.requests[0]).toMatchObject({ type: "run", id: 1, code: OK });
    worker.result(1);
    const result = await promise;
    expect(Array.from(result.png)).toEqual([137, 80, 78, 71]);
    expect(result).toMatchObject({ width: 10, height: 5, dpi: 300 });
  });

  it("forwards progress stages in order", async () => {
    const runner = make();
    const stages: PlotStage[] = [];
    const promise = runner.run(OK, { onProgress: (s) => stages.push(s) });
    const worker = FakeWorker.instances[0];
    for (const stage of ["runtime", "numpy", "matplotlib", "rendering"] as const) worker.emit({ type: "progress", id: 1, stage });
    worker.result(1);
    await promise;
    expect(stages).toEqual(["runtime", "numpy", "matplotlib", "rendering"]);
  });

  it("serialises requests on the one worker and reuses it", async () => {
    const runner = make();
    const first = runner.run(OK);
    const second = runner.run(OK + "# 2\n");
    const worker = FakeWorker.instances[0];
    expect(worker.requests).toHaveLength(1);
    worker.result(1);
    await first;
    expect(worker.requests).toHaveLength(2);
    expect(worker.requests[1].id).toBe(2);
    worker.result(2);
    await second;
    expect(FakeWorker.instances).toHaveLength(1);
  });

  it("maps worker errors to PlotError with kind and line", async () => {
    const runner = make();
    const promise = runner.run(OK);
    FakeWorker.instances[0].emit({ type: "error", id: 1, kind: "python", message: "ZeroDivisionError: division by zero", line: 7 });
    const error = await promise.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PlotError);
    expect(error).toMatchObject({ kind: "python", message: "ZeroDivisionError: division by zero", line: 7 });
  });

  it("refuses a hostile script before any worker exists", async () => {
    const runner = make();
    await expect(runner.run("import os\n")).rejects.toMatchObject({ kind: "rejected", line: 1 });
    expect(FakeWorker.instances).toHaveLength(0);
  });

  it("ignores messages for another request id", async () => {
    const runner = make();
    const promise = runner.run(OK);
    const worker = FakeWorker.instances[0];
    worker.result(99);
    worker.result(1);
    await expect(promise).resolves.toMatchObject({ width: 10 });
  });

  it("terminates a script that outlives the timeout, recreates the worker and keeps going", async () => {
    const runner = make({ timeoutMs: 30_000 });
    const hung = runner.run("while True:\n    pass\n");
    const next = runner.run(OK);
    const first = FakeWorker.instances[0];
    first.emit({ type: "progress", id: 1, stage: "rendering" });
    const hungError = hung.catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(30_001);
    expect(await hungError).toMatchObject({ kind: "timeout" });
    expect(first.terminated).toBe(true);
    // The queued plot runs on a fresh worker.
    expect(FakeWorker.instances).toHaveLength(2);
    const second = FakeWorker.instances[1];
    expect(second.requests[0]).toMatchObject({ id: 2, code: OK });
    second.result(2);
    await expect(next).resolves.toMatchObject({ width: 10 });
  });

  it("does not start the script timer while the runtime is still loading", async () => {
    const runner = make({ timeoutMs: 30_000, loadTimeoutMs: 120_000 });
    const promise = runner.run(OK);
    const worker = FakeWorker.instances[0];
    worker.emit({ type: "progress", id: 1, stage: "numpy" });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(worker.terminated).toBe(false);
    worker.emit({ type: "progress", id: 1, stage: "rendering" });
    worker.result(1);
    await expect(promise).resolves.toBeDefined();
  });

  it("gives up on a stalled download with a load error", async () => {
    const runner = make({ loadTimeoutMs: 5_000 });
    const promise = runner.run(OK);
    const caught = promise.catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(5_001);
    expect(await caught).toMatchObject({ kind: "load" });
  });

  it("turns a worker crash into an internal error and recovers", async () => {
    const runner = make();
    const promise = runner.run(OK);
    const caught = promise.catch((e: unknown) => e);
    FakeWorker.instances[0].onerror?.(new Event("error"));
    expect(await caught).toMatchObject({ kind: "internal" });
    const again = runner.run(OK);
    expect(FakeWorker.instances).toHaveLength(2);
    FakeWorker.instances[1].result(2);
    await expect(again).resolves.toBeDefined();
  });
});

describe("plot jobs (cache and sharing)", () => {
  it("shares one execution between callers of the same code and caches the result", async () => {
    const worker = new FakeWorker();
    setPlotRunnerForTests(createPlotRunner({ createWorker: () => worker }));
    const a = startPlot(OK);
    const b = startPlot(OK);
    expect(a).toBe(b);
    expect(worker.requests).toHaveLength(1);
    worker.result(1);
    const outcome = await a.promise;
    expect(outcome.result?.width).toBe(10);
    const { cachedPlot } = await import("./plotJobs");
    expect(cachedPlot(OK)).toBe(outcome);
  });

  it("caches a Python error but not a timeout", async () => {
    const worker = new FakeWorker();
    setPlotRunnerForTests(createPlotRunner({ createWorker: () => worker, timeoutMs: 1_000 }));
    const failing = startPlot(OK);
    worker.emit({ type: "error", id: 1, kind: "python", message: "NameError: x", line: 2 });
    const { cachedPlot } = await import("./plotJobs");
    expect((await failing.promise).error?.kind).toBe("python");
    expect(cachedPlot(OK)).toBeDefined();

    const slow = startPlot(OK + "# slow\n");
    worker.emit({ type: "progress", id: 2, stage: "rendering" });
    await vi.advanceTimersByTimeAsync(1_001);
    expect((await slow.promise).error?.kind).toBe("timeout");
    expect(cachedPlot(OK + "# slow\n")).toBeUndefined();
  });
});
