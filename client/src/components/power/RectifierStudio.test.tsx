// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { RectifierStudio } from "./RectifierStudio";

beforeAll(() => {
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

describe("RectifierStudio", () => {
  it("renders the DCM extinction marker on the output scope without a recharts yAxisId crash", async () => {
    const { container } = render(<RectifierStudio />);

    // Default load is already RL; disable the free-wheeling diode and shrink the
    // inductance so the load enters discontinuous conduction (DCM), which draws the
    // extinction-angle ReferenceLine on the recharts scope.
    const fwdNoButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "No");
    if (!fwdNoButton) throw new Error("FWD 'No' button not found");
    await act(async () => { fireEvent.click(fwdNoButton); });

    const inductanceField = findByAriaLabel(container, "L\\,[\\mathrm{mH}]");
    await act(async () => { fireEvent.change(inductanceField, { target: { value: "0.02" } }); });

    const firingAngleSlider = findByAriaLabel(container, "firing angle slider");
    await act(async () => { fireEvent.change(firingAngleSlider, { target: { value: "65" } }); });

    // Flush the requestAnimationFrame that gates chart rendering (chartsReady).
    await act(async () => { await new Promise((resolve) => requestAnimationFrame(resolve)); });

    expect(container.querySelector(".recharts-responsive-container")).not.toBeNull();
  });
});
