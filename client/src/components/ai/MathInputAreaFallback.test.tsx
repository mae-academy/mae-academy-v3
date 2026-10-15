// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MathInputArea } from "./MathInputArea";
import { serializeRoot, setCaret } from "./composerDom";

// MathLive is unavailable (it failed to load or timed out): formulas must degrade to atomic KaTeX chips, never raw dollars.
vi.mock("./mathliveLoader", () => ({
  isMathLiveReady: () => false,
  hasMathLiveFailed: () => true,
  loadMathLive: () => Promise.resolve(false),
  MATH_FIELD_TAG: "math-field",
}));

const root = () => screen.getByRole("textbox", { name: "Message" });
const chips = () => Array.from(root().querySelectorAll<HTMLElement>(".mae-math-chip"));
const renderArea = (value: string) => {
  const onChange = vi.fn();
  const ref = { current: null as import("./MathInputArea").MathInputHandle | null };
  render(<MathInputArea ref={ref} value={value} onChange={onChange} onSubmit={() => {}} ariaLabel="Message" />);
  return { onChange, ref };
};

afterEach(cleanup);

describe("MathInputArea without MathLive", () => {
  it("renders formulas as non-editable KaTeX chips with no dollar signs or commands visible, and still serializes", () => {
    renderArea("Find $\\frac{a}{b}$ now");
    expect(chips()).toHaveLength(1);
    expect(chips()[0].getAttribute("contenteditable")).toBe("false");
    expect(chips()[0].querySelector(".katex")).not.toBeNull();
    expect(root().textContent).not.toContain("$");
    expect(serializeRoot(root())).toBe("Find $\\frac{a}{b}$ now");
  });

  it("deletes a chip as a unit with Backspace or Delete next to it", () => {
    renderArea("a$x$b");
    const chip = chips()[0];
    const after = chip.nextSibling as Text;
    setCaret(after, after.data.startsWith("​") ? 1 : 0);
    expect(fireEvent.keyDown(root(), { key: "Backspace" })).toBe(false);
    expect(chips()).toHaveLength(0);
    expect(serializeRoot(root())).toBe("ab");
  });

  it("arrows step over a chip", () => {
    renderArea("a$x$b");
    const first = root().firstChild as Text;
    setCaret(first, first.data.length);
    fireEvent.keyDown(root(), { key: "ArrowRight" });
    expect(window.getSelection()!.getRangeAt(0).startContainer).toBe(chips()[0].nextSibling);
  });

  it("inserting a key falls back to a chip showing the key's default formula", async () => {
    const { ref } = renderArea("");
    let result: boolean | Promise<boolean> = false;
    await act(async () => {
      result = ref.current!.insertMath("\\frac{\\placeholder{}}{\\placeholder{}}", "\\frac{a}{b}");
      await result;
    });
    expect(await result).toBe(true);
    expect(chips()).toHaveLength(1);
    expect(serializeRoot(root())).toBe("$\\frac{a}{b}$");
  });
});
