// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AI_MAX_MESSAGE_CHARS } from "@shared/aiTypes";
import { ChatComposer } from "./ChatComposer";
import { setCaret } from "./composerDom";
import { clickKey, composer, composerMath, getComposerValue, typeInComposer } from "./composerTestUtils";
import { ALL_MATH_KEYS } from "./mathKeyboardData";

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
const toggle = () => screen.getByRole("button", { name: /math keyboard/i });
const button = (name: string) => screen.getByRole("button", { name });
/** A pointer click on a tab, as the browser delivers it (mousedown prevented). */
const press = (el: HTMLElement) => {
  expect(fireEvent.mouseDown(el)).toBe(false);
  fireEvent.click(el);
};
const tab = (name: string) => press(screen.getByRole("tab", { name }));
const field = () => composerMath()[0];

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("math keyboard data", () => {
  it("gives every parametrised key a MathLive template with empty boxes, and symbols none", () => {
    const byId = Object.fromEntries(ALL_MATH_KEYS.map((k) => [k.id, k]));
    expect(byId.integral.template).toBe("\\int_{\\placeholder{}}^{\\placeholder{}}");
    expect(byId.integral.latex).toBe("\\int_{a}^{b}");
    expect(byId.limit.template).toBe("\\lim_{\\placeholder{} \\to \\placeholder{}}");
    expect(byId.sin.template).toBe("\\sin(\\placeholder{})");
    expect(byId["nth-root"].template).toBe("\\sqrt[\\placeholder{}]{\\placeholder{}}");
    expect(byId.matrix.template.match(/\\placeholder\{\}/g)).toHaveLength(4);
    expect(byId.alpha.template).toBe("\\alpha");
    for (const key of ALL_MATH_KEYS) expect(key.template).not.toMatch(/[⟦⟧⟨⟩‸]/);
  });
});

describe("math keyboard in the composer", () => {
  it("toggles with aria-expanded / aria-controls; Escape returns focus to the editor", async () => {
    setup();
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    clickKey(/math keyboard/i);
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    const panelId = toggle().getAttribute("aria-controls")!;
    const panel = document.getElementById(panelId)!;
    expect(panel).not.toBeNull();
    expect(panel.querySelector('[dir="ltr"]')).not.toBeNull();

    button("Integral from a to b").focus();
    fireEvent.keyDown(button("Integral from a to b"), { key: "Escape" });
    expect(document.activeElement).toBe(composer());
    await waitFor(() => expect(document.getElementById(panelId)).toBeNull());
    expect(toggle().getAttribute("aria-expanded")).toBe("false");

    clickKey(/math keyboard/i);
    composer().focus();
    fireEvent.keyDown(composer(), { key: "Escape" });
    await waitFor(() => expect(document.getElementById(panelId)).toBeNull());
    expect(document.activeElement).toBe(composer());
  });

  it("switches tabs with arrow keys (roving tabindex) and remembers the last tab", () => {
    setup();
    clickKey(/math keyboard/i);
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

  it("a key creates a formula node with empty boxes and puts the caret in the first one; no dollar sign or backslash is visible", () => {
    setup();
    composer().focus();
    clickKey(/math keyboard/i);
    clickKey("Integral from a to b");
    expect(composerMath()).toHaveLength(1);
    expect(field().tagName.toLowerCase()).toBe("math-field");
    expect((field() as unknown as { value: string }).value).toBe("\\int_{\\placeholder{}}^{\\placeholder{}}");
    expect(document.activeElement).toBe(field());
    // MathLive visits the upper limit before the lower one, so the lower (first written) box is the second stop.
    expect((field() as unknown as { commands: unknown[] }).commands).toEqual(["moveToMathfieldStart", "moveToNextPlaceholder", "moveToNextPlaceholder"]);
    // The visible text of the editor carries no raw LaTeX.
    expect(composer().textContent!.replace(/​/g, "")).toBe("");
    expect(composer().textContent).not.toMatch(/[$\\]/);
    expect(getComposerValue()).toBe("$\\int_{}^{}$");
  });

  it("while the caret is inside a formula a key goes into THAT formula, not a new one", () => {
    setup();
    clickKey(/math keyboard/i);
    clickKey("Integral from a to b");
    tab("Algebra & Matrix");
    clickKey("Fraction");
    expect(composerMath()).toHaveLength(1);
    expect((field() as unknown as { inserted: string[] }).inserted).toEqual(["\\frac{\\placeholder{}}{\\placeholder{}}"]);
    // Below the 80% threshold the counter stays hidden.
    expect(screen.queryByText(/characters/)).toBeNull();
  });

  it("a symbol key is inserted without boxes and the caret goes to its end", () => {
    setup();
    clickKey(/math keyboard/i);
    tab("Greek & Constants");
    clickKey("alpha");
    expect((field() as unknown as { value: string; commands: unknown[] }).value).toBe("\\alpha");
    expect((field() as unknown as { commands: unknown[] }).commands).toEqual(["moveToMathfieldEnd"]);
    expect(getComposerValue()).toBe("$\\alpha$");
  });

  it("inserts at the caret between two pieces of text", () => {
    setup();
    typeInComposer("ab");
    setCaret(composer().firstChild!, 1);
    clickKey(/math keyboard/i);
    clickKey("Integral from a to b");
    expect(getComposerValue()).toBe("a$\\int_{}^{}$b");
  });

  it("wraps a plain-text selection: it moves into the first box and the caret goes on to the next box", () => {
    setup();
    typeInComposer("x+1");
    const range = document.createRange();
    range.selectNodeContents(composer().firstChild!);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    clickKey(/math keyboard/i);
    tab("Algebra & Matrix");
    clickKey("Fraction");
    expect((field() as unknown as { value: string }).value).toBe("\\frac{x+1}{\\placeholder{}}");
    expect((field() as unknown as { commands: unknown[] }).commands).toEqual(["moveToMathfieldStart", "moveToNextPlaceholder"]);
    expect(getComposerValue()).toBe("$\\frac{x+1}{}$");
  });

  it("a selection that is not plain math text is replaced, not moved", () => {
    setup();
    typeInComposer("a\\b");
    const range = document.createRange();
    range.selectNodeContents(composer().firstChild!);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    clickKey(/math keyboard/i);
    tab("Algebra & Matrix");
    clickKey("Square root");
    expect((field() as unknown as { value: string }).value).toBe("\\sqrt{\\placeholder{}}");
  });

  it("refuses an insertion past the limit, keeps the text, and flashes the counter and hint", () => {
    setup();
    typeInComposer("a".repeat(AI_MAX_MESSAGE_CHARS - 3));
    clickKey(/math keyboard/i);
    clickKey("Integral from a to b");
    expect(getComposerValue()).toHaveLength(AI_MAX_MESSAGE_CHARS - 3);
    expect(composerMath()).toHaveLength(0);
    expect(screen.getByText(/Message limit reached/)).toBeTruthy();
    expect(screen.getByText(/characters/)).toBeTruthy();
  });

  it("sends the inserted formula with delimiters", () => {
    const { onSubmit } = setup();
    clickKey(/math keyboard/i);
    clickKey("Integral from a to b");
    (field() as unknown as { type: (s: string) => void }).type("\\int_{0}^{1}");
    fireEvent.click(button("Send"));
    expect(onSubmit).toHaveBeenCalledWith({ text: "$\\int_{0}^{1}$", image: null, document: null });
  });

  it("an emptied formula does not count as content for Send", () => {
    setup();
    clickKey(/math keyboard/i);
    tab("Greek & Constants");
    clickKey("alpha");
    (field() as unknown as { type: (s: string) => void }).type("");
    expect((button("Send") as HTMLButtonElement).disabled).toBe(true);
  });
});
