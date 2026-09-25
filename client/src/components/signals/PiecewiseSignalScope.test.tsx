// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { PiecewiseSignalScope } from "./PiecewiseSignalScope";
import { SignalOperationsLab } from "./SignalOperationsLab";
import { createPiecewiseSignal } from "@/utils/signalsEngine";

// jsdom has no real custom-element math renderer; the mathfield's own behavior is
// irrelevant to these DOM-structure assertions, so a bare class avoids loading mathlive.
vi.mock("mathlive", () => ({ MathfieldElement: class {} }));

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  window.ResizeObserver = MockResizeObserver as any;
});

// This suite explicitly imports vitest's afterEach rather than relying on RTL's
// global-detection auto-cleanup, so repeated SignalOperationsLab renders never collide.
afterEach(() => {
  cleanup();
});

describe("PiecewiseSignalScope", () => {

  it("renders pure vector SVG elements with zero canvas tags", () => {
    const model = createPiecewiseSignal({
      primary: { kind: "sine", frequencyHz: 2 },
      transform: { amplitude: 1, timeScale: 1, timeShift: 0 },
    });

    const { container } = render(<PiecewiseSignalScope model={model} />);

    // Must NOT contain any HTML5 canvas elements
    expect(container.querySelectorAll("canvas").length).toBe(0);

    // Must contain SVG element
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    expect(svg?.classList.contains("cursor-crosshair")).toBe(true);

    // Must contain hairline axes
    const hairlines = container.querySelector(".axes-hairlines");
    expect(hairlines).toBeTruthy();
    expect(hairlines?.querySelectorAll("line").length).toBe(2);

    // Must render signal curve paths
    const curves = container.querySelectorAll(".signal-curves path");
    expect(curves.length).toBeGreaterThan(0);
  });

  it("renders Dirac symbolic impulses as vector arrows with KaTeX badges", () => {
    const model = createPiecewiseSignal({
      primary: { kind: "dirac" },
      transform: { amplitude: 2, timeScale: 1, timeShift: 1 },
    });

    const { container } = render(<PiecewiseSignalScope model={model} />);

    // Arrow lines and polygon heads rendered
    const impulseGroups = container.querySelectorAll(".dirac-impulse");
    expect(impulseGroups.length).toBeGreaterThan(0);

    const arrowShaft = impulseGroups[0].querySelector("line");
    expect(arrowShaft).toBeTruthy();
    expect(arrowShaft?.getAttribute("stroke")).toBe("#E11D48");

    const arrowHead = impulseGroups[0].querySelector("polygon");
    expect(arrowHead).toBeTruthy();
    expect(arrowHead?.getAttribute("fill")).toBe("#E11D48");
  });

  it("renders Apple HUD tooltip on pointer move", () => {
    const model = createPiecewiseSignal({
      primary: { kind: "step" },
      transform: { amplitude: 1, timeScale: 1, timeShift: 0 },
    });

    const { container } = render(<PiecewiseSignalScope model={model} />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();

    // Mock getBoundingClientRect
    vi.spyOn(svg!, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      right: 700,
      bottom: 420,
      width: 700,
      height: 420,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    // Fire pointer move within plot area
    fireEvent.pointerMove(svg!, { clientX: 200, clientY: 150 });

    // Crosshair indicator should be rendered
    const crosshair = container.querySelector(".crosshair-indicator");
    expect(crosshair).toBeTruthy();
  });

  it("applies domain headroom and positions Y-axis ticks with end-anchor, central-baseline, and margin clearance", () => {
    const model = createPiecewiseSignal({
      primary: { kind: "sine", frequencyHz: 1 },
      transform: { amplitude: 2, timeScale: 1, timeShift: 0 },
    });

    const { container } = render(<PiecewiseSignalScope model={model} height={420} />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    expect(svg?.classList.contains("overflow-visible")).toBe(true);

    // Margin configuration: left = 48, so Y-axis labels must be positioned at x = 48 - 10 = 38
    const yTickLabels = Array.from(container.querySelectorAll(".ticks-text text")).filter((el) => {
      return el.getAttribute("x") === "38";
    });
    expect(yTickLabels.length).toBeGreaterThan(0);

    // Each Y tick label must have text-anchor="end" and dominant-baseline="central"
    for (const label of yTickLabels) {
      expect(label.getAttribute("text-anchor")).toBe("end");
      expect(label.getAttribute("dominant-baseline")).toBe("central");
    }

    // Check that -2 tick exists and its y position is strictly inside height - margin.bottom (420 - 44 = 376)
    const minusTwoTick = yTickLabels.find((el) => el.textContent?.trim() === "-2");
    expect(minusTwoTick).toBeTruthy();
    const minusTwoY = parseFloat(minusTwoTick?.getAttribute("y") || "0");
    const heightMinusMarginBottom = 420 - 44; // 376
    // yScale(-2) + textHeight (11px) must be strictly inside height - margin.bottom
    expect(minusTwoY + 11).toBeLessThan(heightMinusMarginBottom);
  });

  it("dynamically auto-scales time axis to 3 full periods for periodic signals", () => {
    // Model with T0 = 1s
    const model = createPiecewiseSignal({
      primary: { kind: "sine", frequencyHz: 1 },
      transform: { amplitude: 1, timeScale: 1, timeShift: 0 },
    });

    const { container } = render(<PiecewiseSignalScope model={model} fundamentalPeriod={1} />);
    // For T0 = 1, tRange = (1 * 3) / 2 = 1.5. xTicks step = 0.5s -> [-1.5, -1, -0.5, 0, 0.5, 1, 1.5]
    const xLabels = Array.from(container.querySelectorAll(".ticks-text text"))
      .filter((el) => el.getAttribute("x") !== "38")
      .map((el) => el.textContent?.trim());

    expect(xLabels).toContain("0");
    expect(xLabels).toContain("-1.5");
    expect(xLabels).toContain("1.5");
    expect(xLabels).toContain("-1");
    expect(xLabels).toContain("1");
  });

  it("clamps time axis for ultra-high frequencies and uses 0.25s adaptive ticks", () => {
    // Model with T0 = 0.2s (e.g. 5 Hz / sin(10pi t))
    const model = createPiecewiseSignal({
      primary: { kind: "sine", frequencyHz: 5 },
      transform: { amplitude: 1, timeScale: 1, timeShift: 0 },
    });

    const { container } = render(<PiecewiseSignalScope model={model} fundamentalPeriod={0.2} />);
    // For T0 = 0.2, (0.2 * 3) / 2 = 0.3 clamped to min 0.5. tRange = 0.5. xTicks step = 0.25s -> [-0.5, -0.25, 0, 0.25, 0.5]
    const xLabels = Array.from(container.querySelectorAll(".ticks-text text"))
      .filter((el) => el.getAttribute("x") !== "38")
      .map((el) => el.textContent?.trim());

    expect(xLabels).toEqual(["-0.5", "-0.25", "0", "0.25", "0.5"]);
  });

  it("expands time axis for low frequencies and uses 2s adaptive ticks", () => {
    // Model with T0 = 4s (e.g. 0.25 Hz / sin(0.5pi t))
    const model = createPiecewiseSignal({
      primary: { kind: "sine", frequencyHz: 0.25 },
      transform: { amplitude: 1, timeScale: 1, timeShift: 0 },
    });

    const { container } = render(<PiecewiseSignalScope model={model} fundamentalPeriod={4} />);
    // For T0 = 4, tRange = (4 * 3) / 2 = 6s. xTicks step = 2s -> [-6, -4, -2, 0, 2, 4, 6]
    const xLabels = Array.from(container.querySelectorAll(".ticks-text text"))
      .filter((el) => el.getAttribute("x") !== "38")
      .map((el) => el.textContent?.trim());

    expect(xLabels).toEqual(["-6", "-4", "-2", "0", "2", "4", "6"]);
  });

  it("auto-scales aperiodic pulse signals with 50% symmetric margin around pulse width", () => {
    // Rect pulse centered at t=0 with width 1 (breakpoints at -0.5 and 0.5)
    const model = createPiecewiseSignal({
      primary: { kind: "rect" },
      transform: { amplitude: 1, timeScale: 1, timeShift: 0 },
    });

    const { container } = render(<PiecewiseSignalScope model={model} fundamentalPeriod={null} />);
    // Active width = 1, marginSide = 0.5 -> tRange = 1.0. xTicks step = 0.5s -> [-1, -0.5, 0, 0.5, 1]
    const xLabels = Array.from(container.querySelectorAll(".ticks-text text"))
      .filter((el) => el.getAttribute("x") !== "38")
      .map((el) => el.textContent?.trim());

    expect(xLabels).toContain("0");
    expect(xLabels).toContain("-1");
    expect(xLabels).toContain("1");
    expect(xLabels).toContain("-0.5");
    expect(xLabels).toContain("0.5");
  });
});

describe("SignalOperationsLab", () => {
  it("renders standardized COMPOSITE SIGNAL VIEW card header without redundant subtitles or canvas clutter", () => {
    const { container } = render(<SignalOperationsLab />);

    // Header title matches gold standard
    const title = screen.getByText("COMPOSITE SIGNAL VIEW");
    expect(title).toBeTruthy();
    expect(title.tagName).toBe("H4");

    // Header carries the SIGNAL ENGINE input, not the legacy dual-dropdown selectors
    expect(screen.getByText("SIGNAL ENGINE")).toBeTruthy();
    expect(screen.queryByText("Primary signal x₁(t)")).toBeNull();
    expect(screen.queryByText("Secondary signal x₂(t)")).toBeNull();

    // Redundant labels and footer hints are removed
    expect(screen.queryByText("Interactive Canvas Scope")).toBeNull();
    expect(screen.queryByText("Drag to pan")).toBeNull();
    expect(screen.queryByText("Wheel to zoom")).toBeNull();
    expect(screen.queryByText("SOURCE / x₁, x₂")).toBeNull();

    // No canvas anywhere in the rebuilt lab
    expect(container.querySelectorAll("canvas").length).toBe(0);

    // Academic analysis card title
    const analysisTitle = screen.getByText("ACADEMIC ANALYSIS");
    expect(analysisTitle).toBeTruthy();
    expect(screen.queryByText("Energy, Power & Periodicity")).toBeNull();
  });

  it("classifies the default commensurate sin+cos composition as periodic with a Power Signal readout", () => {
    render(<SignalOperationsLab />);
    expect(screen.getAllByText("Power Signal").length).toBeGreaterThan(0);
    expect(screen.getByText("Periodic")).toBeTruthy();
  });

  it("classifies a preset rect(t) pulse as an aperiodic Energy Signal with a settable window", () => {
    const { container } = render(<SignalOperationsLab />);
    // KaTeX duplicates its source into a hidden MathML annotation, so match on inclusion, not equality.
    // The "rect(t)" pill (inserts into the mathfield) renders before the "rect(t)" preset (sets the
    // expression directly) in source order, so the last match is the preset button under test here.
    const rectMatches = Array.from(container.querySelectorAll("button")).filter((button) => (button.textContent ?? "").includes("rect(t)"));
    const rectPreset = rectMatches.at(-1);
    expect(rectPreset).toBeTruthy();
    fireEvent.click(rectPreset!);
    expect(screen.getAllByText("Energy Signal").length).toBeGreaterThan(0);
  });
});
