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
type Statement = { line: number; text: string; kind: StatementKind; mnemonic?: string; operands: string[]; label?: string; width?: DataWidth; offset?: number; size?: number; };

const key = (value: string) => value.trim().toLowerCase();
const wordBytes = (value: number) => [value & 0xff, (value >>> 8) & 0xff];
const modrm = (operation: number, destination: number) => 0xc0 | (operation << 3) | destination;
const isReg16 = (value?: string) => REG16.includes(key(value ?? "") as typeof REG16[number]);
const isReg8 = (value?: string) => REG8.includes(key(value ?? "") as typeof REG8[number]);
const registerIndex16 = (value?: string) => REG16.indexOf(key(value ?? "") as typeof REG16[number]);
const registerIndex8 = (value?: string) => REG8.indexOf(key(value ?? "") as typeof REG8[number]);

function stripComment(line: string) {
  let quoted = false;
  for (let index = 0; index < line.length; index++) { if (line[index] === "'") quoted = !quoted; if (line[index] === ";" && !quoted) return line.slice(0, index).trim(); }
  return line.trim();
}
function splitOperands(source: string) {
  const values: string[] = []; let current = ""; let quoted = false;
  for (const character of source) { if (character === "'") quoted = !quoted; if (character === "," && !quoted) { values.push(current.trim()); current = ""; } else current += character; }
  if (current.trim()) values.push(current.trim()); return values;
}
function parseInteger(raw: string) {
  const source = raw.trim().toLowerCase(); const normalized = source.replace(/^0x/, "").replace(/h$/, "");
  if (!/^[0-9a-f]+$/i.test(normalized)) return null;
  return Number.parseInt(normalized, source.endsWith("h") || source.startsWith("0x") ? 16 : 10);
}
function bracketSymbol(raw: string) { const matched = raw.trim().match(/^\[(.+)]$/); return matched ? matched[1].trim() : null; }
function resolve(raw: string, symbols: Map<string, number>): number | null {
  const source = raw.trim(); const lowered = key(source);
  if (lowered === "@data") return COM_SEGMENT;
  const offset = source.match(/^offset\s+([a-z_][\w$]*)$/i); if (offset) return symbols.get(key(offset[1])) ?? null;
  const bracketed = bracketSymbol(source); if (bracketed) return resolve(bracketed, symbols);
  const arithmetic = source.match(/^([a-z_][\w$]*|(?:0x)?[0-9a-f]+h?)\s*([+-])\s*((?:0x)?[0-9a-f]+h?)$/i);
  if (arithmetic) { const base: number | null = resolve(arithmetic[1], symbols); const adjustment = parseInteger(arithmetic[3]); return base === null || adjustment === null ? null : base + (arithmetic[2] === "+" ? adjustment : -adjustment); }
  const literal = parseInteger(source); return literal ?? symbols.get(lowered) ?? null;
}
function dataSize(operands: string[], width: DataWidth) { return operands.reduce((size, operand) => { const quoted = operand.match(/^'(.*)'$/); return size + (quoted ? Array.from(quoted[1]).length * width : width); }, 0); }
function encodeData(operands: string[], width: DataWidth, symbols: Map<string, number>, statement: Statement, diagnostics: AssemblerDiagnostic[]) {
  const bytes: number[] = [];
  for (const operand of operands) {
    const quoted = operand.match(/^'(.*)'$/);
    if (quoted) { for (const character of Array.from(quoted[1])) { const value = character.charCodeAt(0); bytes.push(width === 1 ? value & 0xff : value & 0xff, ...(width === 2 ? [(value >>> 8) & 0xff] : [])); } continue; }
    if (operand.trim() === "?") { bytes.push(...Array(width).fill(0)); continue; }
    const value = resolve(operand, symbols); if (value === null) { diagnostics.push({ line: statement.line, message: `Unresolved ${width === 1 ? "DB" : "DW"} initializer: ${operand}`, source: statement.text }); continue; }
    bytes.push(...(width === 1 ? [value & 0xff] : wordBytes(value)));
  }
  return bytes;
}
function instructionSize(mnemonic: string, operands: string[]) {
  const op = key(mnemonic); const destination = operands[0]; const source = operands[1];
  if (["nop", "hlt", "ret", "push", "pop", "inc", "dec"].includes(op)) return 1;
  if (op === "int") return 2;
  if (["jmp", "call"].includes(op)) return 3;
  if (["jz", "je", "jnz", "jne", "loop"].includes(op)) return 2;
  if (op === "mov") {
    const destinationMemory = bracketSymbol(destination ?? "") !== null; const sourceMemory = bracketSymbol(source ?? "") !== null;
    if ((destinationMemory && key(source ?? "") === "ax") || (sourceMemory && key(destination ?? "") === "ax")) return 3;
    if (destinationMemory || sourceMemory) return 4;
    if (isReg16(destination) && !isReg16(source)) return 3;
    if (isReg8(destination) && !isReg8(source)) return 2;
    return 2;
  }
  if (["add", "sub", "cmp", "xchg"].includes(op)) {
    if (isReg16(destination) && !isReg16(source)) return 4;
    if (isReg8(destination) && !isReg8(source)) return 3;
    return 2;
  }
  return null;
}

function encodeInstruction(statement: Statement, symbols: Map<string, number>, diagnostics: AssemblerDiagnostic[]): number[] {
  const mnemonic = statement.mnemonic!; const operands = statement.operands; const destination = key(operands[0] ?? ""); const source = key(operands[1] ?? "");
  const fail = (message: string) => { diagnostics.push({ line: statement.line, message, source: statement.text }); return [] as number[]; };
  const immediate = (value: string) => resolve(value, symbols);
  const offset = statement.offset!;
  if (mnemonic === "nop") return [0x90]; if (mnemonic === "hlt") return [0xf4]; if (mnemonic === "ret") return [0xc3];
  if (mnemonic === "push" || mnemonic === "pop") { const index = registerIndex16(destination); return index < 0 ? fail("PUSH/POP requires a 16-bit register") : [(mnemonic === "push" ? 0x50 : 0x58) + index]; }
  if (mnemonic === "inc" || mnemonic === "dec") { const index = registerIndex16(destination); return index < 0 ? fail("INC/DEC requires a 16-bit register") : [(mnemonic === "inc" ? 0x40 : 0x48) + index]; }
  if (mnemonic === "int") { const interrupt = immediate(destination); return interrupt === null ? fail("INT requires a numeric interrupt") : [0xcd, interrupt & 0xff]; }
  if (["jmp", "call", "jz", "je", "jnz", "jne", "loop"].includes(mnemonic)) {
    const target = immediate(destination); if (target === null) return fail("Branch target must be a resolved label or offset");
    const size = statement.size!; const displacement = target - (offset + size);
    if (mnemonic === "jmp" || mnemonic === "call") return [mnemonic === "jmp" ? 0xe9 : 0xe8, ...wordBytes(displacement)];
    if (displacement < -128 || displacement > 127) return fail("Short branch target is out of range");
    return [["jz", "je"].includes(mnemonic) ? 0x74 : ["jnz", "jne"].includes(mnemonic) ? 0x75 : 0xe2, displacement & 0xff];
  }
  if (mnemonic === "mov") {
    const d16 = registerIndex16(destination); const s16 = registerIndex16(source); const d8 = registerIndex8(destination); const s8 = registerIndex8(source); const segment = SEGMENT[destination]; const destinationMemory = bracketSymbol(operands[0] ?? ""); const sourceMemory = bracketSymbol(operands[1] ?? "");
    if (d16 >= 0 && sourceMemory) { const address = immediate(sourceMemory); if (address === null) return fail(`Unresolved memory symbol: ${sourceMemory}`); return destination === "ax" ? [0xa1, ...wordBytes(address)] : [0x8b, 0x06 | (d16 << 3), ...wordBytes(address)]; }
    if (destinationMemory && s16 >= 0) { const address = immediate(destinationMemory); if (address === null) return fail(`Unresolved memory symbol: ${destinationMemory}`); return source === "ax" ? [0xa3, ...wordBytes(address)] : [0x89, 0x06 | (s16 << 3), ...wordBytes(address)]; }
    if (d16 >= 0 && s16 >= 0) return [0x89, modrm(s16, d16)];
    if (d8 >= 0 && s8 >= 0) return [0x88, modrm(s8, d8)];
    if (segment !== undefined && s16 >= 0) return [0x8e, modrm(segment, s16)];
    const value = immediate(operands[1] ?? "");
    if (d16 >= 0 && value !== null) return [0xb8 + d16, ...wordBytes(value)];
    if (d8 >= 0 && value !== null) return [0xb0 + d8, value & 0xff];
    return fail("MOV supports registers, immediate values, OFFSET, and direct [symbol] memory operands");
  }
  if (["add", "sub", "cmp", "xchg"].includes(mnemonic)) {
    const d16 = registerIndex16(destination); const s16 = registerIndex16(source); const d8 = registerIndex8(destination); const s8 = registerIndex8(source);
    const opcode = { add: 0x01, sub: 0x29, cmp: 0x39, xchg: 0x87 }[mnemonic]!;
    if (d16 >= 0 && s16 >= 0) return [opcode, modrm(s16, d16)];
    if (mnemonic !== "xchg" && d8 >= 0 && s8 >= 0) return [{ add: 0x00, sub: 0x28, cmp: 0x38 }[mnemonic]!, modrm(s8, d8)];
    const value = immediate(operands[1] ?? ""); const extension = { add: 0, sub: 5, cmp: 7 }[mnemonic];
    if (mnemonic !== "xchg" && d16 >= 0 && value !== null) return [0x81, modrm(extension ?? 0, d16), ...wordBytes(value)];
    if (mnemonic !== "xchg" && d8 >= 0 && value !== null) return [0x80, modrm(extension ?? 0, d8), value & 0xff];
    return fail(`${mnemonic.toUpperCase()} uses an unsupported operand pair`);
  }
  return fail(`Unsupported instruction: ${mnemonic.toUpperCase()}`);
}

function parseSource(source: string, diagnostics: AssemblerDiagnostic[]) {
  const lines = source.replace(/\r/g, "").split("\n"); const statements: Statement[] = []; const symbols = new Map<string, number>(); let origin = COM_ORIGIN; let lc = origin; let emitted = false;
  const isMasmStyle = lines.some((line) => /^\s*\.(?:model|stack|data|code)\b/i.test(stripComment(line)));
  type SourceLine = { line: number; text: string; section: "code" | "data" };
  const sourceLines: SourceLine[] = []; let activeSection: "code" | "data" = "code";
  for (let index = 0; index < lines.length; index++) {
    const text = lines[index]; const directive = stripComment(text);
    if (/^\.data\b/i.test(directive)) activeSection = "data";
    if (/^\.code\b/i.test(directive)) activeSection = "code";
    sourceLines.push({ line: index + 1, text, section: activeSection });
  }
  // MASM declares .data before .code, but a flat COM image must start with code at 0100h.
  // A direct `org 100h` source is intentionally left in written order.
  const orderedLines = isMasmStyle ? [...sourceLines.filter((record) => record.section === "code"), ...sourceLines.filter((record) => record.section === "data")] : sourceLines;
  const define = (name: string, line: number, text: string) => { const symbol = key(name); if (symbols.has(symbol)) diagnostics.push({ line, message: `Duplicate symbol: ${name}`, source: text }); else symbols.set(symbol, lc); };
  const emit = (statement: Statement, size: number) => { statement.offset = lc; statement.size = size; statements.push(statement); lc += size; emitted = true; };
  for (const record of orderedLines) {
    const { line, text } = record; let rest = stripComment(text); if (!rest) { statements.push({ line, text, kind: "ignore", operands: [] }); continue; }
    const org = rest.match(/^org\s+(.+)$/i);
    if (org) { const nextOrigin = parseInteger(org[1]); if (nextOrigin === null || nextOrigin < 0 || nextOrigin > 0xffff) diagnostics.push({ line, message: "ORG requires a 16-bit numeric offset", source: text }); else if (emitted) diagnostics.push({ line, message: "ORG must appear before emitted COM bytes", source: text }); else { origin = nextOrigin; lc = nextOrigin; } statements.push({ line, text, kind: "ignore", operands: [] }); continue; }
    if (/^\.(model|stack|data|code)\b/i.test(rest) || /^end\b/i.test(rest)) { statements.push({ line, text, kind: "ignore", operands: [] }); continue; }
    const colonLabel = rest.match(/^([a-z_][\w$]*):\s*(.*)$/i);
    if (colonLabel) { define(colonLabel[1], line, text); rest = colonLabel[2].trim(); if (!rest) { statements.push({ line, text, kind: "ignore", operands: [] }); continue; } }
    const namedData = rest.match(/^([a-z_][\w$]*)\s+(db|dw)\s+(.+)$/i);
    if (namedData) { define(namedData[1], line, text); const width: DataWidth = key(namedData[2]) === "db" ? 1 : 2; const operands = splitOperands(namedData[3]); emit({ line, text, kind: "data", label: key(namedData[1]), width, operands }, dataSize(operands, width)); continue; }
    const bareData = rest.match(/^(db|dw)\s+(.+)$/i);
    if (bareData) { const width: DataWidth = key(bareData[1]) === "db" ? 1 : 2; const operands = splitOperands(bareData[2]); emit({ line, text, kind: "data", width, operands }, dataSize(operands, width)); continue; }
    if (/^[a-z_][\w$]*\s+proc\b/i.test(rest) || /^[a-z_][\w$]*\s+endp\b/i.test(rest)) { statements.push({ line, text, kind: "ignore", operands: [] }); continue; }
    const match = rest.match(/^(\S+)(?:\s+(.*))?$/); if (!match) { diagnostics.push({ line, message: "Unable to parse source line", source: text }); continue; }
    const mnemonic = key(match[1]); const operands = splitOperands(match[2] ?? ""); const size = instructionSize(mnemonic, operands);
    if (size === null) diagnostics.push({ line, message: `Unsupported instruction: ${match[1]}`, source: text }); else emit({ line, text, kind: "instruction", mnemonic, operands }, size);
  }
  return { lines, statements, symbols, origin, endOffset: lc };
}

/** Strict two-pass COM compiler. Pass 1 scans; Pass 2 resolves and emits. */
export function compileComProgram(source: string): AssembledProgram {
  const diagnostics: AssemblerDiagnostic[] = []; const first = parseSource(source, diagnostics); const image = new Uint8Array(Math.max(0, first.endOffset - first.origin)); const sourceByOffset = new Map<number, number>(); const executableOffsets = new Set<number>(); const haltOffsets = new Set<number>(); const dataRanges: ComDataRange[] = []; let firstDataOffset: number | null = null;
  for (const statement of first.statements) {
    if (statement.kind === "instruction" && statement.offset !== undefined) {
      const encoded = encodeInstruction(statement, first.symbols, diagnostics); if (encoded.length !== statement.size) { if (encoded.length) diagnostics.push({ line: statement.line, message: "Instruction size changed during Pass 2", source: statement.text }); continue; }
      image.set(encoded, statement.offset - first.origin); sourceByOffset.set(statement.offset, statement.line); executableOffsets.add(statement.offset); if (statement.mnemonic === "hlt" || (statement.mnemonic === "int" && resolve(statement.operands[0] ?? "", first.symbols) === 0x20)) haltOffsets.add(statement.offset);
    }
    if (statement.kind === "data" && statement.offset !== undefined && statement.width) {
      const bytes = encodeData(statement.operands, statement.width, first.symbols, statement, diagnostics); if (bytes.length !== statement.size) continue;
      image.set(bytes, statement.offset - first.origin); dataRanges.push({ start: statement.offset, end: statement.offset + bytes.length, label: statement.label }); firstDataOffset ??= statement.offset;
    }
  }
  return { bytes: image, diagnostics, sourceByOffset, source: first.lines, origin: first.origin, dataOffset: firstDataOffset ?? first.endOffset, symbols: first.symbols, executableOffsets, haltOffsets, dataRanges };
}

/** Backward-compatible name used by the existing headless adapter. */
export const assembleMasmSubset = compileComProgram;
