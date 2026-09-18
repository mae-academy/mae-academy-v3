import { describe, expect, it } from "vitest";

import * as masmEngine from "@/features/execution-engine/masmEngine";

describe("8086 Assembly Engine — Advanced E2E Verification Suite", () => {
  // =========================================================================
  // 1. Complex Arithmetic & Flags
  // =========================================================================
  describe("1. Complex Arithmetic & Flags", () => {
    it("computes 16-bit unsigned multiplication with 32-bit product in DX:AX and sets CF/OF", async () => {
      const result = await masmEngine.run(`
        main:
          mov ax, 1234h
          mov bx, 5678h
          mul bx
          hlt
      `);
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();

      const lastStep = result.steps.at(-1);
      // 0x1234 * 0x5678 = 0x06260060 -> DX = 0626h, AX = 0060h
      expect(lastStep?.registers?.DX).toBe("0626");
      expect(lastStep?.registers?.AX).toBe("0060");
      // Since high-order word DX != 0, CF and OF must both be set to 1
      expect(lastStep?.flags?.CF).toBe(1);
      expect(lastStep?.flags?.OF).toBe(1);
    });

    it("computes 8-bit unsigned multiplication in AX", async () => {
      const result = await masmEngine.run(`
        main:
          mov al, 20h
          mov bl, 10h
          mul bl
          hlt
      `);
      expect(result.success).toBe(true);
      const lastStep = result.steps.at(-1);
      // 20h * 10h = 0200h -> AX = 0200h
      expect(lastStep?.registers?.AX).toBe("0200");
      expect(lastStep?.flags?.CF).toBe(1);
      expect(lastStep?.flags?.OF).toBe(1);
    });

    it("computes signed 16-bit multiplication (IMUL) with negative result", async () => {
      const result = await masmEngine.run(`
        main:
          mov ax, 0FFFEh ; -2
          mov bx, 0003h  ; +3
          imul bx
          hlt
      `);
      expect(result.success).toBe(true);
      const lastStep = result.steps.at(-1);
      // -2 * 3 = -6 = 0xFFFFFFFA -> DX = FFFFh, AX = FFFAh
      expect(lastStep?.registers?.DX).toBe("FFFF");
      expect(lastStep?.registers?.AX).toBe("FFFA");
      // DX is sign-extension of AX, so CF and OF are 0
      expect(lastStep?.flags?.CF).toBe(0);
      expect(lastStep?.flags?.OF).toBe(0);
    });

    it("computes 16-bit unsigned division with 32-bit dividend in DX:AX", async () => {
      const result = await masmEngine.run(`
        main:
          mov dx, 0001h
          mov ax, 0000h ; DX:AX = 0x10000 = 65536
          mov bx, 0002h ; divisor = 2
          div bx
          hlt
      `);
      expect(result.success).toBe(true);
      const lastStep = result.steps.at(-1);
      // Quotient 65536 / 2 = 32768 = 8000h in AX, remainder 0 in DX
      expect(lastStep?.registers?.AX).toBe("8000");
      expect(lastStep?.registers?.DX).toBe("0000");
    });

    it("computes 8-bit unsigned division (AL = quotient, AH = remainder)", async () => {
      const result = await masmEngine.run(`
        main:
          mov ax, 0019h ; 25
          mov bl, 04h   ; 4
          div bl
          hlt
      `);
      expect(result.success).toBe(true);
      const lastStep = result.steps.at(-1);
      // 25 / 4 = quotient 6 in AL (06h), remainder 1 in AH (01h) -> AX = 0106h
      expect(lastStep?.registers?.AX).toBe("0106");
    });

    it("computes 16-bit signed division (IDIV)", async () => {
      const result = await masmEngine.run(`
        main:
          mov dx, 0FFFFh
          mov ax, 0FF9Ch ; -100 in DX:AX
          mov bx, 000Ah  ; +10
          idiv bx
          hlt
      `);
      expect(result.success).toBe(true);
      const lastStep = result.steps.at(-1);
      // -100 / 10 = -10 = 0xFFF6 in AX, remainder 0 in DX
      expect(lastStep?.registers?.AX).toBe("FFF6");
      expect(lastStep?.registers?.DX).toBe("0000");
    });

    it("handles division by zero gracefully without crashing the runner", async () => {
      const result = await masmEngine.run(`
        main:
          mov ax, 1000h
          mov bl, 0
          div bl
          hlt
      `);
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/divide by zero/i);
    });

    it("validates two's complement NEG across zero, positive, negative, and overflow boundary", async () => {
      // 1. NEG 0 -> 0, CF=0, ZF=1, SF=0, OF=0
      const resZero = await masmEngine.run(`
        main:
          mov al, 0
          neg al
          hlt
      `);
      expect(resZero.success).toBe(true);
      const stepZero = resZero.steps.at(-1);
      expect(stepZero?.registers?.AX?.endsWith("00")).toBe(true);
      expect(stepZero?.flags?.CF).toBe(0);
      expect(stepZero?.flags?.ZF).toBe(1);
      expect(stepZero?.flags?.SF).toBe(0);
      expect(stepZero?.flags?.OF).toBe(0);

      // 2. NEG 1 -> 0xFF (-1), CF=1, ZF=0, SF=1, OF=0
      const resPos = await masmEngine.run(`
        main:
          mov al, 1
          neg al
          hlt
      `);
      expect(resPos.success).toBe(true);
      const stepPos = resPos.steps.at(-1);
      expect(stepPos?.registers?.AX?.endsWith("FF")).toBe(true);
      expect(stepPos?.flags?.CF).toBe(1);
      expect(stepPos?.flags?.ZF).toBe(0);
      expect(stepPos?.flags?.SF).toBe(1);
      expect(stepPos?.flags?.OF).toBe(0);

      // 3. NEG 80h (-128) -> 80h (-128 cannot be represented in positive 8-bit), OF=1, CF=1, SF=1
      const resOv = await masmEngine.run(`
        main:
          mov al, 80h
          neg al
          hlt
      `);
      expect(resOv.success).toBe(true);
      const stepOv = resOv.steps.at(-1);
      expect(stepOv?.registers?.AX?.endsWith("80")).toBe(true);
      expect(stepOv?.flags?.OF).toBe(1);
      expect(stepOv?.flags?.CF).toBe(1);
      expect(stepOv?.flags?.SF).toBe(1);

      // 4. NEG 16-bit word: 1234h -> EDCC (-0x1234 = 0xEDCC)
      const resWord = await masmEngine.run(`
        main:
          mov ax, 1234h
          neg ax
          hlt
      `);
      expect(resWord.success).toBe(true);
      const stepWord = resWord.steps.at(-1);
      expect(stepWord?.registers?.AX).toBe("EDCC");
      expect(stepWord?.flags?.CF).toBe(1);
      expect(stepWord?.flags?.SF).toBe(1);
    });
  });

  // =========================================================================
  // 2. Bitwise & Shift/Rotate Calculations
  // =========================================================================
  describe("2. Bitwise & Shift/Rotate Calculations", () => {
    it("executes multi-bit shifts via CL register", async () => {
      const result = await masmEngine.run(`
        main:
          mov ax, 000Fh
          mov cl, 4
          shl ax, cl
          mov bx, 0F00h
          mov cl, 8
          shr bx, cl
          hlt
      `);
      expect(result.success).toBe(true);
      const lastStep = result.steps.at(-1);
      expect(lastStep?.registers?.AX).toBe("00F0");
      expect(lastStep?.registers?.BX).toBe("000F");
    });

    it("performs SAR arithmetic right shift preserving sign bit", async () => {
      const result = await masmEngine.run(`
        main:
          mov ax, 8000h
          mov cl, 4
          sar ax, cl
          hlt
      `);
      expect(result.success).toBe(true);
      const lastStep = result.steps.at(-1);
      // 0x8000 >> 4 with sign extension -> 0xF800
      expect(lastStep?.registers?.AX).toBe("F800");
      expect(lastStep?.flags?.SF).toBe(1);
    });

    it("executes ROL and ROR rotations verifying Carry Flag propagation", async () => {
      const result = await masmEngine.run(`
        main:
          mov al, 80h
          rol al, 1
          mov bl, 01h
          ror bl, 1
          mov cx, 8001h
          rol cx, 1
          hlt
      `);
      expect(result.success).toBe(true);
      const lastStep = result.steps.at(-1);
      // al: 80h rot left 1 -> 01h, carry = 1
      expect(lastStep?.registers?.AX?.endsWith("01")).toBe(true);
      // bl: 01h rot right 1 -> 80h, carry = 1
      expect(lastStep?.registers?.BX?.endsWith("80")).toBe(true);
      // cx: 8001h rot left 1 -> 0003h, carry = 1
      expect(lastStep?.registers?.CX).toBe("0003");
      expect(lastStep?.flags?.CF).toBe(1);
    });

    it("performs TEST masking without mutating the destination register", async () => {
      const result = await masmEngine.run(`
        main:
          mov ax, 0F0Fh
          test ax, 00F0h ; no overlapping bits -> ZF = 1
          mov bx, ax    ; verify ax unchanged
          test ax, 000Fh ; overlapping bits -> ZF = 0
          hlt
      `);
      expect(result.success).toBe(true);
      const step1 = result.steps.find(s => s.instruction.includes("test ax, 00F0h"));
      expect(step1?.flags?.ZF).toBe(1);
      expect(step1?.flags?.CF).toBe(0);
      expect(step1?.flags?.OF).toBe(0);
      expect(step1?.registers?.AX).toBe("0F0F");

      const lastStep = result.steps.at(-1);
      expect(lastStep?.registers?.BX).toBe("0F0F");
      expect(lastStep?.registers?.AX).toBe("0F0F");
      expect(lastStep?.flags?.ZF).toBe(0);
    });
  });

  // =========================================================================
  // 3. Memory, Indirect Addressing & Arrays
  // =========================================================================
  describe("3. Memory, Indirect Addressing & Arrays", () => {
    it("handles direct and complex indirect indexed modes ([si], [di+2], [bx+si])", async () => {
      const result = await masmEngine.run(`
        .data
        table db 10h, 20h, 30h, 40h, 50h
        .code
        main proc
          mov ax, @data
          mov ds, ax
          mov si, offset table
          mov al, [si]
          mov di, si
          mov dl, [di + 2]
          mov bx, 1
          mov cl, [bx + si]
          hlt
        main endp
      `);
      expect(result.success).toBe(true);
      const lastStep = result.steps.at(-1);
      // [si] = 10h
      expect(lastStep?.registers?.AX?.endsWith("10")).toBe(true);
      // [di + 2] = table[2] = 30h (stored in DL)
      expect(lastStep?.registers?.DX?.endsWith("30")).toBe(true);
      // [bx + si] = table[1] = 20h (stored in CL)
      expect(lastStep?.registers?.CX?.endsWith("20")).toBe(true);
    });

    it("increments and decrements 8-bit & 16-bit registers and memory operands", async () => {
      const result = await masmEngine.run(`
        .data
        val_byte db 7Fh
        val_word dw 00FEh
        .code
        main proc
          mov ax, @data
          mov ds, ax
          mov bl, 0FEh
          inc bl
          mov di, 0005h
          dec di
          mov si, offset val_byte
          inc byte ptr [si]
          mov si, offset val_word
          inc word ptr [si]
          hlt
        main endp
      `);
      expect(result.success).toBe(true);
      const lastStep = result.steps.at(-1);
      // BL incremented: 0xFE + 1 = 0xFF
      expect(lastStep?.registers?.BX?.endsWith("FF")).toBe(true);
      // DI decremented: 5 - 1 = 4
      expect(lastStep?.registers?.DI).toBe("0004");

      // Verify memory mutated: val_byte 7Fh -> 80h, val_word 00FEh -> 00FFh
      const offsetStep = result.steps.find(s => s.instruction.includes("offset val_byte"));
      const byteAddr = parseInt(offsetStep?.registers?.SI ?? "0", 16);
      const memByte = masmEngine.peekMemory(byteAddr, 1);
      expect(memByte[0]).toBe(0x80);

      const wordOffsetStep = result.steps.findLast(s => s.instruction.includes("offset val_word"));
      const wordAddr = parseInt(wordOffsetStep?.registers?.SI ?? "0", 16);
      const memWord = masmEngine.peekMemory(wordAddr, 2);
      expect(memWord[0] | (memWord[1] << 8)).toBe(0x00ff);
    });

    it("computes effective address using LEA", async () => {
      const result = await masmEngine.run(`
        .code
        main proc
          mov bx, 0010h
          mov si, 0004h
          lea dx, [bx + si + 2]
          hlt
        main endp
      `);
      expect(result.success).toBe(true);
      const lastStep = result.steps.at(-1);
      // BX (16) + SI (4) + 2 = 22 = 0x0016
      expect(lastStep?.registers?.DX).toBe("0016");
    });

    it("allocates repeating memory blocks with DUP and accesses items correctly", async () => {
      const result = await masmEngine.run(`
        .data
        zeros db 5 dup(0)
        pats  db 4 dup(0AAh)
        words dw 3 dup(1234h)
        .code
        main proc
          mov ax, @data
          mov ds, ax
          mov si, offset pats
          mov al, [si]
          mov di, offset words
          mov bx, [di + 2]
          hlt
        main endp
      `);
      expect(result.success).toBe(true);
      const lastStep = result.steps.at(-1);
      expect(lastStep?.registers?.AX?.endsWith("AA")).toBe(true);
      expect(lastStep?.registers?.BX).toBe("1234");

      // Verify exact memory buffer with peekMemory
      const patsStep = result.steps.find(s => s.instruction.includes("offset pats"));
      const patsAddr = parseInt(patsStep?.registers?.SI ?? "0", 16);
      const patsMem = masmEngine.peekMemory(patsAddr, 4);
      expect(Array.from(patsMem)).toEqual([0xaa, 0xaa, 0xaa, 0xaa]);

      const wordsStep = result.steps.find(s => s.instruction.includes("offset words"));
      const wordsAddr = parseInt(wordsStep?.registers?.DI ?? "0", 16);
      const wordsMem = masmEngine.peekMemory(wordsAddr, 6);
      expect(Array.from(wordsMem)).toEqual([0x34, 0x12, 0x34, 0x12, 0x34, 0x12]);
    });
  });

  // =========================================================================
  // 4. String Operations & Repetition Prefixes
  // =========================================================================
  describe("4. String Operations & Repetition Prefixes", () => {
    it("copies a block of memory using CLD and REP MOVSB", async () => {
      const result = await masmEngine.run(`
        .data
        src_str db 'ANTIGRAVITY$'
        dst_str db 12 dup(0)
        .code
        main proc
          mov ax, @data
          mov ds, ax
          mov es, ax
          cld
          mov si, offset src_str
          mov di, offset dst_str
          mov cx, 11
          rep movsb
          hlt
        main endp
      `);
      expect(result.success).toBe(true);
      const lastStep = result.steps.at(-1);
      expect(lastStep?.registers?.CX).toBe("0000");
      expect(lastStep?.flags?.DF).toBe(0);

      const dstStep = result.steps.find(s => s.instruction.includes("offset dst_str"));
      const dstAddr = parseInt(dstStep?.registers?.DI ?? "0", 16);
      const copied = masmEngine.peekMemory(dstAddr, 11);
      expect(Array.from(copied).map(c => String.fromCharCode(c)).join("")).toBe("ANTIGRAVITY");
    });

    it("scans string using CLD and REPNE SCASB, stopping on match and updating CX and ZF", async () => {
      const result = await masmEngine.run(`
        .data
        haystack db 'ABCDEFGH'
        .code
        main proc
          mov ax, @data
          mov ds, ax
          mov es, ax
          cld
          mov di, offset haystack
          mov al, 'D'
          mov cx, 8
          repne scasb
          hlt
        main endp
      `);
      expect(result.success).toBe(true);
      const lastStep = result.steps.at(-1);
      // 'D' is the 4th character (index 3). CX starts at 8, decrements for 'A', 'B', 'C', 'D' -> CX = 4
      expect(lastStep?.registers?.CX).toBe("0004");
      expect(lastStep?.flags?.ZF).toBe(1);
    });

    it("performs in-place array reversal using two pointers and comparison loops", async () => {
      const result = await masmEngine.run(`
        .data
        nums db 1, 2, 3, 4, 5
        .code
        main proc
          mov ax, @data
          mov ds, ax
          mov si, offset nums
          mov di, offset nums
          add di, 4
        rev_loop:
          mov al, [si]
          mov bl, [di]
          mov [si], bl
          mov [di], al
          inc si
          dec di
          cmp si, di
          jb rev_loop
          hlt
        main endp
      `);
      expect(result.success).toBe(true);

      const siStep = result.steps.find(s => s.instruction.includes("offset nums"));
      const numsAddr = parseInt(siStep?.registers?.SI ?? "0", 16);
      const reversedMem = masmEngine.peekMemory(numsAddr, 5);
      expect(Array.from(reversedMem)).toEqual([5, 4, 3, 2, 1]);
    });
  });

  // =========================================================================
  // 5. Program Architecture & Dual-Format Support
  // =========================================================================
  describe("5. Program Architecture & Dual-Format Support", () => {
    it("executes flat COM style program with ORG 100h and direct memory access", async () => {
      const result = await masmEngine.run(`
        org 100h
        start:
          mov ax, 1000h
          mov bx, 2000h
          add ax, bx
          mov [result_var], ax
          hlt
        result_var dw 0
      `);
      expect(result.success).toBe(true);
      const lastStep = result.steps.at(-1);
      expect(lastStep?.registers?.AX).toBe("3000");

      const varStep = result.steps.find(s => s.instruction.includes("result_var"));
      expect(varStep).toBeDefined();
    });

    it("executes standard segmented DOS MASM program with DOS INT 21h terminate", async () => {
      const result = await masmEngine.run(`
        .model small
        .stack 100h
        .data
        msg db 'HELLO DOS$'
        .code
        main proc
          mov ax, @data
          mov ds, ax
          mov ah, 09h
          mov dx, offset msg
          int 21h
          mov ax, 4c00h
          int 21h
        main endp
        end main
      `);
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      const lastStep = result.steps.at(-1);
      expect(lastStep?.stdout).toBe("HELLO DOS");
    });
  });
});
