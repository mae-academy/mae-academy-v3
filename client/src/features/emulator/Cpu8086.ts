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
const REG16_ARITH_OPCODES: Record<number, ArithOp> = {
  0x01: "add",
  0x29: "sub",
  0x39: "cmp",
  0x21: "and",
  0x09: "or",
  0x31: "xor",
};
const REG8_ARITH_OPCODES: Record<number, ArithOp> = {
  0x00: "add",
  0x28: "sub",
  0x38: "cmp",
  0x20: "and",
  0x08: "or",
  0x30: "xor",
};
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
  /** The one memory form this assembler emits: mod=00,rm=110 is always a direct disp16 address. */
  private isDirectAddress(mod: number, rm: number): boolean {
    return mod === 0 && rm === 6;
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
  private evaluateCondition(opcode: number): boolean {
    const { cf, zf, sf, of, pf } = this.flags;
    switch (opcode) {
      case 0x70:
        return of;
      case 0x71:
        return !of;
      case 0x72:
        return cf;
      case 0x73:
        return !cf;
      case 0x74:
        return zf;
      case 0x75:
        return !zf;
      case 0x76:
        return cf || zf;
      case 0x77:
        return !cf && !zf;
      case 0x78:
        return sf;
      case 0x79:
        return !sf;
      case 0x7a:
        return pf;
      case 0x7b:
        return !pf;
      case 0x7c:
        return sf !== of;
      case 0x7d:
        return sf === of;
      case 0x7e:
        return zf || sf !== of;
      case 0x7f:
        return !zf && sf === of;
      default:
        return false;
    }
  }
  private packFlags(): number {
    let value = 0x0202; // reserved bit 1 and IF are conventionally set; nothing reads this back but a real dump.
    if (this.flags.cf) value |= 0x0001;
    if (this.flags.pf) value |= 0x0004;
    if (this.flags.zf) value |= 0x0040;
    if (this.flags.sf) value |= 0x0080;
    if (this.flags.of) value |= 0x0800;
    return value;
  }
  private unpackFlags(value: number): void {
    this.flags.cf = (value & 0x0001) !== 0;
    this.flags.pf = (value & 0x0004) !== 0;
    this.flags.zf = (value & 0x0040) !== 0;
    this.flags.sf = (value & 0x0080) !== 0;
    this.flags.of = (value & 0x0800) !== 0;
  }
  /** Reverse symbol lookup so CALL can push a real procedure name onto callStack, not just an address. */
  private resolveLabelAt(offset: number): string | undefined {
    // Array.from + find rather than `for...of` over the Map: this project's tsconfig has no
    // `target`/`downlevelIteration` set, so Map iteration doesn't compile without it.
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
    if (opcode === 0xf4) return; // hlt: haltOffsets handles the transition
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
    if (opcode === 0xf6 || opcode === 0xf7) {
      const { reg, rm } = this.readModRM(); // this assembler only ever emits NOT (reg field = 2), register-direct
      if (reg !== 2) return;
      if (opcode === 0xf7) this.setReg16(rm, word(~this.getReg16(rm)));
      else this.setReg8(rm, ~this.getReg8(rm) & 0xff);
      return;
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
    if (opcode === 0xa1)
      return void (this.reg.ax = this.readWord(this.fetchWord()));
    if (opcode === 0xa3) return this.writeWord(this.fetchWord(), this.reg.ax);
    if (opcode === 0x8b) {
      const { mod, reg, rm } = this.readModRM();
      if (this.isDirectAddress(mod, rm))
        this.setReg16(reg, this.readWord(this.fetchWord()));
      return;
    }
    if (opcode === 0x89) {
      const { mod, reg, rm } = this.readModRM();
      if (this.isDirectAddress(mod, rm))
        this.writeWord(this.fetchWord(), this.getReg16(reg));
      else this.setReg16(rm, this.getReg16(reg));
      return;
    }
    if (opcode === 0x88) {
      const { reg, rm } = this.readModRM();
      this.setReg8(rm, this.getReg8(reg));
      return;
    }
    if (opcode === 0x8e) {
      const { reg, rm } = this.readModRM();
      this.seg[SEGMENT_NAMES[reg]] = this.getReg16(rm);
      return;
    }
    if (opcode >= 0xb8 && opcode <= 0xbf)
      return this.setReg16(opcode - 0xb8, this.fetchWord());
    if (opcode >= 0xb0 && opcode <= 0xb7)
      return this.setReg8(opcode - 0xb0, this.fetchByte());
    if (opcode === 0x87) {
      // XCHG reg16,reg16 — this assembler's only reg-reg opcode with no arithmetic-flag side effect.
      const { reg, rm } = this.readModRM();
      const a = this.getReg16(rm);
      const b = this.getReg16(reg);
      this.setReg16(rm, b);
      this.setReg16(reg, a);
      return;
    }
    if (opcode in REG16_ARITH_OPCODES) {
      const { reg, rm } = this.readModRM();
      const op = REG16_ARITH_OPCODES[opcode];
      const result = this.computeArith(
        op,
        this.getReg16(rm),
        this.getReg16(reg),
        16
      );
      if (op !== "cmp") this.setReg16(rm, result);
      return;
    }
    if (opcode in REG8_ARITH_OPCODES) {
      const { reg, rm } = this.readModRM();
      const op = REG8_ARITH_OPCODES[opcode];
      const result = this.computeArith(
        op,
        this.getReg8(rm),
        this.getReg8(reg),
        8
      );
      if (op !== "cmp") this.setReg8(rm, result);
      return;
    }
    if (opcode === 0x81 || opcode === 0x80) {
      const { reg, rm } = this.readModRM();
      const op = ARITH_EXTENSION[reg];
      if (!op) return;
      if (opcode === 0x81) {
        const result = this.computeArith(
          op,
          this.getReg16(rm),
          this.fetchWord(),
          16
        );
        if (op !== "cmp") this.setReg16(rm, result);
      } else {
        const result = this.computeArith(
          op,
          this.getReg8(rm),
          this.fetchByte(),
          8
        );
        if (op !== "cmp") this.setReg8(rm, result);
      }
      return;
    }
    // An opcode this assembler cannot produce reached here; treat it as a hard stop rather than
    // silently corrupting further execution.
    this.halted = true;
    this.error = `Unknown opcode 0x${opcode.toString(16).padStart(2, "0")} at offset 0x${(this.ip - 1).toString(16)}`;
  }
}
