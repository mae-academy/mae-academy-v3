// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { canWriteRichClipboard, copyRichMessage, latexToMathMl, markdownToMathHtml } from "./richCopy";

const LAPLACE = String.raw`\int_{0}^{\infty} e^{-st} f(t) \, dt`;
const MATRIX = String.raw`\begin{pmatrix} a & b \\ c & d \end{pmatrix}`;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("latexToMathMl", () => {
  it("returns MathML for an integral, with no annotation, semantics wrapper or raw LaTeX", () => {
    const mathml = latexToMathMl(LAPLACE, true);
    expect(mathml.startsWith("<math")).toBe(true);
    expect(mathml).toContain('xmlns="http://www.w3.org/1998/Math/MathML"');
    expect(mathml).toContain("<mo>∫</mo>");
    expect(mathml).not.toContain("<annotation");
    expect(mathml).not.toContain("<semantics");
    expect(mathml).not.toContain("\\int");
    expect(mathml).not.toContain("$");
  });
  it("handles fractions and matrices", () => {
    expect(latexToMathMl(String.raw`\frac{a}{b}`, false)).toContain("<mfrac>");
    const matrix = latexToMathMl(MATRIX, true);
    expect(matrix).toContain("<mtable");
    expect(matrix).not.toContain("\\begin");
  });
  it("degrades to escaped text instead of throwing on invalid LaTeX", () => {
    const out = latexToMathMl(String.raw`\unknownmacro{<b>x</b>`, false);
    expect(out).not.toContain("<b>");
    expect(() => latexToMathMl("\\", false)).not.toThrow();
  });
});

describe("markdownToMathHtml", () => {
  it("replaces inline and display formulas with MathML and leaves no dollar delimiters", () => {
    const html = markdownToMathHtml(`The transform is $F(s)=\\frac{1}{s}$ and\n\n$$${LAPLACE}$$\n\nDone.`);
    expect((html.match(/<math/g) ?? []).length).toBe(2);
    expect(html).not.toContain("$");
    expect(html).not.toContain("<annotation");
    expect(html).toContain("The transform is");
  });
  it("also converts \\( \\) and \\[ \\] delimiters", () => {
    const html = markdownToMathHtml("so \\(x^2\\) and \\[y=1\\]");
    expect((html.match(/<math/g) ?? []).length).toBe(2);
  });
  it("keeps tables, lists, bold text and code blocks as normal HTML", () => {
    const html = markdownToMathHtml("**Bold**\n\n- one\n- two\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```cpp\nint $x = 1;\n```");
    expect(html).toContain("<strong>Bold</strong>");
    expect(html).toContain("<li>one</li>");
    expect(html).toContain("<table>");
    expect(html).toContain("<pre><code");
    expect(html).toContain("int $x = 1;"); // a dollar inside code is not math
    expect(html).not.toContain("<math");
  });
  it("never lets raw HTML, scripts, unsafe links or remote images through", () => {
    const html = markdownToMathHtml('<script>alert(1)</script> <img src=x onerror="alert(1)">\n\n[bad](javascript:alert(1)) ![pic](https://evil.example/x.png) [ok](https://example.com)');
    expect(html).not.toContain('href="javascript');
    // raw HTML survives only as escaped, inert text (the same as in the chat), never as a real element
    const doc = new DOMParser().parseFromString(html, "text/html");
    expect(doc.querySelector("script, img, [onerror]")).toBeNull();
    expect(html).not.toContain("<script");
    expect(doc.querySelector("a[href^='javascript']")).toBeNull();
    expect(html).not.toContain("data-loc");
    expect(html).not.toContain("<img");
    expect(html).toContain('href="https://example.com"');
  });
  it("hides stray HTML comments", () => {
    expect(markdownToMathHtml("hi <!-- Standard: IEC --> there")).not.toContain("Standard");
  });
});

describe("copyRichMessage", () => {
  class FakeClipboardItem {
    constructor(public items: Record<string, Blob>) {}
  }

  it("writes text/html with MathML and text/plain with the clean source in one ClipboardItem", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("ClipboardItem", FakeClipboardItem);
    vi.stubGlobal("navigator", { clipboard: { write, writeText: vi.fn() } });
    const source = `Result: $$${LAPLACE}$$`;
    expect(await copyRichMessage(source)).toBe(true);
    const item = write.mock.calls[0][0][0] as FakeClipboardItem;
    expect(Object.keys(item.items).sort()).toEqual(["text/html", "text/plain"]);
    expect(await item.items["text/plain"].text()).toBe(source);
    const html = await item.items["text/html"].text();
    expect(html).toContain("<math");
    expect(html).not.toContain("$");
  });
  it("uses plain text only when the message has no math", async () => {
    const write = vi.fn();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("ClipboardItem", FakeClipboardItem);
    vi.stubGlobal("navigator", { clipboard: { write, writeText } });
    expect(await copyRichMessage("just words")).toBe(true);
    expect(write).not.toHaveBeenCalled();
    expect(writeText).toHaveBeenCalledWith("just words");
  });
  it("falls back to plain text when ClipboardItem is unavailable", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("ClipboardItem", undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    expect(canWriteRichClipboard()).toBe(false);
    expect(await copyRichMessage("$x$")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("$x$");
  });
  it("falls back to plain text when the rich write is refused", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("ClipboardItem", FakeClipboardItem);
    vi.stubGlobal("navigator", { clipboard: { write: vi.fn().mockRejectedValue(new Error("denied")), writeText } });
    expect(await copyRichMessage("$x$")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("$x$");
  });
});
