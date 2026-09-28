// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { DiscreteConvolutionScope } from "./DiscreteConvolutionScope";
import { ConvolutionLab } from "./ConvolutionLab";

vi.mock("mathlive", () => ({ MathfieldElement: class {} }));

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  window.ResizeObserver = MockResizeObserver as any;
});

afterEach(() => {
  cleanup();
});

describe("DiscreteConvolutionScope", () => {
  it("renders pure vector SVG elements with 3 tiers and zero canvas tags", () => {
    const { container } = render(
      <DiscreteConvolutionScope x={[1, 2, 1]} h={[1, -1, 2]} n={0} />
    );

    // Must NOT contain HTML5 canvas elements
    expect(container.querySelectorAll("canvas").length).toBe(0);

    // Must contain 3 SVG elements for the 3 tiers
    const svgs = container.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThanOrEqual(3);

    // Each tier must have min-h-[240px]
    const tiers = container.querySelectorAll(".min-h-\\[240px\\]");
    expect(tiers.length).toBe(3);
  });

  it("renders discrete hairline stems and circular markers", () => {
    const { container } = render(
      <DiscreteConvolutionScope x={[1, 2, 1]} h={[1, -1, 2]} n={1} />
    );

    // Circles should be rendered for stem heads
    const circles = container.querySelectorAll("circle");
    expect(circles.length).toBeGreaterThan(0);

    // Lines should be rendered for vertical stems
    const lines = container.querySelectorAll("line");
    expect(lines.length).toBeGreaterThan(0);

    // Check presence of hairline zero-crossing axes
    const zeroLines = Array.from(lines).filter((l) =>
      l.getAttribute("stroke-width") === "1.25" || l.getAttribute("strokeWidth") === "1.25" ||
      l.getAttribute("stroke-width") === "1.5" || l.getAttribute("strokeWidth") === "1.5"
    );
    expect(zeroLines.length).toBeGreaterThan(0);
  });

  it("updates active shift n via interactive slider and buttons", () => {
    const handleIndexChange = vi.fn();
    render(
      <DiscreteConvolutionScope
        x={[1, 2, 1]}
        h={[1, -1, 2]}
        n={0}
        onIndexChange={handleIndexChange}
      />
    );

    // Should find the Next button and trigger change
    const nextBtn = screen.getByRole("button", { name: /Next/i });
    expect(nextBtn).toBeDefined();
    fireEvent.click(nextBtn);
    expect(handleIndexChange).toHaveBeenCalledWith(1);
  });

  it("renders floating Apple HUD on pointer move over stem scope", () => {
    const { container } = render(
      <DiscreteConvolutionScope x={[1, 2, 1]} h={[1, -1, 2]} n={1} />
    );

    const scopeSvg = container.querySelector(".stem-scope-svg");
    expect(scopeSvg).toBeTruthy();

    if (scopeSvg) {
      vi.spyOn(scopeSvg, "getBoundingClientRect").mockReturnValue({
        left: 0,
        top: 0,
        right: 500,
        bottom: 220,
        width: 500,
        height: 220,
        x: 0,
        y: 0,
        toJSON: () => {},
      });

      fireEvent.pointerMove(scopeSvg, {
        clientX: 150,
        clientY: 80,
      });

      // Tooltip HUD with sample details should render
      const hud = container.querySelector(".backdrop-blur-md");
      expect(hud).toBeTruthy();
    }
  });
});

describe("ConvolutionLab Mode Switching", () => {
  it("switches to Discrete mode and renders both DiscreteConvolutionScope and DiscreteConvolutionTable", () => {
    const { container } = render(<ConvolutionLab />);

    // Initially in continuous mode
    expect(screen.getByRole("tab", { name: "Continuous-Time [x(t)]" })).toBeDefined();

    // Click discrete segmented option
    const discreteBtn = screen.getByRole("tab", { name: "Discrete-Time [x[n]]" });
    fireEvent.click(discreteBtn);

    // Check for discrete title and sequence inputs
    expect(screen.getByText(/THREE-TIER DISCRETE STEM CANVAS/i)).toBeDefined();
    expect(screen.getByText(/DISCRETE CONVOLUTION MATRIX/i)).toBeDefined();
    expect(screen.getByLabelText("x[n] =")).toBeDefined();
    expect(screen.getByLabelText("h[n] =")).toBeDefined();
    expect(screen.queryByText(/SEQUENCE [AB]/i)).toBeNull();
  });
});
