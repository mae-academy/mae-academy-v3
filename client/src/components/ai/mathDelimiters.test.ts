import { describe, expect, it } from "vitest";
import { normalizeMathDelimiters } from "./mathDelimiters";

describe("normalizeMathDelimiters", () => {
  it("rewrites inline \\( \\) to $ $", () => {
    expect(normalizeMathDelimiters("Ohm: \\( V = IR \\) holds")).toBe("Ohm: $V = IR$ holds");
  });

  it("rewrites display \\[ \\] to a $$ block on its own lines", () => {
    const out = normalizeMathDelimiters("So \\[ \\frac{V}{R} \\] done");
    expect(out).toBe("So \n\n$$\n\\frac{V}{R}\n$$\n\n done");
  });

  it("handles multi-line display math", () => {
    const out = normalizeMathDelimiters("\\[\nx = 1\ny = 2\n\\]");
    expect(out).toContain("$$\nx = 1\ny = 2\n$$");
  });

  it("leaves fenced code blocks alone (backtick and tilde fences)", () => {
    const src = "```cpp\nprintf(\"\\(x\\)\"); // \\[a\\]\n```\n\n~~~\n\\(y\\)\n~~~\n\\(z\\)";
    const out = normalizeMathDelimiters(src);
    expect(out).toContain("printf(\"\\(x\\)\"); // \\[a\\]");
    expect(out).toContain("~~~\n\\(y\\)\n~~~");
    expect(out.endsWith("$z$")).toBe(true);
  });

  it("only closes a fence with a matching, long enough marker", () => {
    const src = "````\n```\n\\(x\\)\n```\n````\n\\(y\\)";
    const out = normalizeMathDelimiters(src);
    expect(out).toContain("```\n\\(x\\)\n```");
    expect(out.endsWith("$y$")).toBe(true);
  });

  it("an unterminated fence protects everything after it (streaming)", () => {
    expect(normalizeMathDelimiters("```py\nprint(\"\\(x\\)\")")).toBe("```py\nprint(\"\\(x\\)\")");
  });

  it("leaves inline code spans alone", () => {
    expect(normalizeMathDelimiters("use `\\(x\\)` or \\(y\\)")).toBe("use `\\(x\\)` or $y$");
  });

  it("does not touch an escaped LaTeX row break like \\\\[2pt]", () => {
    expect(normalizeMathDelimiters("so $$a \\\\[2pt] b$$ end")).toBe("so $$a \\\\[2pt] b$$ end");
  });

  it("returns plain text and already-dollar math unchanged", () => {
    expect(normalizeMathDelimiters("no math $x^2$ here")).toBe("no math $x^2$ here");
  });

  it("leaves an unclosed delimiter alone (streaming)", () => {
    expect(normalizeMathDelimiters("so \\( V = I")).toBe("so \\( V = I");
  });
});

describe("one-line $$ equations", () => {
  it("expands a line holding only $$...$$ into a display block", () => {
    expect(normalizeMathDelimiters("Intro\n$$\\frac{V}{R}$$\nOutro")).toBe("Intro\n\n$$\n\\frac{V}{R}\n$$\n\nOutro");
  });
  it("leaves multi-line $$ blocks, mixed lines and code fences alone", () => {
    expect(normalizeMathDelimiters("$$\nx\n$$")).toBe("$$\nx\n$$");
    expect(normalizeMathDelimiters("so $$a$$ and $$b$$ end")).toBe("so $$a$$ and $$b$$ end");
    expect(normalizeMathDelimiters("```\n$$x$$\n```")).toBe("```\n$$x$$\n```");
  });
});
