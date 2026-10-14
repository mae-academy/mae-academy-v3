import { describe, expect, it } from "vitest";
import { OMITTED_DIAGRAM, isSvgFence, stripHtmlComments, stripSvgFences } from "./svgFence";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500"><rect width="10" height="10"/></svg>';

describe("isSvgFence", () => {
  it("accepts xml:svg and svg, and xml / html / untyped blocks that start with <svg", () => {
    expect(isSvgFence("xml:svg", "anything")).toBe(true);
    expect(isSvgFence("XML:SVG", "anything")).toBe(true);
    expect(isSvgFence("svg", "")).toBe(true);
    for (const lang of ["xml", "html", "", undefined]) expect(isSvgFence(lang, `\n  ${SVG}`)).toBe(true);
  });
  it("rejects other languages and xml that is not an svg", () => {
    expect(isSvgFence("xml", "<note>hi</note>")).toBe(false);
    expect(isSvgFence("html", "<div><svg/></div>")).toBe(false);
    expect(isSvgFence("python", SVG)).toBe(false);
    expect(isSvgFence("xml", "<svgfoo/>")).toBe(false);
    expect(isSvgFence(undefined, "")).toBe(false);
  });
});

describe("stripSvgFences", () => {
  it("replaces an xml:svg fence and keeps the text around it", () => {
    expect(stripSvgFences(`Here:\n\n\`\`\`xml:svg\n${SVG}\n\`\`\`\n\nDone.`)).toBe(`Here:\n\n${OMITTED_DIAGRAM}\n\nDone.`);
  });
  it("handles svg fences, ~~~ fences, longer fences and an xml fence holding <svg", () => {
    expect(stripSvgFences(`\`\`\`svg\n${SVG}\n\`\`\``)).toBe(OMITTED_DIAGRAM);
    expect(stripSvgFences(`~~~xml:svg\n${SVG}\n~~~`)).toBe(OMITTED_DIAGRAM);
    expect(stripSvgFences(`\`\`\`\`xml:svg\n\`\`\`inner\n${SVG}\n\`\`\`\`\nafter`)).toBe(`${OMITTED_DIAGRAM}\nafter`);
    expect(stripSvgFences(`\`\`\`xml\n${SVG}\n\`\`\``)).toBe(OMITTED_DIAGRAM);
    expect(stripSvgFences(`\`\`\`\n${SVG}\n\`\`\``)).toBe(OMITTED_DIAGRAM);
  });
  it("replaces several diagrams independently", () => {
    const text = `a\n\`\`\`xml:svg\n${SVG}\n\`\`\`\nb\n\`\`\`xml:svg\n${SVG}\n\`\`\`\nc`;
    expect(stripSvgFences(text)).toBe(`a\n${OMITTED_DIAGRAM}\nb\n${OMITTED_DIAGRAM}\nc`);
  });
  it("cuts an unterminated fence at the end of the text", () => {
    expect(stripSvgFences(`Lead-in\n\n\`\`\`xml:svg\n${SVG.slice(0, 40)}`)).toBe(`Lead-in\n\n${OMITTED_DIAGRAM}`);
  });
  it("leaves other code, plain text and inline code alone", () => {
    const code = "```python\nprint('<svg>')\n```";
    expect(stripSvgFences(code)).toBe(code);
    expect(stripSvgFences("xml:svg is the info string; `<svg>` inline")).toBe("xml:svg is the info string; `<svg>` inline");
    expect(stripSvgFences("```xml\n<note/>\n```")).toBe("```xml\n<note/>\n```");
    expect(stripSvgFences("")).toBe("");
  });
  it("does not treat a closing fence inside a longer fence as the end", () => {
    const text = `\`\`\`\`xml:svg\n\`\`\`\n${SVG}\n\`\`\`\`\ntail`;
    expect(stripSvgFences(text)).toBe(`${OMITTED_DIAGRAM}\ntail`);
  });
});

describe("stripHtmlComments", () => {
  it("returns text without comments untouched", () => {
    const text = "Plain **markdown** with `code` and\n```cpp\nint x;\n```\n";
    expect(stripHtmlComments(text)).toBe(text);
  });
  it("removes a comment line the model wrote outside the fence", () => {
    expect(stripHtmlComments("Diagram:\n<!-- Standard: IEC 60617 | Pitch P = 20 px -->\n```xml:svg\n<svg/>\n```")).toBe("Diagram:\n```xml:svg\n<svg/>\n```");
  });
  it("removes inline and multi-line comments in prose", () => {
    expect(stripHtmlComments("a <!-- x --> b")).toBe("a b");
    expect(stripHtmlComments("one\n<!-- line 1\nline 2 -->\ntwo")).toBe("one\ntwo");
  });
  it("leaves comments inside code fences alone (including an unfinished fence)", () => {
    const closed = "```xml\n<!-- keep me -->\n<a/>\n```";
    expect(stripHtmlComments(closed)).toBe(closed);
    const open = "```xml:svg\n<!-- Standard: IEC 60617 -->\n<svg";
    expect(stripHtmlComments(open)).toBe(open);
  });
  it("leaves a comment quoted in inline code alone", () => {
    expect(stripHtmlComments("write `<!-- note -->` to comment")).toBe("write `<!-- note -->` to comment");
  });
  it("hides a comment that is still streaming in at the end of the text", () => {
    expect(stripHtmlComments("Here it is:\n<!-- Standard: ISO/IE")).toBe("Here it is:\n");
    expect(stripHtmlComments("done <!--")).toBe("done ");
  });
});

describe("diagrams that open with the platform's header comment", () => {
  const HEADER = "<!-- Standard: IEC 60617 | Pitch P = 20 px | Signal stroke 2 px | Power stroke 3 px -->";

  it("recognises an untyped or xml fence whose body is a comment, then <svg", () => {
    for (const lang of ["", "xml", "html", undefined]) expect(isSvgFence(lang, `${HEADER}\n${SVG}`)).toBe(true);
  });
  it("skips an XML prolog and several comments", () => {
    expect(isSvgFence("", `<?xml version="1.0" encoding="UTF-8"?>\n<!-- a -->\n<!-- b -->\n${SVG}`)).toBe(true);
  });
  it("still rejects a comment followed by something that is not an svg", () => {
    expect(isSvgFence("xml", `${HEADER}\n<note>hi</note>`)).toBe(false);
    expect(isSvgFence("", "<!-- only a comment -->")).toBe(false);
  });
  it("strips such a fence from history like any other diagram", () => {
    const text = `Here:\n\`\`\`\n${HEADER}\n${SVG}\n\`\`\`\nDone.`;
    expect(stripSvgFences(text)).toBe(`Here:\n${OMITTED_DIAGRAM}\nDone.`);
  });
});
