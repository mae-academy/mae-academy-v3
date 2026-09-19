import { validateAddress } from '../domain/address';
import type {
  Branch,
  BranchId,
  CompareOp,
  ContactVariant,
  GridPlacement,
  LadNode,
  LogicWidth,
  Network,
  NodeId,
  NumericType,
  Operand,
} from '../domain/ast';
import type { HardwareProfile } from '../domain/hardware';
import { tokenize, type NetworkBlock, type Token } from './tokenizer';
import {
  LOGIC_STACK_DEPTH,
  result,
  timerResolution,
  type TranspileCode,
  type TranspileDiagnostic,
  type TranspileResult,
} from './types';

/**
 * Siemens S7-200 STL (AWL) -> LAD reconstruction.
 *
 * Three stages:
 *  1. `tokenize` turns text into per-network instruction tokens.
 *  2. A virtual logic stack replays the program's boolean algebra, rebuilding the series / parallel
 *     tree that the original ladder must have had. This mirrors the real CPU's 9-level stack, so
 *     LPS/LRD/LPP and ALD/OLD are reversed rather than guessed at.
 *  3. The layout synthesiser assigns grid coordinates and branch bounding boxes, producing a
 *     `Network` the scan engine can compile and the SVG renderer can draw without overlaps.
 *
 * Every failure is reported as a diagnostic carrying line and column; the parser never throws.
 */

// ---- reconstructed boolean algebra -------------------------------------------------------------

type Logic =
  | { readonly kind: 'always' }
  | { readonly kind: 'contact'; readonly variant: ContactVariant; readonly operand: string }
  | {
      readonly kind: 'compare';
      readonly op: CompareOp;
      readonly dataType: NumericType;
      readonly lhs: Operand;
      readonly rhs: Operand;
    }
  | { readonly kind: 'and'; readonly children: readonly Logic[] }
  | { readonly kind: 'or'; readonly children: readonly Logic[] };

/** Shared singleton so reference-identity prefix matching keeps working across LPS copies. */
const ALWAYS: Logic = { kind: 'always' };

/** The S7-200 always-on special memory bit, which the LAD generator synthesises for rail-fed coils. */
const ALWAYS_ON_BIT = 'SM0.0';

const andWith = (a: Logic, b: Logic): Logic => {
  if (a.kind === 'always') return b;
  if (b.kind === 'always') return a;
  return a.kind === 'and' ? { kind: 'and', children: [...a.children, b] } : { kind: 'and', children: [a, b] };
};

const orWith = (a: Logic, b: Logic): Logic =>
  a.kind === 'or' ? { kind: 'or', children: [...a.children, b] } : { kind: 'or', children: [a, b] };

/** Top-level conjuncts of a term, for common-prefix factoring. */
const conjuncts = (logic: Logic): readonly Logic[] => (logic.kind === 'and' ? logic.children : [logic]);

// ---- sinks -----------------------------------------------------------------------------------

/** A `LadNode` before the layout pass has assigned its grid placement. */
type ProtoNode = LadNode extends infer T ? (T extends LadNode ? Omit<T, 'layout'> : never) : never;

interface Sink {
  readonly proto: ProtoNode;
  /** Power-flow pins, top to bottom. `pins[0]` gates the box; the rest are counter control pins. */
  readonly pins: readonly Logic[];
}

// ---- parse context ---------------------------------------------------------------------------

class ParseContext {
  readonly diagnostics: TranspileDiagnostic[] = [];
  private nodes = 0;
  private branches = 0;

  constructor(
    readonly profile: HardwareProfile,
    public networkId: string,
  ) {}

  nextNodeId(): NodeId {
    this.nodes += 1;
    return `${this.networkId}_n${this.nodes}`;
  }

  nextBranchId(): BranchId {
    this.branches += 1;
    return `${this.networkId}_b${this.branches}`;
  }

  report(
    code: TranspileCode,
    severity: 'warning' | 'error',
    message: string,
    at?: { line: number; column: number },
  ): void {
    this.diagnostics.push({
      code,
      severity,
      message,
      networkId: this.networkId,
      ...(at === undefined ? {} : { line: at.line, column: at.column }),
    });
  }
}

// ---- operand parsing -------------------------------------------------------------------------

const NUMERIC_RE = /^[+-]?(\d+\.\d+|\d+|16#[0-9a-fA-F]+)$/;

function parseConstant(text: string): number | null {
  if (!NUMERIC_RE.test(text)) return null;
  const negative = text.startsWith('-');
  const body = text.replace(/^[+-]/, '');
  const value = body.toLowerCase().startsWith('16#') ? parseInt(body.slice(3), 16) : Number(body);
  return Number.isFinite(value) ? (negative ? -value : value) : null;
}

/** Validates a bit / word operand against the active profile. Returns the canonical text. */
function parseAddress(text: string, ctx: ParseContext, token: Token): string | null {
  const canonical = text.toUpperCase();
  if (canonical.startsWith('SM')) {
    ctx.report(
      'PROFILE_VIOLATION',
      'error',
      `Special memory "${canonical}" has no equivalent in ${ctx.profile.model}: the profile exposes only ${ctx.profile.allowedPrefixes.join(', ')}`,
      token,
    );
    return null;
  }
  const check = validateAddress(canonical, ctx.profile);
  if (!check.isValid) {
    ctx.report('PROFILE_VIOLATION', 'error', check.error ?? `Invalid address "${text}"`, token);
    return null;
  }
  return canonical;
}

function parseOperand(text: string, ctx: ParseContext, token: Token): Operand | null {
  const value = parseConstant(text);
  if (value !== null) return { kind: 'constant', value };
  const address = parseAddress(text, ctx, token);
  return address === null ? null : { kind: 'address', address };
}

const instanceNumber = (address: string): number => Number(address.replace(/^[A-Z]+/i, ''));

// ---- opcode tables ---------------------------------------------------------------------------

const COMPARE_RE = /^(LD|A|O)([BWDR])(==|<>|>=|<=|>|<)$/;
const MATH_RE = /^([+\-*/])([IDR])$/;
const WORD_LOGIC_RE = /^(WAND|WOR|WXOR)_(B|W|DW)$/;

const COMPARE_TYPE: Readonly<Record<string, NumericType>> = { B: 'BYTE', W: 'INT', D: 'DINT', R: 'REAL' };
const MATH_TYPE: Readonly<Record<string, NumericType>> = { I: 'INT', D: 'DINT', R: 'REAL' };
const MATH_FN: Readonly<Record<string, 'ADD' | 'SUB' | 'MUL' | 'DIV'>> = {
  '+': 'ADD',
  '-': 'SUB',
  '*': 'MUL',
  '/': 'DIV',
};
const MOVE_TYPE: Readonly<Record<string, NumericType>> = {
  MOVB: 'BYTE',
  MOVW: 'INT',
  MOVD: 'DINT',
  MOVR: 'REAL',
};
const LOGIC_WIDTH_BY_SUFFIX: Readonly<Record<string, LogicWidth>> = { B: 'BYTE', W: 'WORD', DW: 'DWORD' };

/** A pending `MOVW in1, out` awaiting the destructive operation that completes a LAD math box. */
interface PendingMove {
  readonly type: NumericType;
  readonly source: Operand;
  readonly dest: string;
  readonly gate: Logic;
  readonly token: Token;
}

// ---- network parser --------------------------------------------------------------------------

function parseNetwork(block: NetworkBlock, ctx: ParseContext): Network {
  const stack: Logic[] = [];
  const sinks: Sink[] = [];
  let pendingMove: PendingMove | null = null;

  const top = (token: Token): Logic | null => {
    const value = stack[stack.length - 1];
    if (value === undefined) {
      ctx.report('EMPTY_STACK', 'error', `"${token.opcode}" needs a preceding load instruction`, token);
      return null;
    }
    return value;
  };

  const replaceTop = (logic: Logic): void => {
    stack[stack.length - 1] = logic;
  };

  const pushLogic = (logic: Logic, token: Token): void => {
    stack.push(logic);
    if (stack.length > LOGIC_STACK_DEPTH) {
      ctx.report(
        'STACK_OVERFLOW',
        'error',
        `Logic stack reaches ${stack.length} levels; the S7-200 provides ${LOGIC_STACK_DEPTH}`,
        token,
      );
    }
  };

  const bitOperand = (token: Token): Logic | null => {
    const text = token.operands[0];
    if (text === undefined) {
      ctx.report('OPERAND_COUNT', 'error', `"${token.opcode}" requires an operand`, token);
      return null;
    }
    if (text.toUpperCase() === ALWAYS_ON_BIT) return ALWAYS; // rail-fed output, see lad-to-il
    const address = parseAddress(text, ctx, token);
    return address === null ? null : { kind: 'contact', variant: 'NO', operand: address };
  };

  const negate = (logic: Logic): Logic =>
    logic.kind === 'contact' ? { ...logic, variant: 'NC' } : logic;

  /** Applies EU/ED to the last contact of the accumulated term. */
  const applyEdge = (logic: Logic, variant: 'P' | 'N', token: Token): Logic | null => {
    if (logic.kind === 'contact') return { ...logic, variant };
    if (logic.kind === 'and') {
      const last = logic.children[logic.children.length - 1];
      if (last !== undefined && last.kind === 'contact') {
        return { kind: 'and', children: [...logic.children.slice(0, -1), { ...last, variant }] };
      }
    }
    ctx.report(
      'EDGE_SEMANTICS',
      'error',
      `"${token.opcode}" must follow a contact: the LAD model attaches edge detection to a named bit, ` +
        'so an edge applied to a parallel group or a box result cannot be drawn',
      token,
    );
    return null;
  };

  const flushPendingMove = (): void => {
    if (pendingMove === null) return;
    ctx.report(
      'ORPHAN_MOVE',
      'error',
      `"${pendingMove.token.opcode} ${pendingMove.source.kind === 'address' ? pendingMove.source.address : pendingMove.source.value}, ${pendingMove.dest}" ` +
        'has no LAD equivalent: the AST models data moves only as the seed of a math or word-logic box',
      pendingMove.token,
    );
    pendingMove = null;
  };

  for (const token of block.tokens) {
    const { opcode } = token;

    // ---- bit logic ---------------------------------------------------------------------
    const immediate = /^(LDN?|AN?|ON?)I$/.test(opcode);
    const base = immediate ? opcode.slice(0, -1) : opcode;
    if (immediate) {
      ctx.report(
        'NON_NATIVE_MNEMONIC',
        'warning',
        `Immediate contact "${opcode}" has no LAD counterpart in this model; treated as "${base}"`,
        token,
      );
    }

    if (base === 'LD' || base === 'LDN') {
      flushPendingMove();
      const logic = bitOperand(token);
      if (logic) pushLogic(base === 'LDN' ? negate(logic) : logic, token);
      continue;
    }
    if (base === 'A' || base === 'AN' || base === 'O' || base === 'ON') {
      flushPendingMove();
      const logic = bitOperand(token);
      const current = top(token);
      if (!logic || !current) continue;
      const term = base.endsWith('N') ? negate(logic) : logic;
      replaceTop(base.startsWith('A') ? andWith(current, term) : orWith(current, term));
      continue;
    }

    if (opcode === 'ALD' || opcode === 'OLD') {
      flushPendingMove();
      const right = stack.pop();
      const left = stack.pop();
      if (right === undefined || left === undefined) {
        ctx.report('STACK_UNDERFLOW', 'error', `"${opcode}" needs two logic levels on the stack`, token);
        continue;
      }
      stack.push(opcode === 'ALD' ? andWith(left, right) : orWith(left, right));
      continue;
    }

    if (opcode === 'LPS') {
      flushPendingMove();
      const current = top(token);
      if (current) pushLogic(current, token);
      continue;
    }
    if (opcode === 'LRD') {
      flushPendingMove();
      const second = stack[stack.length - 2];
      if (second === undefined) {
        ctx.report('STACK_UNDERFLOW', 'error', '"LRD" needs two logic levels on the stack', token);
        continue;
      }
      replaceTop(second);
      continue;
    }
    if (opcode === 'LPP') {
      flushPendingMove();
      if (stack.pop() === undefined) {
        ctx.report('STACK_UNDERFLOW', 'error', '"LPP" on an empty logic stack', token);
      }
      continue;
    }

    if (opcode === 'EU' || opcode === 'ED') {
      flushPendingMove();
      const current = top(token);
      if (!current) continue;
      const edged = applyEdge(current, opcode === 'EU' ? 'P' : 'N', token);
      if (edged) replaceTop(edged);
      continue;
    }

    // ---- comparison contacts -----------------------------------------------------------
    const compare = COMPARE_RE.exec(opcode);
    if (compare) {
      flushPendingMove();
      const mode = compare[1] ?? 'LD';
      const dataType = COMPARE_TYPE[compare[2] ?? 'W'] ?? 'INT';
      const op = (compare[3] ?? '==') as CompareOp;
      const lhsText = token.operands[0];
      const rhsText = token.operands[1];
      if (lhsText === undefined || rhsText === undefined) {
        ctx.report('OPERAND_COUNT', 'error', `"${opcode}" requires two operands`, token);
        continue;
      }
      const lhs = parseOperand(lhsText, ctx, token);
      const rhs = parseOperand(rhsText, ctx, token);
      if (!lhs || !rhs) continue;
      const term: Logic = { kind: 'compare', op, dataType, lhs, rhs };
      if (mode === 'LD') {
        pushLogic(term, token);
      } else {
        const current = top(token);
        if (!current) continue;
        replaceTop(mode === 'A' ? andWith(current, term) : orWith(current, term));
      }
      continue;
    }

    // ---- output instructions -----------------------------------------------------------
    const gate = (): Logic => stack[stack.length - 1] ?? ALWAYS;

    if (opcode === '=') {
      flushPendingMove();
      const target = token.operands[0] === undefined ? null : parseAddress(token.operands[0], ctx, token);
      if (target === null) {
        if (token.operands[0] === undefined) ctx.report('OPERAND_COUNT', 'error', '"=" requires a target bit', token);
        continue;
      }
      sinks.push({
        proto: { id: ctx.nextNodeId(), type: 'coil', variant: target.startsWith('M') ? 'INTERNAL' : 'OUT', target },
        pins: [gate()],
      });
      continue;
    }

    if (opcode === 'S' || opcode === 'R') {
      flushPendingMove();
      const targetText = token.operands[0];
      const target = targetText === undefined ? null : parseAddress(targetText, ctx, token);
      if (target === null) {
        if (targetText === undefined) ctx.report('OPERAND_COUNT', 'error', `"${opcode}" requires a target bit`, token);
        continue;
      }
      const countText = token.operands[1];
      const count = countText === undefined ? 1 : parseConstant(countText);
      if (count === null || !Number.isInteger(count) || count < 1) {
        ctx.report('INVALID_OPERAND', 'error', `"${opcode}" bit count must be a positive integer`, token);
        continue;
      }
      sinks.push({
        proto: {
          id: ctx.nextNodeId(),
          type: 'coil',
          variant: opcode === 'S' ? 'SET' : 'RESET',
          target,
          count,
        },
        pins: [gate()],
      });
      continue;
    }

    if (opcode === 'MCR' || opcode === 'MCRE') {
      flushPendingMove();
      sinks.push({
        proto: { id: ctx.nextNodeId(), type: 'coil', variant: 'MASTER', mode: opcode === 'MCR' ? 'begin' : 'end' },
        pins: [gate()],
      });
      continue;
    }

    // ---- timers ------------------------------------------------------------------------
    if (opcode === 'TON' || opcode === 'TOF' || opcode === 'TONR') {
      flushPendingMove();
      const instanceText = token.operands[0];
      const presetText = token.operands[1];
      if (instanceText === undefined || presetText === undefined) {
        ctx.report('OPERAND_COUNT', 'error', `"${opcode}" requires an instance and a preset`, token);
        continue;
      }
      const instance = parseAddress(instanceText, ctx, token);
      const preset = parseOperand(presetText, ctx, token);
      if (instance === null || preset === null) continue;
      if (!instance.startsWith('T')) {
        ctx.report('INVALID_OPERAND', 'error', `"${opcode}" needs a T instance, got "${instance}"`, token);
        continue;
      }
      const resolution = timerResolution(opcode, instanceNumber(instance));
      if (!resolution.valid) {
        ctx.report(
          'INVALID_OPERAND',
          'warning',
          `${instance} is not in the ${opcode} pool on an S7-200; assuming a ${resolution.timeBaseMs} ms time base`,
          token,
        );
      }
      sinks.push({
        proto: {
          id: ctx.nextNodeId(),
          type: 'timer',
          fn: opcode,
          instance,
          timeBaseMs: resolution.timeBaseMs,
          inputs: { IN: { kind: 'flow' }, PT: preset },
          outputs: {},
        },
        pins: [gate()],
      });
      continue;
    }

    // ---- counters ----------------------------------------------------------------------
    if (opcode === 'CTU' || opcode === 'CTD' || opcode === 'CTUD') {
      flushPendingMove();
      const instanceText = token.operands[0];
      const presetText = token.operands[1];
      if (instanceText === undefined || presetText === undefined) {
        ctx.report('OPERAND_COUNT', 'error', `"${opcode}" requires an instance and a preset`, token);
        continue;
      }
      const instance = parseAddress(instanceText, ctx, token);
      const preset = parseOperand(presetText, ctx, token);
      if (instance === null || preset === null) continue;
      if (!instance.startsWith('C')) {
        ctx.report('INVALID_OPERAND', 'error', `"${opcode}" needs a C instance, got "${instance}"`, token);
        continue;
      }

      // STL supplies the pins on the logic stack, deepest first; the mnemonic consumes them all.
      const pinCount = opcode === 'CTUD' ? 3 : 2;
      const pins: Logic[] = [];
      for (let i = 0; i < pinCount; i++) {
        const value = stack.pop();
        if (value === undefined) {
          ctx.report('STACK_UNDERFLOW', 'error', `"${opcode}" needs ${pinCount} logic levels for its pins`, token);
          break;
        }
        pins.unshift(value);
      }
      if (pins.length < pinCount) continue;

      const inputs =
        opcode === 'CTU'
          ? { CU: { kind: 'flow' as const }, R: { kind: 'flow' as const }, PV: preset }
          : opcode === 'CTD'
            ? { CD: { kind: 'flow' as const }, LD: { kind: 'flow' as const }, PV: preset }
            : {
                CU: { kind: 'flow' as const },
                CD: { kind: 'flow' as const },
                R: { kind: 'flow' as const },
                PV: preset,
              };
      sinks.push({
        // The union member is selected by `fn`, which TypeScript cannot narrow through this literal.
        proto: { id: ctx.nextNodeId(), type: 'counter', fn: opcode, instance, inputs, outputs: {} } as ProtoNode,
        pins,
      });
      continue;
    }

    // ---- data move (seed of a math / word-logic box) -----------------------------------
    const moveType = MOVE_TYPE[opcode];
    if (moveType !== undefined) {
      flushPendingMove();
      const sourceText = token.operands[0];
      const destText = token.operands[1];
      if (sourceText === undefined || destText === undefined) {
        ctx.report('OPERAND_COUNT', 'error', `"${opcode}" requires a source and a destination`, token);
        continue;
      }
      const source = parseOperand(sourceText, ctx, token);
      const dest = parseAddress(destText, ctx, token);
      if (!source || dest === null) continue;
      pendingMove = { type: moveType, source, dest, gate: gate(), token };
      continue;
    }

    // ---- arithmetic --------------------------------------------------------------------
    const math = MATH_RE.exec(opcode);
    if (math) {
      const fn = MATH_FN[math[1] ?? '+'] ?? 'ADD';
      const dataType = MATH_TYPE[math[2] ?? 'I'] ?? 'INT';
      const in2Text = token.operands[0];
      const outText = token.operands[1];
      if (in2Text === undefined || outText === undefined) {
        ctx.report('OPERAND_COUNT', 'error', `"${opcode}" requires an operand and a destination`, token);
        pendingMove = null;
        continue;
      }
      const in2 = parseOperand(in2Text, ctx, token);
      const out = parseAddress(outText, ctx, token);
      if (!in2 || out === null) {
        pendingMove = null;
        continue;
      }
      // `+I IN1, OUT` is OUT := IN1 + OUT, so a preceding MOV to the same destination supplies in1.
      const fused = pendingMove !== null && pendingMove.dest === out;
      const in1: Operand = fused && pendingMove !== null ? pendingMove.source : { kind: 'address', address: out };
      const pin = fused && pendingMove !== null ? pendingMove.gate : gate();
      pendingMove = null;
      sinks.push({
        proto: { id: ctx.nextNodeId(), type: 'math', fn, dataType, in1, in2, out },
        pins: [pin],
      });
      continue;
    }

    if (opcode === 'SQRT' || opcode === 'SIN') {
      flushPendingMove();
      const inText = token.operands[0];
      const outText = token.operands[1];
      if (inText === undefined || outText === undefined) {
        ctx.report('OPERAND_COUNT', 'error', `"${opcode}" requires a source and a destination`, token);
        continue;
      }
      const input = parseOperand(inText, ctx, token);
      const out = parseAddress(outText, ctx, token);
      if (!input || out === null) continue;
      sinks.push({
        proto: {
          id: ctx.nextNodeId(),
          type: 'math',
          fn: opcode === 'SQRT' ? 'SQR' : 'SIN',
          dataType: 'REAL',
          in: input,
          out,
        },
        pins: [gate()],
      });
      continue;
    }

    // ---- word logic --------------------------------------------------------------------
    const wordLogic = WORD_LOGIC_RE.exec(opcode);
    if (wordLogic) {
      const stem = wordLogic[1] ?? 'WAND';
      const width = LOGIC_WIDTH_BY_SUFFIX[wordLogic[2] ?? 'W'] ?? 'WORD';
      const in2Text = token.operands[0];
      const outText = token.operands[1];
      if (in2Text === undefined || outText === undefined) {
        ctx.report('OPERAND_COUNT', 'error', `"${opcode}" requires an operand and a destination`, token);
        pendingMove = null;
        continue;
      }
      const in2 = parseOperand(in2Text, ctx, token);
      const out = parseAddress(outText, ctx, token);
      if (!in2 || out === null) {
        pendingMove = null;
        continue;
      }
      const fused = pendingMove !== null && pendingMove.dest === out;
      const in1: Operand = fused && pendingMove !== null ? pendingMove.source : { kind: 'address', address: out };
      const pin = fused && pendingMove !== null ? pendingMove.gate : gate();
      pendingMove = null;
      sinks.push({
        proto: {
          id: ctx.nextNodeId(),
          type: 'wordLogic',
          fn: stem === 'WAND' ? 'W_AND' : stem === 'WOR' ? 'W_OR' : 'W_XOR',
          width,
          in1,
          in2,
          out,
        },
        pins: [pin],
      });
      continue;
    }

    ctx.report('UNKNOWN_OPCODE', 'error', `Unsupported instruction "${opcode}"`, token);
  }

  flushPendingMove();

  if (sinks.length === 0 && stack.length > 0) {
    ctx.report(
      'DANGLING_LOGIC',
      'warning',
      'Network computes a logic result but drives no output; the contacts are kept without a coil',
      block.tokens[0] ? { line: block.tokens[0].line, column: block.tokens[0].column } : undefined,
    );
  }
  if (stack.length > 1) {
    ctx.report(
      'UNBALANCED_STACK',
      'warning',
      `${stack.length} logic levels are still open at the end of the network; a missing ALD/OLD/LPP`,
      block.tokens[0] ? { line: block.tokens[0].line, column: block.tokens[0].column } : undefined,
    );
  }

  const dangling = sinks.length === 0 ? (stack[stack.length - 1] ?? null) : null;
  return synthesiseLayout(block, sinks, dangling, ctx);
}

// ---- layout synthesiser ------------------------------------------------------------------------

interface Placed {
  readonly nodes: readonly LadNode[];
  readonly branches: readonly Branch[];
  /** Columns consumed, so the next element in series knows where to start. */
  readonly width: number;
  /** Rows consumed, so stacked lanes do not collide. */
  readonly height: number;
}

const EMPTY_PLACED: Placed = { nodes: [], branches: [], width: 0, height: 1 };

const placement = (
  row: number,
  col: number,
  branchId: BranchId | null,
  rowSpan = 1,
): GridPlacement => ({ row, col, rowSpan, colSpan: 1, branchId });

/** Rebuilds a node with its grid placement; the cast restores the union member `proto` came from. */
const withLayout = (proto: ProtoNode, layout: GridPlacement): LadNode =>
  ({ ...proto, layout }) as LadNode;

function placeLogic(logic: Logic, row: number, col: number, owner: BranchId | null, ctx: ParseContext): Placed {
  switch (logic.kind) {
    case 'always':
      // The always-on bit draws nothing: the element it gates hangs straight off the power rail.
      return EMPTY_PLACED;

    case 'contact':
      return {
        nodes: [
          withLayout(
            { id: ctx.nextNodeId(), type: 'contact', variant: logic.variant, operand: logic.operand },
            placement(row, col, owner),
          ),
        ],
        branches: [],
        width: 1,
        height: 1,
      };

    case 'compare':
      return {
        nodes: [
          withLayout(
            { id: ctx.nextNodeId(), type: 'compare', op: logic.op, dataType: logic.dataType, lhs: logic.lhs, rhs: logic.rhs },
            placement(row, col, owner),
          ),
        ],
        branches: [],
        width: 1,
        height: 1,
      };

    case 'and':
      return placeSeries(logic.children, row, col, owner, ctx);

    case 'or': {
      const branchId = ctx.nextBranchId();
      const nodes: LadNode[] = [];
      const branches: Branch[] = [];
      let laneRow = row;
      let width = 1;

      for (const lane of logic.children) {
        const placedLane = placeLogic(lane, laneRow, col, branchId, ctx);
        nodes.push(...placedLane.nodes);
        branches.push(...placedLane.branches);
        width = Math.max(width, placedLane.width);
        laneRow += placedLane.height;
      }

      const height = Math.max(1, laneRow - row);
      branches.unshift({
        id: branchId,
        parentId: owner,
        splitCol: col,
        mergeCol: col + width - 1,
        rowStart: row,
        rowEnd: row + height - 1,
      });
      return { nodes, branches, width, height };
    }

    default: {
      const exhaustive: never = logic;
      void exhaustive;
      return EMPTY_PLACED;
    }
  }
}

function placeSeries(
  terms: readonly Logic[],
  row: number,
  col: number,
  owner: BranchId | null,
  ctx: ParseContext,
): Placed {
  const nodes: LadNode[] = [];
  const branches: Branch[] = [];
  let cursor = col;
  let height = 1;

  for (const term of terms) {
    const placed = placeLogic(term, row, cursor, owner, ctx);
    nodes.push(...placed.nodes);
    branches.push(...placed.branches);
    cursor += placed.width;
    height = Math.max(height, placed.height);
  }
  return { nodes, branches, width: cursor - col, height };
}

/** Longest run of leading conjuncts shared by every sink, matched by reference identity. */
function commonPrefix(sinks: readonly Sink[]): readonly Logic[] {
  const first = sinks[0];
  if (first === undefined) return [];
  let prefix = conjuncts(first.pins[0] ?? ALWAYS);
  for (const sink of sinks.slice(1)) {
    const other = conjuncts(sink.pins[0] ?? ALWAYS);
    let length = 0;
    while (length < prefix.length && length < other.length && prefix[length] === other[length]) length += 1;
    prefix = prefix.slice(0, length);
    if (prefix.length === 0) break;
  }
  return prefix;
}

function synthesiseLayout(
  block: NetworkBlock,
  sinks: readonly Sink[],
  dangling: Logic | null,
  ctx: ParseContext,
): Network {
  const nodes: LadNode[] = [];
  const branches: Branch[] = [];

  if (sinks.length === 0) {
    const placed = dangling === null ? EMPTY_PLACED : placeLogic(dangling, 0, 0, null, ctx);
    nodes.push(...placed.nodes);
    branches.push(...placed.branches);
    return assemble(block, nodes, branches, ctx);
  }

  // Factor out the logic every output shares, so it is drawn once on the main rung.
  const prefix = commonPrefix(sinks);
  const prefixPlaced = placeSeries(prefix, 0, 0, null, ctx);
  nodes.push(...prefixPlaced.nodes);
  branches.push(...prefixPlaced.branches);
  const afterPrefix = prefixPlaced.width;

  const remainders = sinks.map((sink) => conjuncts(sink.pins[0] ?? ALWAYS).slice(prefix.length));

  if (sinks.length === 1) {
    const sink = sinks[0];
    const remainder = remainders[0];
    if (sink === undefined || remainder === undefined) return assemble(block, nodes, branches, ctx);

    const placed = placeSeries(remainder, 0, afterPrefix, null, ctx);
    nodes.push(...placed.nodes);
    branches.push(...placed.branches);
    const boxNodes = placeSink(sink, 0, afterPrefix + placed.width, null, ctx);
    nodes.push(...boxNodes.nodes);
    branches.push(...boxNodes.branches);
    return assemble(block, nodes, branches, ctx);
  }

  // Several outputs: one lane each, sinks aligned so the coil column lines up.
  const branchId = ctx.nextBranchId();
  const laneWidth = Math.max(...remainders.map((terms) => terms.length), 0);
  const sinkCol = afterPrefix + laneWidth;
  let laneRow = 0;

  sinks.forEach((sink, index) => {
    const remainder = remainders[index] ?? [];
    const placed = placeSeries(remainder, laneRow, afterPrefix, branchId, ctx);
    nodes.push(...placed.nodes);
    branches.push(...placed.branches);
    const boxNodes = placeSink(sink, laneRow, sinkCol, branchId, ctx);
    nodes.push(...boxNodes.nodes);
    branches.push(...boxNodes.branches);
    laneRow += Math.max(placed.height, boxNodes.height);
  });

  branches.push({
    id: branchId,
    parentId: null,
    splitCol: afterPrefix,
    mergeCol: sinkCol,
    rowStart: 0,
    rowEnd: Math.max(0, laneRow - 1),
  });
  return assemble(block, nodes, branches, ctx);
}

/** Places a sink box plus, for counters, the chains feeding its lower pins. */
function placeSink(sink: Sink, row: number, col: number, owner: BranchId | null, ctx: ParseContext): Placed {
  const pinCount = sink.pins.length;
  // Boxes with operand lists are drawn two rows tall so every operand has room; coils stay one row.
  const rowSpan = Math.max(
    pinCount,
    sink.proto.type === 'math' || sink.proto.type === 'wordLogic' || sink.proto.type === 'timer' ? 2 : 1,
  );
  const nodes: LadNode[] = [];
  const branches: Branch[] = [];

  // Pin chains sit on the rows below the box and must end left of it, which is where the engine
  // looks for them; the box shifts right if a chain would not otherwise fit.
  const extras: Placed[] = [];
  let required = col;
  for (let pin = 1; pin < pinCount; pin++) {
    const logic = sink.pins[pin] ?? ALWAYS;
    const placed = placeSeries(conjuncts(logic), row + pin, 0, owner, ctx);
    extras.push(placed);
    required = Math.max(required, placed.width);
  }
  for (const extra of extras) {
    nodes.push(...extra.nodes);
    branches.push(...extra.branches);
  }

  nodes.push(withLayout(sink.proto, placement(row, required, owner, rowSpan)));
  return { nodes, branches, width: required - col + 1, height: rowSpan };
}

function assemble(block: NetworkBlock, nodes: readonly LadNode[], branches: readonly Branch[], ctx: ParseContext): Network {
  let rows = 1;
  let cols = 1;
  for (const node of nodes) {
    rows = Math.max(rows, node.layout.row + node.layout.rowSpan);
    cols = Math.max(cols, node.layout.col + node.layout.colSpan);
  }
  for (const branch of branches) {
    rows = Math.max(rows, branch.rowEnd + 1);
    cols = Math.max(cols, branch.mergeCol + 1);
  }
  const limits = ctx.profile.limits;
  if (rows > limits.maxGridRows || cols > limits.maxGridCols) {
    ctx.report(
      'PROFILE_VIOLATION',
      'warning',
      `Reconstructed network needs ${rows}x${cols} cells, beyond the ${limits.maxGridRows}x${limits.maxGridCols} editor grid of ${ctx.profile.model}`,
    );
  }
  return {
    id: ctx.networkId,
    ...(block.title === undefined ? {} : { title: block.title }),
    grid: { rows, cols },
    nodes,
    branches,
  };
}

// ---- entry point -------------------------------------------------------------------------------

/** STL source text -> LAD networks, validated against `profile`. */
export function ilToLad(stlSource: string, profile: HardwareProfile): TranspileResult<Network[]> {
  const { blocks, diagnostics } = tokenize(stlSource);
  const all: TranspileDiagnostic[] = [...diagnostics];
  const networks: Network[] = [];

  for (const block of blocks) {
    const ctx = new ParseContext(profile, `network_${block.index}`);
    networks.push(parseNetwork(block, ctx));
    all.push(...ctx.diagnostics);
  }

  return result(networks, all);
}
