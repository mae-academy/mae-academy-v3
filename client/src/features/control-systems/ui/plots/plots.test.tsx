// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import React from "react";
import { StandardStepPlot } from "./StandardStepPlot";
import { ComplexPlanePlot } from "./ComplexPlanePlot";
import type { PlotSeries } from "./types";
import {
  DECADE_STEPS,
  findClosestDecadeStep,
  getNextDecadeStep,
  getPrevDecadeStep,
  formatStepDisplay,
  getAlignedGridTicks,
} from "./grid-utils";

// Mock ResizeObserver for jsdom
class MockResizeObserver {
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe(target: Element) {
    // Provide a default width/height
    Object.defineProperty(target, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ width: 600, height: 340, top: 0, left: 0, right: 600, bottom: 340 }),
    });
  }
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  window.ResizeObserver = MockResizeObserver as any;
});

afterEach(() => {
  cleanup();
});

describe("StandardStepPlot", () => {
  const samplePositiveSeries: PlotSeries[] = [
    {
      id: "r",
      katexName: "r(t)",
      color: "#7C3AED",
      data: [
        { x: 0, y: 1 },
        { x: 5, y: 1 },
        { x: 10, y: 1 },
      ],
    },
    {
      id: "y",
      katexName: "y(t)",
      color: "#2563EB",
      data: [
        { x: 0, y: 0 },
        { x: 2, y: 0.8 },
        { x: 5, y: 1.15 },
        { x: 10, y: 1.0 },
      ],
    },
  ];

  it("renders native SVG elements with no canvas elements", () => {
    const { container } = render(
      <StandardStepPlot series={samplePositiveSeries} title="Step Response Test" />
    );

    expect(container.querySelector("canvas")).toBeNull();
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(screen.getByText("Step Response Test")).toBeDefined();
  });

  it("handles 1-Quadrant auto-fitting when y >= 0", () => {
    const { container } = render(
      <StandardStepPlot series={samplePositiveSeries} forceBipolar={false} />
    );

    // In 1-quadrant mode, yMin is 0, so there shouldn't be negative tick text
    const tickTexts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent);
    const hasNegativeTicks = tickTexts.some((text) => text && text.startsWith("-") && !text.startsWith("-0.00"));
    expect(hasNegativeTicks).toBe(false);
  });

  it("dynamically switches to 2-Quadrant auto-fitting when data has negative undershoot", () => {
    const bipolarSeries: PlotSeries[] = [
      {
        id: "y",
        katexName: "y(t)",
        color: "#2563EB",
        data: [
          { x: 0, y: 0 },
          { x: 1, y: -0.45 }, // Negative undershoot
          { x: 4, y: 1.2 },
          { x: 10, y: 1.0 },
        ],
      },
    ];

    const { container } = render(<StandardStepPlot series={bipolarSeries} />);

    // In 2-quadrant mode, negative ticks are present
    const tickTexts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent);
    const hasNegativeTicks = tickTexts.some((text) => text && text.includes("-0."));
    expect(hasNegativeTicks).toBe(true);
  });

  it("forces 2-Quadrant mode when forceBipolar is true", () => {
    const { container } = render(
      <StandardStepPlot series={samplePositiveSeries} forceBipolar={true} />
    );

    // Should include negative ticks even if data is strictly positive
    const tickTexts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent);
    const hasNegativeTicks = tickTexts.some((text) => text && text.startsWith("-"));
    expect(hasNegativeTicks).toBe(true);
  });

  it("renders legend badges and toggles series visibility on click", () => {
    render(<StandardStepPlot series={samplePositiveSeries} />);

    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBe(2);

    // Initially active
    expect(buttons[0].getAttribute("aria-pressed")).toBe("true");

    // Click to toggle off
    fireEvent.click(buttons[0]);
    expect(buttons[0].getAttribute("aria-pressed")).toBe("false");

    // Click to toggle on
    fireEvent.click(buttons[0]);
    expect(buttons[0].getAttribute("aria-pressed")).toBe("true");
  });

  it("renders error signal e(t) trace alongside r(t) and y(t) with toggle badge", () => {
    const threeSeries = [
      ...samplePositiveSeries,
      {
        id: "e",
        katexName: "e(t)",
        data: [
          { x: 0, y: 1 },
          { x: 1, y: 0.5 },
          { x: 2, y: 0 },
        ],
        color: "#E11D48",
        dashArray: "4,3",
      },
    ];
    render(<StandardStepPlot series={threeSeries} />);

    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBe(3);
    const hasErrorBadge = buttons.some((b) => b.textContent?.includes("e(t)"));
    expect(hasErrorBadge).toBe(true);
  });

  it("renders headerRight controls and clean title without descriptive subtitles", () => {
    render(
      <StandardStepPlot
        series={samplePositiveSeries}
        title="Closed-Loop Step Response"
        headerRight={<button data-testid="tmax-ctrl">tmax</button>}
      />
    );
    expect(screen.getByTestId("tmax-ctrl")).toBeDefined();
    expect(screen.getByText("Closed-Loop Step Response")).toBeDefined();
    expect(screen.queryByText(/Positive-time signal response/i)).toBeNull();
    expect(screen.queryByText(/\[RK4\]/i)).toBeNull();
  });
});

describe("ComplexPlanePlot", () => {
  const samplePoles = [
    { re: -1, im: 2 },
    { re: -1, im: -2 },
  ];
  const sampleZeros = [{ re: -3, im: 0 }];
  const sampleBranches = [
    [
      { re: -1, im: 2, k: 0 },
      { re: -2, im: 1.5, k: 5 },
      { re: -3, im: 0, k: 10 },
    ],
  ];

  it("renders native SVG elements with no canvas blur", () => {
    const { container } = render(
      <ComplexPlanePlot
        poles={samplePoles}
        zeros={sampleZeros}
        locusBranches={sampleBranches}
        title="Root Locus Test"
      />
    );

    expect(container.querySelector("canvas")).toBeNull();
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(screen.getByText("Root Locus Test")).toBeDefined();
  });

  it("renders poles as 'x' line pairs and zeros as circle glyphs", () => {
    const { container } = render(
      <ComplexPlanePlot poles={samplePoles} zeros={sampleZeros} locusBranches={sampleBranches} />
    );

    const poleGroup = container.querySelector(".open-loop-poles");
    expect(poleGroup).not.toBeNull();
    // 2 poles * 2 lines each = 4 lines
    expect(poleGroup?.querySelectorAll("line").length).toBe(4);

    const zeroGroup = container.querySelector(".open-loop-zeros");
    expect(zeroGroup).not.toBeNull();
    expect(zeroGroup?.querySelectorAll("circle").length).toBe(1);
  });

  it("switches between Cartesian and Polar grid modes via pill segmented control", () => {
    render(<ComplexPlanePlot poles={samplePoles} zeros={sampleZeros} />);

    const cartesianTab = screen.getByRole("tab", { name: /cartesian/i });
    const polarTab = screen.getByRole("tab", { name: /polar/i });

    expect(cartesianTab.getAttribute("aria-selected")).toBe("true");
    expect(polarTab.getAttribute("aria-selected")).toBe("false");

    fireEvent.click(polarTab);
    expect(polarTab.getAttribute("aria-selected")).toBe("true");
    expect(cartesianTab.getAttribute("aria-selected")).toBe("false");

    fireEvent.click(cartesianTab);
    expect(cartesianTab.getAttribute("aria-selected")).toBe("true");
    expect(polarTab.getAttribute("aria-selected")).toBe("false");
  });

  it("renders polar grid circles and damping lines with KaTeX labels when in polar mode", () => {
    const { container } = render(
      <ComplexPlanePlot poles={samplePoles} zeros={sampleZeros} gridMode="polar" />
    );

    // Should render polar circles and lines
    expect(container.querySelectorAll("circle").length).toBeGreaterThan(1);
    expect(container.querySelectorAll("line").length).toBeGreaterThan(4);

    // Should render KaTeX labels with zeta and omega_n
    const textElements = Array.from(container.querySelectorAll("text"));
    const hasZeta = textElements.some((t) => t.textContent?.includes("ζ"));
    const hasOmega = textElements.some((t) => t.textContent?.includes("ω"));
    expect(hasZeta).toBe(true);
    expect(hasOmega).toBe(true);
  });

  it("resets viewport on Reset button click", () => {
    render(<ComplexPlanePlot poles={samplePoles} zeros={sampleZeros} interactive={true} />);

    const resetBtn = screen.getByRole("button", { name: /reset zoom and pan/i });
    expect(resetBtn).toBeDefined();
    fireEvent.click(resetBtn);
  });

  it("prevents browser context menu to allow smooth drag panning", () => {
    const { container } = render(
      <ComplexPlanePlot poles={samplePoles} zeros={sampleZeros} interactive={true} />
    );

    const canvasContainer = container.querySelector("[data-testid='complex-plane-canvas']");
    expect(canvasContainer).not.toBeNull();

    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    canvasContainer?.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("formats imaginary axis ticks with +j and -j and real axis ticks with clean formatting", () => {
    const { container } = render(
      <ComplexPlanePlot poles={samplePoles} zeros={sampleZeros} locusBranches={sampleBranches} />
    );

    const tickGroup = container.querySelector(".axis-tick-labels");
    expect(tickGroup).not.toBeNull();

    const tickTexts = Array.from(tickGroup?.querySelectorAll("text") || []).map(
      (t) => t.textContent
    );
    // Should have imaginary ticks formatted with +j or -j
    const hasImagTick = tickTexts.some((txt) => txt && (txt.includes("+j") || txt.includes("-j")));
    expect(hasImagTick).toBe(true);

    // Should have 0 or negative real ticks
    const hasRealTick = tickTexts.some((txt) => txt && (txt === "0" || txt.startsWith("-")));
    expect(hasRealTick).toBe(true);
  });

  it("renders minimalist snap marker and hairlines without animated ping glow", () => {
    const { container } = render(
      <ComplexPlanePlot poles={samplePoles} zeros={sampleZeros} locusBranches={sampleBranches} />
    );

    // No elements with animate-ping should exist in the plot
    expect(container.querySelector(".animate-ping")).toBeNull();
  });

  it("renders a clean top toolbar with pill segmented control and no manual dropdowns", () => {
    render(
      <ComplexPlanePlot poles={samplePoles} zeros={sampleZeros} interactive={true} />
    );

    // No comboboxes or step dropdowns should exist in the toolbar
    expect(screen.queryByRole("combobox")).toBeNull();
    // Pill segmented control tabs and reset button should exist
    expect(screen.getByRole("tab", { name: /cartesian/i })).toBeDefined();
    expect(screen.getByRole("tab", { name: /polar/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /reset zoom and pan/i })).toBeDefined();
  });

  it("renders mathematical italicized j inside a tspan for all imaginary ticks", () => {
    const { container } = render(
      <ComplexPlanePlot poles={samplePoles} zeros={sampleZeros} locusBranches={sampleBranches} />
    );

    const tickGroup = container.querySelector(".axis-tick-labels");
    expect(tickGroup).not.toBeNull();

    // Find all tspans inside the tick group
    const tspans = Array.from(tickGroup?.querySelectorAll("tspan") || []);
    expect(tspans.length).toBeGreaterThan(0);

    // Verify every tspan contains 'j' and has italic font styling
    for (const tspan of tspans) {
      expect(tspan.textContent).toBe("j");
      expect(tspan.style.fontStyle).toBe("italic");
      expect(tspan.style.fontFamily).toContain("KaTeX_Math");
    }

    // Verify imaginary axis header KaTeX formula contains \mathit{j}
    const headerKatex = container.querySelector(".absolute.top-1.left-3");
    expect(headerKatex).not.toBeNull();
  });

  it("synchronizes SVG grid lines strictly to integer multiples of automatic 1-2-5 decade steps", () => {
    const { container } = render(
      <ComplexPlanePlot poles={samplePoles} zeros={sampleZeros} interactive={true} />
    );

    const tickGroup = container.querySelector(".axis-tick-labels");
    const tickTexts = Array.from(tickGroup?.querySelectorAll("text") || []).map((t) => t.textContent);

    // Filter real ticks (ticks without 'j')
    const realTicks = tickTexts.filter((txt) => txt && !txt.includes("j")).map(Number);
    expect(realTicks.length).toBeGreaterThan(0);
    expect(realTicks).toContain(0);
  });

  it("reliably centers the auto-scaled frame on Reset button click", () => {
    const { container } = render(
      <ComplexPlanePlot poles={samplePoles} zeros={sampleZeros} interactive={true} />
    );

    const resetBtn = screen.getByRole("button", { name: /reset zoom and pan/i });
    fireEvent.click(resetBtn);

    const canvasContainer = container.querySelector("[data-testid='complex-plane-canvas']");
    expect(canvasContainer).not.toBeNull();
  });

  it("renders operating pole markers as clean diamond glyphs in Rose/Pink with solid border", () => {
    const { container } = render(
      <ComplexPlanePlot
        poles={samplePoles}
        zeros={sampleZeros}
        currentRoots={[{ re: -0.5, im: 1.5 }]}
      />
    );

    const rootGroup = container.querySelector(".current-roots");
    expect(rootGroup).not.toBeNull();
    const diamond = rootGroup?.querySelector("rect");
    expect(diamond).not.toBeNull();
    expect(diamond?.getAttribute("fill")).toBe("#F43F5E");
    expect(diamond?.getAttribute("transform")).toContain("rotate(45)");
    expect(diamond?.getAttribute("stroke-width") || diamond?.getAttribute("strokeWidth")).toBe("1.5");
  });

  it("renders Cartesian and Polar toggle tabs with pure text labels and no svg icons", () => {
    render(<ComplexPlanePlot poles={samplePoles} zeros={sampleZeros} />);

    const cartesianTab = screen.getByRole("tab", { name: /cartesian/i });
    const polarTab = screen.getByRole("tab", { name: /polar/i });

    expect(cartesianTab.querySelector("svg")).toBeNull();
    expect(polarTab.querySelector("svg")).toBeNull();
    expect(cartesianTab.textContent?.trim()).toBe("Cartesian");
    expect(polarTab.textContent?.trim()).toBe("Polar");
  });

  it("visually highlights analytical step geometry directly on the SVG canvas", () => {
    // Step 1: Poles & Zeros highlighting rings
    const { container: c1 } = render(
      <ComplexPlanePlot
        poles={samplePoles}
        zeros={sampleZeros}
        highlightedStep="poles_zeros"
      />
    );
    expect(c1.querySelectorAll(".open-loop-poles .animate-pulse").length).toBe(samplePoles.length);
    expect(c1.querySelectorAll(".open-loop-zeros .animate-pulse").length).toBe(sampleZeros.length);

    // Step 2: Real axis segments
    const { container: c2 } = render(
      <ComplexPlanePlot
        poles={samplePoles}
        zeros={sampleZeros}
        highlightedStep="real_axis"
      />
    );
    const realAxisGroup = c2.querySelector(".highlight-real-axis");
    expect(realAxisGroup).not.toBeNull();
    const blueLine = realAxisGroup?.querySelector("line[stroke='#2563EB']");
    expect(blueLine).not.toBeNull();

    // Step 4: Asymptotes high-contrast and centroid
    const { container: c4 } = render(
      <ComplexPlanePlot
        poles={samplePoles}
        zeros={sampleZeros}
        asymptotes={[{ centroid: -0.667, angleDeg: 60 }, { centroid: -0.667, angleDeg: 180 }]}
        highlightedStep="asymptotes"
      />
    );
    const asymLines = Array.from(c4.querySelectorAll("line[stroke='#7C3AED']"));
    expect(asymLines.length).toBeGreaterThan(0);

    // Step 5: Breakaway points
    const { container: c5 } = render(
      <ComplexPlanePlot
        poles={samplePoles}
        zeros={sampleZeros}
        breakawayPoints={[-0.4226]}
        highlightedStep="breakaway"
      />
    );
    expect(c5.querySelector(".animate-step5-pulse")).not.toBeNull();
    expect(c5.querySelector("rect[fill='#F43F5E']")).not.toBeNull();

    // Step 6: Imaginary axis crossings
    const { container: c6 } = render(
      <ComplexPlanePlot
        poles={samplePoles}
        zeros={sampleZeros}
        imagCrossings={[{ k: 6, omega: 1.414 }]}
        highlightedStep="imag_crossings"
      />
    );
    expect(c6.querySelectorAll("circle[fill='#E11D48']").length).toBeGreaterThan(0);
  });
});

describe("grid-utils (1-2-5 Decade Scale Series)", () => {
  it("strictly follows the 1-2-5 decade sequence across orders of magnitude", () => {
    // Check 0.1 -> 0.2 -> 0.5 -> 1 -> 2 -> 5 sequence
    expect(getNextDecadeStep(0.1)).toBe(0.2);
    expect(getNextDecadeStep(0.2)).toBe(0.5);
    expect(getNextDecadeStep(0.5)).toBe(1);
    expect(getNextDecadeStep(1)).toBe(2);
    expect(getNextDecadeStep(2)).toBe(5);
    expect(getNextDecadeStep(5)).toBe(10);

    // Check reverse stepping
    expect(getPrevDecadeStep(10)).toBe(5);
    expect(getPrevDecadeStep(5)).toBe(2);
    expect(getPrevDecadeStep(2)).toBe(1);
    expect(getPrevDecadeStep(1)).toBe(0.5);
    expect(getPrevDecadeStep(0.5)).toBe(0.2);
    expect(getPrevDecadeStep(0.2)).toBe(0.1);
  });

  it("snaps arbitrary spans to the closest 1-2-5 decade step", () => {
    expect(findClosestDecadeStep(0.08)).toBe(0.1);
    expect(findClosestDecadeStep(0.19)).toBe(0.2);
    expect(findClosestDecadeStep(0.48)).toBe(0.5);
    expect(findClosestDecadeStep(1.1)).toBe(1);
    expect(findClosestDecadeStep(2.3)).toBe(2);
    expect(findClosestDecadeStep(4.5)).toBe(5);
    expect(findClosestDecadeStep(9.2)).toBe(10);
  });

  it("formats decade steps cleanly without trailing zeroes", () => {
    expect(formatStepDisplay(0.01)).toBe("0.01");
    expect(formatStepDisplay(0.05)).toBe("0.05");
    expect(formatStepDisplay(0.1)).toBe("0.1");
    expect(formatStepDisplay(1)).toBe("1");
    expect(formatStepDisplay(2)).toBe("2");
    expect(formatStepDisplay(5)).toBe("5");
    expect(formatStepDisplay(50)).toBe("50");
  });

  it("generates grid ticks strictly at integer multiples of the step", () => {
    const ticks = getAlignedGridTicks(-2.3, 3.4, 0.5);
    // Should align to -2.5, -2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5
    for (const tick of ticks) {
      const multiple = Math.round(tick / 0.5);
      expect(Math.abs(tick - multiple * 0.5)).toBeLessThan(1e-9);
    }
    expect(ticks).toContain(0);
    expect(ticks).toContain(1);
    expect(ticks).toContain(-1);
  });
});
