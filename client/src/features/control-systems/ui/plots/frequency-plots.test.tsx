// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import React from "react";
import {
  BodeMagnitudePlot,
  BodePhasePlot,
  BodePlot,
  NyquistPlot,
  NicholsPlot,
} from "./index";
import type { FrequencyPoint, StabilityMargins } from "@/features/control/frequencyResponseMath";

// Mock ResizeObserver for jsdom
class MockResizeObserver {
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe(target: Element) {
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

const samplePoints: FrequencyPoint[] = [
  {
    omega: 0.1,
    re: 1.0,
    im: -0.1,
    magnitudeDb: 0.0,
    phaseDeg: -5.7,
    phaseUnwrappedDeg: -5.7,
    asymMagnitudeDb: 0.0,
    asymPhaseDeg: 0.0,
  },
  {
    omega: 1.0,
    re: 0.707,
    im: -0.707,
    magnitudeDb: -3.01,
    phaseDeg: -45.0,
    phaseUnwrappedDeg: -45.0,
    asymMagnitudeDb: 0.0,
    asymPhaseDeg: -45.0,
  },
  {
    omega: 10.0,
    re: 0.01,
    im: -0.1,
    magnitudeDb: -20.0,
    phaseDeg: -84.3,
    phaseUnwrappedDeg: -84.3,
    asymMagnitudeDb: -20.0,
    asymPhaseDeg: -90.0,
  },
  {
    omega: 100.0,
    re: 0.0001,
    im: -0.01,
    magnitudeDb: -40.0,
    phaseDeg: -175.0,
    phaseUnwrappedDeg: -175.0,
    asymMagnitudeDb: -40.0,
    asymPhaseDeg: -180.0,
  },
];

const sampleMargins: StabilityMargins = {
  gainCrossover: {
    omega: 1.0,
    phaseDeg: -45.0,
    phaseMarginDeg: 135.0,
  },
  phaseCrossover: {
    omega: 120.0,
    magnitudeDb: -42.0,
    gainMarginDb: 42.0,
  },
};

describe("BodeMagnitudePlot", () => {
  it("renders pure SVG vectors with no canvas elements", () => {
    const { container } = render(
      <BodeMagnitudePlot data={samplePoints} margins={sampleMargins} title="Bode Magnitude Test" />
    );

    expect(container.querySelector("canvas")).toBeNull();
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(screen.getByText("Bode Magnitude Test")).toBeDefined();
  });

  it("renders decade grid lines and linear dB grid", () => {
    const { container } = render(
      <BodeMagnitudePlot data={samplePoints} margins={sampleMargins} />
    );

    const decadeLines = container.querySelectorAll(".decade-grid line");
    expect(decadeLines.length).toBeGreaterThan(0);

    const dbLines = container.querySelectorAll(".db-grid line");
    expect(dbLines.length).toBeGreaterThan(0);
  });

  it("renders gain margin pill badge when margins are provided", () => {
    const { container } = render(
      <BodeMagnitudePlot data={samplePoints} margins={sampleMargins} />
    );

    // Should render Gm badge
    expect(container.textContent).toContain("G_m = 42.0");
  });

  it("prevents context menu on canvas for smooth panning", () => {
    const { container } = render(<BodeMagnitudePlot data={samplePoints} />);
    const canvasDiv = container.querySelector(".cursor-crosshair");
    expect(canvasDiv).not.toBeNull();

    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    canvasDiv?.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("resets viewport on Reset button click", () => {
    const { container } = render(<BodeMagnitudePlot data={samplePoints} />);
    const resetBtn = screen.getByTitle("Reset View");
    expect(resetBtn).toBeDefined();

    fireEvent.click(resetBtn);
    // After reset, svg path should remain valid
    const path = container.querySelector("svg path");
    expect(path).not.toBeNull();
  });
});

describe("BodePhasePlot", () => {
  it("renders pure SVG vectors with no canvas elements", () => {
    const { container } = render(
      <BodePhasePlot data={samplePoints} margins={sampleMargins} title="Bode Phase Test" />
    );

    expect(container.querySelector("canvas")).toBeNull();
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(screen.getByText("Bode Phase Test")).toBeDefined();
  });

  it("renders phase margin pill badge when margins are provided", () => {
    const { container } = render(
      <BodePhasePlot data={samplePoints} margins={sampleMargins} />
    );

    // Should render Pm badge
    expect(container.textContent).toContain("P_m = 135.0");
  });

  it("renders -180 degree reference line", () => {
    const { container } = render(
      <BodePhasePlot data={samplePoints} margins={sampleMargins} />
    );

    const degLines = container.querySelectorAll(".deg-grid line");
    expect(degLines.length).toBeGreaterThan(0);
  });
});

describe("BodePlot", () => {
  it("renders both magnitude and phase plots in a synchronized view", () => {
    const { container } = render(
      <BodePlot data={samplePoints} margins={sampleMargins} />
    );

    expect(screen.getByText("Bode Magnitude")).toBeDefined();
    expect(screen.getByText("Bode Phase")).toBeDefined();
  });

  it("renders side-by-side 2-column responsive grid with 380px plot heights", () => {
    const { container } = render(
      <BodePlot data={samplePoints} margins={sampleMargins} />
    );

    const grid = container.querySelector(".lg\\:grid-cols-2");
    expect(grid).not.toBeNull();
    expect(grid?.className).toContain("gap-6");
    expect(grid?.className).toContain("items-stretch");

    const columns = container.querySelectorAll(".h-\\[380px\\]");
    expect(columns.length).toBe(2);
  });
});

describe("NyquistPlot", () => {
  it("renders pure SVG elements with no canvas elements", () => {
    const { container } = render(
      <NyquistPlot data={samplePoints} title="Nyquist Test" />
    );

    expect(container.querySelector("canvas")).toBeNull();
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(screen.getByText("Nyquist Test")).toBeDefined();
  });

  it("renders critical point marker and KaTeX label -1 + j0", () => {
    const { container } = render(<NyquistPlot data={samplePoints} />);

    const critPoint = container.querySelector(".critical-point");
    expect(critPoint).not.toBeNull();
    expect(container.textContent).toContain("-1 + j0");
  });

  it("renders unit circle contour |G| = 1", () => {
    const { container } = render(<NyquistPlot data={samplePoints} showUnitCircle={true} />);

    const unitCircle = container.querySelector(".unit-circle circle");
    expect(unitCircle).not.toBeNull();
  });

  it("renders both positive and negative frequency branch traces", () => {
    const { container } = render(
      <NyquistPlot data={samplePoints} showNegativeBranch={true} />
    );

    const paths = container.querySelectorAll("svg path");
    // Should have positive and negative branch paths (at least 2 paths)
    expect(paths.length).toBeGreaterThanOrEqual(2);
  });

  it("resets viewport on Reset button click", () => {
    const { container } = render(<NyquistPlot data={samplePoints} />);
    const resetBtn = screen.getByTitle("Reset View");
    expect(resetBtn).toBeDefined();

    fireEvent.click(resetBtn);
    expect(container.querySelector("svg")).not.toBeNull();
  });
});

describe("NicholsPlot", () => {
  const sampleNichols = samplePoints.map((p) => ({
    phase: p.phaseUnwrappedDeg,
    magnitude: p.magnitudeDb,
    omega: p.omega,
  }));

  it("renders pure SVG elements with critical stability marker", () => {
    const { container } = render(
      <NicholsPlot data={sampleNichols} title="Nichols Test" />
    );

    expect(container.querySelector("canvas")).toBeNull();
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(screen.getByText("Nichols Test")).toBeDefined();

    const critPoint = container.querySelector(".critical-point");
    expect(critPoint).not.toBeNull();
  });

  it("locks canvas cursor to cursor-crosshair without drag panning", () => {
    const { container } = render(<NicholsPlot data={sampleNichols} />);
    const canvasDiv = container.querySelector(".cursor-crosshair");
    expect(canvasDiv).not.toBeNull();
  });

  it("renders HUD tooltip with KaTeX formatting on pointer hover", () => {
    const { container } = render(<NicholsPlot data={sampleNichols} />);
    const canvasDiv = container.querySelector(".cursor-crosshair") as HTMLElement;

    // Hover near point omega=1.0 (phase=-45, mag=-3.01) at (488, 156)
    fireEvent.pointerMove(canvasDiv, { clientX: 488, clientY: 156 });

    // Floating HUD tooltip with KaTeX labels
    const tooltip = container.querySelector(".backdrop-blur-md");
    expect(tooltip).not.toBeNull();
    expect(tooltip?.textContent).toContain("\\omega =");
    expect(tooltip?.textContent).toContain("|G(j\\omega)|");
    expect(tooltip?.textContent).toContain("\\angle G(j\\omega)");
  });
});

describe("HUD Tooltip Isolation in BodePlot", () => {
  it("isolates floating HUD tooltip to only the directly hovered plot", () => {
    const { container } = render(
      <BodePlot data={samplePoints} margins={sampleMargins} />
    );

    const canvases = container.querySelectorAll(".cursor-crosshair");
    expect(canvases.length).toBe(2);

    const magnitudeCanvas = canvases[0] as HTMLElement;
    const phaseCanvas = canvases[1] as HTMLElement;

    // Initially neither canvas has floating HUD tooltip
    expect(magnitudeCanvas.querySelector(".backdrop-blur-md")).toBeNull();
    expect(phaseCanvas.querySelector(".backdrop-blur-md")).toBeNull();

    // Hover over Magnitude: pointerEnter + pointerMove
    fireEvent.pointerEnter(magnitudeCanvas);
    fireEvent.pointerMove(magnitudeCanvas, { clientX: 200, clientY: 150 });

    // Only Magnitude canvas should render floating HUD tooltip
    expect(magnitudeCanvas.querySelector(".backdrop-blur-md")).not.toBeNull();
    expect(phaseCanvas.querySelector(".backdrop-blur-md")).toBeNull();

    // Leave Magnitude canvas
    fireEvent.pointerLeave(magnitudeCanvas);
    expect(magnitudeCanvas.querySelector(".backdrop-blur-md")).toBeNull();

    // Hover over Phase canvas: pointerEnter + pointerMove
    fireEvent.pointerEnter(phaseCanvas);
    fireEvent.pointerMove(phaseCanvas, { clientX: 200, clientY: 150 });

    // Only Phase canvas should render floating HUD tooltip
    expect(phaseCanvas.querySelector(".backdrop-blur-md")).not.toBeNull();
    expect(magnitudeCanvas.querySelector(".backdrop-blur-md")).toBeNull();
  });
});

describe("NyquistPlot HUD KaTeX formatting", () => {
  it("renders branch indicator and complex parameters in KaTeX on hover", () => {
    const { container } = render(
      <NyquistPlot data={samplePoints} showNegativeBranch={true} />
    );

    const canvasDiv = container.querySelector(".cursor-crosshair") as HTMLElement;
    expect(canvasDiv).not.toBeNull();

    // Trigger hover near point (re=0.01, im=-0.1) at (301, 270)
    fireEvent.pointerMove(canvasDiv, { clientX: 301, clientY: 270 });

    const tooltip = container.querySelector(".backdrop-blur-md");
    expect(tooltip).not.toBeNull();
    expect(tooltip?.textContent).toContain("\\omega \\ge 0");
    expect(tooltip?.textContent).toContain("\\text{Re} =");
    expect(tooltip?.textContent).toContain("\\text{Im} =");
  });
});

