// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { InverterStudio } from "./InverterStudio";
import { ACVoltageControllerStudio } from "./ACVoltageControllerStudio";
import { ChopperStudio } from "./ChopperStudio";

beforeAll(() => {
  class StubResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = StubResizeObserver;
  HTMLElement.prototype.getBoundingClientRect = () => ({
    width: 800,
    height: 530,
    top: 0,
    left: 0,
    right: 800,
    bottom: 530,
    x: 0,
    y: 0,
    toJSON() {
      return {};
    },
  });
});

describe("InverterStudio", () => {
  it("renders with SegmentedControl and allows switching between Waveform and Spectrum views", async () => {
    const { container } = render(<InverterStudio />);

    // Check that PowerScopePlot is present
    expect(container.querySelector("svg")).not.toBeNull();

    // Check segmented control buttons
    const buttons = Array.from(container.querySelectorAll("button"));
    const threePhaseBtn = buttons.find((b) => b.textContent?.includes("Three-Phase"));
    expect(threePhaseBtn).toBeDefined();

    // Click Three-Phase
    if (threePhaseBtn) {
      await act(async () => {
        fireEvent.click(threePhaseBtn);
      });
    }

    // Verify 3-phase subtitle has VoA, VoB, VoC, Io
    expect(container.textContent).toContain("V_{oA}(t)");
    expect(container.textContent).toContain("V_{oB}(t)");
    expect(container.textContent).toContain("V_{oC}(t)");
    expect(container.textContent).toContain("I_o(t)");

    // Toggle to Spectrum view
    const updatedButtons = Array.from(container.querySelectorAll("button"));
    const spectrumBtn = updatedButtons.find((b) => b.textContent?.includes("Spectrum"));
    if (spectrumBtn) {
      await act(async () => {
        fireEvent.click(spectrumBtn);
      });
    }

    expect(container.textContent).toContain("Harmonic Spectrum");
    // Verify KaTeX math labels in spectrum view
    expect(container.textContent).toContain("V_{o1,\\text{RMS}}");
    expect(container.textContent).toContain("\\text{THD}_v");
    expect(container.textContent).toContain("n = 1, \\dots, 25");

    // Verify SVG text tick labels use KaTeX font
    const svgTexts = Array.from(container.querySelectorAll("svg text"));
    const katexTick = svgTexts.find((t) => (t as HTMLElement).style.fontFamily?.includes("KaTeX_Main"));
    expect(katexTick).toBeDefined();

    // Verify fundamental blue lollipop circle exists and stays within plot bounds (y >= 24)
    const fundamentalCircle = container.querySelector('svg circle[fill="#2563eb"]');
    expect(fundamentalCircle).not.toBeNull();
    const cy = Number(fundamentalCircle?.getAttribute("cy"));
    expect(cy).toBeGreaterThanOrEqual(24);
  });
});

describe("ACVoltageControllerStudio", () => {
  it("renders with SegmentedControl and updates parameters", async () => {
    const { container } = render(<ACVoltageControllerStudio />);

    expect(container.querySelector("svg")).not.toBeNull();

    // Switch to Three-Phase
    const buttons = Array.from(container.querySelectorAll("button"));
    const threePhaseBtn = buttons.find((b) => b.textContent?.includes("Three-Phase"));
    expect(threePhaseBtn).toBeDefined();

    if (threePhaseBtn) {
      await act(async () => {
        fireEvent.click(threePhaseBtn);
      });
    }

    // Check 3-Phase scope title & trace nomenclature
    expect(container.textContent).toContain("THREE-PHASE AC CONTROLLER OUTPUT SCOPE");
    expect(container.textContent).toContain("V_{oA}(t)");
    expect(container.textContent).toContain("V_{oB}(t)");
    expect(container.textContent).toContain("V_{oC}(t)");
    expect(container.textContent).toContain("I_o(t)");
  });
});

describe("ChopperStudio", () => {
  it("renders with SegmentedControl for quadrant class and topology", async () => {
    const { container } = render(<ChopperStudio />);

    expect(container.querySelector("svg")).not.toBeNull();
    // Verify trace names
    expect(container.textContent).toContain("V_o(t)");
    expect(container.textContent).toContain("I_o(t)");

    // Switch to Class B or Boost
    const buttons = Array.from(container.querySelectorAll("button"));
    const boostBtn = buttons.find((b) => b.textContent?.includes("Boost"));
    expect(boostBtn).toBeDefined();

    if (boostBtn) {
      await act(async () => {
        fireEvent.click(boostBtn);
      });
    }

    const classBBtn = buttons.find((b) => b.textContent?.includes("Class B"));
    expect(classBBtn).toBeDefined();

    if (classBBtn) {
      await act(async () => {
        fireEvent.click(classBBtn);
      });
    }

    expect(container.textContent).toContain("Boost");
  });
});
