import katex from "katex";
import { describe, expect, it } from "vitest";
import { ALL_MATH_KEYS, MATH_TABS, type MathKey } from "./mathKeyboardData";
import { insertAtCursor, isInsideMath } from "./insertAtCursor";

const byId = (id: string): MathKey => {
  const found = ALL_MATH_KEYS.find((k) => k.id === id);
  if (!found) throw new Error(id);
  return found;
};
const raw = { wrap: false } as const;

describe("isInsideMath", () => {
  it.each([
    ["", 0, false],
    ["plain text", 5, false],
    ["$x", 2, true],
    ["$x$", 3, false],
    ["$x$ and ", 8, false],
    ["$x$ and $y", 10, true],
    ["$$x", 3, true],
    ["$$x$$", 5, false],
    ["$$x$$ then", 10, false],
    ["costs \\$5 total", 12, false],
    ["\\$5 and $x", 10, true],
    ["$a$ $b$ $c", 10, true],
    ["$x$", 1, true],
    ["$x$", 0, false],
  ])("%j at %i -> %s", (value, caret, expected) => {
    expect(isInsideMath(value, caret)).toBe(expected);
  });
});

describe("insertAtCursor", () => {
  it("wraps in dollars into an empty field and selects the first placeholder", () => {
    const r = insertAtCursor("", 0, 0, byId("integral"));
    expect(r).toEqual({ value: "$\\int_{a}^{b}$", caretStart: 7, caretEnd: 8 });
    expect(r!.value.slice(r!.caretStart, r!.caretEnd)).toBe("a");
  });

  it("inserts raw LaTeX when wrapping is off", () => {
    const r = insertAtCursor("", 0, 0, byId("integral"), raw)!;
    expect(r.value).toBe("\\int_{a}^{b}");
    expect(r.value.slice(r.caretStart, r.caretEnd)).toBe("a");
  });

  it("inserts in the middle of text", () => {
    const r = insertAtCursor("find  now", 5, 5, byId("sqrt"))!;
    expect(r.value).toBe("find $\\sqrt{}$ now");
    expect(r.caretStart).toBe(r.caretEnd);
    expect(r.value.slice(r.caretStart - 1, r.caretStart + 1)).toBe("{}");
  });

  it("inserts raw inside an existing math span, and a second key replaces the selected placeholder", () => {
    const first = insertAtCursor("", 0, 0, byId("integral"))!;
    const second = insertAtCursor(first.value, first.caretStart, first.caretEnd, byId("fraction"))!;
    expect(second.value).toBe("$\\int_{\\frac{a}{b}}^{b}$");
    expect(second.caretStart).toBe(second.caretEnd);
    expect(second.value.slice(second.caretStart - 1, second.caretStart)).toBe("}");
    const rawFirst = insertAtCursor("", 0, 0, byId("integral"), raw)!;
    const rawSecond = insertAtCursor(rawFirst.value, rawFirst.caretStart, rawFirst.caretEnd, byId("fraction"), raw)!;
    expect(rawSecond.value).toBe("\\int_{\\frac{a}{b}}^{b}");
  });

  it("wraps a selection into the first parameter and puts the caret after the closing brace", () => {
    const r = insertAtCursor("solve x+1 now", 6, 9, byId("sqrt"))!;
    expect(r.value).toBe("solve $\\sqrt{x+1}$ now");
    expect(r.value.slice(0, r.caretStart)).toBe("solve $\\sqrt{x+1}");
    expect(r.caretEnd).toBe(r.caretStart);
  });

  it("wraps a selection into a placeholder key (fraction) and a paren key (ln)", () => {
    expect(insertAtCursor("x+1", 0, 3, byId("fraction"), raw)!.value).toBe("\\frac{x+1}{b}");
    const ln = insertAtCursor("x", 0, 1, byId("ln"), raw)!;
    expect(ln.value).toBe("\\ln(x)");
    expect(ln.caretStart).toBe(6);
  });

  it("replaces the selection for symbol keys and leaves the caret after them", () => {
    const r = insertAtCursor("angle XX end", 6, 8, byId("theta"), raw)!;
    expect(r.value).toBe("angle \\theta end");
    expect(r.caretStart).toBe(12);
    expect(r.caretEnd).toBe(12);
    const wrapped = insertAtCursor("a ", 2, 2, byId("pi"))!;
    expect(wrapped.value).toBe("a $\\pi$");
    expect(wrapped.value.slice(0, wrapped.caretStart)).toBe("a $\\pi");
  });

  it("treats $$ blocks as math and ignores escaped dollars", () => {
    expect(insertAtCursor("$$ ", 3, 3, byId("alpha"))!.value).toBe("$$ \\alpha");
    expect(insertAtCursor("price \\$5 ", 10, 10, byId("alpha"))!.value).toBe("price \\$5 $\\alpha$");
    expect(insertAtCursor("$$x$$ ", 6, 6, byId("alpha"))!.value).toBe("$$x$$ $\\alpha$");
  });

  it("refuses an insertion that would exceed the limit, and allows one that fits exactly", () => {
    const full = "a".repeat(3995);
    expect(insertAtCursor(full, 3995, 3995, byId("integral"), { maxChars: 4000 })).toBeNull();
    const fits = insertAtCursor("a".repeat(3988), 3988, 3988, byId("integral"), { maxChars: 4000, wrap: false });
    expect(fits?.value.length).toBe(4000);
    expect(insertAtCursor("abc", 0, 3, byId("integral"), { maxChars: 3, wrap: false })).toBeNull();
  });

  it("clamps out-of-range and reversed selections", () => {
    expect(insertAtCursor("ab", 9, 9, byId("pi"), raw)!.value).toBe("ab\\pi");
    expect(insertAtCursor("abcd", 3, 1, byId("pi"), raw)!.value).toBe("a\\pid");
  });
});

describe("math keyboard data", () => {
  it("has the four tabs with unique ids and non-empty keys", () => {
    expect(MATH_TABS.map((t) => t.id)).toEqual(["calculus", "functions", "algebra", "greek"]);
    const ids = ALL_MATH_KEYS.map((k) => k.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const tab of MATH_TABS) expect(tab.keys.length).toBeGreaterThan(5);
  });

  it.each(ALL_MATH_KEYS.map((k) => [k.id, k] as const))("%s is valid LaTeX with a sane caret model and an accessible name", (_id, key) => {
    expect(() => katex.renderToString(key.latex, { throwOnError: true })).not.toThrow();
    expect(() => katex.renderToString(key.face, { throwOnError: true })).not.toThrow();
    expect(key.name.length).toBeGreaterThanOrEqual(2);
    if (key.selStart === undefined) {
      expect(key.selEnd).toBeUndefined();
      return;
    }
    expect(key.selEnd).toBeGreaterThanOrEqual(key.selStart);
    expect(key.selEnd!).toBeLessThanOrEqual(key.latex.length);
    expect(key.selStart).toBeGreaterThan(0);
    // The parameter sits right after an opening bracket or a space (matrix cells).
    expect(key.latex[key.selStart - 1]).toMatch(/[{(\[ |]/);
    if (key.selEnd === key.selStart) expect(key.latex[key.selStart]).toMatch(/[})\]]/);
  });

  it("every key produces a selection inside the inserted string", () => {
    for (const key of ALL_MATH_KEYS) {
      const r = insertAtCursor("", 0, 0, key)!;
      expect(r.caretStart).toBeGreaterThan(0);
      expect(r.caretEnd).toBeLessThanOrEqual(r.value.length);
    }
  });
});
