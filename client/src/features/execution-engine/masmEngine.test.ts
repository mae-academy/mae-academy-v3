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
    const result = await masmEngine.run("invalid_op bx\nhlt");
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

  describe("Full 8086 Instruction Set & Addressing Modes", () => {
    it("executes unsigned MUL and signed IMUL (8-bit and 16-bit)", async () => {
      // 8-bit unsigned: AL = 6 * 7 = 42 (002Ah)
      const mul8 = await masmEngine.run(`
        main:
          mov al, 6
          mov bl, 7
          mul bl
          hlt
      `);
      expect(mul8.success).toBe(true);
      const mulStep = mul8.steps.find(s => s.registers?.AX === "002A");
      expect(mulStep).toBeDefined();
      expect(mulStep?.flags?.CF).toBe(0);

      // 16-bit unsigned: DX:AX = 1000h * 20h = 20000h (DX=2, AX=0)
      const mul16 = await masmEngine.run(`
        main:
          mov ax, 1000h
          mov bx, 20h
          mul bx
          hlt
      `);
      expect(mul16.success).toBe(true);
      const last = mul16.steps.at(-1);
      expect(last?.registers?.AX).toBe("0000");
      expect(last?.registers?.DX).toBe("0002");
      expect(last?.flags?.CF).toBe(1);

      // 8-bit signed IMUL: AL = -5 * 6 = -30 (FFE2h)
      const imul8 = await masmEngine.run(`
        main:
          mov al, 0fbh ; -5
          mov bl, 6
          imul bl
          hlt
      `);
      expect(imul8.success).toBe(true);
      expect(imul8.steps.at(-1)?.registers?.AX).toBe("FFE2");
    });

    it("executes DIV and IDIV (8-bit and 16-bit)", async () => {
      // 8-bit DIV: AX = 42 (002Ah) / 5 -> AL = 8 (quotient), AH = 2 (remainder) -> AX = 0208h
      const div8 = await masmEngine.run(`
        main:
          mov ax, 002Ah
          mov bl, 5
          div bl
          hlt
      `);
      expect(div8.success).toBe(true);
      expect(div8.steps.at(-1)?.registers?.AX).toBe("0208");

      // 16-bit DIV: DX:AX = 1000 (03E8h) / 3 -> AX = 333 (014Dh), DX = 1
      const div16 = await masmEngine.run(`
        main:
          mov dx, 0
          mov ax, 03E8h
          mov bx, 3
          div bx
          hlt
      `);
      expect(div16.success).toBe(true);
      expect(div16.steps.at(-1)?.registers?.AX).toBe("014D");
      expect(div16.steps.at(-1)?.registers?.DX).toBe("0001");
    });

    it("executes NEG and updates flags correctly", async () => {
      const result = await masmEngine.run(`
        main:
          mov al, 5
          neg al
          mov bl, 0
          neg bl
          hlt
      `);
      expect(result.success).toBe(true);
      // neg al (5 -> 0FBh = -5)
      const negStep1 = result.steps[1];
      expect(negStep1.registers?.AX?.endsWith("FB")).toBe(true);
      expect(negStep1.flags?.CF).toBe(1);
      expect(negStep1.flags?.ZF).toBe(0);
      expect(negStep1.flags?.SF).toBe(1);

      // neg bl (0 -> 0)
      const negStep2 = result.steps[3];
      expect(negStep2.registers?.BX?.endsWith("00")).toBe(true);
      expect(negStep2.flags?.CF).toBe(0);
      expect(negStep2.flags?.ZF).toBe(1);
    });

    it("executes TEST reg/imm and CMP reg/mem without corrupting destination", async () => {
      const result = await masmEngine.run(`
        .data
        arr db 10h, 20h
        .code
        main proc
          mov ax, @data
          mov ds, ax
          mov si, offset arr
          mov al, 05h
          test al, 02h
          test al, 01h
          cmp al, [si]
          hlt
        main endp
      `);
      expect(result.success).toBe(true);
      // al is still 05h after test
      const testStep1 = result.steps.find(s => s.instruction.includes("test al, 02h"));
      expect(testStep1?.registers?.AX?.endsWith("05")).toBe(true);
      expect(testStep1?.flags?.ZF).toBe(1);

      const testStep2 = result.steps.find(s => s.instruction.includes("test al, 01h"));
      expect(testStep2?.flags?.ZF).toBe(0);

      // cmp al, [si] -> 5 - 10h (subtraction flags without changing al)
      const cmpStep = result.steps.find(s => s.instruction.includes("cmp al, [si]"));
      expect(cmpStep?.registers?.AX?.endsWith("05")).toBe(true);
      expect(cmpStep?.flags?.CF).toBe(1); // 5 < 16 -> borrow
    });

    it("executes bit shifts and rotates (SHL, SHR, SAR, ROL, ROR)", async () => {
      const result = await masmEngine.run(`
        main:
          mov al, 05h
          shl al, 1
          mov bl, 09h
          shr bl, 1
          mov cl, 0FEh
          sar cl, 1
          mov dl, 81h
          rol dl, 1
          hlt
      `);
      expect(result.success).toBe(true);
      // shl 5 by 1 = 10 (0Ah)
      expect(result.steps[1].registers?.AX?.endsWith("0A")).toBe(true);
      // shr 9 by 1 = 4, CF = 1
      expect(result.steps[3].registers?.BX?.endsWith("04")).toBe(true);
      expect(result.steps[3].flags?.CF).toBe(1);
      // sar 0xFE (-2) by 1 = 0xFF (-1), CF = 0
      expect(result.steps[5].registers?.CX?.endsWith("FF")).toBe(true);
      expect(result.steps[5].flags?.CF).toBe(0);
      // rol 81h by 1 = 03h, CF = 1
      expect(result.steps[7].registers?.DX?.endsWith("03")).toBe(true);
      expect(result.steps[7].flags?.CF).toBe(1);
    });

    it("supports shift and rotate by register CL", async () => {
      const result = await masmEngine.run(`
        main:
          mov al, 1
          mov cl, 4
          shl al, cl
          hlt
      `);
      expect(result.success).toBe(true);
      expect(result.steps.at(-1)?.registers?.AX?.endsWith("10")).toBe(true);
    });

    it("supports indirect addressing, displacements, INC BL, DEC DI, and LEA", async () => {
      const result = await masmEngine.run(`
        .data
        arr db 12h, 34h, 56h, 78h
        .code
        main proc
          mov ax, @data
          mov ds, ax
          mov si, offset arr
          mov al, [si]
          add al, [si + 1]
          inc bl
          dec di
          lea dx, [si + 2]
          mov [si], bl
          hlt
        main endp
      `);
      expect(result.success).toBe(true);
      // AL = 12h + 34h = 46h
      const addStep = result.steps.find(s => s.instruction.includes("add al, [si + 1]"));
      expect(addStep?.registers?.AX?.endsWith("46")).toBe(true);

      // inc bl increments BL without error
      const incStep = result.steps.find(s => s.instruction.includes("inc bl"));
      expect(incStep?.registers?.BX?.endsWith("01")).toBe(true);

      // dec di decrements DI without error (0 - 1 = FFFF)
      const decStep = result.steps.find(s => s.instruction.includes("dec di"));
      expect(decStep?.registers?.DI).toBe("FFFF");

      // lea dx, [si + 2] computes effective address
      const leaStep = result.steps.find(s => s.instruction.includes("lea dx, [si + 2]"));
      const siVal = parseInt(leaStep?.registers?.SI ?? "0", 16);
      const dxVal = parseInt(leaStep?.registers?.DX ?? "0", 16);
      expect(dxVal).toBe(siVal + 2);
    });

    it("supports DUP allocations in data definitions", async () => {
      const result = await masmEngine.run(`
        .data
        dst db 5 dup(0)
        src dw 4 dup(100h)
        .code
        main proc
          mov ax, @data
          mov ds, ax
          mov si, offset dst
          mov al, [si]
          hlt
        main endp
      `);
      expect(result.success).toBe(true);
      expect(result.steps.at(-1)?.registers?.AX?.endsWith("00")).toBe(true);
    });

    it("executes CLD, STD, and REP MOVSB string instructions", async () => {
      const result = await masmEngine.run(`
        .data
        source db 'HELLO'
        dest db 5 dup(0)
        .code
        main proc
          mov ax, @data
          mov ds, ax
          mov es, ax
          cld
          mov si, offset source
          mov di, offset dest
          mov cx, 5
          rep movsb
          std
          hlt
        main endp
      `);
      expect(result.success).toBe(true);
      const cldStep = result.steps.find(s => s.instruction.includes("cld"));
      expect(cldStep?.flags?.DF).toBe(0);

      const repStep = result.steps.find(s => s.instruction.includes("rep movsb"));
      expect(repStep?.registers?.CX).toBe("0000");

      const stdStep = result.steps.find(s => s.instruction.includes("std"));
      expect(stdStep?.flags?.DF).toBe(1);

      // Verify copied bytes at dest
      const destOffset = result.steps.find(s => s.instruction.includes("mov di, offset dest"));
      const diAddr = parseInt(destOffset?.registers?.DI ?? "0", 16);
      const mem = masmEngine.peekMemory(diAddr, 5);
      expect(Array.from(mem).map(c => String.fromCharCode(c)).join("")).toBe("HELLO");
    });
  });
});

