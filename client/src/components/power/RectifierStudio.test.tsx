// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { installInProcessControlApi, uninstallInProcessControlApi } from "./test-utils";

/** The converter model is solved by the serverless engine: wait for the first answer, and for each re-solve after an edit. */
async function renderReady(ui: React.ReactElement) {
  const result = render(ui);
  await waitFor(() => expect(result.container.querySelector('[role="status"]')).toBeNull());
  return result;
}
const flushSim = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 120)); });

import { RectifierStudio } from "./RectifierStudio";

beforeAll(() => {
  installInProcessControlApi();
  // jsdom has no layout engine: recharts' ResponsiveContainer needs ResizeObserver
  // and a non-zero getBoundingClientRect to actually mount its chart body (including
  // the ReferenceLine whose yAxisId resolution is under test) instead of bailing out
  // on a 0x0 container.
  class StubResizeObserver { observe() {} unobserve() {} disconnect() {} }
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = StubResizeObserver;
  HTMLElement.prototype.getBoundingClientRect = () => ({ width: 800, height: 530, top: 0, left: 0, right: 800, bottom: 530, x: 0, y: 0, toJSON() { return {}; } });
});

function findByAriaLabel(container: HTMLElement, label: string) {
  const match = Array.from(container.querySelectorAll<HTMLElement>("[aria-label]")).find((el) => el.getAttribute("aria-label") === label);
  if (!match) throw new Error(`No element with aria-label "${label}"`);
  return match;
}

afterAll(uninstallInProcessControlApi);

describe("RectifierStudio", () => {
  it("renders the DCM extinction marker on the output scope without a recharts yAxisId crash", async () => {
    const { container } = await renderReady(<RectifierStudio />);

    // Default load is already RL; disable the free-wheeling diode and shrink the
    // inductance so the load enters discontinuous conduction (DCM), which draws the
    // extinction-angle ReferenceLine on the recharts scope.
    const fwdNoButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "No");
    if (!fwdNoButton) throw new Error("FWD 'No' button not found");
    await act(async () => { fireEvent.click(fwdNoButton); });
    await flushSim();

    const inductanceField = findByAriaLabel(container, "L\\,[\\mathrm{mH}]");
    await act(async () => { fireEvent.change(inductanceField, { target: { value: "0.02" } }); });

    const firingAngleSlider = findByAriaLabel(container, "firing angle slider");
    await act(async () => { fireEvent.change(firingAngleSlider, { target: { value: "65" } }); });

    await flushSim();

    // Flush the requestAnimationFrame that gates chart rendering (chartsReady).
    await act(async () => { await new Promise((resolve) => requestAnimationFrame(resolve)); });

    expect(container.querySelector(".recharts-responsive-container")).not.toBeNull();
  });

  it("drives the circuit diagram from studio state and only offers a free-wheeling diode for RL / RLE", async () => {
    const { container } = await renderReady(<RectifierStudio />);
    const component = (id: string) => container.querySelector(`[data-testid="power-schematic"] [data-component="${id}"]`);
    const button = (label: string) => Array.from(container.querySelectorAll("button")).find((candidate) => candidate.textContent === label);
    const LOADS = ["R", "RL", "RC", "RLC", "RLE"];
    const loadButton = (load: string) => findByAriaLabel(container, "Load Type").querySelectorAll("button")[LOADS.indexOf(load)];
    const hasFwdControl = () => Array.from(container.querySelectorAll("span")).some((node) => node.textContent === "Free-Wheeling Diode (FWD)");

    // defaults: controlled single-phase bridge, RL load, FWD on
    expect(component("T1")?.getAttribute("data-kind")).toBe("thyristor");
    expect(component("T4")).not.toBeNull();
    expect(component("FWD")).not.toBeNull();
    expect(hasFwdControl()).toBe(true);

    await act(async () => { fireEvent.click(loadButton("R")); });
    expect(component("FWD")).toBeNull();
    expect(component("L")).toBeNull();
    expect(hasFwdControl()).toBe(false);

    await act(async () => { fireEvent.click(loadButton("RLC")); });
    expect(component("C")).not.toBeNull();
    expect(component("FWD")).toBeNull();
    expect(hasFwdControl()).toBe(false);

    // returning to an inductive load must not resurrect a stale free-wheeling diode
    await act(async () => { fireEvent.click(loadButton("RLE")); });
    expect(component("E")).not.toBeNull();
    expect(hasFwdControl()).toBe(true);
    expect(component("FWD")).toBeNull();
    await act(async () => { fireEvent.click(button("Yes")!); });
    expect(component("FWD")).not.toBeNull();

    // topology switch rebuilds the diagram
    await act(async () => { fireEvent.click(button("Half-Wave")!); });
    expect(component("T1")).not.toBeNull();
    expect(component("T4")).toBeNull();

    // alpha = 0 means diodes
    await act(async () => { fireEvent.change(findByAriaLabel(container, "firing angle slider"), { target: { value: "0" } }); });
    expect(component("D1")?.getAttribute("data-kind")).toBe("diode");
  });
});
