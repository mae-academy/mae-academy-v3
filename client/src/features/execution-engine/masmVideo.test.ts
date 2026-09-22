import { describe, expect, it } from "vitest";

import { run } from "./masmEngine";
import { MASM_EXAMPLES } from "@/components/assembler/masmExamples";

const example = (id: string) => {
  const found = MASM_EXAMPLES.find(item => item.id === id);
  if (!found) throw new Error(`missing example ${id}`);
  return found.code;
};

describe("INT 10h VRAM", () => {
  it("paints the full-screen blue background and gray window box", async () => {
    const result = await run(example("fullscreen-dialog"), { maxSteps: 5000 });
    expect(result.success).toBe(true);
    const video = result.steps.at(-1)?.video;
    expect(video?.grid[0][0]).toMatchObject({ bg: "#0000AA", fg: "#FFFFFF" });
    expect(video?.grid[12][30].bg).toBe("#AAAAAA");
    expect(video?.grid[7][30].bg).toBe("#0000AA");
    expect(video?.grid[12][27].char).toBe("S");
  });

  it("blocks on empty stdin without an infinite-loop error and resumes on input", async () => {
    const code = example("realtime-keyboard-echo");
    const blocked = await run(code, { maxSteps: 5000 });
    expect(blocked.error).toBeUndefined();
    expect(blocked.awaitingInput).toBe(true);
    expect(blocked.totalSteps).toBeLessThan(50);

    const resumed = await run(code, { maxSteps: 5000, stdin: "abq" });
    expect(resumed.awaitingInput).toBe(false);
    const grid = resumed.steps.at(-1)!.video!.grid;
    const row = grid.find(line => line[0].char === "a")!;
    expect(row[0].fg).not.toBe(row[1].fg);
  });
});

describe("Mode 13h graphics", () => {
  it("plots the Mode 13h line at exact coordinates, then restores text mode after a key", async () => {
    const code = example("vga-pixel-plotter");
    const blocked = await run(code, { maxSteps: 5000 });
    expect(blocked.error).toBeUndefined();
    expect(blocked.awaitingInput).toBe(true);
    const video = blocked.steps.at(-1)!.video!;
    expect(video.videoMode).toBe(0x13);
    const { pixels, count } = video.graphics!;
    expect(count).toBe(200);
    expect(pixels[0]).toBe((100 * 320 + 60) * 256 + 0x0e);
    expect(pixels[count - 1]).toBe((100 * 320 + 259) * 256 + 0x0e);

    const done = await run(code, { maxSteps: 5000, stdin: "x" });
    expect(done.steps.at(-1)!.video!.videoMode).toBe(3);
    expect(done.steps.at(-1)!.video!.graphics).toBeNull();
  });
});

describe("Colorful text attributes", () => {
  it("writes each attribute nibble to the cell", async () => {
    const result = await run(example("color-text-attrs"), { maxSteps: 5000 });
    const grid = result.steps.at(-1)!.video!.grid;
    expect(grid[5][10]).toMatchObject({ char: "M", fg: "#FF55FF", bg: "#0000AA" });
    expect(grid[5][11]).toMatchObject({ char: "A", fg: "#55FF55", bg: "#AA0000" });
    expect(grid[5][12]).toMatchObject({ char: "E", fg: "#FFFF55", bg: "#00AAAA" });
  });
});

describe("Verified algorithms", () => {
  it("linear search reports index 3", async () => {
    const result = await run(example("linear-search"), { maxSteps: 5000 });
    expect(result.success).toBe(true);
    expect(result.steps.at(-1)!.stdout).toBe("Item found at index: 3");
  });

  it("bubble sort prints the sorted array", async () => {
    const result = await run(example("bubble-sort"), { maxSteps: 5000 });
    expect(result.success).toBe(true);
    expect(result.steps.at(-1)!.stdout).toBe("Sorted Array: 1 2 4 5 9 ");
    const row = result.steps.at(-1)!.video!.grid[0];
    expect(row.slice(0, 13).map(cell => cell.char).join("")).toBe("Sorted Array:");
  });
});
