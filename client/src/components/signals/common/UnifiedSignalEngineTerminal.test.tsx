// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { UnifiedSignalEngineTerminal } from "./UnifiedSignalEngineTerminal";
import { SIGNAL_TOKENS } from "@shared/signals/unifiedSignalParser";

// jsdom cannot host MathLive's custom element; the terminal's own wiring is what is under test.
vi.mock("mathlive", () => ({ MathfieldElement: class {} }));

afterEach(() => cleanup());

/** Attribute lookup: jsdom cannot compute accessible names across KaTeX markup. */
const button = (label: string) => { const node = document.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`); if (!node) throw new Error(`Missing button ${label}`); return node; };

function Harness({ initial = "r(t)", dual = false }: { initial?: string; dual?: boolean }) {
  const [x, setX] = useState(initial);
  const [h, setH] = useState("u(t)");
  return (
    <>
      <UnifiedSignalEngineTerminal
        channels={dual
          ? [{ id: "x", lhs: "x(t)", value: x, onChange: setX }, { id: "h", lhs: "h(t)", value: h, onChange: setH }]
          : [{ id: "x", lhs: "x(t)", value: x, onChange: setX }]}
      />
      <output data-testid="x-value">{x}</output>
      <output data-testid="h-value">{h}</output>
    </>
  );
}

describe("UnifiedSignalEngineTerminal", () => {
  it("renders the split keypad and the strictly ordered signal palette", () => {
    render(<Harness />);
    expect(screen.getByText("Signal Engine")).toBeTruthy();
    for (const digit of ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "(", ")"]) expect(button(digit)).toBeTruthy();
    for (const name of ["Decimal point", "Backspace", "Clear"]) expect(button(name)).toBeTruthy();
    const palette = Array.from(document.querySelectorAll<HTMLButtonElement>("button[aria-label]")).map((node) => node.getAttribute("aria-label"));
    const order = SIGNAL_TOKENS.map((token) => palette.indexOf(token.ariaLabel));
    expect(order.every((index, position) => index >= 0 && (position === 0 || index > order[position - 1]))).toBe(true);
    expect(button("Triangular pulse").textContent).toContain("tri");
  });

  it("differentiates r(t) into u(t) and integrates it back symbolically", () => {
    render(<Harness />);
    fireEvent.click(button("Differentiate Expression"));
    expect(screen.getByTestId("x-value").textContent).toMatch(/^u/);
    fireEvent.click(button("Integrate Expression"));
    expect(screen.getByTestId("x-value").textContent).toMatch(/^r/);
  });

  it("wraps the expression in explicit operator syntax", () => {
    render(<Harness initial="\text{rect}(t)" />);
    fireEvent.click(button("Wrap in derivative operator"));
    expect(screen.getByTestId("x-value").textContent).toContain("\\frac{d}{dt}\\left(");
  });

  it("shows both dual-signal rows at once, with no tabs or Signal A/B captions", () => {
    render(<Harness dual />);
    expect(document.querySelector('[data-channel="x"]')).toBeTruthy();
    expect(document.querySelector('[data-channel="h"]')).toBeTruthy();
    expect(document.querySelector('[role="tab"]')).toBeNull();
    expect(document.body.textContent).not.toMatch(/Signal [AB]/);
  });

  it("renders keypad digits through KaTeX", () => {
    render(<Harness />);
    for (const digit of ["0", "5", "9", "(", ")"]) expect(button(digit).querySelector(".katex")).toBeTruthy();
  });

  it("routes the calculus strip to the last-clicked row in dual-signal mode", () => {
    render(<Harness dual />);
    fireEvent.click(document.querySelector<HTMLElement>('[data-channel="h"]')!);
    fireEvent.click(button("Differentiate Expression"));
    expect(screen.getByTestId("h-value").textContent).toContain("\\delta");
    expect(screen.getByTestId("x-value").textContent).toBe("r(t)");
  });

  it("enables the Calculus Engine for system expressions containing x(t)", () => {
    render(<Harness initial="x(t)+5" />);
    fireEvent.click(button("Differentiate Expression"));
    expect(screen.getByTestId("x-value").textContent).toBe("x^{\\prime}\\!\\left(t\\right)");
  });

  it("clears the active signal with AC", () => {
    render(<Harness />);
    fireEvent.click(button("Clear"));
    expect(screen.getByTestId("x-value").textContent).toBe("");
  });
});
