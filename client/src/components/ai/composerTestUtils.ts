import { act, fireEvent, screen } from "@testing-library/react";
import { expect } from "vitest";
import { buildFragment, normalizeRoot, serializeRoot, MATH_ATTR } from "./composerDom";

/**
 * Test helpers for the composer's contenteditable editor. MathLive does not run in jsdom, so a small STUB `<math-field>` custom element is
 * registered (once) when this module loads: it keeps a `value`, answers `getValue`, records `executeCommand` / `insert` calls, and
 * `type()` emulates what typing inside a real field does (changes the value and fires `input`). The editor treats it exactly like
 * MathLive, so node creation, placeholder commands, caret moves and serialization are testable; real MathLive behaviour is covered by the
 * browser verification instead.
 */
export class StubMathField extends HTMLElement {
  value = "";
  commands: unknown[] = [];
  inserted: string[] = [];
  connectedCallback() {
    if (!this.hasAttribute("tabindex")) this.setAttribute("tabindex", "0");
  }
  getValue(format = "latex"): string {
    return format === "latex-without-placeholders" ? this.value.replace(/\\placeholder(\[[^\]]*\])?\{[^{}]*\}/g, "") : this.value;
  }
  executeCommand(command: unknown): boolean {
    this.commands.push(command);
    return true;
  }
  insert(latex: string): boolean {
    this.inserted.push(latex);
    this.value += latex;
    return true;
  }
  /** Replaces the formula as typing in a real field would, and notifies the editor. */
  type(latex: string) {
    this.value = latex;
    fireEvent.input(this);
  }
}

if (typeof customElements !== "undefined" && !customElements.get("math-field")) customElements.define("math-field", StubMathField);

export const composer = () => screen.getByRole("textbox", { name: /Message MAE AI|Edit your message/ }) as HTMLDivElement;
export const composerPlaceholder = () => composer().getAttribute("data-placeholder") ?? "";

/** The editor's content as the wire string, read from the DOM (what a submit would send). */
export const getComposerValue = () => serializeRoot(composer());

/** All formula nodes, in order. */
export const composerMath = () => Array.from(composer().querySelectorAll<StubMathField>(`[${MATH_ATTR}]`));

/** Puts the caret at the end of the editor. */
export function caretToEndOfComposer() {
  const root = composer();
  const range = document.createRange();
  range.selectNodeContents(root);
  range.collapse(false);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
}

/** Sets the editor's whole content from a wire string and fires `input`, like the old `fireEvent.change(textarea)`. `$…$` becomes formulas. */
export function typeInComposer(text: string) {
  const root = composer();
  act(() => {
    root.replaceChildren(buildFragment(text, { live: true, label: "Formula" }));
    normalizeRoot(root);
    caretToEndOfComposer();
  });
  fireEvent.input(root);
}

/** A pointer click on a keypad key as the browser delivers it: mousedown is prevented, so focus must not move. */
export function clickKey(name: string | RegExp) {
  const key = screen.getByRole("button", { name });
  expect(fireEvent.mouseDown(key)).toBe(false);
  fireEvent.click(key);
}
