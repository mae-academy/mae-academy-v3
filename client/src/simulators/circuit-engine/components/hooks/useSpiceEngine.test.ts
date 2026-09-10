// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  SpiceRequest,
  SpiceResponse,
} from "@/simulators/circuit-engine/engine/spiceWorker";
import { useSpiceEngine } from "@/simulators/circuit-engine/components/hooks/useSpiceEngine";

/** Stands in for the real worker so the hook's correlation and cleanup logic can be driven directly. */
class FakeWorker {
  static instances: FakeWorker[] = [];

  onmessage: ((event: MessageEvent<SpiceResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  readonly requests: SpiceRequest[] = [];
  terminated = false;

  constructor() {
    FakeWorker.instances.push(this);
  }

  postMessage(request: SpiceRequest): void {
    this.requests.push(request);
  }

  terminate(): void {
    this.terminated = true;
  }

  /** Delivers a response as the real worker would, from outside React. */
  respond(response: SpiceResponse): void {
    act(() => {
      this.onmessage?.({ data: response } as MessageEvent<SpiceResponse>);
    });
  }

  succeed(id: string, vectors: Record<string, number[]>): void {
    this.respond({ type: "SUCCESS", payload: { vectors }, id });
  }

  fail(id: string, error: string): void {
    this.respond({ type: "ERROR", payload: { error }, id });
  }
}

beforeEach(() => {
  FakeWorker.instances = [];
  vi.stubGlobal("Worker", FakeWorker);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const worker = () => FakeWorker.instances[0];

describe("useSpiceEngine", () => {
  it("does not create a worker until the first simulation", () => {
    renderHook(() => useSpiceEngine());
    expect(FakeWorker.instances).toHaveLength(0);
  });

  it("exposes vectors from a successful run and resolves the promise", async () => {
    const { result } = renderHook(() => useSpiceEngine());

    let settled = false;
    act(() => {
      void result.current.runSimulation("* deck\n.op\n.end\n").then(() => {
        settled = true;
      });
    });

    expect(result.current.isSimulating).toBe(true);
    expect(worker().requests[0].payload.netlist).toContain(".op");

    worker().succeed(worker().requests[0].id!, { "v(2)": [5] });

    await waitFor(() => expect(settled).toBe(true));
    expect(result.current.isSimulating).toBe(false);
    expect(result.current.results).toEqual({ "v(2)": [5] });
    expect(result.current.error).toBeNull();
  });

  it("surfaces an error response without rejecting", async () => {
    const { result } = renderHook(() => useSpiceEngine());

    let rejected = false;
    act(() => {
      void result.current.runSimulation("bad").catch(() => {
        rejected = true;
      });
    });
    worker().fail(worker().requests[0].id!, "could not find a valid modelname");

    await waitFor(() => expect(result.current.isSimulating).toBe(false));
    expect(rejected).toBe(false);
    expect(result.current.error).toBe("could not find a valid modelname");
    expect(result.current.results).toBeNull();
  });

  it("ignores a stale response that arrives after a newer run", async () => {
    const { result } = renderHook(() => useSpiceEngine());

    act(() => {
      void result.current.runSimulation("first");
      void result.current.runSimulation("second");
    });

    const [first, second] = worker().requests;
    expect(first.id).not.toBe(second.id);

    // The superseded run answers last; it must not clobber the newer result.
    worker().succeed(second.id!, { "v(2)": [2] });
    worker().succeed(first.id!, { "v(2)": [1] });

    await waitFor(() => expect(result.current.isSimulating).toBe(false));
    expect(result.current.results).toEqual({ "v(2)": [2] });
  });

  it("settles a superseded request instead of leaving it pending", async () => {
    const { result } = renderHook(() => useSpiceEngine());

    let firstSettled = false;
    act(() => {
      void result.current.runSimulation("first").then(() => {
        firstSettled = true;
      });
      void result.current.runSimulation("second");
    });

    worker().succeed(worker().requests[0].id!, { "v(2)": [1] });
    await waitFor(() => expect(firstSettled).toBe(true));
  });

  it("reports a worker crash and stops reporting as simulating", async () => {
    const { result } = renderHook(() => useSpiceEngine());

    let settled = false;
    act(() => {
      void result.current.runSimulation("deck").then(() => {
        settled = true;
      });
    });

    const crashed = worker();
    act(() => {
      crashed.onerror?.({ message: "worker died" } as ErrorEvent);
    });

    await waitFor(() => expect(settled).toBe(true));
    expect(result.current.isSimulating).toBe(false);
    expect(result.current.error).toBe("worker died");
    expect(crashed.terminated).toBe(true);
  });

  it("terminates the worker and settles pending runs on unmount", async () => {
    const { result, unmount } = renderHook(() => useSpiceEngine());

    let settled = false;
    act(() => {
      void result.current.runSimulation("deck").then(() => {
        settled = true;
      });
    });

    const created = worker();
    unmount();

    expect(created.terminated).toBe(true);
    await waitFor(() => expect(settled).toBe(true));
  });

  it("reset clears results and error", async () => {
    const { result } = renderHook(() => useSpiceEngine());

    act(() => {
      void result.current.runSimulation("deck");
    });
    worker().succeed(worker().requests[0].id!, { "v(2)": [5] });
    await waitFor(() => expect(result.current.results).not.toBeNull());

    act(() => result.current.reset());
    expect(result.current.results).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.isSimulating).toBe(false);
  });
});
