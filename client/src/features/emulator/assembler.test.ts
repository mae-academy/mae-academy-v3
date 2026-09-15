import { describe, expect, it } from "vitest";

import { COM_ORIGIN, COM_SEGMENT, compileComProgram } from "@/features/emulator/assembler";

describe("compileComProgram — directive parsing (Task 8)", () => {
  it("accepts .model/.stack/.data/.code/end without diagnostics", () => {
    const program = compileComProgram(`
      .model small
      .stack 100h
      .data
        var1 db 10
      .code
      main:
          mov ax, 0
          hlt
      end main
    `);
    expect(program.diagnostics).toEqual([]);
  });

  it("relocates .data after .code so the COM image starts with executable bytes at origin", () => {
    const program = compileComProgram(`
      .model small
      .data
        var1 db 0x41
      .code
      main:
          mov ax, 0x1234
          hlt
    `);
    // mov ax,imm16 (0xB8 0x34 0x12) then hlt (0xF4) must occupy the first 4 bytes.
    expect(Array.from(program.bytes.slice(0, 4))).toEqual([0xb8, 0x34, 0x12, 0xf4]);
    expect(program.symbols.get("var1")).toBe(COM_ORIGIN + 4);
  });

  it("still supports the legacy ORG directive for flat COM sources", () => {
    const program = compileComProgram(`
      org 100h
      mov ax, 10
      hlt
    `);
    expect(program.diagnostics).toEqual([]);
    expect(program.origin).toBe(0x100);
  });

  it("rejects ORG after bytes have already been emitted", () => {
    const program = compileComProgram(`
      mov ax, 1
      org 200h
      hlt
    `);
    expect(program.diagnostics.some((d) => /ORG must appear before/.test(d.message))).toBe(true);
  });

  it("flags duplicate symbol definitions", () => {
    const program = compileComProgram(`
      main:
          mov ax, 1
      main:
          mov bx, 2
    `);
    expect(program.diagnostics.some((d) => /Duplicate symbol: main/.test(d.message))).toBe(true);
  });
});

describe("compileComProgram — data encoding", () => {
  it("encodes DB string literals, numeric literals, and ? placeholders", () => {
    const program = compileComProgram(`
      main:
          hlt
      msg db 'AB', 0x43, ?
    `);
    const dataStart = program.symbols.get("msg")!;
    const bytes = program.bytes.slice(dataStart - program.origin, dataStart - program.origin + 4);
    expect(Array.from(bytes)).toEqual([0x41, 0x42, 0x43, 0x00]);
  });

  it("reports unresolved DB/DW initializers instead of throwing", () => {
    const program = compileComProgram(`
      main:
          hlt
      bad db undefined_symbol
    `);
    expect(program.diagnostics.some((d) => /Unresolved DB initializer/.test(d.message))).toBe(true);
  });

  it("records dataRanges with labels, excluded from executableOffsets", () => {
    const program = compileComProgram(`
      main:
          hlt
      var1 db 1, 2, 3
    `);
    expect(program.dataRanges).toHaveLength(1);
    expect(program.dataRanges[0].label).toBe("var1");
    const dataOffset = program.symbols.get("var1")!;
    expect(program.executableOffsets.has(dataOffset)).toBe(false);
  });
});

describe("compileComProgram — instruction encoding", () => {
  it("encodes MOV reg16,imm16 as B8+r imm16 (3 bytes)", () => {
    const program = compileComProgram(`mov cx, 0x00ff\nhlt`);
    expect(Array.from(program.bytes.slice(0, 3))).toEqual([0xb9, 0xff, 0x00]);
  });

  it("encodes MOV reg8,imm8 as B0+r imm8 (2 bytes)", () => {
    const program = compileComProgram(`mov al, 0x41\nhlt`);
    expect(Array.from(program.bytes.slice(0, 2))).toEqual([0xb0, 0x41]);
  });

  it("encodes PUSH/POP reg16 as single-byte 50+r / 58+r", () => {
    const program = compileComProgram(`push bx\npop cx\nhlt`);
    expect(Array.from(program.bytes.slice(0, 2))).toEqual([0x53, 0x59]);
  });

  it("encodes ADD/SUB/CMP reg16,reg16 as 2-byte reg-reg forms", () => {
    const program = compileComProgram(`add ax, bx\nsub cx, dx\ncmp ax, ax\nhlt`);
    expect(Array.from(program.bytes.slice(0, 2))).toEqual([0x01, 0xd8]); // ADD r/m16,r16: reg=bx(3), rm=ax(0)
    expect(Array.from(program.bytes.slice(2, 4))).toEqual([0x29, 0xd1]); // SUB: reg=dx(2), rm=cx(1)
    expect(Array.from(program.bytes.slice(4, 6))).toEqual([0x39, 0xc0]); // CMP: reg=ax(0), rm=ax(0)
  });

  it("encodes ADD reg16,imm16 via opcode 0x81 with the /0 extension", () => {
    const program = compileComProgram(`add ax, 5\nhlt`);
    expect(Array.from(program.bytes.slice(0, 4))).toEqual([0x81, 0xc0, 0x05, 0x00]);
  });

  it("computes JZ/JNZ short-branch displacement relative to the next instruction", () => {
    const program = compileComProgram(`
      start:
          jz start
          hlt
    `);
    // jz start: opcode 0x74, displacement = target(0x100) - (offset(0x100)+size(2)) = -2
    expect(Array.from(program.bytes.slice(0, 2))).toEqual([0x74, 0xfe]);
  });

  it("rejects out-of-range short branches instead of emitting a truncated displacement", () => {
    const filler = Array.from({ length: 130 }, () => "nop").join("\n");
    const program = compileComProgram(`
      start:
          ${filler}
          jz start
          hlt
    `);
    expect(program.diagnostics.some((d) => /Short branch target is out of range/.test(d.message))).toBe(true);
  });

  it("computes JMP/CALL near displacement (3-byte encoding)", () => {
    const program = compileComProgram(`
      start:
          jmp start
    `);
    expect(program.bytes[0]).toBe(0xe9);
    const displacement = program.bytes[1] | (program.bytes[2] << 8);
    expect((displacement << 16) >> 16).toBe(-3);
  });

  it("marks HLT and INT 20h as halt offsets, but not other interrupts", () => {
    const program = compileComProgram(`
      mov ax, 1
      int 21h
      hlt
    `);
    const haltInstrOffset = program.origin + 3 + 2; // mov(3) + int21h(2)
    expect(program.haltOffsets.has(haltInstrOffset)).toBe(true);
    expect(program.haltOffsets.has(program.origin + 3)).toBe(false);
  });

  it("reports unsupported instructions without throwing", () => {
    const program = compileComProgram(`mul bx\nhlt`);
    expect(program.diagnostics.some((d) => /Unsupported instruction: mul/.test(d.message))).toBe(true);
  });

  it("encodes direct-memory MOV forms using the COM_SEGMENT-relative offset", () => {
    const program = compileComProgram(`
      main:
          mov ax, [var1]
          hlt
      var1 dw 0x1234
    `);
    // mov ax,[var1] with dest=ax uses the special-cased 0xA1 imm16 form.
    expect(program.bytes[0]).toBe(0xa1);
    const address = program.bytes[1] | (program.bytes[2] << 8);
    expect(address).toBe(program.symbols.get("var1"));
    expect(address).toBeGreaterThanOrEqual(COM_SEGMENT ? program.origin : 0);
  });
});
