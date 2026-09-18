/**
 * Pure-TypeScript 8086 instruction interpreter for the MAE educational COM subset that
 * assembler.ts compiles to. No WASM, no network assets — this decodes exactly the byte
 * encodings compileComProgram() can emit (see assembler.ts's encodeInstruction()), so every
 * program the assembler accepts, this can execute, entirely in-process and synchronously.
 */
import type { AssembledProgram } from "./types";

const REG16 = ["ax", "cx", "dx", "bx", "sp", "bp", "si", "di"] as const;
type Reg16Name = (typeof REG16)[number];
/** es/cs/ss/ds, in the encoding order assembler.ts's SEGMENT map uses. */
const SEGMENT_NAMES = ["es", "cs", "ss", "ds"] as const;
type SegmentName = (typeof SEGMENT_NAMES)[number];

const STACK_TOP = 0xfffe;
const MEMORY_SIZE = 0x10000;
/** Display-only: this flat model never applies segment:offset translation to memory access. */
const COM_SEGMENT = 0x1000;
const MAX_ASCIIZ_SCAN = 4096;

const word = (value: number) => value & 0xffff;
const signed16 = (value: number) => (value << 16) >> 16;
const signed8 = (value: number) => (value << 24) >> 24;

function parityEven(byte: number): boolean {
  let value = byte & 0xff;
  let bits = 0;
  while (value) {
    bits += value & 1;
    value >>= 1;
  }
  return bits % 2 === 0;
}

export interface Cpu8086Flags {
  zf: boolean;
  cf: boolean;
  sf: boolean;
  of: boolean;
  pf: boolean;
  df: boolean;
}

export interface Cpu8086Events {
  /** DOS/BIOS teletype output (INT 21h AH=02h/09h, INT 10h AH=0Eh). */
  onOutput?: (text: string) => void;
}

export interface StepResult {
  line: number | null;
  instruction: string;
}

type ArithOp = "add" | "sub" | "cmp" | "and" | "or" | "xor";

/** Reverse of assembler.ts's `extension` map for the 0x80/0x81 immediate-group opcodes. */
const ARITH_EXTENSION: Record<number, ArithOp> = {
  0: "add",
  1: "or",
  4: "and",
  5: "sub",
  6: "xor",
  7: "cmp",
};

export class Cpu8086 {
  reg: Record<Reg16Name, number> = {
    ax: 0,
    cx: 0,
    dx: 0,
    bx: 0,
    sp: STACK_TOP,
    bp: 0,
    si: 0,
    di: 0,
  };
  seg: Record<SegmentName, number> = {
    es: COM_SEGMENT,
    cs: COM_SEGMENT,
    ss: COM_SEGMENT,
    ds: COM_SEGMENT,
  };
  flags: Cpu8086Flags = {
    zf: false,
    cf: false,
    sf: false,
    of: false,
    pf: false,
    df: false,
  };
  memory = new Uint8Array(MEMORY_SIZE);
  ip: number;
  halted = false;
  error: string | null = null;
  /** Procedure names entered via CALL, popped on RET; resolved from the assembler's symbol table. */
  callStack: string[] = ["_start"];

  private readonly stdin: number[] = [];

  constructor(
    private readonly program: AssembledProgram,
    private readonly events: Cpu8086Events = {}
  ) {
    this.memory.set(program.bytes, program.origin);
    this.ip = program.origin;
  }

  queueInput(text: string): void {
    for (const character of text)
      this.stdin.push(character.charCodeAt(0) & 0xff);
  }

  readMemory(address: number, length: number): Uint8Array {
    const start = Math.max(0, address) & 0xffff;
    return this.memory.slice(start, start + Math.max(0, length));
  }

  currentLine(): number | null {
    return this.program.sourceByOffset.get(this.ip) ?? null;
  }

  /** Executes exactly one instruction. Returns null once halted or if IP leaves the mapped program. */
  step(): StepResult | null {
    if (this.halted) return null;
    if (!this.program.executableOffsets.has(this.ip)) {
      this.halted = true;
      this.error = "Execution entered an unmapped data region";
      return null;
    }
    const line = this.currentLine();
    const instruction = line
      ? (this.program.source[line - 1] ?? "").trim()
      : "";
    const startIp = this.ip;
    this.execute();
    if (this.program.haltOffsets.has(startIp)) this.halted = true;
    return { line, instruction };
  }

  private fetchByte(): number {
    const value = this.memory[this.ip] ?? 0;
    this.ip = word(this.ip + 1);
    return value;
  }
  private fetchWord(): number {
    const low = this.fetchByte();
    const high = this.fetchByte();
    return low | (high << 8);
  }
  private readByte(address: number): number {
    return this.memory[address & 0xffff] ?? 0;
  }
  private writeByte(address: number, value: number): void {
    this.memory[address & 0xffff] = value & 0xff;
  }
  private readWord(address: number): number {
    return this.readByte(address) | (this.readByte(address + 1) << 8);
  }
  private writeWord(address: number, value: number): void {
    this.writeByte(address, value & 0xff);
    this.writeByte(address + 1, (value >>> 8) & 0xff);
  }
  private pushWord(value: number): void {
    this.reg.sp = word(this.reg.sp - 2);
    this.writeWord(this.reg.sp, word(value));
  }
  private popWord(): number {
    const value = this.readWord(this.reg.sp);
    this.reg.sp = word(this.reg.sp + 2);
    return value;
  }

  private getReg16(index: number): number {
    return this.reg[REG16[index]];
  }
  private setReg16(index: number, value: number): void {
    this.reg[REG16[index]] = word(value);
  }
  /** REG8 order [al,cl,dl,bl,ah,ch,dh,bh]: index%4 selects ax/cx/dx/bx, index>=4 selects the high half. */
  private getReg8(index: number): number {
    const value = this.reg[REG16[index % 4]];
    return index >= 4 ? (value >> 8) & 0xff : value & 0xff;
  }
  private setReg8(index: number, value: number): void {
    const name = REG16[index % 4];
    const current = this.reg[name];
    this.reg[name] =
      index >= 4
        ? (current & 0x00ff) | ((value & 0xff) << 8)
        : (current & 0xff00) | (value & 0xff);
  }
  private readModRM(): { mod: number; reg: number; rm: number } {
    const byte = this.fetchByte();
    return { mod: (byte >> 6) & 3, reg: (byte >> 3) & 7, rm: byte & 7 };
  }

  private computeEA(mod: number, rm: number): number {
    if (mod === 0 && rm === 6) {
      return this.fetchWord();
    }
    let base = 0;
    switch (rm) {
      case 0: base = this.reg.bx + this.reg.si; break;
      case 1: base = this.reg.bx + this.reg.di; break;
      case 2: base = this.reg.bp + this.reg.si; break;
      case 3: base = this.reg.bp + this.reg.di; break;
      case 4: base = this.reg.si; break;
      case 5: base = this.reg.di; break;
      case 6: base = this.reg.bp; break;
      case 7: base = this.reg.bx; break;
    }
    let disp = 0;
    if (mod === 1) disp = signed8(this.fetchByte());
    else if (mod === 2) disp = signed16(this.fetchWord());
    return word(base + disp);
  }

  private setFlag(flag: keyof Cpu8086Flags, value: boolean): void {
    this.flags[flag] = value;
  }

  private applyArithFlags(
    a: number,
    b: number,
    result: number,
    width: 8 | 16,
    isSub: boolean,
    affectCarry = true
  ): void {
    const mask = width === 8 ? 0xff : 0xffff;
    const signBit = width === 8 ? 0x80 : 0x8000;
    const carryBit = width === 8 ? 0x100 : 0x10000;
    const res = result & mask;
    if (affectCarry)
      this.setFlag("cf", isSub ? (a & mask) < (b & mask) : a + b >= carryBit);
    this.setFlag(
      "of",
      isSub
        ? ((a ^ b) & (a ^ res) & signBit) !== 0
        : (~(a ^ b) & (a ^ res) & signBit) !== 0
    );
    this.setFlag("sf", (res & signBit) !== 0);
    this.setFlag("zf", res === 0);
    this.setFlag("pf", parityEven(res));
  }

  private applyLogicFlags(result: number, width: 8 | 16): void {
    const mask = width === 8 ? 0xff : 0xffff;
    const signBit = width === 8 ? 0x80 : 0x8000;
    const res = result & mask;
    this.setFlag("cf", false);
    this.setFlag("of", false);
    this.setFlag("sf", (res & signBit) !== 0);
    this.setFlag("zf", res === 0);
    this.setFlag("pf", parityEven(res));
  }

  private computeArith(
    op: ArithOp,
    a: number,
    b: number,
    width: 8 | 16
  ): number {
    const mask = width === 8 ? 0xff : 0xffff;
    switch (op) {
      case "add": {
        const res = (a + b) & mask;
        this.applyArithFlags(a, b, res, width, false);
        return res;
      }
      case "sub":
      case "cmp": {
        const res = (a - b) & mask;
        this.applyArithFlags(a, b, res, width, true);
        return res;
      }
      case "and": {
        const res = a & b & mask;
        this.applyLogicFlags(res, width);
        return res;
      }
      case "or": {
        const res = (a | b) & mask;
        this.applyLogicFlags(res, width);
        return res;
      }
      case "xor": {
        const res = (a ^ b) & mask;
        this.applyLogicFlags(res, width);
        return res;
      }
    }
  }

  private executeShiftRotate(
    op: number,
    val: number,
    count: number,
    width: 8 | 16
  ): number {
    if (count === 0) return val;
    const mask = width === 8 ? 0xff : 0xffff;
    const signBit = width === 8 ? 0x80 : 0x8000;
    let res = val & mask;
    let lastCF = this.flags.cf;

    for (let i = 0; i < count; i++) {
      const msb = (res & signBit) !== 0;
      const lsb = (res & 1) !== 0;
      switch (op) {
        case 0: { // ROL
          lastCF = msb;
          res = ((res << 1) | (msb ? 1 : 0)) & mask;
          break;
        }
        case 1: { // ROR
          lastCF = lsb;
          res = (res >>> 1) | (lsb ? signBit : 0);
          break;
        }
        case 2: { // RCL
          const oldCarry = lastCF ? 1 : 0;
          lastCF = msb;
          res = ((res << 1) | oldCarry) & mask;
          break;
        }
        case 3: { // RCR
          const oldCarry = lastCF ? signBit : 0;
          lastCF = lsb;
          res = (res >>> 1) | oldCarry;
          break;
        }
        case 4: { // SHL / SAL
          lastCF = msb;
          res = (res << 1) & mask;
          break;
        }
        case 5: { // SHR
          lastCF = lsb;
          res = (res >>> 1) & mask;
          break;
        }
        case 7: { // SAR
          lastCF = lsb;
          const sign = res & signBit;
          res = (res >>> 1) | sign;
          break;
        }
      }
    }

    this.setFlag("cf", lastCF);

    if (op === 4 || op === 5 || op === 7) {
      this.setFlag("zf", res === 0);
      this.setFlag("sf", (res & signBit) !== 0);
      this.setFlag("pf", parityEven(res & 0xff));
    }

    if (count === 1) {
      const msb = (res & signBit) !== 0;
      switch (op) {
        case 0:
        case 2:
        case 4:
          this.setFlag("of", msb !== lastCF);
          break;
        case 1:
        case 3:
          this.setFlag("of", msb !== ((res & (signBit >> 1)) !== 0));
          break;
        case 5:
          this.setFlag("of", (val & signBit) !== 0);
          break;
        case 7:
          this.setFlag("of", false);
          break;
      }
    }

    return res;
  }

  private executeStringOp(opcode: number): void {
    const isWord = (opcode & 1) === 1;
    const step = this.flags.df ? (isWord ? -2 : -1) : (isWord ? 2 : 1);
    switch (opcode) {
      case 0xa4: { // MOVSB
        const b = this.readByte(this.reg.si);
        this.writeByte(this.reg.di, b);
        this.reg.si = word(this.reg.si + step);
        this.reg.di = word(this.reg.di + step);
        break;
      }
      case 0xa5: { // MOVSW
        const w = this.readWord(this.reg.si);
        this.writeWord(this.reg.di, w);
        this.reg.si = word(this.reg.si + step);
        this.reg.di = word(this.reg.di + step);
        break;
      }
      case 0xaa: { // STOSB
        this.writeByte(this.reg.di, this.reg.ax & 0xff);
        this.reg.di = word(this.reg.di + step);
        break;
      }
      case 0xab: { // STOSW
        this.writeWord(this.reg.di, this.reg.ax);
        this.reg.di = word(this.reg.di + step);
        break;
      }
      case 0xae: { // SCASB
        const b = this.readByte(this.reg.di);
        this.computeArith("cmp", this.reg.ax & 0xff, b, 8);
        this.reg.di = word(this.reg.di + step);
        break;
      }
      case 0xaf: { // SCASW
        const w = this.readWord(this.reg.di);
        this.computeArith("cmp", this.reg.ax, w, 16);
        this.reg.di = word(this.reg.di + step);
        break;
      }
      case 0xac: { // LODSB
        const b = this.readByte(this.reg.si);
        this.setReg8(0, b);
        this.reg.si = word(this.reg.si + step);
        break;
      }
      case 0xad: { // LODSW
        const w = this.readWord(this.reg.si);
        this.reg.ax = w;
        this.reg.si = word(this.reg.si + step);
        break;
      }
    }
  }

  private evaluateCondition(opcode: number): boolean {
    const { cf, zf, sf, of, pf } = this.flags;
    switch (opcode) {
      case 0x70: return of;
      case 0x71: return !of;
      case 0x72: return cf;
      case 0x73: return !cf;
      case 0x74: return zf;
      case 0x75: return !zf;
      case 0x76: return cf || zf;
      case 0x77: return !cf && !zf;
      case 0x78: return sf;
      case 0x79: return !sf;
      case 0x7a: return pf;
      case 0x7b: return !pf;
      case 0x7c: return sf !== of;
      case 0x7d: return sf === of;
      case 0x7e: return zf || sf !== of;
      case 0x7f: return !zf && sf === of;
      default: return false;
    }
  }

  private packFlags(): number {
    let value = 0x0202;
    if (this.flags.cf) value |= 0x0001;
    if (this.flags.pf) value |= 0x0004;
    if (this.flags.zf) value |= 0x0040;
    if (this.flags.sf) value |= 0x0080;
    if (this.flags.df) value |= 0x0400;
    if (this.flags.of) value |= 0x0800;
    return value;
  }

  private unpackFlags(value: number): void {
    this.flags.cf = (value & 0x0001) !== 0;
    this.flags.pf = (value & 0x0004) !== 0;
    this.flags.zf = (value & 0x0040) !== 0;
    this.flags.sf = (value & 0x0080) !== 0;
    this.flags.df = (value & 0x0400) !== 0;
    this.flags.of = (value & 0x0800) !== 0;
  }

  private resolveLabelAt(offset: number): string | undefined {
    return Array.from(this.program.symbols.entries()).find(
      ([, address]) => address === offset
    )?.[0];
  }

  private handleInterrupt(interrupt: number): void {
    const ah = (this.reg.ax >> 8) & 0xff;
    const al = this.reg.ax & 0xff;
    const dl = this.reg.dx & 0xff;
    if (interrupt === 0x10 && ah === 0x0e) {
      this.events.onOutput?.(String.fromCharCode(al));
    } else if (interrupt === 0x21 && ah === 0x02) {
      this.events.onOutput?.(String.fromCharCode(dl));
    } else if (interrupt === 0x21 && (ah === 0x01 || ah === 0x08)) {
      const key = this.stdin.shift() ?? 0;
      this.reg.ax = (this.reg.ax & 0xff00) | key;
      if (ah === 0x01 && key) this.events.onOutput?.(String.fromCharCode(key));
    } else if (interrupt === 0x21 && ah === 0x09) {
      const characters: string[] = [];
      for (let index = 0; index < MAX_ASCIIZ_SCAN; index++) {
        const byte = this.readByte(word(this.reg.dx + index));
        if (byte === 0x24) break;
        characters.push(String.fromCharCode(byte));
      }
      this.events.onOutput?.(characters.join(""));
    } else if (interrupt === 0x21 && ah === 0x4c) {
      this.halted = true;
    }
  }

  private execute(): void {
    const opcode = this.fetchByte();

    if (opcode === 0x90) return; // nop
    if (opcode === 0xf4) return; // hlt
    if (opcode === 0xc3) {
      this.ip = this.popWord();
      if (this.callStack.length > 1) this.callStack.pop();
      return;
    }
    if (opcode >= 0x50 && opcode <= 0x57)
      return this.pushWord(this.getReg16(opcode - 0x50));
    if (opcode >= 0x58 && opcode <= 0x5f)
      return this.setReg16(opcode - 0x58, this.popWord());
    if (opcode >= 0x40 && opcode <= 0x47) {
      const index = opcode - 0x40;
      const a = this.getReg16(index);
      const res = word(a + 1);
      this.applyArithFlags(a, 1, res, 16, false, false);
      this.setReg16(index, res);
      return;
    }
    if (opcode >= 0x48 && opcode <= 0x4f) {
      const index = opcode - 0x48;
      const a = this.getReg16(index);
      const res = word(a - 1);
      this.applyArithFlags(a, 1, res, 16, true, false);
      this.setReg16(index, res);
      return;
    }
    if (opcode === 0xcd) return this.handleInterrupt(this.fetchByte());
    if (opcode === 0x9c) return this.pushWord(this.packFlags());
    if (opcode === 0x9d) return this.unpackFlags(this.popWord());
    if (opcode === 0xfc) {
      this.flags.df = false;
      return;
    }
    if (opcode === 0xfd) {
      this.flags.df = true;
      return;
    }

    // String instructions
    if (
      opcode === 0xa4 || opcode === 0xa5 || opcode === 0xaa || opcode === 0xab ||
      opcode === 0xae || opcode === 0xaf || opcode === 0xac || opcode === 0xad
    ) {
      return this.executeStringOp(opcode);
    }

    // REP / REPE / REPNE prefixes
    if (opcode === 0xf3 || opcode === 0xf2) {
      const stringOp = this.fetchByte();
      while (this.reg.cx > 0) {
        this.executeStringOp(stringOp);
        this.reg.cx = word(this.reg.cx - 1);
        if (stringOp === 0xae || stringOp === 0xaf) {
          if (opcode === 0xf3 && !this.flags.zf) break;
          if (opcode === 0xf2 && this.flags.zf) break;
        }
      }
      return;
    }

    // LEA reg16, mem
    if (opcode === 0x8d) {
      const { mod, reg, rm } = this.readModRM();
      const ea = this.computeEA(mod, rm);
      this.setReg16(reg, ea);
      return;
    }

    // INC / DEC (modrm)
    if (opcode === 0xfe || opcode === 0xff) {
      const width: 8 | 16 = opcode === 0xff ? 16 : 8;
      const { mod, reg, rm } = this.readModRM();
      if (reg === 0 || reg === 1) {
        const isSub = reg === 1;
        const isRmReg = mod === 3;
        const ea = isRmReg ? 0 : this.computeEA(mod, rm);
        const val = isRmReg
          ? (width === 8 ? this.getReg8(rm) : this.getReg16(rm))
          : (width === 8 ? this.readByte(ea) : this.readWord(ea));
        const res = width === 8 ? ((val + (isSub ? -1 : 1)) & 0xff) : word(val + (isSub ? -1 : 1));
        this.applyArithFlags(val, 1, res, width, isSub, false);
        if (isRmReg) {
          if (width === 8) this.setReg8(rm, res); else this.setReg16(rm, res);
        } else {
          if (width === 8) this.writeByte(ea, res); else this.writeWord(ea, res);
        }
        return;
      }
      if (opcode === 0xff && reg === 6) { // PUSH r/m16
        const isRmReg = mod === 3;
        const ea = isRmReg ? 0 : this.computeEA(mod, rm);
        const val = isRmReg ? this.getReg16(rm) : this.readWord(ea);
        return this.pushWord(val);
      }
    }

    // Group 3: TEST, NOT, NEG, MUL, IMUL, DIV, IDIV
    if (opcode === 0xf6 || opcode === 0xf7) {
      const width: 8 | 16 = opcode === 0xf7 ? 16 : 8;
      const { mod, reg, rm } = this.readModRM();
      const isRmReg = mod === 3;
      const ea = isRmReg ? 0 : this.computeEA(mod, rm);
      const val = isRmReg
        ? (width === 8 ? this.getReg8(rm) : this.getReg16(rm))
        : (width === 8 ? this.readByte(ea) : this.readWord(ea));

      if (reg === 0) { // TEST operand, imm
        const imm = width === 8 ? this.fetchByte() : this.fetchWord();
        return this.applyLogicFlags(val & imm, width);
      }
      if (reg === 2) { // NOT
        const res = width === 8 ? (~val & 0xff) : word(~val);
        if (isRmReg) {
          if (width === 8) this.setReg8(rm, res); else this.setReg16(rm, res);
        } else {
          if (width === 8) this.writeByte(ea, res); else this.writeWord(ea, res);
        }
        return;
      }
      if (reg === 3) { // NEG
        const res = width === 8 ? ((0 - val) & 0xff) : word(0 - val);
        this.setFlag("cf", val !== 0);
        this.setFlag("zf", res === 0);
        this.setFlag("sf", (res & (width === 8 ? 0x80 : 0x8000)) !== 0);
        this.setFlag("of", width === 8 ? val === 0x80 : val === 0x8000);
        this.setFlag("pf", parityEven(res & 0xff));
        if (isRmReg) {
          if (width === 8) this.setReg8(rm, res); else this.setReg16(rm, res);
        } else {
          if (width === 8) this.writeByte(ea, res); else this.writeWord(ea, res);
        }
        return;
      }
      if (reg === 4) { // MUL (unsigned)
        if (width === 8) {
          const res = (this.reg.ax & 0xff) * val;
          this.reg.ax = word(res);
          const overflow = (res & 0xff00) !== 0;
          this.setFlag("cf", overflow);
          this.setFlag("of", overflow);
        } else {
          const res = this.reg.ax * val;
          this.reg.ax = res & 0xffff;
          this.reg.dx = Math.floor(res / 0x10000) & 0xffff;
          const overflow = this.reg.dx !== 0;
          this.setFlag("cf", overflow);
          this.setFlag("of", overflow);
        }
        return;
      }
      if (reg === 5) { // IMUL (signed)
        if (width === 8) {
          const res = signed8(this.reg.ax & 0xff) * signed8(val);
          this.reg.ax = word(res);
          const overflow = res < -128 || res > 127;
          this.setFlag("cf", overflow);
          this.setFlag("of", overflow);
        } else {
          const res = signed16(this.reg.ax) * signed16(val);
          this.reg.ax = word(res);
          this.reg.dx = word(Math.floor(res / 0x10000));
          const overflow = res < -32768 || res > 32767;
          this.setFlag("cf", overflow);
          this.setFlag("of", overflow);
        }
        return;
      }
      if (reg === 6) { // DIV (unsigned)
        if (val === 0) {
          this.halted = true;
          this.error = "Divide by zero";
          return;
        }
        if (width === 8) {
          const quotient = Math.floor(this.reg.ax / val);
          const remainder = this.reg.ax % val;
          if (quotient > 255) {
            this.halted = true;
            this.error = "Divide overflow";
            return;
          }
          this.setReg8(0, quotient & 0xff);
          this.setReg8(4, remainder & 0xff);
        } else {
          const dividend = (this.reg.dx * 0x10000) + this.reg.ax;
          const quotient = Math.floor(dividend / val);
          const remainder = dividend % val;
          if (quotient > 0xffff) {
            this.halted = true;
            this.error = "Divide overflow";
            return;
          }
          this.reg.ax = quotient & 0xffff;
          this.reg.dx = remainder & 0xffff;
        }
        return;
      }
      if (reg === 7) { // IDIV (signed)
        if (val === 0) {
          this.halted = true;
          this.error = "Divide by zero";
          return;
        }
        if (width === 8) {
          const dividend = signed16(this.reg.ax);
          const divisor = signed8(val);
          const quotient = Math.trunc(dividend / divisor);
          const remainder = dividend % divisor;
          if (quotient < -128 || quotient > 127) {
            this.halted = true;
            this.error = "Divide overflow";
            return;
          }
          this.setReg8(0, quotient & 0xff);
          this.setReg8(4, remainder & 0xff);
        } else {
          const dividend32 = ((this.reg.dx << 16) | this.reg.ax) >> 0;
          const divisor = signed16(val);
          const quotient = Math.trunc(dividend32 / divisor);
          const remainder = dividend32 % divisor;
          if (quotient < -32768 || quotient > 32767) {
            this.halted = true;
            this.error = "Divide overflow";
            return;
          }
          this.reg.ax = word(quotient);
          this.reg.dx = word(remainder);
        }
        return;
      }
    }

    // Group 2: Shifts & Rotates
    if (
      opcode === 0xd0 || opcode === 0xd1 ||
      opcode === 0xd2 || opcode === 0xd3 ||
      opcode === 0xc0 || opcode === 0xc1
    ) {
      const width: 8 | 16 = (opcode & 1) ? 16 : 8;
      const { mod, reg, rm } = this.readModRM();
      let count = 1;
      if (opcode === 0xd2 || opcode === 0xd3) {
        count = this.reg.cx & 0x1f;
      } else if (opcode === 0xc0 || opcode === 0xc1) {
        count = this.fetchByte() & 0x1f;
      }
      const isRmReg = mod === 3;
      const ea = isRmReg ? 0 : this.computeEA(mod, rm);
      const val = isRmReg
        ? (width === 8 ? this.getReg8(rm) : this.getReg16(rm))
        : (width === 8 ? this.readByte(ea) : this.readWord(ea));
      const res = this.executeShiftRotate(reg, val, count, width);
      if (isRmReg) {
        if (width === 8) this.setReg8(rm, res); else this.setReg16(rm, res);
      } else {
        if (width === 8) this.writeByte(ea, res); else this.writeWord(ea, res);
      }
      return;
    }

    // TEST reg, r/m
    if (opcode === 0x84 || opcode === 0x85) {
      const width: 8 | 16 = opcode === 0x85 ? 16 : 8;
      const { mod, reg, rm } = this.readModRM();
      const src = width === 8 ? this.getReg8(reg) : this.getReg16(reg);
      const dest = mod === 3
        ? (width === 8 ? this.getReg8(rm) : this.getReg16(rm))
        : (width === 8 ? this.readByte(this.computeEA(mod, rm)) : this.readWord(this.computeEA(mod, rm)));
      return this.applyLogicFlags(dest & src, width);
    }
    if (opcode === 0xa8) {
      return this.applyLogicFlags((this.reg.ax & 0xff) & this.fetchByte(), 8);
    }
    if (opcode === 0xa9) {
      return this.applyLogicFlags(this.reg.ax & this.fetchWord(), 16);
    }

    if (opcode === 0xe9) {
      const rel = signed16(this.fetchWord());
      this.ip = word(this.ip + rel);
      return;
    }
    if (opcode === 0xe8) {
      const rel = signed16(this.fetchWord());
      const returnAddress = this.ip;
      const target = word(this.ip + rel);
      this.pushWord(returnAddress);
      this.callStack.push(
        this.resolveLabelAt(target) ?? `0x${target.toString(16)}`
      );
      this.ip = target;
      return;
    }
    if (opcode >= 0x70 && opcode <= 0x7f) {
      const rel = signed8(this.fetchByte());
      if (this.evaluateCondition(opcode)) this.ip = word(this.ip + rel);
      return;
    }
    if (opcode === 0xe0 || opcode === 0xe1 || opcode === 0xe2) {
      const rel = signed8(this.fetchByte());
      const cx = word(this.reg.cx - 1);
      this.reg.cx = cx;
      const take =
        cx !== 0 &&
        (opcode === 0xe2 ||
          (opcode === 0xe1 && this.flags.zf) ||
          (opcode === 0xe0 && !this.flags.zf));
      if (take) this.ip = word(this.ip + rel);
      return;
    }

    // Direct MOV accumulator <-> memory
    if (opcode === 0xa0) return void this.setReg8(0, this.readByte(this.fetchWord()));
    if (opcode === 0xa1) return void (this.reg.ax = this.readWord(this.fetchWord()));
    if (opcode === 0xa2) return this.writeByte(this.fetchWord(), this.reg.ax & 0xff);
    if (opcode === 0xa3) return this.writeWord(this.fetchWord(), this.reg.ax);

    // MOV reg8, r/m8
    if (opcode === 0x8a) {
      const { mod, reg, rm } = this.readModRM();
      const val = mod === 3 ? this.getReg8(rm) : this.readByte(this.computeEA(mod, rm));
      this.setReg8(reg, val);
      return;
    }
    // MOV reg16, r/m16
    if (opcode === 0x8b) {
      const { mod, reg, rm } = this.readModRM();
      const val = mod === 3 ? this.getReg16(rm) : this.readWord(this.computeEA(mod, rm));
      this.setReg16(reg, val);
      return;
    }
    // MOV r/m16, reg16
    if (opcode === 0x89) {
      const { mod, reg, rm } = this.readModRM();
      const val = this.getReg16(reg);
      if (mod === 3) this.setReg16(rm, val);
      else this.writeWord(this.computeEA(mod, rm), val);
      return;
    }
    // MOV r/m8, reg8
    if (opcode === 0x88) {
      const { mod, reg, rm } = this.readModRM();
      const val = this.getReg8(reg);
      if (mod === 3) this.setReg8(rm, val);
      else this.writeByte(this.computeEA(mod, rm), val);
      return;
    }
    // MOV r/m, imm
    if (opcode === 0xc6) {
      const { mod, rm } = this.readModRM();
      const ea = mod === 3 ? 0 : this.computeEA(mod, rm);
      const imm = this.fetchByte();
      if (mod === 3) this.setReg8(rm, imm);
      else this.writeByte(ea, imm);
      return;
    }
    if (opcode === 0xc7) {
      const { mod, rm } = this.readModRM();
      const ea = mod === 3 ? 0 : this.computeEA(mod, rm);
      const imm = this.fetchWord();
      if (mod === 3) this.setReg16(rm, imm);
      else this.writeWord(ea, imm);
      return;
    }
    // MOV sreg, reg16
    if (opcode === 0x8e) {
      const { reg, rm } = this.readModRM();
      this.seg[SEGMENT_NAMES[reg]] = this.getReg16(rm);
      return;
    }
    // MOV reg16, sreg
    if (opcode === 0x8c) {
      const { reg, rm } = this.readModRM();
      this.setReg16(rm, this.seg[SEGMENT_NAMES[reg]]);
      return;
    }
    // MOV reg, imm
    if (opcode >= 0xb8 && opcode <= 0xbf)
      return this.setReg16(opcode - 0xb8, this.fetchWord());
    if (opcode >= 0xb0 && opcode <= 0xb7)
      return this.setReg8(opcode - 0xb0, this.fetchByte());

    // XCHG
    if (opcode === 0x86 || opcode === 0x87) {
      const width: 8 | 16 = opcode === 0x87 ? 16 : 8;
      const { mod, reg, rm } = this.readModRM();
      const a = width === 8 ? this.getReg8(reg) : this.getReg16(reg);
      if (mod === 3) {
        const b = width === 8 ? this.getReg8(rm) : this.getReg16(rm);
        if (width === 8) {
          this.setReg8(rm, a);
          this.setReg8(reg, b);
        } else {
          this.setReg16(rm, a);
          this.setReg16(reg, b);
        }
      } else {
        const ea = this.computeEA(mod, rm);
        const b = width === 8 ? this.readByte(ea) : this.readWord(ea);
        if (width === 8) {
          this.writeByte(ea, a);
          this.setReg8(reg, b);
        } else {
          this.writeWord(ea, a);
          this.setReg16(reg, b);
        }
      }
      return;
    }

    // Group 1: ADD, OR, AND, SUB, XOR, CMP (opcodes 00..03, 08..0B, 20..23, 28..2B, 30..33, 38..3B)
    const baseGroup1 = opcode & 0x38;
    const opGroup1 = {
      0x00: "add", 0x08: "or", 0x20: "and", 0x28: "sub", 0x30: "xor", 0x38: "cmp",
    }[baseGroup1] as ArithOp | undefined;

    if (opGroup1 && (opcode & ~0x3b) === 0) {
      const width: 8 | 16 = (opcode & 1) ? 16 : 8;
      const isRegDest = (opcode & 2) !== 0;
      const { mod, reg, rm } = this.readModRM();
      const isRmReg = mod === 3;
      const ea = isRmReg ? 0 : this.computeEA(mod, rm);
      const regVal = width === 8 ? this.getReg8(reg) : this.getReg16(reg);
      const rmVal = isRmReg
        ? (width === 8 ? this.getReg8(rm) : this.getReg16(rm))
        : (width === 8 ? this.readByte(ea) : this.readWord(ea));

      const destVal = isRegDest ? regVal : rmVal;
      const srcVal = isRegDest ? rmVal : regVal;
      const res = this.computeArith(opGroup1, destVal, srcVal, width);

      if (opGroup1 !== "cmp") {
        if (isRegDest) {
          if (width === 8) this.setReg8(reg, res); else this.setReg16(reg, res);
        } else {
          if (isRmReg) {
            if (width === 8) this.setReg8(rm, res); else this.setReg16(rm, res);
          } else {
            if (width === 8) this.writeByte(ea, res); else this.writeWord(ea, res);
          }
        }
      }
      return;
    }

    // Group 1 immediate: 0x80 and 0x81
    if (opcode === 0x80 || opcode === 0x81) {
      const width: 8 | 16 = opcode === 0x81 ? 16 : 8;
      const { mod, reg, rm } = this.readModRM();
      const op = ARITH_EXTENSION[reg];
      if (!op) return;
      const isRmReg = mod === 3;
      const ea = isRmReg ? 0 : this.computeEA(mod, rm);
      const dest = isRmReg
        ? (width === 8 ? this.getReg8(rm) : this.getReg16(rm))
        : (width === 8 ? this.readByte(ea) : this.readWord(ea));
      const imm = width === 8 ? this.fetchByte() : this.fetchWord();
      const res = this.computeArith(op, dest, imm, width);
      if (op !== "cmp") {
        if (isRmReg) {
          if (width === 8) this.setReg8(rm, res); else this.setReg16(rm, res);
        } else {
          if (width === 8) this.writeByte(ea, res); else this.writeWord(ea, res);
        }
      }
      return;
    }

    this.halted = true;
    this.error = `Unknown opcode 0x${opcode.toString(16).padStart(2, "0")} at offset 0x${(this.ip - 1).toString(16)}`;
  }
}
