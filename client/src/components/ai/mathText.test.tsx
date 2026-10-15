import { describe, expect, it } from "vitest";
import { hasMath, splitMath } from "./mathText";

describe("splitMath", () => {
  it("splits inline and display math from text", () => {
    expect(splitMath("a $x^2$ b $$\\int_a^b f$$ c")).toEqual([
      { kind: "text", text: "a " },
      { kind: "inline", math: "x^2" },
      { kind: "text", text: " b " },
      { kind: "display", math: "\\int_a^b f" },
      { kind: "text", text: " c" },
    ]);
  });

  it("keeps currency, lone dollars and escaped dollars literal", () => {
    for (const text of ["costs $5 and $10", "a single $ sign", "$ spaced $", "no math"]) expect(hasMath(text)).toBe(false);
    expect(splitMath("pay \\$5 now")).toEqual([{ kind: "text", text: "pay $5 now" }]);
  });

  it("does not run an unterminated formula across a blank line", () => {
    expect(hasMath("$x\n\nmore $y$")).toBe(true);
    expect(splitMath("$x\n\nmore")).toEqual([{ kind: "text", text: "$x\n\nmore" }]);
  });

  it("treats braces and backslash-dollar inside a formula as part of it", () => {
    expect(splitMath("$\\frac{1}{2}\\$$")).toEqual([{ kind: "inline", math: "\\frac{1}{2}\\$" }]);
  });
});
