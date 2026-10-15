import { describe, expect, it } from "vitest";
import { AI_MAX_MESSAGE_CHARS } from "@shared/aiTypes";
import {
  canonicalValue,
  fillFirstPlaceholder,
  hasComposerContent,
  hasPlaceholder,
  isMovableSelection,
  parseComposerValue,
  serializeSegments,
  stepsToFirstBox,
  stripPlaceholders,
  type ComposerSegment,
} from "./composerModel";

const roundTrip = (source: string) => serializeSegments(parseComposerValue(source));
const math = (latex: string, display = false): ComposerSegment => ({ kind: "math", latex, display });
const text = (t: string): ComposerSegment => ({ kind: "text", text: t });

describe("composer value model: parse and serialize", () => {
  it.each([
    "plain text only",
    "multi\nline\ntext",
    "limit $\\lim_{x \\to a} f(x)$ here",
    "$x$",
    "display $$\\int_0^1 x\\,dx$$ math",
    "cost is $5 and $10 total",
    "$a$ and $b$ and $c$",
    "line one\n$x^2$\nline three",
    "",
  ])("round-trips %j unchanged", (source) => {
    expect(roundTrip(source)).toBe(source);
  });

  it("parses inline, display and text segments", () => {
    expect(parseComposerValue("a $x$ b $$y$$")).toEqual([text("a "), math("x"), text(" b "), math("y", true)]);
  });

  it("keeps currency as text and unmatched dollars literal", () => {
    expect(parseComposerValue("I paid $5 and then $10")).toEqual([text("I paid $5 and then $10")]);
    expect(parseComposerValue("only one $ here")).toEqual([text("only one $ here")]);
  });

  it("treats an escaped dollar as a literal dollar in the text", () => {
    expect(parseComposerValue("price \\$5 ok")).toEqual([text("price $5 ok")]);
    expect(canonicalValue("price \\$5 ok")).toBe("price $5 ok");
  });

  it("escapes literal dollars only when leaving them bare would change the meaning", () => {
    // Text that reads "$x$" literally must not turn into a formula on the next parse.
    expect(serializeSegments([text("literal $x$ text")])).toBe("literal \\$x\\$ text");
    // A trailing dollar right before a formula still parses back to the same formula, so nothing is escaped.
    expect(serializeSegments([text("cost $"), math("x")])).toBe("cost $$x$");
    expect(parseComposerValue("cost $$x$").filter((s) => s.kind === "math")).toEqual([math("x")]);
  });

  it("separates adjacent formulas and a formula followed by a digit so they stay parseable", () => {
    expect(serializeSegments([math("a"), math("b")])).toBe("$a$ $b$");
    expect(serializeSegments([math("x"), text("2 apples")])).toBe("$x$ 2 apples");
    expect(parseComposerValue("$a$ $b$").filter((s) => s.kind === "math")).toHaveLength(2);
  });

  it("drops empty and whitespace-only formulas, and trims formula padding", () => {
    expect(serializeSegments([text("a"), math(""), text("b"), math("   ")])).toBe("ab");
    expect(serializeSegments([math("  x+1 ")])).toBe("$x+1$");
  });

  it("serializes display formulas with $$ and keeps the flag", () => {
    expect(serializeSegments([math("x", true)])).toBe("$$x$$");
  });

  it("removes the padding characters and non-breaking spaces", () => {
    expect(serializeSegments([text("​a b​"), math("x"), text("​")])).toBe("a b$x$");
  });

  it("handles the message limit with formulas: length is the serialized string's", () => {
    const filler = "a".repeat(AI_MAX_MESSAGE_CHARS - 5);
    const value = serializeSegments([text(filler), math("xy")]);
    expect(value).toHaveLength(AI_MAX_MESSAGE_CHARS - 5 + 4);
    expect(value.length).toBeLessThanOrEqual(AI_MAX_MESSAGE_CHARS);
    expect(serializeSegments([text(filler), math("x".repeat(10))]).length).toBeGreaterThan(AI_MAX_MESSAGE_CHARS);
  });
});

describe("composer value model: content and templates", () => {
  it("has content when there is non-whitespace text or a formula", () => {
    expect(hasComposerContent("")).toBe(false);
    expect(hasComposerContent("  \n ")).toBe(false);
    expect(hasComposerContent("$x$")).toBe(true);
    expect(hasComposerContent(serializeSegments([math("")]))).toBe(false);
  });

  it("finds, strips and fills MathLive placeholders", () => {
    const template = "\\frac{\\placeholder{}}{\\placeholder{}}";
    expect(hasPlaceholder(template)).toBe(true);
    expect(hasPlaceholder("\\alpha")).toBe(false);
    expect(stripPlaceholders(template)).toBe("\\frac{}{}");
    expect(fillFirstPlaceholder(template, " x+1 ")).toBe("\\frac{x+1}{\\placeholder{}}");
  });

  it("knows how many placeholder stops reach the first written box", () => {
    expect(stepsToFirstBox("\\frac{\\placeholder{}}{\\placeholder{}}")).toBe(1);
    expect(stepsToFirstBox("\\int_{\\placeholder{}}^{\\placeholder{}}")).toBe(2);
    expect(stepsToFirstBox("\\lim_{\\placeholder{} \\to \\placeholder{}}")).toBe(1);
  });

  it("only moves short one-line plain text into a box", () => {
    expect(isMovableSelection("x+1")).toBe(true);
    expect(isMovableSelection("  ")).toBe(false);
    expect(isMovableSelection("a\\b")).toBe(false);
    expect(isMovableSelection("line\nbreak")).toBe(false);
    expect(isMovableSelection("x".repeat(81))).toBe(false);
  });
});
