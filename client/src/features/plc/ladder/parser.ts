/**
 * PLC Ladder backend contract.
 * Parser only produces the documented AST; it has no dependency on an editor or visual layout.
 * Grammar: rung := circuit ';'; branch := '[' circuit ('|' circuit)+ ']'; instruction := NAME '(' operands? ')'.
 */
import { parsePlcNumber } from './numeric';
import type { LDBranch, LDCircuit, LDIndexedAccess, LDInstruction, LDMemberAccess, LDParameter, LDProgram, LDRung, LDTagReference, PlcDiagnostic, PlcInstructionType, SourceLocation } from './types';

const INSTRUCTIONS = new Set<PlcInstructionType>([
  'XIC', 'XIO', 'ONS', 'OSR', 'OSF', 'OTE', 'OTL', 'OTU', 'AFI', 'NOP',
  'TON', 'TOF', 'RTO', 'CTU', 'CTD', 'CTUD', 'RES', 'TONR', 'TOFR', 'RTOR', 'OSRI', 'OSFI',
  'MOV', 'ADD', 'SUB', 'MUL', 'DIV', 'MOD', 'NEG', 'ABS', 'SQRT', 'SIN', 'COS', 'TAN',
  'AND', 'OR', 'XOR', 'NOT', 'MVM', 'BTD', 'EQU', 'NEQ', 'GRT', 'GEQ', 'LES', 'LEQ', 'LIM',
]);

class LadderParser {
  private offset = 0;
  private rung = 0;
  readonly diagnostics: PlcDiagnostic[] = [];
  constructor(private readonly source: string) {}

  parse(): LDProgram {
    const rungs: LDRung[] = [];
    this.skipTrivia();
    while (!this.end()) {
      const start = this.offset;
      const circuit = this.parseCircuit(new Set([';']));
      this.skipTrivia();
      if (this.peek() !== ';') this.error('LD-PARSE-001', 'Each Ladder rung must terminate with a semicolon.');
      else this.offset += 1;
      if (circuit.elements.length) {
        const index = this.rung++;
        rungs.push({ type: 'LDRung', index, circuit, nodeId: `r${index}`, location: this.location(start, this.offset) });
      }
      this.skipTrivia();
      if (this.offset === start) break;
    }
    return { type: 'LDProgram', rungs };
  }

  private parseCircuit(stops: Set<string>, path = `r${this.rung}`): LDCircuit {
    const start = this.offset;
    const elements: LDCircuit['elements'] = [];
    while (!this.end()) {
      this.skipTrivia();
      if (stops.has(this.peek())) break;
      const elementIndex = elements.length;
      if (this.peek() === '[') elements.push(this.parseBranch(`${path}.b${elementIndex}`));
      else {
        const instruction = this.parseInstruction(`${path}.i${elementIndex}`);
        if (instruction) elements.push(instruction); else this.recover(stops);
      }
      this.skipTrivia();
    }
    return { type: 'LDCircuit', elements, nodeId: `${path}.c`, location: this.location(start, this.offset) };
  }

  private parseBranch(path: string): LDBranch {
    const start = this.offset;
    this.offset += 1;
    const circuits: LDCircuit[] = [];
    do {
      circuits.push(this.parseCircuit(new Set(['|', ']']), `${path}.l${circuits.length}`));
      this.skipTrivia();
      if (this.peek() === '|') this.offset += 1;
      else break;
    } while (!this.end());
    if (circuits.length < 2) this.error('LD-PARSE-002', 'A parallel branch requires at least two legs.');
    if (this.peek() !== ']') this.error('LD-PARSE-003', 'A parallel branch must terminate with ].');
    else this.offset += 1;
    return { type: 'LDBranch', circuits, nodeId: path, location: this.location(start, this.offset) };
  }

  private parseInstruction(path: string): LDInstruction | null {
    const start = this.offset;
    const name = this.readIdentifier();
    if (!name) { this.error('LD-PARSE-004', 'Expected a Ladder instruction.'); return null; }
    const instructionType = name.toUpperCase() as PlcInstructionType;
    if (!INSTRUCTIONS.has(instructionType)) this.error('LD-PARSE-005', `Unsupported Ladder instruction ${name}.`);
    this.skipTrivia();
    if (this.peek() !== '(') { this.error('LD-PARSE-006', `${name} requires parenthesized operands.`); return null; }
    this.offset += 1;
    const parameters: LDParameter[] = [];
    this.skipTrivia();
    while (!this.end() && this.peek() !== ')') {
      const parameter = this.parseParameter(`${path}.p${parameters.length}`);
      if (parameter) parameters.push(parameter);
      this.skipTrivia();
      if (this.peek() === ',') { this.offset += 1; this.skipTrivia(); }
      else if (this.peek() !== ')') this.error('LD-PARSE-007', `Expected , or ) after operand in ${name}.`);
    }
    if (this.peek() !== ')') this.error('LD-PARSE-008', `${name} is missing a closing ).`);
    else this.offset += 1;
    return { type: 'LDInstruction', instructionType, parameters, nodeId: path, location: this.location(start, this.offset) };
  }

  private parseParameter(path: string): LDParameter | null {
    const start = this.offset;
    const tokenStart = this.offset;
    let depth = 0;
    while (!this.end()) {
      const char = this.peek();
      if (char === '[') depth += 1;
      if (char === ']') depth -= 1;
      if (depth === 0 && (char === ',' || char === ')')) break;
      this.offset += 1;
    }
    const raw = this.source.slice(tokenStart, this.offset).trim();
    if (!raw) { this.error('LD-PARSE-009', 'Empty instruction operand.'); return null; }
    return this.parameterFromText(raw, path, this.location(start, this.offset));
  }

  private parameterFromText(raw: string, path: string, location: SourceLocation): LDParameter | null {
    const numeric = parsePlcNumber(raw);
    if (numeric) return { type: 'LDNumericLiteral', ...numeric, nodeId: path, location };
    const index = /^(.+)\[(.+)\]$/.exec(raw);
    if (index) {
      const target = this.parameterFromText(index[1].trim(), `${path}.target`, location);
      const subscript = this.parameterFromText(index[2].trim(), `${path}.s`, location);
      if (!target || !subscript) return null;
      const result: LDIndexedAccess = { type: 'LDIndexedAccess', target, index: subscript, nodeId: path, location };
      return result;
    }
    const member = /^(.+)\.([A-Za-z_][A-Za-z0-9_]*)$/.exec(raw);
    if (member) {
      const object = this.parameterFromText(member[1].trim(), `${path}.object`, location);
      if (!object) return null;
      const result: LDMemberAccess = { type: 'LDMemberAccess', object, member: member[2], nodeId: `${path}.m:${member[2].toLowerCase()}`, location };
      return result;
    }
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(raw)) { this.error('LD-PARSE-010', `Invalid operand ${raw}.`); return null; }
    const result: LDTagReference = { type: 'LDTagReference', name: raw, nodeId: path, location };
    return result;
  }

  private readIdentifier(): string | null {
    this.skipTrivia();
    const match = /^[A-Za-z_][A-Za-z0-9_]*/.exec(this.source.slice(this.offset));
    if (!match) return null;
    this.offset += match[0].length;
    return match[0];
  }

  private skipTrivia() {
    while (!this.end()) {
      if (/\s/.test(this.peek())) { this.offset += 1; continue; }
      if (this.source.slice(this.offset, this.offset + 2) === '//') { const next = this.source.indexOf('\n', this.offset); this.offset = next === -1 ? this.source.length : next + 1; continue; }
      break;
    }
  }
  private recover(stops: Set<string>) { while (!this.end() && !stops.has(this.peek()) && !/[A-Za-z_[]/.test(this.peek())) this.offset += 1; }
  private peek(): string { return this.source[this.offset] ?? ''; }
  private end(): boolean { return this.offset >= this.source.length; }
  private location(start: number, end: number): SourceLocation { const prior = this.source.slice(0, start); const line = prior.split('\n').length; return { start, end, line, column: start - prior.lastIndexOf('\n') }; }
  private error(code: string, message: string) { this.diagnostics.push({ severity: 'error', code, message, location: this.location(this.offset, this.offset) }); }
}

export function parseLadder(source: string): { ast: LDProgram; diagnostics: PlcDiagnostic[] } {
  const parser = new LadderParser(source);
  return { ast: parser.parse(), diagnostics: parser.diagnostics };
}
