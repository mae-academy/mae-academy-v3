import { describe, expect, it } from "vitest";
import { MAX_HIGHLIGHT_CHARS, defaultLoaders, engineForLanguage, highlightToSpans, type HighlightLoaders, type HighlightSpan } from "./codeHighlight";

const joined = (spans: HighlightSpan[] | null) => (spans ?? []).map((s) => s.text).join("");
const classOf = (spans: HighlightSpan[] | null, text: string) => spans?.find((s) => s.text === text)?.className;

describe("engineForLanguage", () => {
  it("routes C-family and Arduino to the cpp parser and python to python", () => {
    for (const language of ["cpp", "c++", "C", "arduino", "INO", "h"]) expect(engineForLanguage(language)).toBe("cpp");
    expect(engineForLanguage("python")).toBe("python");
    expect(engineForLanguage("py")).toBe("python");
    expect(engineForLanguage("matlab")).toBe("matlab");
  });
  it("is null for unknown, empty and prototype-ish names", () => {
    for (const language of [undefined, null, "", "text", "klingon", "constructor", "__proto__"]) expect(engineForLanguage(language)).toBeNull();
  });
});

describe("highlightToSpans", () => {
  it("highlights C++ with the lezer parser and reproduces the source exactly", async () => {
    const code = '// blink\nconst int LED = 13;\nvoid setup() {\n  pinMode(LED, OUTPUT);\n  Serial.println("hi");\n}\n';
    const spans = await highlightToSpans(code, "cpp");
    expect(spans).not.toBeNull();
    expect(joined(spans)).toBe(code);
    expect(spans!.some((s) => s.className.includes("tok-keyword"))).toBe(true);
    expect(spans!.some((s) => s.className.includes("tok-comment"))).toBe(true);
    expect(spans!.some((s) => s.className.includes("tok-string"))).toBe(true);
    expect(spans!.some((s) => s.className.includes("tok-number"))).toBe(true);
  });

  it("highlights Python", async () => {
    const code = "def f(x):\n    return x + 1  # inc\n";
    const spans = await highlightToSpans(code, "python");
    expect(joined(spans)).toBe(code);
    expect(classOf(spans, "def")).toContain("tok-keyword");
    expect(spans!.some((s) => s.className.includes("tok-comment"))).toBe(true);
  });

  it("highlights MATLAB with the hand-rolled tokenizer: comments, strings, numbers, keywords, transposes", async () => {
    const code = "% plant\nfunction y = f(x)\n  s = 'hi'; y = x' * 2.5e3;\nend\n";
    const spans = await highlightToSpans(code, "matlab");
    expect(joined(spans)).toBe(code);
    expect(classOf(spans, "% plant")).toBe("tok-comment");
    expect(classOf(spans, "function")).toBe("tok-keyword");
    expect(classOf(spans, "'hi'")).toBe("tok-string");
    expect(classOf(spans, "2.5e3")).toBe("tok-number");
    expect(classOf(spans, "end")).toBe("tok-keyword");
    // `x'` is a transpose, so the quote must not start a string that swallows the rest of the line.
    expect(spans!.filter((s) => s.className === "tok-string")).toHaveLength(1);
  });

  it("tolerates unterminated strings and block comments", async () => {
    for (const code of ["s = 'oops", "/* never closed", 'x = "a\\', "`tick"]) {
      expect(joined(await highlightToSpans(code, code.startsWith("s") ? "matlab" : "ts"))).toBe(code);
    }
  });

  it("returns null (plain text) for unknown languages, empty or oversized code", async () => {
    expect(await highlightToSpans("hello", "klingon")).toBeNull();
    expect(await highlightToSpans("hello", undefined)).toBeNull();
    expect(await highlightToSpans("", "cpp")).toBeNull();
    expect(await highlightToSpans("x".repeat(MAX_HIGHLIGHT_CHARS + 1), "cpp")).toBeNull();
  });

  it("degrades to null when a chunk fails to load or the parser throws", async () => {
    const failingLoad: HighlightLoaders = { ...defaultLoaders, parser: () => Promise.reject(new Error("chunk failed")) };
    expect(await highlightToSpans("int x;", "cpp", failingLoad)).toBeNull();
    const throwingParser: HighlightLoaders = { ...defaultLoaders, parser: async () => ({ parse: () => { throw new Error("boom"); } }) };
    expect(await highlightToSpans("def f(): pass", "python", throwingParser)).toBeNull();
  });

  it("degrades to null when the highlighter output does not reproduce the source", async () => {
    const lossy: HighlightLoaders = {
      lezer: async () => ({ highlightCode: (_c: string, _t: unknown, _h: unknown, put: (t: string, c: string) => void) => put("garbage", "tok-keyword"), classHighlighter: {} }),
      parser: async () => ({ parse: () => ({}) }),
    };
    expect(await highlightToSpans("int x;", "cpp", lossy)).toBeNull();
  });

  it("does not need the lezer chunks for hand-rolled languages", async () => {
    const neverLoads: HighlightLoaders = { lezer: () => Promise.reject(new Error("no")), parser: () => Promise.reject(new Error("no")) };
    expect(await highlightToSpans("# hi\necho 1", "bash", neverLoads)).not.toBeNull();
  });
});
