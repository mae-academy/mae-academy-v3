import { describe, expect, it } from "vitest";

import * as masmEngine from "@/features/execution-engine/masmEngine";

describe("masmEngine.run — pure-TypeScript Cpu8086 (no v86, no mocks)", () => {
  it("produces one TraceStep per executed instruction, in source order", async () => {
    const result = await masmEngine.run(`
      main:
          mov ax, 10h
          mov bx, 20h
          add ax, bx
          hlt
    `);
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.steps).toHaveLength(4);
    expect(result.totalSteps).toBe(4);
    expect(result.steps[0].registers?.AX).toBe("0010");
    expect(result.steps[1].registers?.BX).toBe("0020");
    expect(result.steps[2].registers?.AX).toBe("0030");
  });

  it("stepIndex is 0-based and matches array position", async () => {
    const result = await masmEngine.run(`
      main:
          mov ax, 1
          mov bx, 2
          hlt
    `);
    expect(result.steps.map(step => step.stepIndex)).toEqual([0, 1, 2]);
  });

  it("reports assembly diagnostics as a failed result instead of throwing", async () => {
    const result = await masmEngine.run("mul bx\nhlt");
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    expect(result.steps).toHaveLength(0);
  });

  it("halts and reports an error when a program never reaches HLT within maxSteps", async () => {
    const result = await masmEngine.run(
      `
      main:
          mov cx, 0
      loop_forever:
          inc cx
          jmp loop_forever
    `,
      { maxSteps: 50 }
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/possible infinite loop/i);
    expect(result.steps).toHaveLength(50);
  });

  it("tracks callStack across CALL/RET, resolving the real procedure name", async () => {
    const result = await masmEngine.run(`
      main:
          call adder
          hlt
      adder:
          mov ax, 1
          ret
    `);
    // The CALL instruction's own step already shows "adder" on the stack (it pushed the frame as
    // part of executing); the mov inside adder is the *last* step with "adder" still on it.
    const callStep = result.steps.findLast(step =>
      step.callStack.includes("adder")
    );
    expect(callStep).toBeDefined();
    expect(callStep?.registers?.AX).toBe("0001");
    const afterReturn = result.steps.at(-1);
    expect(afterReturn?.callStack).not.toContain("adder");
  });

  it("captures a per-step stack memory window usable by the Stack panel", async () => {
    const result = await masmEngine.run(`
      main:
          mov sp, 0400h
          mov ax, 9abch
          push ax
          hlt
    `);
    const pushStep = result.steps.find(step => step.registers?.SP === "03FE");
    expect(pushStep?.memory?.length).toBeGreaterThan(0);
    const [low, high] = pushStep!
      .memory!.filter(
        cell => cell.address === 0x03fe || cell.address === 0x03ff
      )
      .map(cell => cell.value);
    expect(low | (high << 8)).toBe(0x9abc);
  });

  it("computes arithmetic flags correctly (CMP against self sets ZF, clears CF)", async () => {
    const result = await masmEngine.run(`
      main:
          mov ax, 0
          cmp ax, ax
          hlt
    `);
    const cmpStep = result.steps[1];
    expect(cmpStep.flags?.ZF).toBe(1);
    expect(cmpStep.flags?.CF).toBe(0);
  });

  it("DOS INT 21h AH=09h prints a $-terminated string to stdout", async () => {
    const result = await masmEngine.run(`
      .model small
      .stack 100h
      .data
      message db 'MAE 8086 ready.$', 0
      .code
      main proc
        mov ax, @data
        mov ds, ax
        mov dx, offset message
        mov ah, 09h
        int 21h
        mov ax, 4C00h
        int 21h
      main endp
    `);
    expect(result.success).toBe(true);
    expect(result.steps.at(-1)?.stdout).toBe("MAE 8086 ready.");
  });

  it("does not leak register state between independent run() calls", async () => {
    const a = await masmEngine.run("main:\n mov ax, 1\n hlt");
    const b = await masmEngine.run("main:\n mov ax, 2\n hlt");
    expect(a.steps.at(-1)?.registers?.AX).toBe("0001");
    expect(b.steps.at(-1)?.registers?.AX).toBe("0002");
  });
});
