// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DiscreteStemPlot } from "./DiscreteStemPlot";

const samples = Array.from({ length: 21 }, (_, index) => ({ n: index - 10, value: (index - 10) / 10 }));
const WIDTH = 596; // 48 + 500 + 48 → inner width 500

describe("DiscreteStemPlot hover", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({ x: 0, y: 0, left: 0, top: 0, right: WIDTH, bottom: 240, width: WIDTH, height: 240, toJSON: () => ({}) }));
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it.each([-10, -3, 0, 7, 10])("activates stem n = %i when the cursor sits on it", (n) => {
    const { container } = render(<DiscreteStemPlot title="x[n]" name="x[n]" samples={samples} color="#2563EB" window={{ from: -10, to: 10 }} yDomain={[-1, 1]} />);
    const surface = container.querySelector(".cursor-crosshair") as HTMLElement;
    const x = 48 + ((n + 10.5) / 21) * 500;
    fireEvent.pointerMove(surface, { clientX: x, clientY: 100 });
    const tooltip = container.querySelector("[data-testid=stem-tooltip]");
    expect(tooltip?.textContent?.replace(/\s/g, "")).toContain(`n=${n}`);
    expect(tooltip?.textContent?.replace(/\s/g, "")).not.toContain(`n=${n + 1}x`);
  });
});
