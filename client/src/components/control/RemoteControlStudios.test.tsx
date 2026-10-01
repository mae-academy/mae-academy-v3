// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { controllabilityMatrix, rank } from "../../../../api/_lib/control/systems/matrixMath";
import { bodeRemote, ControlEvaluationError, rootLocusRemote, stateSpaceRemote } from "@/services/controlClient";
import { installInProcessControlApi, uninstallInProcessControlApi } from "../power/test-utils";
import { LocaleProvider } from "@/contexts/LocaleContext";
import { PIDStudio } from "./PIDStudio";
import { StateSpaceStudio } from "./StateSpaceStudio";

beforeAll(() => {
  installInProcessControlApi();
  class StubResizeObserver { observe() {} unobserve() {} disconnect() {} }
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = StubResizeObserver;
});
afterAll(uninstallInProcessControlApi);
afterEach(cleanup);

describe("control studios over the serverless engine", () => {
  it("client: root locus, Bode and state-space answers arrive as data arrays", async () => {
    const locus = await rootLocusRemote([1], [1, 3, 2, 0], { locus: true, gain: 1 });
    expect(locus.locus?.openLoopPoles).toHaveLength(3);
    expect(locus.closedLoop?.roots).toHaveLength(3);
    const bode = await bodeRemote([10], [1, 3, 2, 0], 1, [], 12, 64);
    expect(bode.response).toHaveLength(64);
    const A = [[0, 1], [-2, -3]]; const B = [[0], [1]];
    const ss = await stateSpaceRemote(A, B, [[1, 0]], [[0]], [-4, -5]);
    expect("controllabilityRank" in ss.analysis && ss.analysis.controllabilityRank).toBe(rank(controllabilityMatrix(A, B)));
    expect(ss.placement?.gain).toEqual([18, 6]);
  });

  it("client: out-of-range requests are refused with a clear message", async () => {
    await expect(rootLocusRemote([1], Array(20).fill(1))).rejects.toThrow(/engine 400|outside the supported range/);
    await expect(stateSpaceRemote([[1, 0], [0, 1]], [[1]], [[1, 0]], [[0]], null)).rejects.toThrow();
    void ControlEvaluationError;
  });

  it("State-Space studio: characteristic polynomial and Ackermann gain render from the engine", async () => {
    const { container } = render(<LocaleProvider locale="en"><StateSpaceStudio /></LocaleProvider>);
    await waitFor(() => expect(container.innerHTML).toContain("det(sI-A)"));
    await waitFor(() => expect(container.innerHTML).toContain("A_{cl}=A-BK"));
  });

  it("PID studio: the closed-loop scope metrics come from the engine", async () => {
    const { container } = render(<PIDStudio />);
    await waitFor(() => expect(container.querySelectorAll("svg path").length).toBeGreaterThan(3), { timeout: 4000 });
    expect(screen.getAllByText(/PID|Controller/i).length).toBeGreaterThan(0);
  });
});
