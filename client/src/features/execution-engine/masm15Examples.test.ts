import { describe, expect, it } from "vitest";
import * as masmEngine from "@/features/execution-engine/masmEngine";
import { MASM_EXAMPLES } from "@/components/assembler/masmExamples";

describe("15 Comprehensive x86 MASM Assembly Examples", () => {
  it("has exactly 21 defined examples (15 classic + 6 BIOS/Screen control)", () => {
    expect(MASM_EXAMPLES).toHaveLength(21);
  });

  for (const example of MASM_EXAMPLES) {
    it(`executes "${example.title}" cleanly without assembler or runtime errors`, async () => {
      // Provide stdin queue for interactive keyboard polling examples
      const options = { maxSteps: 5000, stdin: "q" };
      const result = await masmEngine.run(example.code, options);
      if (!result.success) {
        console.error(`${example.title} error:`, result.error);
        if (result.steps.length > 0) {
          const last = result.steps.slice(-5);
          console.error("Last steps:", last.map((s) => ({ line: s.line, inst: s.instruction, cx: s.registers.CX, si: s.registers.SI })));
        }
      }
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.totalSteps).toBeGreaterThan(0);
      expect(result.steps.length).toBeGreaterThan(0);
    });
  }

  it("verifies Example 16: Colorful Text Attributes & Page Scroll (ORG 100h)", async () => {
    const ex = MASM_EXAMPLES.find((e) => e.id === "color-text-attrs")!;
    const result = await masmEngine.run(ex.code);
    expect(result.success).toBe(true);
    const lastStep = result.steps[result.steps.length - 1];
    expect(lastStep.stdout).toContain("MAE");
  });

  it("verifies Example 17: Full-Screen Custom Background Color & Window Box (ORG 100h)", async () => {
    const ex = MASM_EXAMPLES.find((e) => e.id === "fullscreen-dialog")!;
    const result = await masmEngine.run(ex.code);
    expect(result.success).toBe(true);
    const lastStep = result.steps[result.steps.length - 1];
    expect(lastStep.stdout).toContain("SYSTEM READY: MAE ACADEMY");
  });

  it("verifies Example 18: Real-Time Keyboard Echo with Dynamic Color Shift (ORG 100h)", async () => {
    const ex = MASM_EXAMPLES.find((e) => e.id === "realtime-keyboard-echo")!;
    const result = await masmEngine.run(ex.code, { stdin: "HelloQ" });
    expect(result.success).toBe(true);
    const lastStep = result.steps[result.steps.length - 1];
    expect(lastStep.stdout).toContain("Hello");
  });

  it("verifies Example 19: Interactive Cursor Navigation via Arrow Keys / WASD", async () => {
    const ex = MASM_EXAMPLES.find((e) => e.id === "cursor-avatar-nav")!;
    const result = await masmEngine.run(ex.code, { stdin: "wwssaaq" });
    expect(result.success).toBe(true);
    const lastStep = result.steps[result.steps.length - 1];
    expect(lastStep.stdout).toContain("*");
  });

  it("verifies Example 20: Animated Progress Bar on Terminal Canvas", async () => {
    const ex = MASM_EXAMPLES.find((e) => e.id === "animated-progress-bar")!;
    const result = await masmEngine.run(ex.code, { maxSteps: 10000 });
    if (!result.success) console.error("Example 20 error:", result.error);
    expect(result.success).toBe(true);
    const lastStep = result.steps[result.steps.length - 1];
    expect(lastStep.stdout).toContain("INITIALIZING SYSTEM HARDWARE...");
  });

  it("verifies Example 21: CGA/VGA 320x200 256-Color Graphics Mode Plotter (Mode 13h)", async () => {
    const ex = MASM_EXAMPLES.find((e) => e.id === "vga-pixel-plotter")!;
    const result = await masmEngine.run(ex.code, { stdin: " " });
    expect(result.success).toBe(true);
    expect(result.totalSteps).toBeGreaterThan(200);
  });

  it("verifies Example 1 (Hello World & DOS String Interrupt) outputs message via INT 21h AH=09h", async () => {
    const ex = MASM_EXAMPLES.find((e) => e.id === "hello-world")!;
    const result = await masmEngine.run(ex.code);
    expect(result.success).toBe(true);
    const lastStep = result.steps[result.steps.length - 1];
    expect(lastStep.stdout).toContain("Welcome to MAE Academy - Code Studio!");
  });

  it("verifies Example 2 (Arithmetic Math & ALU Status Flags) sets OF, CF, SF", async () => {
    const ex = MASM_EXAMPLES.find((e) => e.id === "math-flags")!;
    const result = await masmEngine.run(ex.code);
    expect(result.success).toBe(true);
    // Find step after 7FFFh + 0001h (OF=1, SF=1)
    const stepOverflow = result.steps.find((s) => s.registers.AX === "8000");
    expect(stepOverflow).toBeDefined();
    expect(stepOverflow?.flags.OF).toBe(1);
    expect(stepOverflow?.flags.SF).toBe(1);
    expect(stepOverflow?.flags.ZF).toBe(0);

    // Find step after 0FFFFh + 1 (BX = 0000, ZF=1, CF=1)
    const stepZero = result.steps.find((s) => s.registers.BX === "0000" && s.flags.ZF === 1);
    expect(stepZero).toBeDefined();
    expect(stepZero?.flags.CF).toBe(1);
  });

  it("verifies Example 3 (Signed Math, Two's Complement & NEG) sign-extends via CBW", async () => {
    const ex = MASM_EXAMPLES.find((e) => e.id === "signed-neg")!;
    const result = await masmEngine.run(ex.code);
    expect(result.success).toBe(true);
    // val1 = 15, neg al => -15 (F1h)
    // val2 = -25 (E7h)
    // al = F1h + E7h = D8h (-40 decimal)
    // cbw => AX = FFD8h
    const stepCbw = result.steps.find((s) => s.registers.AX === "FFD8");
    expect(stepCbw).toBeDefined();
  });

  it("verifies Example 4 (Register Exchange & Data Swapping) swaps AX, BX and high/low bytes", async () => {
    const ex = MASM_EXAMPLES.find((e) => e.id === "xchg-swap")!;
    const result = await masmEngine.run(ex.code);
    expect(result.success).toBe(true);
    // num1 was 1234h, num2 was 5678h
    // xchg ax, bx => ax = 5678h, bx = 1234h
    // xchg ah, al => ax = 7856h
    const stepSwapped = result.steps.find((s) => s.registers.AX === "7856");
    expect(stepSwapped).toBeDefined();
    expect(stepSwapped?.registers.BX).toBe("1234");
  });

  it("verifies Example 5 (Bitwise Logic, Masks & Parity) zeroes register with XOR", async () => {
    const ex = MASM_EXAMPLES.find((e) => e.id === "bitwise-logic")!;
    const result = await masmEngine.run(ex.code);
    expect(result.success).toBe(true);
    const stepXor = result.steps.find((s) => s.registers.BX === "0000" && s.flags.ZF === 1);
    expect(stepXor).toBeDefined();
  });

  it("verifies Example 6 (Bit Shifting) computes powers of 2 and arithmetic right shift", async () => {
    const ex = MASM_EXAMPLES.find((e) => e.id === "bit-shift")!;
    const result = await masmEngine.run(ex.code);
    expect(result.success).toBe(true);
    // AX = 5, shl 1 => 10, shl 2 => 40 (0028h)
    const step40 = result.steps.find((s) => s.registers.AX === "0028");
    expect(step40).toBeDefined();
    // BX = 64, shr 3 => 8
    const stepBx8 = result.steps.find((s) => s.registers.BX === "0008");
    expect(stepBx8).toBeDefined();
    // DX = -16 (FFF0h), sar 2 => -4 (FFFCh)
    const stepDxSar = result.steps.find((s) => s.registers.DX === "FFFC");
    expect(stepDxSar).toBeDefined();
  });

  it("verifies Example 7 (Bit Rotation) rotates left, right, and through carry", async () => {
    const ex = MASM_EXAMPLES.find((e) => e.id === "bit-rotate")!;
    const result = await masmEngine.run(ex.code);
    expect(result.success).toBe(true);
    // rol 8001h, 1 => 0003h
    const stepRol = result.steps.find((s) => s.registers.AX === "0003");
    expect(stepRol).toBeDefined();
    // ror 0003h, 2 => C000h
    const stepRor = result.steps.find((s) => s.registers.AX === "C000");
    expect(stepRor).toBeDefined();
  });

  it("verifies Example 8 (Loop Counter) sums 1 to 10 to equal 55 (0037h)", async () => {
    const ex = MASM_EXAMPLES.find((e) => e.id === "loop-counter")!;
    const result = await masmEngine.run(ex.code);
    expect(result.success).toBe(true);
    const stepSum = result.steps.find((s) => s.registers.AX === "0037");
    expect(stepSum).toBeDefined();
  });

  it("verifies Example 9 (Stack Operations) pops in reverse order", async () => {
    const ex = MASM_EXAMPLES.find((e) => e.id === "stack-push-pop")!;
    const result = await masmEngine.run(ex.code);
    expect(result.success).toBe(true);
    // Pushed AX=1111h, BX=2222h, CX=3333h
    // Popped AX=3333h, BX=2222h, CX=1111h
    const lastStep = result.steps[result.steps.length - 1];
    expect(lastStep.registers.AX).toBe("4C00");
    expect(lastStep.registers.BX).toBe("2222");
    expect(lastStep.registers.CX).toBe("1111");
  });

  it("verifies Example 10 (Memory Addressing) computes sum of array = F0h", async () => {
    const ex = MASM_EXAMPLES.find((e) => e.id === "memory-addressing")!;
    const result = await masmEngine.run(ex.code);
    expect(result.success).toBe(true);
    // 10h + 20h + 30h + 40h + 50h = F0h (240)
    const axValues = result.steps.map((s) => s.registers.AX);
    const stepF0 = result.steps.find((s) => (parseInt(s.registers.AX, 16) & 0xff) === 0xf0);
    if (!stepF0) {
      console.error("Example 10 AX values:", axValues);
    }
    expect(stepF0).toBeDefined();
  });

  it("verifies Example 11 (String Operations) copies string via REP MOVSB", async () => {
    const ex = MASM_EXAMPLES.find((e) => e.id === "string-ops")!;
    const result = await masmEngine.run(ex.code);
    expect(result.success).toBe(true);
    // CX decrements to 0
    const lastStep = result.steps[result.steps.length - 1];
    expect(lastStep.registers.CX).toBe("0000");
  });

  it("verifies Example 12 (BIOS Video Screen Mode & Clear Screen) runs without errors", async () => {
    const ex = MASM_EXAMPLES.find((e) => e.id === "bios-video-clear")!;
    const result = await masmEngine.run(ex.code);
    expect(result.success).toBe(true);
    const lastStep = result.steps[result.steps.length - 1];
    expect(lastStep.stdout).toContain("Screen Cleared! Cursor at (12, 30)");
  });

  it("verifies Example 13 (BIOS Teletype Character Printing) streams characters", async () => {
    const ex = MASM_EXAMPLES.find((e) => e.id === "bios-teletype")!;
    const result = await masmEngine.run(ex.code);
    expect(result.success).toBe(true);
    const lastStep = result.steps[result.steps.length - 1];
    expect(lastStep.stdout).toContain("Assembly Interactive Output");
  });

  it("verifies Example 14 (Linear Search Algorithm) finds target 89h at index 03h", async () => {
    const ex = MASM_EXAMPLES.find((e) => e.id === "linear-search")!;
    const result = await masmEngine.run(ex.code);
    expect(result.success).toBe(true);
    // 89h is at index 3 in [12h, 45h, 67h, 89h, 34h, 99h]
    const stepFound = result.steps.find((s) => s.registers.BX === "0003");
    expect(stepFound).toBeDefined();
  });

  it("verifies Example 15 (Bubble Sort Algorithm) runs through all outer and inner passes", async () => {
    const ex = MASM_EXAMPLES.find((e) => e.id === "bubble-sort")!;
    const result = await masmEngine.run(ex.code, { maxSteps: 5000 });
    if (!result.success) {
      console.error("Bubble sort error:", result.error);
    }
    expect(result.success).toBe(true);
    expect(result.totalSteps).toBeGreaterThan(20);
  });
});
