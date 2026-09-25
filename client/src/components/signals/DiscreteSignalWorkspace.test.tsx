// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SignalOperationsLab } from "./SignalOperationsLab";

vi.mock("mathlive", () => ({ MathfieldElement: class {} }));
class MockResizeObserver { observe() {} unobserve() {} disconnect() {} }
beforeEach(() => { window.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver; });
afterEach(() => cleanup());

const stems = () => Array.from(screen.getByTestId("stem-original").querySelectorAll<SVGGElement>("g[data-n]")).map((g) => ({ n: Number(g.dataset.n), value: Number(g.dataset.value), cx: Number(g.querySelector("circle:last-of-type")!.getAttribute("cx")) }));
const live = () => stems().filter((stem) => stem.value !== 0).map((stem) => stem.n);
const goDiscrete = () => { render(<SignalOperationsLab />); fireEvent.click(screen.getByText("Discrete-Time [x[n]]")); };
const clickPreset = (index: number) => fireEvent.click(screen.getByTestId(`discrete-preset-${index}`));

describe("Signal Operations — discrete-time mode", () => {
  it("shares the continuous layout: test-signal pills + analysis, no operations panel, one stem plot", () => {
    goDiscrete();
    expect(screen.getByText("Academic test signals")).toBeTruthy();
    expect(screen.getByText("ACADEMIC ANALYSIS")).toBeTruthy();
    expect(screen.getByText("SAMPLE ARRAYS")).toBeTruthy();
    expect(screen.queryByText(/sequence operations/i)).toBeNull();
    expect(screen.queryByTestId("stem-transformed")).toBeNull();
    expect(document.querySelectorAll('[data-testid^="stem-"]:not([data-testid="stem-tooltip"])')).toHaveLength(1);
  });

  it("x[n] = u[n]−u[n−5] draws unit stems at n = 0…4 on a window symmetric about 0", () => {
    goDiscrete();
    expect(live()).toEqual([0, 1, 2, 3, 4]);
    const ns = stems().map((stem) => stem.n);
    expect(Math.min(...ns)).toBe(-Math.max(...ns));
    expect(Math.max(...ns)).toBeGreaterThanOrEqual(10);
    expect(stems().every((stem) => Number.isInteger(stem.n))).toBe(true);
  });

  it("n = 0 sits on the exact horizontal centre of the plot (cx(−k) + cx(k) = 2·cx(0))", () => {
    goDiscrete();
    const byN = new Map(stems().map((stem) => [stem.n, stem.cx]));
    [1, 4, 10].forEach((k) => expect(byN.get(-k)! + byN.get(k)!).toBeCloseTo(2 * byN.get(0)!, 9));
  });

  it("every pill loads instantly and the SAMPLE ARRAYS underline marks the n = 0 sample", () => {
    goDiscrete();
    const arrays = () => screen.getByTestId("array-original").querySelector("annotation")!.textContent!;
    clickPreset(1); expect(live()).toEqual([0, 1, 2]); expect(arrays()).toBe("x[n]=\\{\\underline{1},\\,2,\\,-1\\}");
    clickPreset(2); expect(arrays()).toContain("\\underline{1}");
    clickPreset(3); expect(arrays()).toContain("\\underline{1}"); expect(screen.getByTestId("discrete-period").textContent).toContain("8");
    clickPreset(4); expect(arrays()).toContain("\\underline{0}");
    clickPreset(5); expect(arrays()).toBe("x[n]=\\{1,\\,1,\\,1,\\,\\underline{1},\\,1,\\,1,\\,1\\}"); expect(live()).toEqual([-3, -2, -1, 0, 1, 2, 3]);
  });

  it("analysis: classification, period, symmetry, energy and power per pill", () => {
    goDiscrete();
    expect(screen.getByTestId("discrete-energy").textContent).toContain("5"); expect(screen.getByTestId("discrete-power").textContent).toContain("0");
    expect(screen.getByTestId("discrete-classification").textContent).toContain("Energy");
    clickPreset(3);
    expect(screen.getByTestId("discrete-classification").textContent).toContain("Power");
    expect(screen.getByTestId("discrete-symmetry").textContent).toContain("Even");
    clickPreset(5); expect(screen.getByTestId("discrete-symmetry").textContent).toContain("Even");
  });

  it("switches back to continuous time", () => {
    goDiscrete();
    fireEvent.click(screen.getByText("Continuous-Time [x(t)]"));
    expect(screen.getByText("COMPOSITE SIGNAL VIEW")).toBeTruthy();
    expect(screen.queryByTestId("stem-original")).toBeNull();
  });
});
