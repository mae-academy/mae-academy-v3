import { describe, expect, it } from "vitest";
import { PENDING_PLOT_LANG, markPendingPlot, stripSvgFences } from "./svgFence";

const T = "```";

describe("markPendingPlot", () => {
  it("swaps an unterminated python:plot fence for the pending placeholder fence", () => {
    expect(markPendingPlot(`Plot.\n\n${T}python:plot\nimport numpy as np\nt = np.lin`)).toBe(`Plot.\n\n${T}${PENDING_PLOT_LANG}\n${T}`);
    expect(markPendingPlot(`${T}python:plot\n`)).toBe(`${T}${PENDING_PLOT_LANG}\n${T}`);
  });

  it("catches the info line while it is still arriving, but only once it is clearly the plot fence", () => {
    expect(markPendingPlot(`x\n${T}python:pl`)).toBe(`x\n${T}${PENDING_PLOT_LANG}\n${T}`);
    expect(markPendingPlot(`x\n${T}python`)).toBe(`x\n${T}python`);
  });

  it("leaves finished fences, ordinary python and other text alone", () => {
    const done = `${T}python:plot\nimport numpy as np\n${T}`;
    expect(markPendingPlot(done)).toBe(done);
    const plain = `${T}python\nprint(1)`;
    expect(markPendingPlot(plain)).toBe(plain);
    expect(markPendingPlot("no fences")).toBe("no fences");
  });

  it("is not triggered by an earlier closed plot fence when a later prose line streams", () => {
    const text = `${T}python:plot\nx = 1\n${T}\n\nThe curve shows`;
    expect(markPendingPlot(text)).toBe(text);
  });

  it("does not treat a plot fence as an SVG diagram for history stripping", () => {
    const text = `${T}python:plot\nimport numpy as np\n${T}`;
    expect(stripSvgFences(text)).toBe(text);
  });
});
