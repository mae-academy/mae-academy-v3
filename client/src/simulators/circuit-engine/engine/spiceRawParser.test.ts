import { describe, expect, it } from "vitest";

import {
  parseSpiceRawFile,
  parseSpiceRawPlots,
} from "@/simulators/circuit-engine/engine/spiceRawParser";

interface RawPlotSpec {
  plotname: string;
  flags: "real" | "complex";
  variables: string[];
  /** Point-major: one inner array per point, holding one value per variable (re/im pairs if complex). */
  points: number[][];
}

function buildPlot({
  plotname,
  flags,
  variables,
  points,
}: RawPlotSpec): Uint8Array {
  const variableLines = variables
    .map((name, index) => `\t${index}\t${name}\tvoltage`)
    .join("\n");
  const header =
    `Title: synthetic\n` +
    `Date: Wed Sep 10 00:00:00 2026\n` +
    `Plotname: ${plotname}\n` +
    `Flags: ${flags}\n` +
    `No. Variables: ${variables.length}\n` +
    `No. Points: ${points.length}\n` +
    `Variables:\n${variableLines}\n` +
    `Binary:\n`;

  const headerBytes = new TextEncoder().encode(header);
  const values = points.flat();
  const out = new Uint8Array(headerBytes.length + values.length * 8);
  out.set(headerBytes, 0);

  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  values.forEach((value, index) =>
    view.setFloat64(headerBytes.length + index * 8, value, true)
  );
  return out;
}

function concat(...chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

describe("parseSpiceRawFile", () => {
  it("round-trips a real plot", () => {
    const bytes = buildPlot({
      plotname: "Transient Analysis",
      flags: "real",
      variables: ["time", "v(2)"],
      points: [
        [0, 0],
        [0.001, 2.5],
        [0.002, 5],
      ],
    });

    expect(parseSpiceRawFile(bytes)).toEqual({
      time: [0, 0.001, 0.002],
      "v(2)": [0, 2.5, 5],
    });
  });

  it("splits a complex plot into real, imaginary and magnitude vectors", () => {
    const bytes = buildPlot({
      plotname: "AC Analysis",
      flags: "complex",
      variables: ["frequency", "v(2)"],
      points: [
        [1000, 0, 3, 4],
        [2000, 0, 6, 8],
      ],
    });

    const vectors = parseSpiceRawFile(bytes);
    expect(vectors["frequency:real"]).toEqual([1000, 2000]);
    expect(vectors["frequency:imag"]).toEqual([0, 0]);
    expect(vectors.frequency).toEqual([1000, 2000]);
    expect(vectors["v(2):real"]).toEqual([3, 6]);
    expect(vectors["v(2):imag"]).toEqual([4, 8]);
    expect(vectors["v(2):mag"]).toEqual([5, 10]);
    // Bare name is the magnitude.
    expect(vectors["v(2)"]).toEqual([5, 10]);
    expect(vectors["v(2):phase"][0]).toBeCloseTo(53.13, 2);
  });

  it("suffixes colliding names from concatenated plots", () => {
    const bytes = concat(
      buildPlot({
        plotname: "Operating Point",
        flags: "real",
        variables: ["v(1)", "v(2)"],
        points: [[10, 5]],
      }),
      buildPlot({
        plotname: "Operating Point",
        flags: "real",
        variables: ["v(1)", "v(3)"],
        points: [[12, 7]],
      })
    );

    const plots = parseSpiceRawPlots(bytes);
    expect(plots).toHaveLength(2);
    expect(plots[1].pointCount).toBe(1);

    expect(parseSpiceRawFile(bytes)).toEqual({
      "v(1)": [10],
      "v(2)": [5],
      "v(1)#1": [12],
      "v(3)": [7],
    });
  });

  it("reads a buffer that is a view into a larger ArrayBuffer", () => {
    const plot = buildPlot({
      plotname: "Operating Point",
      flags: "real",
      variables: ["v(2)"],
      points: [[5]],
    });
    const padded = new Uint8Array(plot.length + 16);
    padded.set(plot, 16);

    expect(parseSpiceRawFile(padded.subarray(16))).toEqual({ "v(2)": [5] });
  });

  it("clamps to the bytes present when the payload is short of the declared count", () => {
    const bytes = buildPlot({
      plotname: "Transient Analysis",
      flags: "real",
      variables: ["time", "v(2)"],
      points: [
        [0, 0],
        [0.001, 2.5],
      ],
    });

    // One value short of the second point, so only the first point is readable.
    expect(parseSpiceRawFile(bytes.subarray(0, bytes.length - 8))).toEqual({
      time: [0],
      "v(2)": [0],
    });
  });

  it("derives the point count when ngspice failed to backfill the header", () => {
    const bytes = buildPlot({
      plotname: "Transient Analysis",
      flags: "real",
      variables: ["time", "v(2)"],
      points: [
        [0, 0],
        [0.001, 2.5],
        [0.002, 5],
      ],
    });
    const blanked = new TextDecoder("latin1")
      .decode(bytes)
      .replace("No. Points: 3\n", "No. Points: \n");
    const patched = Uint8Array.from(blanked, char => char.charCodeAt(0));

    expect(parseSpiceRawFile(patched)).toEqual({
      time: [0, 0.001, 0.002],
      "v(2)": [0, 2.5, 5],
    });
  });

  it("tolerates the padded Flags form and unknown header keys", () => {
    const bytes = buildPlot({
      plotname: "Operating Point",
      flags: "real",
      variables: ["v(2)"],
      points: [[5]],
    });
    const text = new TextDecoder("latin1")
      .decode(bytes)
      .replace("Flags: real\n", "Flags: real unpadded\nCommand: version 46\n");
    const patched = Uint8Array.from(text, char => char.charCodeAt(0));

    expect(parseSpiceRawFile(patched)).toEqual({ "v(2)": [5] });
  });

  it("throws when the Binary marker is missing", () => {
    const bytes = new TextEncoder().encode(
      "Title: broken\nNo. Variables: 1\nNo. Points: 1\n"
    );
    expect(() => parseSpiceRawFile(bytes)).toThrow(/"Binary:" marker/);
  });

  it("reports ASCII rawfiles explicitly", () => {
    const bytes = new TextEncoder().encode(
      "Title: ascii\nFlags: real\nNo. Variables: 1\nNo. Points: 1\nVariables:\n\t0\tv(2)\tvoltage\nValues:\n 0\t5\n"
    );
    expect(() => parseSpiceRawFile(bytes)).toThrow(/ASCII/);
  });
});
