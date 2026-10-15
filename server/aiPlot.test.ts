import { describe, expect, it } from "vitest";
import { AI_MAX_MODEL_MESSAGE_CHARS } from "../shared/aiTypes";
import { buildSystemInstruction, cleanModelTurn, limitModelTurn } from "./aiService";

describe("plot prompt rules and history for python:plot fences", () => {
  const prompt = buildSystemInstruction("circuits");
  const section = prompt.slice(prompt.indexOf("Plots (the student's browser runs the script"), prompt.indexOf("Visual engines (deterministic"));
  const plotFence = (code: string) => "```python:plot\n" + code + "\n```";

  it("names the fence, the allowed libraries and the host-owned output rules", () => {
    expect(section.length).toBeGreaterThan(500);
    expect(section).toMatch(/info string is exactly `python:plot`/);
    expect(section).toMatch(/exactly ONE fenced block/);
    expect(section).toContain("import numpy as np");
    expect(section).toContain("import matplotlib.pyplot as plt");
    expect(section).toContain("scipy.signal");
    expect(section).toMatch(/No plt\.show\(\), no savefig/);
    expect(section).toMatch(/Never use it to draw wiring or block diagrams/);
  });

  it("requires the house style and mathtext typography", () => {
    expect(section).toContain("grid(True, linestyle='--', alpha=0.6)");
    expect(section).toMatch(/axis label ends with a unit in parentheses/);
    expect(section).toMatch(/figsize=\(8, 4\.5\)/);
    expect(section).toMatch(/no RuntimeWarning/);
    expect(section).toMatch(/mathtext, not usetex/);
    expect(section).toMatch(/raw string r'\.\.\.'/);
    expect(section).toMatch(/NOT supported[^.]*\\textbf/);
  });

  it("stays compact and ships a self-consistent example", () => {
    expect(section.length).toBeLessThan(4200);
    const example = /```python:plot\n([\s\S]*?)\n```/.exec(section)![1];
    expect(example).not.toMatch(/savefig|plt\.show|\bopen\(|\bimport (?!numpy as np|matplotlib\.pyplot as plt)/);
    expect(example.split("\n").length).toBeLessThan(40);
  });

  it("keeps a python:plot fence in resent model turns and strips only the marker", () => {
    const out = cleanModelTurn(`Overdamped response.\n\n${plotFence("import numpy as np\nprint(1)")}\n[[SIM:control]]`);
    expect(out).toContain("```python:plot\nimport numpy as np");
    expect(out).not.toContain("[[SIM");
  });

  it("never cuts a plot fence in half and keeps only the newest one", () => {
    const script = "import numpy as np\n" + "x = np.arange(10)\n".repeat(50);
    const prose = "Explanation. ".repeat(2000);
    const out = limitModelTurn(`Short.\n${plotFence("old = 1")}\nB\n${plotFence(script)}\n${prose}`);
    expect(out.length).toBeLessThanOrEqual(AI_MAX_MODEL_MESSAGE_CHARS);
    expect(out).toContain("[earlier plot omitted]");
    expect(out).not.toContain("old = 1");
    expect(out).toContain(plotFence(script));
  });

  it("drops an unterminated or oversized plot fence whole, with the plot literal", () => {
    expect(limitModelTurn("Intro\n```python:plot\nimport numpy as np\nt = np.lin")).toBe("Intro\n[earlier plot omitted]");
    const out = limitModelTurn(`Lead.\n${plotFence("# " + "x".repeat(AI_MAX_MODEL_MESSAGE_CHARS))}\nTail.`);
    expect(out.length).toBeLessThanOrEqual(AI_MAX_MODEL_MESSAGE_CHARS);
    expect(out).not.toContain("```python:plot");
    expect(out).toContain("[earlier plot omitted]");
  });

  it("leaves ordinary python fences alone", () => {
    const turn = "Here:\n```python\nprint('hi')\n```";
    expect(limitModelTurn(turn)).toBe(turn);
  });
});
