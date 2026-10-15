import { describe, expect, it } from "vitest";
import { AI_MAX_MODEL_MESSAGE_CHARS } from "../shared/aiTypes";
import { buildSystemInstruction, cleanModelTurn, limitModelTurn } from "./aiService";

const prompt = buildSystemInstruction("circuits");
const start = prompt.indexOf("Visual engines (deterministic only");
const section = prompt.slice(start, prompt.indexOf("Attachments:", start));

describe("Visual engines prompt section", () => {
  it("exists exactly once, inside the integration rules, and is compact", () => {
    expect(start).toBeGreaterThan(prompt.indexOf("# MAE Academy platform integration"));
    expect(prompt.split("Visual engines (deterministic only").length).toBe(2);
    expect(section.length).toBeGreaterThan(2000);
    expect(section.length).toBeLessThan(5200);
  });

  it("states the absolute prohibition on probabilistic image generation, ASCII art, raw SVG and image tags", () => {
    expect(section).toMatch(/ABSOLUTE PROHIBITION/);
    for (const name of ["DALL·E", "Midjourney", "Stable Diffusion", "Pollinations", "generate an image"]) expect(section).toContain(name);
    expect(section).toMatch(/Never output ASCII-art diagrams, raw SVG or image tags/);
  });

  it("routes each kind of visual to exactly one engine", () => {
    expect(section).toMatch(/circuits, power converters, op-amp stages, control BLOCK diagrams \(PID, feedback loops, summing junctions\) and logic networks -> ```schematic/);
    expect(section).toMatch(/FSMs, state machines, flowcharts, protocols and sequence diagrams -> ```mermaid/);
    expect(section).toMatch(/digital timing diagrams .* -> ```wavedrom/);
    expect(section).toMatch(/plots .* -> ```python:plot/);
    expect(section).toMatch(/design equations with tunable parameters .* ONE ```json:interactive-params block/);
    expect(section).toMatch(/control block diagrams with feedback go to ```schematic, never Mermaid/);
  });

  it("documents the Mermaid rules proven in the browser tests", () => {
    expect(section).toContain("stateDiagram-v2");
    expect(section).toContain("`A --> B: input / output`");
    expect(section).toMatch(/no click, no %%\{init\}, no HTML tags/);
    expect(section).toContain('R["$$R(s)$$"]');
  });

  it("documents the WaveDrom shape with the user's example and SPI phase guidance", () => {
    expect(section).toContain('{"signal":[{"name":"clk","wave":"p....."},{"name":"data","wave":"x.345x","data":["D0","D1","D2"]}]}');
    expect(section).toMatch(/SPI mode 0/);
    expect(section).toMatch(/same length/);
  });

  it("documents the interactive-params schema keys and the safe formula language", () => {
    for (const key of ["title", "parameters", "name", "label", "min", "max", "default", "step", "unit", "formula", "outputLabel", "outputUnit", "plot", "xLabel", "xMin", "xMax", "xScale", "yLabel", "expression", "markerX", "points", "outputs"]) {
      expect(section, key).toContain(`\\"${key}\\"`.replace(/\\"/g, '"'));
    }
    expect(section).toMatch(/sqrt cbrt pow exp log \(natural\) log10 log2 sin cos tan asin acos atan atan2 sinh cosh tanh abs min max floor ceil round hypot sign/);
    expect(section).toMatch(/with or without the Math\. prefix/);
    expect(section).toMatch(/at most 8/);
  });

  it("demands peer-review-grade checks without promising perfection", () => {
    expect(section).toMatch(/peer-reviewed precision: before delivering any solution run the dimensional, limiting-case and physical-law checks; if you cannot verify something, say so instead of asserting it/);
    expect(section).not.toMatch(/100\s*%|never wrong|flawless|guarantee[sd]? (?:accuracy|correct)/i);
  });

  it("does not offer Schemdraw (or any other layout-code library) as an engine", () => {
    expect(prompt).not.toMatch(/schemdraw/i);
    expect(prompt).not.toMatch(/micropip|pip install/i);
  });

  it("keeps the schematic and plot sections intact", () => {
    expect(prompt).toContain("Schematic drawings (the platform draws them from a JSON spec");
    expect(prompt).toContain("Plots (the student's browser runs the script");
    expect(prompt).toMatch(/info string is exactly `python:plot`/);
  });
});

const fence = (kind: string, body: string) => "```" + kind + "\n" + body + "\n```";

describe("history hygiene for the new fences", () => {
  for (const [kind, omitted] of [
    ["json:interactive-params", "[earlier interactive tool omitted]"],
    ["mermaid", "[earlier diagram omitted]"],
    ["wavedrom", "[earlier timing diagram omitted]"],
  ] as const) {
    describe(kind, () => {
      it("is kept in resent model turns", () => {
        const out = cleanModelTurn(`Text.\n\n${fence(kind, '{"a":1}')}\n[[SIM:control]]`);
        expect(out).toContain("```" + kind + '\n{"a":1}\n```');
        expect(out).not.toContain("[[SIM");
      });

      it("is never cut in half and only the newest is kept", () => {
        const body = Array.from({ length: 60 }, (_, i) => `  line${i}`).join("\n");
        const out = limitModelTurn(`Lead.\n${fence(kind, "old")}\nMid\n${fence(kind, body)}\n${"Explanation. ".repeat(2000)}`);
        expect(out.length).toBeLessThanOrEqual(AI_MAX_MODEL_MESSAGE_CHARS);
        expect(out).toContain(omitted);
        expect(out).not.toContain("\nold\n");
        expect(out).toContain(fence(kind, body));
      });

      it("drops an unterminated fence whole", () => {
        expect(limitModelTurn("Intro\n```" + kind + "\n{ partial")).toBe(`Intro\n${omitted}`);
      });

      it("drops an oversized fence whole", () => {
        const out = limitModelTurn(`Lead.\n${fence(kind, "x".repeat(AI_MAX_MODEL_MESSAGE_CHARS))}\nTail.`);
        expect(out.length).toBeLessThanOrEqual(AI_MAX_MODEL_MESSAGE_CHARS);
        expect(out).toContain(omitted);
        expect(out).not.toContain("```" + kind);
      });
    });
  }

  it("does not mistake a similar info string for an engine fence", () => {
    const text = "```mermaid-extra\nkeep\n```\n```json\n{}\n```";
    expect(limitModelTurn(text)).toBe(text);
  });
});
