/**
 * MAE educational DOS COM compiler.
 *
 * Pass 1 assigns every statement an exact real-mode offset and fills the
 * case-insensitive symbol table. Pass 2 emits one contiguous COM image at
 * that already-calculated address. No React/UI dependency exists here.
 */
import type { AssembledProgram, AssemblerDiagnostic, ComDataRange } from "./types";

export const COM_ORIGIN = 0x0100;
export const COM_SEGMENT = 0x1000;
const REG16 = ["ax", "cx", "dx", "bx", "sp", "bp", "si", "di"] as const;
const REG8 = ["al", "cl", "dl", "bl", "ah", "ch", "dh", "bh"] as const;
const SEGMENT: Record<string, number> = { es: 0, cs: 1, ss: 2, ds: 3 };
type StatementKind = "instruction" | "data" | "ignore";
type DataWidth = 1 | 2;
type Statement = {
  line: number;
  text: string;
  kind: StatementKind;
  mnemonic?: string;
  operands: string[];
  label?: string;
  width?: DataWidth;
  offset?: number;
  size?: number;
};

const key = (value: string) => value.trim().toLowerCase();
const wordBytes = (value: number) => [value & 0xff, (value >>> 8) & 0xff];
const modrm = (operation: number, destination: number) =>
  0xc0 | ((operation & 7) << 3) | (destination & 7);
const isReg16 = (value?: string) =>
  REG16.includes(key(value ?? "") as (typeof REG16)[number]);
const isReg8 = (value?: string) =>
  REG8.includes(key(value ?? "") as (typeof REG8)[number]);
const registerIndex16 = (value?: string) =>
  REG16.indexOf(key(value ?? "") as (typeof REG16)[number]);
const registerIndex8 = (value?: string) =>
  REG8.indexOf(key(value ?? "") as (typeof REG8)[number]);

/** Short (rel8) Jcc opcodes, including every documented mnemonic alias. */
const CONDITION_JUMP: Record<string, number> = {
  jo: 0x70, jno: 0x71, jc: 0x72, jb: 0x72, jnae: 0x72, jnc: 0x73, jae: 0x73, jnb: 0x73,
  jz: 0x74, je: 0x74, jnz: 0x75, jne: 0x75, jbe: 0x76, jna: 0x76, ja: 0x77, jnbe: 0x77,
  js: 0x78, jns: 0x79, jp: 0x7a, jpe: 0x7a, jnp: 0x7b, jpo: 0x7b,
  jl: 0x7c, jnge: 0x7c, jge: 0x7d, jnl: 0x7d, jle: 0x7e, jng: 0x7e, jg: 0x7f, jnle: 0x7f,
};
const LOOP_VARIANT: Record<string, number> = {
  loop: 0xe2, loope: 0xe1, loopz: 0xe1, loopne: 0xe0, loopnz: 0xe0,
};
const GROUP1_ARITH = ["add", "or", "and", "sub", "xor", "cmp", "xchg"] as const;
const STRING_OPS = ["movsb", "movsw", "stosb", "stosw", "scasb", "scasw", "lodsb", "lodsw"] as const;
const STRING_PREFIXES = ["rep", "repe", "repz", "repne", "repnz"] as const;
const SHIFT_ROTATE = ["shl", "sal", "shr", "sar", "rol", "ror", "rcl", "rcr"] as const;
const GROUP3_SINGLE = ["not", "neg", "mul", "imul", "div", "idiv"] as const;

function stripComment(line: string) {
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    if (line[index] === "'") quoted = !quoted;
    if (line[index] === ";" && !quoted) return line.slice(0, index).trim();
  }
  return line.trim();
}

function splitOperands(source: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  let parenDepth = 0;
  for (const character of source) {
    if (character === "'") quoted = !quoted;
    if (!quoted) {
      if (character === "(") parenDepth++;
      else if (character === ")") parenDepth--;
    }
    if (character === "," && !quoted && parenDepth === 0) {
      values.push(current.trim());
      current = "";
    } else current += character;
  }
  if (current.trim()) values.push(current.trim());
  return values;
}

function parseInteger(raw: string): number | null {
  const source = raw.trim();
  const charMatch = source.match(/^'([^'])'$/);
  if (charMatch) {
    return charMatch[1].charCodeAt(0);
  }
  const isNeg = source.startsWith("-");
  const isPos = source.startsWith("+");
  const unsigned = isNeg || isPos ? source.slice(1).trim() : source;
  const lowered = unsigned.toLowerCase();
  const normalized = lowered.replace(/^0x/, "").replace(/h$/, "");
  if (!/^[0-9a-f]+$/i.test(normalized)) return null;
  const val = Number.parseInt(
    normalized,
    lowered.endsWith("h") || lowered.startsWith("0x") ? 16 : 10
  );
  if (Number.isNaN(val)) return null;
  return isNeg ? -val : val;
}

function bracketSymbol(raw: string) {
  const matched = raw.trim().match(/^\[(.+)]$/);
  return matched ? matched[1].trim() : null;
}

function resolve(raw: string, symbols: Map<string, number>): number | null {
  const source = raw.trim();
  const lowered = key(source);
  if (lowered === "@data") return COM_SEGMENT;
  const offset = source.match(/^offset\s+([a-z_][\w$]*)$/i);
  if (offset) return symbols.get(key(offset[1])) ?? null;
  const bracketed = bracketSymbol(source);
  if (bracketed) return resolve(bracketed, symbols);
  const arithmetic = source.match(
    /^([a-z_][\w$]*|(?:0x)?[0-9a-f]+h?)\s*([+-])\s*((?:0x)?[0-9a-f]+h?)$/i
  );
  if (arithmetic) {
    const base: number | null = resolve(arithmetic[1], symbols);
    const adjustment = parseInteger(arithmetic[3]);
    return base === null || adjustment === null
      ? null
      : base + (arithmetic[2] === "+" ? adjustment : -adjustment);
  }
  const literal = parseInteger(source);
  return literal ?? symbols.get(lowered) ?? null;
}

function parseDup(operand: string, symbols?: Map<string, number>): { count: number; inner: string } | null {
  const match = operand.trim().match(/^([a-z_][\w$]*|\d+)\s+dup\s*\(([\s\S]*)\)$/i);
  if (!match) return null;
  let count = Number.parseInt(match[1], 10);
  if (Number.isNaN(count) && symbols) {
    count = symbols.get(key(match[1])) ?? NaN;
  }
  if (Number.isNaN(count)) return null;
  return { count, inner: match[2].trim() };
}

function dataSize(operands: string[], width: DataWidth, symbols?: Map<string, number>): number {
  return operands.reduce((size, operand) => {
    const dup = parseDup(operand, symbols);
    if (dup) {
      const innerOps = splitOperands(dup.inner);
      return size + dup.count * dataSize(innerOps, width, symbols);
    }
    const quoted = operand.match(/^'(.*)'$/);
    return size + (quoted ? Array.from(quoted[1]).length * width : width);
  }, 0);
}

function encodeData(
  operands: string[],
  width: DataWidth,
  symbols: Map<string, number>,
  statement: Statement,
  diagnostics: AssemblerDiagnostic[]
): number[] {
  const bytes: number[] = [];
  for (const operand of operands) {
    const dup = parseDup(operand, symbols);
    if (dup) {
      const innerOps = splitOperands(dup.inner);
      const chunk = encodeData(innerOps, width, symbols, statement, diagnostics);
      for (let i = 0; i < dup.count; i++) {
        bytes.push(...chunk);
      }
      continue;
    }
    const quoted = operand.match(/^'(.*)'$/);
    if (quoted) {
      for (const character of Array.from(quoted[1])) {
        const value = character.charCodeAt(0);
        bytes.push(
          width === 1 ? value & 0xff : value & 0xff,
          ...(width === 2 ? [(value >>> 8) & 0xff] : [])
        );
      }
      continue;
    }
    if (operand.trim() === "?") {
      bytes.push(...Array(width).fill(0));
      continue;
    }
    const value = resolve(operand, symbols);
    if (value === null) {
      diagnostics.push({
        line: statement.line,
        message: `Unresolved ${width === 1 ? "DB" : "DW"} initializer: ${operand}`,
        source: statement.text,
      });
      continue;
    }
    bytes.push(...(width === 1 ? [value & 0xff] : wordBytes(value)));
  }
  return bytes;
}

export interface MemorySpec {
  mod: number;
  rm: number;
  dispBytes: number[];
  explicitWidth?: DataWidth;
}

/**
 * Names declared with EQU in the source being compiled. A bare EQU name is an immediate,
 * never a memory operand. Reset by parseSource(); assembly is synchronous so this is safe.
 */
let constantNames = new Set<string>();

export function parseMemoryOperand(
  raw?: string,
  symbols?: Map<string, number>
): MemorySpec | null {
  if (!raw) return null;
  let text = raw.trim();
  let explicitWidth: DataWidth | undefined;
  if (/^byte\s+ptr\s+/i.test(text)) {
    explicitWidth = 1;
    text = text.replace(/^byte\s+ptr\s+/i, "").trim();
  } else if (/^word\s+ptr\s+/i.test(text)) {
    explicitWidth = 2;
    text = text.replace(/^word\s+ptr\s+/i, "").trim();
  }

  let inside = bracketSymbol(text);
  const arrayForm = text.match(/^([a-z_][\w$]*)\s*\[(.*)\]$/i);
  if (arrayForm) {
    inside = arrayForm[2].trim() ? `${arrayForm[1]} + ${arrayForm[2]}` : arrayForm[1];
  } else if (
    inside === null &&
    !isReg16(text) &&
    !isReg8(text) &&
    parseInteger(text) === null &&
    !/^offset\s+/i.test(text)
  ) {
    // If it's a bare identifier without brackets: check if it's an arithmetic expression first
    const isArithmeticExpr = /^[a-z_][\w$]*\s*[-+]\s*[a-z0-9_$]+/i.test(text);
    if (!isArithmeticExpr && !constantNames.has(key(text))) {
      if (symbols ? symbols.has(key(text)) : true) {
        inside = text;
      }
    }
  }

  if (inside === null) return null;

  const cleaned = inside.replace(/\s+/g, "");
  const termRegex = /([+-]?)([^+-]+)/g;
  let match: RegExpExecArray | null;
  let hasBX = false;
  let hasBP = false;
  let hasSI = false;
  let hasDI = false;
  let disp = 0;
  let hasSymbol = false;

  while ((match = termRegex.exec(cleaned)) !== null) {
    const sign = match[1] === "-" ? -1 : 1;
    const term = match[2].trim().toLowerCase();
    if (term === "bx") hasBX = true;
    else if (term === "bp") hasBP = true;
    else if (term === "si") hasSI = true;
    else if (term === "di") hasDI = true;
    else {
      const num = parseInteger(term);
      if (num !== null) {
        disp += sign * num;
      } else if (symbols && symbols.has(term)) {
        hasSymbol = true;
        disp += sign * (symbols.get(term) ?? 0);
      } else {
        hasSymbol = true;
        disp += sign * COM_ORIGIN;
      }
    }
  }

  let rm: number;
  let hasReg = true;
  if (hasBX && hasSI) rm = 0;
  else if (hasBX && hasDI) rm = 1;
  else if (hasBP && hasSI) rm = 2;
  else if (hasBP && hasDI) rm = 3;
  else if (hasSI && !hasBX && !hasBP) rm = 4;
  else if (hasDI && !hasBX && !hasBP) rm = 5;
  else if (hasBP && !hasSI && !hasDI) rm = 6;
  else if (hasBX && !hasSI && !hasDI) rm = 7;
  else {
    hasReg = false;
    rm = 6;
  }

  let mod: number;
  let dispBytes: number[];
  if (!hasReg) {
    mod = 0;
    dispBytes = wordBytes(disp);
  } else if (rm === 6 && !hasSymbol && disp === 0) {
    mod = 1;
    dispBytes = [0];
  } else if (hasSymbol) {
    mod = 2;
    dispBytes = wordBytes(disp);
  } else if (disp === 0) {
    mod = 0;
    dispBytes = [];
  } else if (disp >= -128 && disp <= 127) {
    mod = 1;
    dispBytes = [disp & 0xff];
  } else {
    mod = 2;
    dispBytes = wordBytes(disp);
  }

  return { mod, rm, dispBytes, explicitWidth };
}

const modrmMem = (reg: number, mem: MemorySpec) =>
  (mem.mod << 6) | ((reg & 7) << 3) | (mem.rm & 7);

function isMemory(raw?: string): boolean {
  if (!raw) return false;
  const s = raw.trim();
  if (/^(byte|word)\s+ptr\b/i.test(s)) return true;
  if (/^\[.*\]$/.test(s)) return true;
  if (/^[a-z_][\w$]*\s*\[.*\]$/i.test(s)) return true;
  return false;
}

function instructionSize(mnemonic: string, operands: string[]): number | null {
  const op = key(mnemonic);
  const destination = operands[0];
  const source = operands[1];

  if (["nop", "hlt", "ret", "pushf", "popf", "cld", "std", "stc", "clc", "cmc", "cbw", "cwd"].includes(op)) return 1;
  if (STRING_OPS.includes(op as (typeof STRING_OPS)[number])) return 1;
  if (STRING_PREFIXES.includes(op as (typeof STRING_PREFIXES)[number])) {
    return operands.length > 0 ? 2 : 1;
  }
  if (op === "int") return 2;
  if (["jmp", "call"].includes(op)) return 3;
  if (op in CONDITION_JUMP || op in LOOP_VARIANT) return 2;

  if (op === "push" || op === "pop") {
    if (isReg16(destination)) return 1;
    const mem = parseMemoryOperand(destination);
    return mem ? 2 + mem.dispBytes.length : null;
  }

  if (op === "inc" || op === "dec") {
    if (isReg16(destination)) return 1;
    if (isReg8(destination)) return 2;
    const mem = parseMemoryOperand(destination);
    return mem ? 2 + mem.dispBytes.length : null;
  }

  if (GROUP3_SINGLE.includes(op as (typeof GROUP3_SINGLE)[number])) {
    if (isReg16(destination) || isReg8(destination)) return 2;
    const mem = parseMemoryOperand(destination);
    return mem ? 2 + mem.dispBytes.length : null;
  }

  if (SHIFT_ROTATE.includes(op as (typeof SHIFT_ROTATE)[number])) {
    const d16 = isReg16(destination);
    const d8 = isReg8(destination);
    const mem = (!d16 && !d8) ? parseMemoryOperand(destination) : null;
    if (!d16 && !d8 && !mem) return null;
    const count = key(source ?? "1");
    if (count === "1" || count === "cl") {
      return mem ? 2 + mem.dispBytes.length : 2;
    }
    return mem ? 3 + mem.dispBytes.length : 3;
  }

  if (op === "lea") {
    if (!isReg16(destination)) return null;
    const mem = parseMemoryOperand(source);
    return mem ? 2 + mem.dispBytes.length : null;
  }

  if (op === "test") {
    const d16 = isReg16(destination);
    const d8 = isReg8(destination);
    const s16 = isReg16(source);
    const s8 = isReg8(source);
    if ((d16 && s16) || (d8 && s8)) return 2;
    const memDest = parseMemoryOperand(destination);
    const memSrc = parseMemoryOperand(source);
    if ((d16 && memSrc) || (memDest && s16) || (d8 && memSrc) || (memDest && s8)) {
      const mem = memDest ?? memSrc;
      return mem ? 2 + mem.dispBytes.length : null;
    }
    if (key(destination ?? "") === "ax") return 3;
    if (key(destination ?? "") === "al") return 2;
    if (d16) return 4;
    if (d8) return 3;
    if (memDest) {
      const width = memDest.explicitWidth ?? 1;
      return 2 + memDest.dispBytes.length + (width === 2 ? 2 : 1);
    }
    return null;
  }

  if (op === "mov") {
    const d16 = isReg16(destination);
    const s16 = isReg16(source);
    const d8 = isReg8(destination);
    const s8 = isReg8(source);
    const segmentDest = SEGMENT[key(destination ?? "")];
    const segmentSrc = SEGMENT[key(source ?? "")];

    if ((d16 && s16) || (d8 && s8) || (segmentDest !== undefined && s16) || (d16 && segmentSrc !== undefined)) {
      return 2;
    }

    const memDest = parseMemoryOperand(destination);
    const memSrc = parseMemoryOperand(source);

    if (d16 && !s16 && !memSrc) return 3; // mov reg16, imm16
    if (d8 && !s8 && !memSrc) return 2;  // mov reg8, imm8

    if (d16 && memSrc) {
      if (key(destination ?? "") === "ax" && memSrc.mod === 0 && memSrc.rm === 6) return 3;
      return 2 + memSrc.dispBytes.length;
    }
    if (d8 && memSrc) {
      if (key(destination ?? "") === "al" && memSrc.mod === 0 && memSrc.rm === 6) return 3;
      return 2 + memSrc.dispBytes.length;
    }
    if (memDest && s16) {
      if (key(source ?? "") === "ax" && memDest.mod === 0 && memDest.rm === 6) return 3;
      return 2 + memDest.dispBytes.length;
    }
    if (memDest && s8) {
      if (key(source ?? "") === "al" && memDest.mod === 0 && memDest.rm === 6) return 3;
      return 2 + memDest.dispBytes.length;
    }
    if (memDest && !s16 && !s8) {
      const width = memDest.explicitWidth ?? 1;
      return 2 + memDest.dispBytes.length + (width === 2 ? 2 : 1);
    }
    return null;
  }

  if (GROUP1_ARITH.includes(op as (typeof GROUP1_ARITH)[number])) {
    const d16 = isReg16(destination);
    const s16 = isReg16(source);
    const d8 = isReg8(destination);
    const s8 = isReg8(source);

    if ((d16 && s16) || (d8 && s8)) return 2;
    const memDest = parseMemoryOperand(destination);
    const memSrc = parseMemoryOperand(source);
    if (op !== "xchg" && d16 && !s16 && !memSrc) return 4;
    if (op !== "xchg" && d8 && !s8 && !memSrc) return 3;

    if ((d16 && memSrc) || (memDest && s16) || (d8 && memSrc) || (memDest && s8)) {
      const mem = memDest ?? memSrc;
      return mem ? 2 + mem.dispBytes.length : null;
    }
    if (op !== "xchg" && memDest && !s16 && !s8) {
      const width = memDest.explicitWidth ?? 1;
      return 2 + memDest.dispBytes.length + (width === 2 ? 2 : 1);
    }
    return null;
  }

  return null;
}

function encodeInstruction(
  statement: Statement,
  symbols: Map<string, number>,
  diagnostics: AssemblerDiagnostic[]
): number[] {
  const mnemonic = key(statement.mnemonic!);
  const operands = statement.operands;
  const destination = key(operands[0] ?? "");
  const source = key(operands[1] ?? "");
  const fail = (message: string) => {
    diagnostics.push({ line: statement.line, message, source: statement.text });
    return [] as number[];
  };
  const immediate = (value: string) => resolve(value, symbols);
  const offset = statement.offset!;

  if (mnemonic === "nop") return [0x90];
  if (mnemonic === "hlt") return [0xf4];
  if (mnemonic === "ret") return [0xc3];
  if (mnemonic === "pushf") return [0x9c];
  if (mnemonic === "popf") return [0x9d];
  if (mnemonic === "cld") return [0xfc];
  if (mnemonic === "std") return [0xfd];
  if (mnemonic === "stc") return [0xf9];
  if (mnemonic === "clc") return [0xf8];
  if (mnemonic === "cmc") return [0xf5];
  if (mnemonic === "cbw") return [0x98];
  if (mnemonic === "cwd") return [0x99];

  if (STRING_OPS.includes(mnemonic as (typeof STRING_OPS)[number])) {
    return [{
      movsb: 0xa4, movsw: 0xa5, stosb: 0xaa, stosw: 0xab,
      scasb: 0xae, scasw: 0xaf, lodsb: 0xac, lodsw: 0xad,
    }[mnemonic]!];
  }

  if (STRING_PREFIXES.includes(mnemonic as (typeof STRING_PREFIXES)[number])) {
    const prefix = (mnemonic === "repne" || mnemonic === "repnz") ? 0xf2 : 0xf3;
    if (operands.length > 0) {
      const subOp = key(operands[0]);
      if (STRING_OPS.includes(subOp as (typeof STRING_OPS)[number])) {
        const subCode = {
          movsb: 0xa4, movsw: 0xa5, stosb: 0xaa, stosw: 0xab,
          scasb: 0xae, scasw: 0xaf, lodsb: 0xac, lodsw: 0xad,
        }[subOp]!;
        return [prefix, subCode];
      }
      return fail(`Unsupported REP instruction: ${operands[0]}`);
    }
    return [prefix];
  }

  if (mnemonic === "push" || mnemonic === "pop") {
    const index = registerIndex16(destination);
    if (index >= 0) {
      return [(mnemonic === "push" ? 0x50 : 0x58) + index];
    }
    const mem = parseMemoryOperand(destination, symbols);
    if (mem) {
      return [mnemonic === "push" ? 0xff : 0x8f, modrmMem(mnemonic === "push" ? 6 : 0, mem), ...mem.dispBytes];
    }
    return fail("PUSH/POP requires a 16-bit register or memory operand");
  }

  if (mnemonic === "inc" || mnemonic === "dec") {
    const d16 = registerIndex16(destination);
    if (d16 >= 0) return [(mnemonic === "inc" ? 0x40 : 0x48) + d16];
    const d8 = registerIndex8(destination);
    if (d8 >= 0) return [0xfe, modrm(mnemonic === "inc" ? 0 : 1, d8)];
    const mem = parseMemoryOperand(destination, symbols);
    if (mem) {
      const width = mem.explicitWidth ?? 1;
      return [width === 2 ? 0xff : 0xfe, modrmMem(mnemonic === "inc" ? 0 : 1, mem), ...mem.dispBytes];
    }
    return fail("INC/DEC requires a register or memory operand");
  }

  if (mnemonic === "int") {
    const interrupt = immediate(destination);
    return interrupt === null ? fail("INT requires a numeric interrupt") : [0xcd, interrupt & 0xff];
  }

  if (GROUP3_SINGLE.includes(mnemonic as (typeof GROUP3_SINGLE)[number])) {
    const ext = { test: 0, not: 2, neg: 3, mul: 4, imul: 5, div: 6, idiv: 7 }[mnemonic]!;
    const d16 = registerIndex16(destination);
    if (d16 >= 0) return [0xf7, modrm(ext, d16)];
    const d8 = registerIndex8(destination);
    if (d8 >= 0) return [0xf6, modrm(ext, d8)];
    const mem = parseMemoryOperand(destination, symbols);
    if (mem) {
      const width = mem.explicitWidth ?? 1;
      return [width === 2 ? 0xf7 : 0xf6, modrmMem(ext, mem), ...mem.dispBytes];
    }
    return fail(`${mnemonic.toUpperCase()} requires a register or memory operand`);
  }

  if (SHIFT_ROTATE.includes(mnemonic as (typeof SHIFT_ROTATE)[number])) {
    const ext = { rol: 0, ror: 1, rcl: 2, rcr: 3, shl: 4, sal: 4, shr: 5, sar: 7 }[mnemonic]!;
    const d16 = registerIndex16(destination);
    const d8 = registerIndex8(destination);
    const mem = (d16 < 0 && d8 < 0) ? parseMemoryOperand(destination, symbols) : null;
    if (d16 < 0 && d8 < 0 && !mem) return fail(`${mnemonic.toUpperCase()} requires a register or memory operand`);
    const width = d16 >= 0 ? 2 : (d8 >= 0 ? 1 : (mem?.explicitWidth ?? 1));
    const countStr = key(operands[1] ?? "1");
    const modrmByte = mem ? modrmMem(ext, mem) : modrm(ext, d16 >= 0 ? d16 : d8);
    const dispBytes = mem ? mem.dispBytes : [];

    if (countStr === "1") {
      return [width === 2 ? 0xd1 : 0xd0, modrmByte, ...dispBytes];
    }
    if (countStr === "cl") {
      return [width === 2 ? 0xd3 : 0xd2, modrmByte, ...dispBytes];
    }
    const cnt = immediate(countStr);
    if (cnt === null) return fail("Shift/rotate count must be 1, CL, or immediate");
    return [width === 2 ? 0xc1 : 0xc0, modrmByte, ...dispBytes, cnt & 0xff];
  }

  if (mnemonic === "lea") {
    const d16 = registerIndex16(destination);
    const mem = parseMemoryOperand(operands[1] ?? "", symbols);
    if (d16 < 0 || !mem) return fail("LEA requires a 16-bit register and memory operand");
    return [0x8d, modrmMem(d16, mem), ...mem.dispBytes];
  }

  if (mnemonic === "jmp" || mnemonic === "call" || mnemonic in CONDITION_JUMP || mnemonic in LOOP_VARIANT) {
    const target = immediate(destination);
    if (target === null) return fail("Branch target must be a resolved label or offset");
    const size = statement.size!;
    const displacement = target - (offset + size);
    if (mnemonic === "jmp" || mnemonic === "call") return [mnemonic === "jmp" ? 0xe9 : 0xe8, ...wordBytes(displacement)];
    if (displacement < -128 || displacement > 127) return fail("Short branch target is out of range");
    return [CONDITION_JUMP[mnemonic] ?? LOOP_VARIANT[mnemonic], displacement & 0xff];
  }

  if (mnemonic === "test") {
    const d16 = registerIndex16(destination);
    const s16 = registerIndex16(source);
    const d8 = registerIndex8(destination);
    const s8 = registerIndex8(source);

    if (d16 >= 0 && s16 >= 0) return [0x85, modrm(s16, d16)];
    if (d8 >= 0 && s8 >= 0) return [0x84, modrm(s8, d8)];

    const memDest = parseMemoryOperand(operands[0] ?? "", symbols);
    const memSrc = parseMemoryOperand(operands[1] ?? "", symbols);

    if (d16 >= 0 && memSrc) return [0x85, modrmMem(d16, memSrc), ...memSrc.dispBytes];
    if (memDest && s16 >= 0) return [0x85, modrmMem(s16, memDest), ...memDest.dispBytes];
    if (d8 >= 0 && memSrc) return [0x84, modrmMem(d8, memSrc), ...memSrc.dispBytes];
    if (memDest && s8 >= 0) return [0x84, modrmMem(s8, memDest), ...memDest.dispBytes];

    const immVal = immediate(operands[1] ?? "");
    if (immVal !== null) {
      if (destination === "ax") return [0xa9, ...wordBytes(immVal)];
      if (destination === "al") return [0xa8, immVal & 0xff];
      if (d16 >= 0) return [0xf7, modrm(0, d16), ...wordBytes(immVal)];
      if (d8 >= 0) return [0xf6, modrm(0, d8), immVal & 0xff];
      if (memDest) {
        const width = memDest.explicitWidth ?? 1;
        return [
          width === 2 ? 0xf7 : 0xf6,
          modrmMem(0, memDest),
          ...memDest.dispBytes,
          ...(width === 2 ? wordBytes(immVal) : [immVal & 0xff]),
        ];
      }
    }
    return fail("TEST uses an unsupported operand pair");
  }

  if (mnemonic === "mov") {
    const d16 = registerIndex16(destination);
    const s16 = registerIndex16(source);
    const d8 = registerIndex8(destination);
    const s8 = registerIndex8(source);
    const segmentDest = SEGMENT[key(destination ?? "")];
    const segmentSrc = SEGMENT[key(source ?? "")];
    const memDest = parseMemoryOperand(operands[0] ?? "", symbols);
    const memSrc = parseMemoryOperand(operands[1] ?? "", symbols);

    if (d16 >= 0 && s16 >= 0) return [0x89, modrm(s16, d16)];
    if (d8 >= 0 && s8 >= 0) return [0x88, modrm(s8, d8)];
    if (segmentDest !== undefined && s16 >= 0) return [0x8e, modrm(segmentDest, s16)];
    if (d16 >= 0 && segmentSrc !== undefined) return [0x8c, modrm(segmentSrc, d16)];

    if (d16 >= 0 && memSrc) {
      if (destination === "ax" && memSrc.mod === 0 && memSrc.rm === 6) return [0xa1, ...memSrc.dispBytes];
      return [0x8b, modrmMem(d16, memSrc), ...memSrc.dispBytes];
    }
    if (d8 >= 0 && memSrc) {
      if (destination === "al" && memSrc.mod === 0 && memSrc.rm === 6) return [0xa0, ...memSrc.dispBytes];
      return [0x8a, modrmMem(d8, memSrc), ...memSrc.dispBytes];
    }
    if (memDest && s16 >= 0) {
      if (source === "ax" && memDest.mod === 0 && memDest.rm === 6) return [0xa3, ...memDest.dispBytes];
      return [0x89, modrmMem(s16, memDest), ...memDest.dispBytes];
    }
    if (memDest && s8 >= 0) {
      if (source === "al" && memDest.mod === 0 && memDest.rm === 6) return [0xa2, ...memDest.dispBytes];
      return [0x88, modrmMem(s8, memDest), ...memDest.dispBytes];
    }

    const value = immediate(operands[1] ?? "");
    if (d16 >= 0 && value !== null) return [0xb8 + d16, ...wordBytes(value)];
    if (d8 >= 0 && value !== null) return [0xb0 + d8, value & 0xff];
    if (memDest && value !== null) {
      const width = memDest.explicitWidth ?? 1;
      return [
        width === 2 ? 0xc7 : 0xc6,
        modrmMem(0, memDest),
        ...memDest.dispBytes,
        ...(width === 2 ? wordBytes(value) : [value & 0xff]),
      ];
    }
    return fail("MOV supports registers, immediate values, OFFSET, and memory operands");
  }

  if (GROUP1_ARITH.includes(mnemonic as (typeof GROUP1_ARITH)[number])) {
    const d16 = registerIndex16(destination);
    const s16 = registerIndex16(source);
    const d8 = registerIndex8(destination);
    const s8 = registerIndex8(source);
    const memDest = parseMemoryOperand(operands[0] ?? "", symbols);
    const memSrc = parseMemoryOperand(operands[1] ?? "", symbols);

    if (mnemonic === "xchg") {
      if (d16 >= 0 && s16 >= 0) return [0x87, modrm(s16, d16)];
      if (d8 >= 0 && s8 >= 0) return [0x86, modrm(s8, d8)];
      if (d16 >= 0 && memSrc) return [0x87, modrmMem(d16, memSrc), ...memSrc.dispBytes];
      if (memDest && s16 >= 0) return [0x87, modrmMem(s16, memDest), ...memDest.dispBytes];
      if (d8 >= 0 && memSrc) return [0x86, modrmMem(d8, memSrc), ...memSrc.dispBytes];
      if (memDest && s8 >= 0) return [0x86, modrmMem(s8, memDest), ...memDest.dispBytes];
      return fail("XCHG requires register or memory operands");
    }

    const baseOp = {
      add: 0x00, or: 0x08, and: 0x20, sub: 0x28, xor: 0x30, cmp: 0x38,
    }[mnemonic]!;
    const extension = {
      add: 0, or: 1, and: 4, sub: 5, xor: 6, cmp: 7,
    }[mnemonic]!;

    if (d16 >= 0 && s16 >= 0) return [baseOp | 0x01, modrm(s16, d16)];
    if (d8 >= 0 && s8 >= 0) return [baseOp | 0x00, modrm(s8, d8)];

    if (d16 >= 0 && memSrc) return [baseOp | 0x03, modrmMem(d16, memSrc), ...memSrc.dispBytes];
    if (d8 >= 0 && memSrc) return [baseOp | 0x02, modrmMem(d8, memSrc), ...memSrc.dispBytes];
    if (memDest && s16 >= 0) return [baseOp | 0x01, modrmMem(s16, memDest), ...memDest.dispBytes];
    if (memDest && s8 >= 0) return [baseOp | 0x00, modrmMem(s8, memDest), ...memDest.dispBytes];

    const value = immediate(operands[1] ?? "");
    if (d16 >= 0 && value !== null) return [0x81, modrm(extension, d16), ...wordBytes(value)];
    if (d8 >= 0 && value !== null) return [0x80, modrm(extension, d8), value & 0xff];
    if (memDest && value !== null) {
      const width = memDest.explicitWidth ?? 1;
      return [
        width === 2 ? 0x81 : 0x80,
        modrmMem(extension, memDest),
        ...memDest.dispBytes,
        ...(width === 2 ? wordBytes(value) : [value & 0xff]),
      ];
    }
    return fail(`${mnemonic.toUpperCase()} uses an unsupported operand pair`);
  }

  return fail(`Unsupported instruction: ${mnemonic.toUpperCase()}`);
}

function parseSource(source: string, diagnostics: AssemblerDiagnostic[]) {
  const lines = source.replace(/\r/g, "").split("\n");
  const statements: Statement[] = [];
  const symbols = new Map<string, number>();
  constantNames = new Set<string>();
  let origin = COM_ORIGIN;
  let lc = origin;
  let emitted = false;

  const isMasmStyle = lines.some((line) =>
    /^\s*\.(?:model|stack|data|code)\b/i.test(stripComment(line))
  );
  type SourceLine = { line: number; text: string; section: "code" | "data" };
  const sourceLines: SourceLine[] = [];
  let activeSection: "code" | "data" = "code";

  for (let index = 0; index < lines.length; index++) {
    const text = lines[index];
    const directive = stripComment(text);
    if (/^\.data\b/i.test(directive)) activeSection = "data";
    if (/^\.code\b/i.test(directive)) activeSection = "code";
    sourceLines.push({ line: index + 1, text, section: activeSection });
  }

  const orderedLines = isMasmStyle
    ? [
        ...sourceLines.filter((record) => record.section === "code"),
        ...sourceLines.filter((record) => record.section === "data"),
      ]
    : sourceLines;

  // Pre-scan constant numeric EQU directives (independent of location counter $)
  for (const record of sourceLines) {
    const rest = stripComment(record.text);
    const equMatch = rest.match(/^([a-z_][\w$]*)\s+equ\s+(.+)$/i);
    if (equMatch) {
      constantNames.add(key(equMatch[1]));
      const equValStr = equMatch[2].trim();
      if (!equValStr.includes("$")) {
        const val = resolve(equValStr, symbols);
        if (val !== null) {
          symbols.set(key(equMatch[1]), val);
        }
      }
    }
  }

  const define = (name: string, line: number, text: string) => {
    const symbol = key(name);
    if (symbols.has(symbol)) {
      diagnostics.push({ line, message: `Duplicate symbol: ${name}`, source: text });
    } else {
      symbols.set(symbol, lc);
    }
  };

  const emit = (statement: Statement, size: number) => {
    statement.offset = lc;
    statement.size = size;
    statements.push(statement);
    lc += size;
    emitted = true;
  };

  for (const record of orderedLines) {
    const { line, text } = record;
    let rest = stripComment(text);
    if (!rest) {
      statements.push({ line, text, kind: "ignore", operands: [] });
      continue;
    }

    const org = rest.match(/^org\s+(.+)$/i);
    if (org) {
      const nextOrigin = parseInteger(org[1]);
      if (nextOrigin === null || nextOrigin < 0 || nextOrigin > 0xffff) {
        diagnostics.push({ line, message: "ORG requires a 16-bit numeric offset", source: text });
      } else if (emitted) {
        diagnostics.push({ line, message: "ORG must appear before emitted COM bytes", source: text });
      } else {
        origin = nextOrigin;
        lc = nextOrigin;
      }
      statements.push({ line, text, kind: "ignore", operands: [] });
      continue;
    }

    if (
      /^\.(model|stack|data|code|[2-5]86p?)\b/i.test(rest) ||
      /^(end|assume|include|public|extrn)\b/i.test(rest)
    ) {
      statements.push({ line, text, kind: "ignore", operands: [] });
      continue;
    }

    const colonLabel = rest.match(/^([a-z_][\w$]*):\s*(.*)$/i);
    if (colonLabel) {
      define(colonLabel[1], line, text);
      rest = colonLabel[2].trim();
      if (!rest) {
        statements.push({ line, text, kind: "ignore", operands: [] });
        continue;
      }
    }

    const procMatch = rest.match(/^([a-z_][\w$]*)\s+proc\b/i);
    if (procMatch) {
      define(procMatch[1], line, text);
      statements.push({ line, text, kind: "ignore", operands: [] });
      continue;
    }
    if (/^[a-z_][\w$]*\s+endp\b/i.test(rest)) {
      statements.push({ line, text, kind: "ignore", operands: [] });
      continue;
    }

    const equMatch = rest.match(/^([a-z_][\w$]*)\s+equ\s+(.+)$/i);
    if (equMatch) {
      const equName = equMatch[1];
      const equValStr = equMatch[2].trim();
      let val: number | null = null;
      if (equValStr.startsWith("$")) {
        const diff = equValStr.match(/^\$\s*-\s*([a-z_][\w$]*)$/i);
        if (diff) {
          const baseSym = symbols.get(key(diff[1]));
          if (baseSym !== undefined) val = lc - baseSym;
        }
      } else {
        val = resolve(equValStr, symbols);
      }
      if (val !== null) {
        symbols.set(key(equName), val);
      } else {
        diagnostics.push({ line, message: `Unable to evaluate EQU expression: ${equValStr}`, source: text });
      }
      statements.push({ line, text, kind: "ignore", operands: [] });
      continue;
    }

    const namedData = rest.match(/^([a-z_][\w$]*)\s+(db|dw)\s+(.+)$/i);
    if (namedData) {
      define(namedData[1], line, text);
      const width: DataWidth = key(namedData[2]) === "db" ? 1 : 2;
      const operands = splitOperands(namedData[3]);
      emit(
        { line, text, kind: "data", label: key(namedData[1]), width, operands },
        dataSize(operands, width, symbols)
      );
      continue;
    }

    const bareData = rest.match(/^(db|dw)\s+(.+)$/i);
    if (bareData) {
      const width: DataWidth = key(bareData[1]) === "db" ? 1 : 2;
      const operands = splitOperands(bareData[2]);
      emit({ line, text, kind: "data", width, operands }, dataSize(operands, width, symbols));
      continue;
    }

    const match = rest.match(/^(\S+)(?:\s+(.*))?$/);
    if (!match) {
      diagnostics.push({ line, message: "Unable to parse source line", source: text });
      continue;
    }

    const mnemonic = key(match[1]);
    const operands = splitOperands(match[2] ?? "");
    const size = instructionSize(mnemonic, operands);
    if (size === null) {
      diagnostics.push({ line, message: `Unsupported instruction: ${match[1]}`, source: text });
    } else {
      emit({ line, text, kind: "instruction", mnemonic, operands }, size);
    }
  }

  return { lines, statements, symbols, origin, endOffset: lc };
}

/** Strict two-pass COM compiler. Pass 1 scans; Pass 2 resolves and emits. */
export function compileComProgram(source: string): AssembledProgram {
  const diagnostics: AssemblerDiagnostic[] = [];
  const first = parseSource(source, diagnostics);
  const image = new Uint8Array(Math.max(0, first.endOffset - first.origin));
  const sourceByOffset = new Map<number, number>();
  const executableOffsets = new Set<number>();
  const haltOffsets = new Set<number>();
  const dataRanges: ComDataRange[] = [];
  let firstDataOffset: number | null = null;

  for (const statement of first.statements) {
    if (statement.kind === "instruction" && statement.offset !== undefined) {
      const encoded = encodeInstruction(statement, first.symbols, diagnostics);
      if (encoded.length !== statement.size) {
        if (encoded.length) {
          diagnostics.push({
            line: statement.line,
            message: "Instruction size changed during Pass 2",
            source: statement.text,
          });
        }
        continue;
      }
      image.set(encoded, statement.offset - first.origin);
      sourceByOffset.set(statement.offset, statement.line);
      executableOffsets.add(statement.offset);
      if (
        statement.mnemonic === "hlt" ||
        (statement.mnemonic === "int" && resolve(statement.operands[0] ?? "", first.symbols) === 0x20)
      ) {
        haltOffsets.add(statement.offset);
      }
    }
    if (statement.kind === "data" && statement.offset !== undefined && statement.width) {
      const bytes = encodeData(statement.operands, statement.width, first.symbols, statement, diagnostics);
      if (bytes.length !== statement.size) continue;
      image.set(bytes, statement.offset - first.origin);
      dataRanges.push({
        start: statement.offset,
        end: statement.offset + bytes.length,
        label: statement.label,
      });
      firstDataOffset ??= statement.offset;
    }
  }

  return {
    bytes: image,
    diagnostics,
    sourceByOffset,
    source: first.lines,
    origin: first.origin,
    dataOffset: firstDataOffset ?? first.endOffset,
    symbols: first.symbols,
    executableOffsets,
    haltOffsets,
    dataRanges,
  };
}

/** Backward-compatible name used by the existing headless adapter. */
export const assembleMasmSubset = compileComProgram;
