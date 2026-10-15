// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AI_MAX_MESSAGE_CHARS } from "@shared/aiTypes";
import { ChatComposer } from "./ChatComposer";

/** Node's experimental global `localStorage` shadows jsdom's, so tests bring their own. */
function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; },
    clear: () => data.clear(),
    getItem: (k: string) => data.get(k) ?? null,
    key: (i: number) => [...data.keys()][i] ?? null,
    removeItem: (k: string) => { data.delete(k); },
    setItem: (k: string, v: string) => { data.set(k, String(v)); },
  };
}

function setup() {
  const onSubmit = vi.fn();
  render(<ChatComposer phase="idle" onSubmit={onSubmit} onStop={() => {}} onActivity={() => {}} />);
  return { onSubmit };
}
const textarea = () => screen.getByRole("textbox", { name: "Message MAE AI" }) as HTMLTextAreaElement;
const toggle = () => screen.getByRole("button", { name: /math keyboard/i });
const button = (name: string) => screen.getByRole("button", { name });
/** A pointer click as the browser delivers it: mousedown is prevented, so focus must not move. */
function press(el: HTMLElement) {
  const notPrevented = fireEvent.mouseDown(el);
  expect(notPrevented).toBe(false);
  fireEvent.click(el);
}
const selection = () => [textarea().selectionStart, textarea().selectionEnd];

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("math keyboard in the composer", () => {
  it("toggles with aria-expanded / aria-controls; Escape returns focus to the textarea", async () => {
    setup();
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    press(toggle());
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    const panelId = toggle().getAttribute("aria-controls")!;
    const panel = document.getElementById(panelId)!;
    expect(panel).not.toBeNull();
    expect(panel.querySelector('[dir="ltr"]')).not.toBeNull();

    button("Integral from a to b").focus();
    fireEvent.keyDown(button("Integral from a to b"), { key: "Escape" });
    expect(document.activeElement).toBe(textarea());
    await waitFor(() => expect(document.getElementById(panelId)).toBeNull());
    expect(toggle().getAttribute("aria-expanded")).toBe("false");

    press(toggle());
    textarea().focus();
    fireEvent.keyDown(textarea(), { key: "Escape" });
    await waitFor(() => expect(document.getElementById(panelId)).toBeNull());
    expect(document.activeElement).toBe(textarea());
  });

  it("switches tabs with arrow keys (roving tabindex) and remembers the last tab", () => {
    setup();
    press(toggle());
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Calculus", "Functions", "Algebra & Matrix", "Greek & Constants"]);
    expect(tabs.map((t) => t.getAttribute("tabindex"))).toEqual(["0", "-1", "-1", "-1"]);
    tabs[0].focus();
    fireEvent.keyDown(tabs[0], { key: "ArrowRight" });
    const functions = screen.getByRole("tab", { name: "Functions" });
    expect(functions.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(functions);
    expect(within(screen.getByRole("tabpanel")).getByRole("button", { name: "Natural logarithm" })).toBeTruthy();
    fireEvent.keyDown(functions, { key: "End" });
    const greek = screen.getByRole("tab", { name: "Greek & Constants" });
    expect(greek.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(greek, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Calculus" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(screen.getByRole("tab", { name: "Calculus" }), { key: "ArrowLeft" });
    expect(window.localStorage.getItem("mae-ai:mathkb-tab:v1")).toBe("greek");
  });

  it("inserts two keys keeping the textarea focused, with the right value, selection and counter", () => {
    setup();
    textarea().focus();
    press(toggle());
    press(button("Integral from a to b"));
    expect(document.activeElement).toBe(textarea());
    expect(textarea().value).toBe("$\\int_{a}^{b}$");
    expect(selection()).toEqual([7, 8]);

    press(screen.getByRole("tab", { name: "Algebra & Matrix" }));
    press(button("Fraction"));
    expect(document.activeElement).toBe(textarea());
    expect(textarea().value).toBe("$\\int_{\\frac{a}{b}}^{b}$");
    const [start, end] = selection();
    expect(start).toBe(end);
    expect(textarea().value.slice(0, start!)).toBe("$\\int_{\\frac{a}");
    // Below the 80% threshold the counter stays hidden.
    expect(screen.queryByText(/characters/)).toBeNull();
  });

  it("types over the selected placeholder and wraps a selection", () => {
    setup();
    textarea().focus();
    press(toggle());
    press(button("Integral from a to b"));
    const [s, e] = selection();
    // What typing "0" over the selection produces.
    const typed = textarea().value.slice(0, s!) + "0" + textarea().value.slice(e!);
    fireEvent.change(textarea(), { target: { value: typed } });
    expect(textarea().value).toBe("$\\int_{0}^{b}$");

    fireEvent.change(textarea(), { target: { value: "x+1" } });
    textarea().setSelectionRange(0, 3);
    press(screen.getByRole("tab", { name: "Algebra & Matrix" }));
    press(button("Square root"));
    expect(textarea().value).toBe("$\\sqrt{x+1}$");
    expect(selection()[0]).toBe(selection()[1]);
    expect(selection()[0]).toBe("$\\sqrt{x+1}".length);
  });

  it("refuses an insertion past the limit, keeps the text, and flashes the counter and hint", () => {
    setup();
    fireEvent.change(textarea(), { target: { value: "a".repeat(AI_MAX_MESSAGE_CHARS - 3) } });
    press(toggle());
    press(button("Integral from a to b"));
    expect(textarea().value).toHaveLength(AI_MAX_MESSAGE_CHARS - 3);
    expect(screen.getByText(/Message limit reached/)).toBeTruthy();
    expect(screen.getByText(/characters/)).toBeTruthy();
  });

  it("sends the inserted formula", () => {
    const { onSubmit } = setup();
    press(toggle());
    press(button("Integral from a to b"));
    fireEvent.click(button("Send"));
    expect(onSubmit).toHaveBeenCalledWith({ text: "$\\int_{a}^{b}$", image: null, document: null });
  });
});
