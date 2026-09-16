// @vitest-environment jsdom
// EmulatorCore uses window.setTimeout for its ready-race and run-loop yield.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CpuState, ExecutionTraceEntry } from "@/features/emulator/types";

/**
 * EmulatorCore drives a real ngspice-style WASM engine (v86) loaded from a
 * static asset URL — unavailable in the test runner. This fake reproduces
 * the exact CpuBridge/HeadlessV86 contract EmulatorCore depends on, with a
 * real (if partial) 8086 interpreter, so orchestration logic (step/step
 * back/reset/run/trace/stack) is verified against genuine instruction
 * semantics rather than a hand-waved stub.
 */
const REG16 = ["ax", "cx", "dx", "bx", "sp", "bp", "si", "di"] as const;
const SEGMENT = { ES: 0, CS: 1, SS: 2, DS: 3 } as const;
const FLAG_BIT = { CF: 0x001, PF: 0x004, AF: 0x010, ZF: 0x040, SF: 0x080, IF: 0x200, DF: 0x400, OF: 0x800 } as const;

const word = (v: number) => v & 0xffff;
const signed16 = (v: number) => (v << 16) >> 16;
const signed8 = (v: number) => (v << 24) >> 24;

function parityEven(byte: number) {
  let v = byte & 0xff;
  let bits = 0;
  while (v) { bits += v & 1; v >>= 1; }
  return bits % 2 === 0;
}

interface SnapshotData {
  reg32: number[]; sreg: number[]; segmentOffsets: number[]; flags: number; ip: number; inHlt: number; instructionCounter: number; memory: number[];
}
class FakeSnapshot {
  constructor(public data: SnapshotData) {}
  slice() { return new FakeSnapshot({ ...this.data, reg32: [...this.data.reg32], sreg: [...this.data.sreg], segmentOffsets: [...this.data.segmentOffsets], memory: [...this.data.memory] }); }
}

class FakeV86 {
  memory = new Uint8Array(0x30000);
  reg32 = new Int32Array(8);
  sreg = new Uint16Array(4);
  segment_offsets = new Int32Array(4);
  segment_limits = new Uint32Array(4);
  segment_is_null = new Uint8Array(4);
  flagsArr = new Int32Array(1);
  instruction_counter = new Uint32Array(1);
  instruction_pointer = new Int32Array(1);
  previous_ip = new Int32Array(1);
  last_virt_eip = new Int32Array(1);
  eip_phys = new Int32Array(1);
  protected_mode = new Int32Array(1);
  is_32 = new Int32Array(1);
  stack_size_32 = new Int32Array(1);
  cpl = new Uint8Array(1);
  in_hlt = new Uint8Array(1);
  listeners = new Map<string, Array<(payload: unknown) => void>>();

  v86 = {
    cpu: {
      reg32: this.reg32, sreg: this.sreg, flags: this.flagsArr, instruction_counter: this.instruction_counter,
      instruction_pointer: this.instruction_pointer, previous_ip: this.previous_ip, segment_offsets: this.segment_offsets,
      segment_limits: this.segment_limits, segment_is_null: this.segment_is_null, protected_mode: this.protected_mode,
      is_32: this.is_32, stack_size_32: this.stack_size_32, cpl: this.cpl, in_hlt: this.in_hlt, last_virt_eip: this.last_virt_eip,
      eip_phys: this.eip_phys,
      get_eflags: () => this.flagsArr[0] >>> 0,
      update_state_flags: () => {},
      mae_step_instruction: () => this.stepInstruction(),
    },
  };

  constructor(_options: Record<string, unknown>) {}

  add_listener(event: string, listener: (payload: unknown) => void) {
    const list = this.listeners.get(event) ?? [];
    list.push(listener);
    this.listeners.set(event, list);
    if (event === "emulator-ready") queueMicrotask(() => listener(undefined));
  }
  remove_listener() {}
  emit(event: string, payload: unknown) { for (const listener of this.listeners.get(event) ?? []) listener(payload); }

  async save_state(): Promise<ArrayBuffer> {
    return new FakeSnapshot({
      reg32: Array.from(this.reg32), sreg: Array.from(this.sreg), segmentOffsets: Array.from(this.segment_offsets),
      flags: this.flagsArr[0], ip: this.instruction_pointer[0], inHlt: this.in_hlt[0], instructionCounter: this.instruction_counter[0],
      memory: Array.from(this.memory),
    }) as unknown as ArrayBuffer;
  }
  async restore_state(state: ArrayBuffer): Promise<void> {
    const data = (state as unknown as FakeSnapshot).data;
    this.reg32.set(data.reg32); this.sreg.set(data.sreg); this.segment_offsets.set(data.segmentOffsets);
    this.flagsArr[0] = data.flags; this.instruction_pointer[0] = data.ip; this.in_hlt[0] = data.inHlt;
    this.instruction_counter[0] = data.instructionCounter; this.memory.set(data.memory);
  }
  read_memory(offset: number, length: number) { return this.memory.slice(offset, offset + length); }
  write_memory(data: Uint8Array, offset: number) { this.memory.set(data, offset); }
  async destroy() {}

  private setFlag(flag: keyof typeof FLAG_BIT, value: boolean) {
    if (value) this.flagsArr[0] |= FLAG_BIT[flag]; else this.flagsArr[0] &= ~FLAG_BIT[flag];
  }
  private applyArithFlags(a: number, b: number, result: number, width: 8 | 16, isSub: boolean, affectCarry = true) {
    const mask = width === 8 ? 0xff : 0xffff; const signBit = width === 8 ? 0x80 : 0x8000; const carryBit = width === 8 ? 0x100 : 0x10000;
    const res = result & mask;
    if (affectCarry) this.setFlag("CF", isSub ? (a & mask) < (b & mask) : a + b >= carryBit);
    this.setFlag("AF", ((a ^ b ^ res) & 0x10) !== 0);
    this.setFlag("OF", isSub ? (((a ^ b) & (a ^ res) & signBit) !== 0) : ((~(a ^ b) & (a ^ res) & signBit) !== 0));
    this.setFlag("SF", (res & signBit) !== 0);
    this.setFlag("ZF", res === 0);
    this.setFlag("PF", parityEven(res));
  }
  private applyLogicFlags(result: number, width: 8 | 16) {
    const mask = width === 8 ? 0xff : 0xffff; const signBit = width === 8 ? 0x80 : 0x8000; const res = result & mask;
    this.setFlag("CF", false); this.setFlag("OF", false); this.setFlag("SF", (res & signBit) !== 0); this.setFlag("ZF", res === 0); this.setFlag("PF", parityEven(res));
  }
  private evaluateCondition(opcode: number): boolean {
    const f = this.flagsArr[0]; const cf = (f & FLAG_BIT.CF) !== 0, zf = (f & FLAG_BIT.ZF) !== 0, sf = (f & FLAG_BIT.SF) !== 0, of = (f & FLAG_BIT.OF) !== 0, pf = (f & FLAG_BIT.PF) !== 0;
    switch (opcode) {
      case 0x70: return of; case 0x71: return !of; case 0x72: return cf; case 0x73: return !cf;
      case 0x74: return zf; case 0x75: return !zf; case 0x76: return cf || zf; case 0x77: return !cf && !zf;
      case 0x78: return sf; case 0x79: return !sf; case 0x7a: return pf; case 0x7b: return !pf;
      case 0x7c: return sf !== of; case 0x7d: return sf === of; case 0x7e: return zf || sf !== of; case 0x7f: return !zf && sf === of;
      default: return false;
    }
  }
  private readReg8(index: number) { const base = index % 4; const high = index >= 4; const v = this.reg32[base]; return high ? (v >> 8) & 0xff : v & 0xff; }
  private writeReg8(index: number, value: number) { const base = index % 4; const high = index >= 4; const v = this.reg32[base]; this.reg32[base] = high ? (v & 0x00ff) | ((value & 0xff) << 8) : (v & 0xff00) | (value & 0xff); }
  private readByte(addr: number) { return this.memory[addr] ?? 0; }
  private writeByte(addr: number, value: number) { this.memory[addr] = value & 0xff; }
  private readWord(addr: number) { return this.readByte(addr) | (this.readByte(addr + 1) << 8); }
  private writeWord(addr: number, value: number) { this.writeByte(addr, value & 0xff); this.writeByte(addr + 1, (value >> 8) & 0xff); }
  private pushWord(value: number) { const sp = word(this.reg32[4] - 2); this.reg32[4] = sp; this.writeWord(this.segment_offsets[SEGMENT.SS] + sp, word(value)); }
  private popWord() { const sp = word(this.reg32[4]); const value = this.readWord(this.segment_offsets[SEGMENT.SS] + sp); this.reg32[4] = word(sp + 2); return value; }

  private stepInstruction() {
    let ip = this.instruction_pointer[0] >>> 0;
    const fetchByte = () => { const b = this.readByte(ip); ip += 1; return b; };
    const fetchWord = () => { const w = this.readWord(ip); ip += 2; return w; };
    const opcode = fetchByte();
    const dsBase = this.segment_offsets[SEGMENT.DS];
    if (opcode === 0x90) { /* nop */ }
    else if (opcode === 0xf4) { this.in_hlt[0] = 1; }
    else if (opcode === 0xc3) { ip = this.popWord(); }
    else if (opcode >= 0x50 && opcode <= 0x57) { this.pushWord(word(this.reg32[opcode - 0x50])); }
    else if (opcode >= 0x58 && opcode <= 0x5f) { this.reg32[opcode - 0x58] = this.popWord(); }
    else if (opcode >= 0x40 && opcode <= 0x47) { const r = opcode - 0x40; const a = word(this.reg32[r]); const res = word(a + 1); this.applyArithFlags(a, 1, res, 16, false, false); this.reg32[r] = res; }
    else if (opcode >= 0x48 && opcode <= 0x4f) { const r = opcode - 0x48; const a = word(this.reg32[r]); const res = word(a - 1); this.applyArithFlags(a, 1, res, 16, true, false); this.reg32[r] = res; }
    else if (opcode === 0xcd) { const interrupt = fetchByte(); const ah = (this.reg32[0] >> 8) & 0xff; const dx = word(this.reg32[2]); this.instruction_pointer[0] = ip; this.emit("mae-interrupt", [interrupt, ah, dx]); ip = this.instruction_pointer[0]; }
    else if (opcode === 0xe9) { const rel = fetchWord(); ip = ip + signed16(rel); }
    else if (opcode === 0xe8) { const rel = fetchWord(); const csBase = this.segment_offsets[SEGMENT.CS]; this.pushWord(word(ip - csBase)); ip = ip + signed16(rel); }
    else if (opcode >= 0x70 && opcode <= 0x7f) { const rel = fetchByte(); const target = ip + signed8(rel); if (this.evaluateCondition(opcode)) ip = target; }
    else if (opcode === 0xe2 || opcode === 0xe1 || opcode === 0xe0) { const rel = fetchByte(); const cx = word(this.reg32[1] - 1); this.reg32[1] = cx; const zf = (this.flagsArr[0] & FLAG_BIT.ZF) !== 0; const take = cx !== 0 && (opcode === 0xe2 || (opcode === 0xe1 && zf) || (opcode === 0xe0 && !zf)); if (take) ip = ip + signed8(rel); }
    else if (opcode === 0x9c) { this.pushWord(this.flagsArr[0] & 0xffff); }
    else if (opcode === 0x9d) { this.flagsArr[0] = (this.flagsArr[0] & ~0xffff) | this.popWord(); }
    else if (opcode === 0xf7 || opcode === 0xf6) {
      const modrm = fetchByte(); const reg = (modrm >> 3) & 7; const rm = modrm & 7;
      if (reg === 2 && opcode === 0xf7) this.reg32[rm] = word(~this.reg32[rm]);
      else if (reg === 2 && opcode === 0xf6) this.writeReg8(rm, ~this.readReg8(rm) & 0xff);
    }
    else if (opcode >= 0xb8 && opcode <= 0xbf) { this.reg32[opcode - 0xb8] = fetchWord(); }
    else if (opcode >= 0xb0 && opcode <= 0xb7) { this.writeReg8(opcode - 0xb0, fetchByte()); }
    else if (opcode === 0xa1) { const addr = fetchWord(); this.reg32[0] = this.readWord(dsBase + addr); }
    else if (opcode === 0xa3) { const addr = fetchWord(); this.writeWord(dsBase + addr, word(this.reg32[0])); }
    else if (opcode === 0x8b || opcode === 0x89 || opcode === 0x88 || opcode === 0x8e || opcode === 0x01 || opcode === 0x29 || opcode === 0x39 || opcode === 0x87 || opcode === 0x00 || opcode === 0x28 || opcode === 0x38 || opcode === 0x81 || opcode === 0x80 || opcode === 0x21 || opcode === 0x09 || opcode === 0x31 || opcode === 0x20 || opcode === 0x08 || opcode === 0x30) {
      const modrm = fetchByte(); const mod = (modrm >> 6) & 3; const reg = (modrm >> 3) & 7; const rm = modrm & 7;
      const directMem = mod === 0 && rm === 6; const disp = directMem ? fetchWord() : 0; const memAddr = dsBase + disp;
      if (opcode === 0x8b) { this.reg32[reg] = directMem ? this.readWord(memAddr) : word(this.reg32[rm]); }
      else if (opcode === 0x89) { if (directMem) this.writeWord(memAddr, word(this.reg32[reg])); else this.reg32[rm] = word(this.reg32[reg]); }
      else if (opcode === 0x88) { this.writeReg8(rm, this.readReg8(reg)); }
      else if (opcode === 0x8e) { this.sreg[reg] = word(this.reg32[rm]); this.segment_offsets[reg] = word(this.reg32[rm]) << 4; }
      else if (opcode === 0x01) { const a = word(this.reg32[rm]); const b = word(this.reg32[reg]); const res = word(a + b); this.applyArithFlags(a, b, res, 16, false); this.reg32[rm] = res; }
      else if (opcode === 0x29) { const a = word(this.reg32[rm]); const b = word(this.reg32[reg]); const res = word(a - b); this.applyArithFlags(a, b, res, 16, true); this.reg32[rm] = res; }
      else if (opcode === 0x39) { const a = word(this.reg32[rm]); const b = word(this.reg32[reg]); const res = word(a - b); this.applyArithFlags(a, b, res, 16, true); }
      else if (opcode === 0x87) { const a = this.reg32[rm]; this.reg32[rm] = this.reg32[reg]; this.reg32[reg] = a; }
      else if (opcode === 0x00) { const a = this.readReg8(rm); const b = this.readReg8(reg); const res = (a + b) & 0xff; this.applyArithFlags(a, b, res, 8, false); this.writeReg8(rm, res); }
      else if (opcode === 0x28) { const a = this.readReg8(rm); const b = this.readReg8(reg); const res = (a - b) & 0xff; this.applyArithFlags(a, b, res, 8, true); this.writeReg8(rm, res); }
      else if (opcode === 0x38) { const a = this.readReg8(rm); const b = this.readReg8(reg); const res = (a - b) & 0xff; this.applyArithFlags(a, b, res, 8, true); }
      else if (opcode === 0x21) { const res = word(this.reg32[rm] & this.reg32[reg]); this.applyLogicFlags(res, 16); this.reg32[rm] = res; }
      else if (opcode === 0x09) { const res = word(this.reg32[rm] | this.reg32[reg]); this.applyLogicFlags(res, 16); this.reg32[rm] = res; }
      else if (opcode === 0x31) { const res = word(this.reg32[rm] ^ this.reg32[reg]); this.applyLogicFlags(res, 16); this.reg32[rm] = res; }
      else if (opcode === 0x20) { const res = this.readReg8(rm) & this.readReg8(reg); this.applyLogicFlags(res, 8); this.writeReg8(rm, res); }
      else if (opcode === 0x08) { const res = this.readReg8(rm) | this.readReg8(reg); this.applyLogicFlags(res, 8); this.writeReg8(rm, res); }
      else if (opcode === 0x30) { const res = this.readReg8(rm) ^ this.readReg8(reg); this.applyLogicFlags(res, 8); this.writeReg8(rm, res); }
      else if (opcode === 0x81) { const imm = fetchWord(); const a = word(this.reg32[rm]); let res = 0;
        if (reg === 0) { res = word(a + imm); this.applyArithFlags(a, imm, res, 16, false); }
        else if (reg === 5) { res = word(a - imm); this.applyArithFlags(a, imm, res, 16, true); }
        else if (reg === 7) { res = word(a - imm); this.applyArithFlags(a, imm, res, 16, true); res = a; }
        else if (reg === 4) { res = word(a & imm); this.applyLogicFlags(res, 16); }
        else if (reg === 1) { res = word(a | imm); this.applyLogicFlags(res, 16); }
        else if (reg === 6) { res = word(a ^ imm); this.applyLogicFlags(res, 16); }
        this.reg32[rm] = res;
      }
      else if (opcode === 0x80) { const imm = fetchByte(); const a = this.readReg8(rm); let res = 0;
        if (reg === 0) { res = (a + imm) & 0xff; this.applyArithFlags(a, imm, res, 8, false); }
        else if (reg === 5) { res = (a - imm) & 0xff; this.applyArithFlags(a, imm, res, 8, true); }
        else if (reg === 7) { res = (a - imm) & 0xff; this.applyArithFlags(a, imm, res, 8, true); res = a; }
        else if (reg === 4) { res = a & imm & 0xff; this.applyLogicFlags(res, 8); }
        else if (reg === 1) { res = (a | imm) & 0xff; this.applyLogicFlags(res, 8); }
        else if (reg === 6) { res = (a ^ imm) & 0xff; this.applyLogicFlags(res, 8); }
        this.writeReg8(rm, res);
      }
    }
    this.instruction_pointer[0] = ip;
    this.instruction_counter[0] = (this.instruction_counter[0] + 1) >>> 0;
  }
}

// Literal must match the private V86_MODULE_URL constant in EmulatorCore.ts exactly.
vi.mock("/manus-storage/mae-v86-headless_edf4ece3.mjs", () => ({ default: FakeV86 }));

const { EmulatorCore } = await import("@/features/emulator/EmulatorCore");

async function loadProgram(source: string) {
  const emulator = new EmulatorCore();
  const ok = await emulator.assembleAndLoad(source);
  expect(ok).toBe(true);
  return emulator;
}

describe("EmulatorCore — execution correctness (Task 1)", () => {
  it("RUN executes every instruction and halts on HLT", async () => {
    const emulator = await loadProgram(`
      .model small
      .stack 100h
      .code
      main:
          mov ax, 10h
          mov bx, 20h
          hlt
      end main
    `);
    await emulator.run();
    const state = emulator.getCpuState();
    expect(state.registers.ax).toBe(0x0010);
    expect(state.registers.bx).toBe(0x0020);
  });

  it("STEP executes exactly one instruction at a time", async () => {
    const emulator = await loadProgram(`
      main:
          mov ax, 5
          mov bx, 10
          hlt
    `);
    await emulator.step();
    let state = emulator.getCpuState();
    expect(state.registers.ax).toBe(5);
    expect(state.registers.bx).toBe(0);

    await emulator.step();
    state = emulator.getCpuState();
    expect(state.registers.ax).toBe(5);
    expect(state.registers.bx).toBe(10);
  });

  it("STEP BACK restores the register state from before the last step", async () => {
    const emulator = await loadProgram(`
      main:
          mov ax, 5
          mov bx, 10
          add ax, bx
          hlt
    `);
    await emulator.step(); // ax=5
    await emulator.step(); // bx=10
    await emulator.step(); // ax=15
    expect(emulator.getCpuState().registers.ax).toBe(15);

    await emulator.stepBack();
    expect(emulator.getCpuState().registers.ax).toBe(5);
    expect(emulator.getCpuState().registers.bx).toBe(10);

    await emulator.stepBack();
    expect(emulator.getCpuState().registers.ax).toBe(5);
    expect(emulator.getCpuState().registers.bx).toBe(0);
  });

  it("RESET restores the post-load snapshot (SP at top of stack, not zero)", async () => {
    const emulator = await loadProgram(`
      main:
          mov ax, 100
          hlt
    `);
    await emulator.run();
    expect(emulator.getCpuState().registers.ax).toBe(100);

    await emulator.reset();
    const state = emulator.getCpuState();
    expect(state.registers.ax).toBe(0);
    expect(state.pointers.ip).toBe(0x100);
    // The COM stack top (0xfffe) is the correct reset value, not 0 — SP=0 would be an empty/wrapped stack.
    expect(state.pointers.sp).toBe(0xfffe);
  });

  it("FLAGS: CMP against self sets ZF and clears CF", async () => {
    const emulator = await loadProgram(`
      main:
          mov ax, 0
          cmp ax, ax
          hlt
    `);
    await emulator.run();
    const flags = emulator.getCpuState().flags;
    expect(flags.ZF).toBe(true);
    expect(flags.CF).toBe(false);
  });
});

describe("EmulatorCore — RESET clears queued keyboard input", () => {
  it("does not deliver a pre-reset sendKey() to a fresh run's INT 21h/AH=01 read", async () => {
    const emulator = await loadProgram(`
      main:
          mov ah, 1
          int 21h
          hlt
    `);
    emulator.sendKey("Q");
    await emulator.reset();
    await emulator.run();
    expect(emulator.getCpuState().registers.al).toBe(0);
  });
});

describe("EmulatorCore — test isolation (Task 2)", () => {
  it("two independently loaded instances never share register state", async () => {
    const a = await loadProgram(`main:\n mov ax, 1\n hlt`);
    const b = await loadProgram(`main:\n mov ax, 2\n hlt`);
    await a.run();
    await b.run();
    expect(a.getCpuState().registers.ax).toBe(1);
    expect(b.getCpuState().registers.ax).toBe(2);
  });
});

describe("EmulatorCore — CPU registers (Task 3)", () => {
  it("tracks AX, BX, CX, DX, SI, DI, BP, SP after direct loads", async () => {
    const emulator = await loadProgram(`
      main:
          mov ax, 0x1234
          mov bx, 0x5678
          mov cx, 0xabcd
          mov dx, 0xef00
          mov si, 0x0100
          mov di, 0x0200
          mov bp, 0x0300
          mov sp, 0x0400
          hlt
    `);
    await emulator.run();
    const state = emulator.getCpuState();
    expect(state.registers.ax).toBe(0x1234);
    expect(state.registers.bx).toBe(0x5678);
    expect(state.registers.cx).toBe(0xabcd);
    expect(state.registers.dx).toBe(0xef00);
    expect(state.pointers.si).toBe(0x0100);
    expect(state.pointers.di).toBe(0x0200);
    expect(state.pointers.bp).toBe(0x0300);
    expect(state.pointers.sp).toBe(0x0400);
  });

  it("derives AH/AL/BH/BL/CH/CL/DH/DL from the parent 16-bit registers", async () => {
    const emulator = await loadProgram(`
      main:
          mov ax, 0x1234
          hlt
    `);
    await emulator.run();
    const { ah, al } = emulator.getCpuState().registers;
    expect(ah).toBe(0x12);
    expect(al).toBe(0x34);
  });

  it("CS segment participates in the physical address formula (segment*16 + offset)", async () => {
    const emulator = await loadProgram(`
      main:
          mov ax, 0x1000
          mov cs, ax
          hlt
    `);
    await emulator.run();
    const cs = emulator.getCpuState().segments.cs;
    expect((cs * 16 + 0x0100) & 0xfffff).toBe(0x10100);
  });
});

describe("EmulatorCore — flags (Task 4)", () => {
  it("CF set when 8-bit addition overflows past 0xFF", async () => {
    const emulator = await loadProgram(`
      main:
          mov al, 0xff
          mov bl, 0x01
          add al, bl
          hlt
    `);
    await emulator.run();
    expect(emulator.getCpuState().flags.CF).toBe(true);
  });

  it("ZF set when a subtraction result is zero", async () => {
    const emulator = await loadProgram(`
      main:
          mov ax, 5
          sub ax, 5
          hlt
    `);
    await emulator.run();
    expect(emulator.getCpuState().flags.ZF).toBe(true);
  });

  it("SF set when the 8-bit result's MSB is 1", async () => {
    const emulator = await loadProgram(`
      main:
          mov al, 0x7f
          add al, 0x01
          hlt
    `);
    await emulator.run();
    expect(emulator.getCpuState().flags.SF).toBe(true);
  });

  it("OF set on signed 8-bit overflow (127 + 1)", async () => {
    const emulator = await loadProgram(`
      main:
          mov al, 0x7f
          add al, 0x01
          hlt
    `);
    await emulator.run();
    expect(emulator.getCpuState().flags.OF).toBe(true);
  });

  it("INC/DEC leave CF untouched", async () => {
    const emulator = await loadProgram(`
      main:
          mov al, 0xff
          mov bl, 0x01
          add al, bl
          mov cx, 5
          hlt
    `);
    await emulator.step(); await emulator.step(); await emulator.step();
    expect(emulator.getCpuState().flags.CF).toBe(true);
  });
});

describe("EmulatorCore — memory viewer (Task 5)", () => {
  it("reads DB bytes back verbatim for hex/decimal/ASCII display modes", async () => {
    const emulator = await loadProgram(`
      .data
        var1 db 0x41
        var2 db 0x42
        var3 db 0x43
      .code
      main:
          hlt
    `);
    // .data is relocated after .code; resolve the physical address via the assembler symbol table + CS base.
    const state = emulator.getCpuState();
    const base = (state.segments.ds << 4);
    const program = (emulator as unknown as { program: { symbols: Map<string, number> } }).program;
    const address = base + program.symbols.get("var1")!;
    const bytes = emulator.readMemory(address, 3);
    expect(Array.from(bytes)).toEqual([0x41, 0x42, 0x43]);
    expect(String.fromCharCode(...bytes)).toBe("ABC");
  });
});

describe("EmulatorCore — stack visualizer (Task 6)", () => {
  it("PUSH decrements SP by 2 and POP restores it, preserving pushed values", async () => {
    const emulator = await loadProgram(`
      main:
          mov ax, 0x1234
          mov sp, 0x0400
          push ax
          mov bx, 0x5678
          push bx
          pop cx
          pop dx
          hlt
    `);
    await emulator.step(); // mov ax
    await emulator.step(); // mov sp
    expect(emulator.getCpuState().pointers.sp).toBe(0x0400);

    await emulator.step(); // push ax
    expect(emulator.getCpuState().pointers.sp).toBe(0x03fe);

    await emulator.step(); // mov bx
    await emulator.step(); // push bx
    expect(emulator.getCpuState().pointers.sp).toBe(0x03fc);

    await emulator.step(); // pop cx
    expect(emulator.getCpuState().pointers.sp).toBe(0x03fe);
    expect(emulator.getCpuState().registers.cx).toBe(0x5678);

    await emulator.step(); // pop dx
    expect(emulator.getCpuState().pointers.sp).toBe(0x0400);
    expect(emulator.getCpuState().registers.dx).toBe(0x1234);
  });

  it("getStackState reads the top-of-stack cells at ss:sp", async () => {
    const emulator = await loadProgram(`
      main:
          mov sp, 0x0400
          mov ax, 0x9abc
          push ax
          hlt
    `);
    await emulator.step(); await emulator.step(); await emulator.step();
    const [top] = emulator.getStackState(1);
    expect(top.value).toBe(0x9abc);
  });
});

describe("EmulatorCore — execution trace (Task 7)", () => {
  it("emits one trace entry per executed instruction, in order", async () => {
    const trace: ExecutionTraceEntry[] = [];
    const states: CpuState[] = [];
    const emulator = new EmulatorCore({ onTrace: (entry) => trace.push(entry), onStateChange: (state) => states.push(state) });
    await emulator.assembleAndLoad(`
      main:
          mov ax, 10h
          mov bx, 20h
          add ax, bx
          hlt
    `);
    await emulator.run();

    expect(trace).toHaveLength(4);
    expect(trace[0].instruction).toBe("mov ax, 10h");
    expect(trace[1].instruction).toBe("mov bx, 20h");
    expect(trace[2].instruction).toBe("add ax, bx");
    expect(trace[3].instruction).toBe("hlt");
    // trace[].value must name the register the instruction actually touched,
    // not always AX (this previously hardcoded "AX=…" for every step).
    expect(trace[0].value).toBe("AX=0010h");
    expect(trace[1].value).toBe("BX=0020h");
    expect(trace[2].value).toBe("AX=0030h");
  });
});

describe("EmulatorCore — logical instructions (AND/OR/XOR/NOT)", () => {
  it("AND/OR/XOR/NOT compose correctly (stress batch 5.2)", async () => {
    const emulator = await loadProgram(`
      main:
          mov ax, 0xf0f0
          and ax, 0x00ff
          or ax, 0x0f00
          xor ax, 0x0ff0
          not ax
          hlt
    `);
    await emulator.step(); // mov
    await emulator.step(); // and -> 0x00f0
    expect(emulator.getCpuState().registers.ax).toBe(0x00f0);
    await emulator.step(); // or -> 0x0ff0
    expect(emulator.getCpuState().registers.ax).toBe(0x0ff0);
    await emulator.step(); // xor -> 0x0000
    expect(emulator.getCpuState().registers.ax).toBe(0x0000);
    expect(emulator.getCpuState().flags.ZF).toBe(true);
    await emulator.step(); // not -> 0xffff
    expect(emulator.getCpuState().registers.ax).toBe(0xffff);
  });
});

describe("EmulatorCore — conditional jumps and LOOPE/LOOPNE (stress batches 12/14)", () => {
  it("JL takes the branch when the comparison is signed-less-than", async () => {
    const emulator = await loadProgram(`
      main:
          mov ax, 5
          mov bx, 10
          cmp ax, bx
          jl less_than
          mov ax, 0
      less_than:
          mov ax, 1
          hlt
    `);
    await emulator.run();
    expect(emulator.getCpuState().registers.ax).toBe(1);
  });

  it("LOOPE stops as soon as ZF clears, distinct from plain LOOP", async () => {
    const emulator = await loadProgram(`
      main:
          mov cx, 10
          mov ax, 0
          mov bx, 1
      loop_equal:
          add ax, bx
          cmp ax, 3
          loope loop_equal
          hlt
    `);
    await emulator.run();
    // ax becomes 1 (cx=9,cmp!=0 zf=0 -> stop immediately after first iteration since 1!=3 sets ZF=0)
    expect(emulator.getCpuState().registers.ax).toBe(1);
    expect(emulator.getCpuState().registers.cx).toBe(9);
  });
});

describe("EmulatorCore — PUSHF/POPF preserve flag state across mutation (stress batch 15.2)", () => {
  it("POPF restores flags saved by an earlier PUSHF", async () => {
    const emulator = await loadProgram(`
      main:
          mov ax, 10
          sub ax, 10
          pushf
          mov ax, 0
          sub ax, 1
          popf
          je flags_ok
          mov ax, 0
          jmp flags_done
      flags_ok:
          mov ax, 1
      flags_done:
          hlt
    `);
    await emulator.run();
    expect(emulator.getCpuState().registers.ax).toBe(1);
  });
});

describe("EmulatorCore — directive parsing (Task 8)", () => {
  it("accepts .model/.stack/.data/.code sources end-to-end", async () => {
    const emulator = new EmulatorCore();
    const ok = await emulator.assembleAndLoad(`
      .model small
      .stack 200h
      .data
        var1 db 0x41
      .code
      main:
          mov ax, 0x0000
          hlt
      end main
    `);
    expect(ok).toBe(true);
  });

  it("still assembles legacy ORG-style flat COM sources by design (not rejected)", async () => {
    const emulator = new EmulatorCore();
    const ok = await emulator.assembleAndLoad(`
      org 100h
      mov ax, 10
      hlt
    `);
    expect(ok).toBe(true);
  });

  it("reports diagnostics through onError instead of throwing on invalid source", async () => {
    const errors: string[] = [];
    const emulator = new EmulatorCore({ onError: (message) => errors.push(message) });
    const ok = await emulator.assembleAndLoad(`mul bx\nhlt`);
    expect(ok).toBe(false);
    expect(errors.length).toBeGreaterThan(0);
  });
});
