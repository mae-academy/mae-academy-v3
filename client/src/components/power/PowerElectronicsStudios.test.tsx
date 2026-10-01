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

import { InverterStudio } from "./InverterStudio";
import { ACVoltageControllerStudio } from "./ACVoltageControllerStudio";
import { ChopperStudio } from "./ChopperStudio";

beforeAll(() => {
  installInProcessControlApi();
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

afterAll(uninstallInProcessControlApi);

describe("InverterStudio", () => {
  it("renders with SegmentedControl and allows switching between Waveform and Spectrum views", async () => {
    const { container } = await renderReady(<InverterStudio />);

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
    await flushSim();
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
    await flushSim();
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
    const { container } = await renderReady(<ACVoltageControllerStudio />);

    expect(container.querySelector("svg")).not.toBeNull();

    // Switch to Three-Phase
    const buttons = Array.from(container.querySelectorAll("button"));
    const threePhaseBtn = buttons.find((b) => b.textContent?.includes("Three-Phase"));
    expect(threePhaseBtn).toBeDefined();

    if (threePhaseBtn) {
      await act(async () => {
        fireEvent.click(threePhaseBtn);
      });
    await flushSim();
    }

    // Check 3-Phase scope title & trace nomenclature
    expect(container.textContent).toContain("THREE-PHASE AC CONTROLLER OUTPUT SCOPE");
    expect(container.textContent).toContain("V_{oA}(t)");
    expect(container.textContent).toContain("V_{oB}(t)");
    expect(container.textContent).toContain("V_{oC}(t)");
    expect(container.textContent).toContain("I_o(t)");
  });

  it("renders alpha and beta annotations in KaTeX math italics and g(t) in violet", async () => {
    const { container } = await renderReady(<ACVoltageControllerStudio />);

    // Check angle annotations typography
    const annotationTexts = Array.from(container.querySelectorAll("svg text")).filter(
      (el) => el.textContent === "α" || el.textContent === "β"
    );
    expect(annotationTexts.length).toBeGreaterThan(0);
    annotationTexts.forEach((el) => {
      const cls = el.getAttribute("class") ?? "";
      expect(cls).toContain("italic");
      expect(cls).toContain("font-serif");
      expect(el.getAttribute("font-weight")).toBeNull();
      expect((el as HTMLElement).style.fontStyle).toBe("italic");
    });

    // Switch overlay to Gate Pulses
    const buttons = Array.from(container.querySelectorAll("button"));
    const gateBtn = buttons.find((b) => b.textContent?.includes("Gate"));
    if (gateBtn) {
      await act(async () => {
        fireEvent.click(gateBtn);
      });
    await flushSim();
      const gateTrace = container.querySelector('path[stroke="#7c3aed"]');
      expect(gateTrace).not.toBeNull();
    }
  });

  it("displays computed beta alongside alpha as a read-only readout with parity on scope", async () => {
    const { container } = await renderReady(<ACVoltageControllerStudio />);

    // Confirm beta is displayed as a read-only math label alongside alpha
    expect(container.textContent).toContain("α=");
    expect(container.textContent).toContain("β=");
    expect(container.textContent).toContain("\\alpha =");
    expect(container.textContent).toContain("\\beta =");

    // Ensure there is NO slider for beta (only firing angle slider exists)
    const sliders = container.querySelectorAll('input[type="range"]');
    expect(sliders.length).toBe(1);
    expect(sliders[0].getAttribute("aria-label")).toBe("firing angle");

    // Parity check on scope annotation text and lines
    const alphaTexts = Array.from(container.querySelectorAll("svg text")).filter((el) => el.textContent === "α");
    const betaTexts = Array.from(container.querySelectorAll("svg text")).filter((el) => el.textContent === "β");
    expect(alphaTexts.length).toBeGreaterThan(0);
    expect(betaTexts.length).toBeGreaterThan(0);

    // Verify alpha and beta share identical fill color, font classes, and font styling
    expect(betaTexts[0].getAttribute("fill")).toBe(alphaTexts[0].getAttribute("fill"));
    expect(betaTexts[0].getAttribute("class")).toBe(alphaTexts[0].getAttribute("class"));
    expect((betaTexts[0] as HTMLElement).style.fontFamily).toBe((alphaTexts[0] as HTMLElement).style.fontFamily);

    // Verify input box values are styled with text-xl sm:text-2xl font-medium and KaTeX font
    const numInputs = container.querySelectorAll('input[type="number"]');
    expect(numInputs.length).toBeGreaterThan(0);
    numInputs.forEach((input) => {
      const cls = input.getAttribute("class") ?? "";
      expect(cls).toContain("text-xl");
      expect(cls).toContain("sm:text-2xl");
      expect(cls).toContain("font-medium");
      expect((input as HTMLElement).style.fontFamily).toContain("KaTeX_Main");
    });
  });
});

describe("ChopperStudio", () => {
  it("renders with SegmentedControl for quadrant class and topology", async () => {
    const { container } = await renderReady(<ChopperStudio />);

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
    await flushSim();
    }

    const classBBtn = buttons.find((b) => b.textContent?.includes("Class B"));
    expect(classBBtn).toBeDefined();

    if (classBBtn) {
      await act(async () => {
        fireEvent.click(classBBtn);
      });
    await flushSim();
    }

    expect(container.textContent).toContain("Boost");
  });

  it("renders g(t) trace with violet stroke and swatch, and settles cleanly at zero duty cycle without dcm markers", async () => {
    const { container } = await renderReady(<ChopperStudio />);

    // Verify g(t) trace path or swatch uses violet #7c3aed
    const gatePath = container.querySelector('path[stroke="#7c3aed"]');
    expect(gatePath).not.toBeNull();

    // Verify input fields have KaTeX font, text-xl/text-2xl sizing, and focus ring
    const numberInputs = Array.from(container.querySelectorAll('input[type="number"]'));
    expect(numberInputs.length).toBeGreaterThan(0);
    numberInputs.forEach((input) => {
      expect((input as HTMLElement).style.fontFamily).toContain("KaTeX_Main");
      expect(input.className).toContain("text-xl");
      expect(input.className).toContain("sm:text-2xl");
      expect(input.className).toContain("focus:ring-violet-500");
    });

    // Set duty cycle to 0
    const dutyInput = container.querySelector('input[aria-label="D"]');
    expect(dutyInput).not.toBeNull();
    if (dutyInput) {
      await act(async () => {
        fireEvent.change(dutyInput, { target: { value: "0" } });
      });
    await flushSim();
    }

    // Verify there are no internal dcm-marker SVG elements
    expect(container.querySelector(".dcm-marker")).toBeNull();
  });

  it("switches to Class B without triggering warnings and displays quadrant badges in Poppins", async () => {
    const { container } = await renderReady(<ChopperStudio />);

    // Verify quadrant badge uses Poppins styling
    const badgeSpans = Array.from(container.querySelectorAll("button span"));
    const badge2ndQ = badgeSpans.find((el) => el.textContent?.includes("2nd-Q"));
    expect(badge2ndQ).toBeDefined();
    expect(badge2ndQ?.className).toContain("Poppins");

    // Switch to Class B
    const buttons = Array.from(container.querySelectorAll("button"));
    const classBBtn = buttons.find((b) => b.textContent?.includes("Class B"));
    expect(classBBtn).toBeDefined();

    if (classBBtn) {
      await act(async () => {
        fireEvent.click(classBBtn);
      });
    await flushSim();
    }

    // Verify no warning or error alerts are triggered
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).not.toContain("unidirectional chopper cannot sustain reverse current");
  });

  it("opens in CCM by default: no DCM banner text, mode badge shows CCM", async () => {
    const { container } = await renderReady(<ChopperStudio />);
    expect(container.textContent).not.toContain("DISCONTINUOUS CONDUCTION");
    expect(container.textContent).not.toContain("Load current reaches 0 A");
    const allSpans = Array.from(container.querySelectorAll("span"));
    const ccmBadge = allSpans.find((el) => el.textContent?.trim() === "CCM");
    expect(ccmBadge).toBeDefined();
    expect(ccmBadge?.className).toContain("emerald");
  });
});

