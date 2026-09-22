import type {
  CoilNode,
  CompareNode,
  ContactNode,
  CounterNode,
  LadNode,
  MathNode,
  Network,
  NetworkId,
  NodeId,
  NumericType,
  Operand,
  TimerNode,
  WordLogicNode,
} from '../domain/ast';
import { buildNetworkTree, type EvalTree } from '../engine/compiler';
import {
  LOGIC_STACK_DEPTH,
  LOGIC_SUFFIX,
  MATH_MNEMONIC,
  MOVE_MNEMONIC,
  TYPE_LETTER,
  result,
  type LoadMode,
  type TranspileCode,
  type TranspileDiagnostic,
  type TranspileResult,
} from './types';

/**
 * LAD -> Siemens S7-200 STL (AWL) generator.
 *
 * The grid topology is read through `buildNetworkTree`, the same function the scan engine uses, so
 * the emitted instruction order can never disagree with what the simulator actually executes.
 *
 * Two conventions worth knowing, both of which the parser reverses exactly:
 *  - A P/N contact becomes `A <operand>` + `EU`/`ED`. The AST attaches an operand to edge contacts
 *    while native STL edges the accumulated power flow, so this pair is the closest faithful form.
 *  - Arithmetic and word logic are destructive on the S7-200 (`+I IN1, OUT` means OUT := IN1 + OUT),
 *    so a three-operand LAD box expands to `MOVW in1, out` followed by the operation on in2.
 */

export interface IlLine {
  readonly opcode: string;
  readonly operands: readonly string[];
  readonly comment?: string;
  readonly nodeId?: NodeId;
}

export interface IlNetwork {
  /** 1-based network number as it appears in the `NETWORK n` header. */
  readonly index: number;
  readonly id: NetworkId;
  readonly title?: string;
  readonly comment?: string;
  readonly lines: readonly IlLine[];
}

export interface FormatOptions {
  /** Column the operands start in. Micro/WIN uses 7. */
  readonly operandColumn: number;
  /** Emit `// <title>` next to the NETWORK header. */
  readonly includeComments: boolean;
}

export const DEFAULT_FORMAT: FormatOptions = { operandColumn: 7, includeComments: true };

// ---- emitter -----------------------------------------------------------------------------------

class Emitter {
  readonly lines: IlLine[] = [];
  readonly diagnostics: TranspileDiagnostic[] = [];
  private depth = 0;
  private maxDepth = 0;

  constructor(private readonly networkId: NetworkId) {}

  emit(opcode: string, operands: readonly string[] = [], nodeId?: NodeId): void {
    this.lines.push(nodeId === undefined ? { opcode, operands } : { opcode, operands, nodeId });
  }

  /** `LD`, `LPS` and friends open a new logic-stack level. */
  push(nodeId?: NodeId): void {
    this.depth += 1;
    this.maxDepth = Math.max(this.maxDepth, this.depth);
    if (this.depth > LOGIC_STACK_DEPTH) {
      this.report(
        'STACK_OVERFLOW',
        'error',
        `Logic stack reaches ${this.depth} levels; the S7-200 provides ${LOGIC_STACK_DEPTH}. Split this network.`,
        { nodeId },
      );
    }
  }

  pop(count = 1, nodeId?: NodeId): void {
    this.depth -= count;
    if (this.depth < 0) {
      this.report('STACK_UNDERFLOW', 'error', 'Instruction consumes more logic levels than are open', { nodeId });
      this.depth = 0;
    }
  }

  get stackDepth(): number {
    return this.depth;
  }

  get peakDepth(): number {
    return this.maxDepth;
  }

  report(
    code: TranspileCode,
    severity: 'warning' | 'error',
    message: string,
    ref: { nodeId?: NodeId } = {},
  ): void {
    this.diagnostics.push({ code, severity, message, networkId: this.networkId, nodeId: ref.nodeId });
  }
}

// ---- tree classification -----------------------------------------------------------------------

const isCondition = (node: LadNode): node is ContactNode | CompareNode =>
  node.type === 'contact' || node.type === 'compare';

/** A subtree that maps to exactly one bit-logic instruction, so `A`/`O` can be used directly. */
function isSingleInstruction(tree: EvalTree): boolean {
  if (tree.kind !== 'leaf') return false;
  const { node } = tree;
  if (node.type === 'compare') return true;
  return node.type === 'contact' && (node.variant === 'NO' || node.variant === 'NC');
}

function containsSink(tree: EvalTree): boolean {
  switch (tree.kind) {
    case 'leaf':
      return !isCondition(tree.node);
    case 'series':
      return tree.children.some(containsSink);
    case 'parallel':
      return tree.lanes.some(containsSink);
    default:
      return false;
  }
}

// ---- operand rendering -------------------------------------------------------------------------

const address = (value: string): string => value.trim().toUpperCase();

/** REAL constants must carry a decimal point or Micro/WIN reads them as integers. */
function constant(value: number, type: NumericType | 'INT'): string {
  if (type !== 'REAL') return String(Math.trunc(value));
  return Number.isInteger(value) ? `${value}.0` : String(value);
}

const operand = (value: Operand, type: NumericType | 'INT'): string =>
  value.kind === 'address' ? address(value.address) : constant(value.value, type);

// ---- generator ---------------------------------------------------------------------------------

export function ladToIlNetworks(networks: readonly Network[]): TranspileResult<IlNetwork[]> {
  const diagnostics: TranspileDiagnostic[] = [];
  const out: IlNetwork[] = [];

  networks.forEach((network, position) => {
    const emitter = new Emitter(network.id);
    const root = buildNetworkTree(network, (code, severity, message, ref) => {
      emitter.report(code === 'BRANCH_CYCLE' ? 'SYNTAX_ERROR' : 'UNREPRESENTABLE_NODE', severity, message, {
        nodeId: ref?.nodeId,
      });
    });

    emitTree(root, 'LD', emitter);
    diagnostics.push(...emitter.diagnostics);
    out.push({
      index: position + 1,
      id: network.id,
      ...(network.title === undefined ? {} : { title: network.title }),
      ...(network.comment === undefined ? {} : { comment: network.comment }),
      lines: emitter.lines,
    });
  });

  return result(out, diagnostics);
}

/** Combines `tree` into whatever is already on the stack, pushing a level only when needed. */
function combine(tree: EvalTree, mode: LoadMode, emitter: Emitter): void {
  if (mode === 'LD' || isSingleInstruction(tree)) {
    emitTree(tree, mode, emitter);
    return;
  }
  // Compound term: evaluate it on its own level, then fold it in with ALD / OLD.
  emitTree(tree, 'LD', emitter);
  emitter.emit(mode === 'A' ? 'ALD' : 'OLD');
  emitter.pop();
}

function emitTree(tree: EvalTree, mode: LoadMode, emitter: Emitter): void {
  switch (tree.kind) {
    case 'leaf': {
      if (isCondition(tree.node)) emitCondition(tree.node, mode, emitter);
      else emitSink(tree, mode, emitter);
      return;
    }

    case 'series': {
      let next = mode;
      for (const child of tree.children) {
        if (child.kind === 'parallel' && containsSink(child)) {
          emitOutputGroup(child, next, emitter);
          if (next === 'LD') next = 'A';
          continue;
        }
        if (child.kind === 'leaf' && !isCondition(child.node)) {
          emitSink(child, next, emitter);
          // A box passes power through, so the stack value stays available for the next element.
          if (next === 'LD') next = 'A';
          continue;
        }
        combine(child, next, emitter);
        next = 'A';
      }
      return;
    }

    case 'parallel': {
      if (containsSink(tree)) {
        emitOutputGroup(tree, mode, emitter);
        return;
      }
      let next = mode;
      for (const lane of tree.lanes) {
        combine(lane, next, emitter);
        next = 'O';
      }
      return;
    }

    default: {
      const exhaustive: never = tree;
      void exhaustive;
    }
  }
}

function emitCondition(node: ContactNode | CompareNode, mode: LoadMode, emitter: Emitter): void {
  if (mode === 'LD') emitter.push(node.id);

  if (node.type === 'compare') {
    // LDW>= / AR< / OW== : mode + type letter + relation.
    emitter.emit(`${mode}${TYPE_LETTER[node.dataType]}${node.op}`, [
      operand(node.lhs, node.dataType),
      operand(node.rhs, node.dataType),
    ], node.id);
    return;
  }

  switch (node.variant) {
    case 'NO':
      emitter.emit(mode, [address(node.operand)], node.id);
      return;
    case 'NC':
      emitter.emit(`${mode}N`, [address(node.operand)], node.id);
      return;
    case 'P':
    case 'N': {
      // Native EU/ED edge the accumulated flow and take no operand; the AST edges a named bit,
      // so the operand is loaded first and the transition applied to the combined result.
      emitter.emit(mode, [address(node.operand)], node.id);
      emitter.emit(node.variant === 'P' ? 'EU' : 'ED', [], node.id);
      emitter.report(
        'EDGE_SEMANTICS',
        'warning',
        `${node.id}: EU/ED evaluate the accumulated power flow, so "${address(node.operand)}" is loaded first. ` +
          'Behaviour differs from the simulator if the rung ahead of the contact also changes state.',
        { nodeId: node.id },
      );
      return;
    }
    default: {
      const exhaustive: never = node.variant;
      void exhaustive;
    }
  }
}

/** A group whose lanes drive outputs: duplicate the branch point with LPS / LRD / LPP. */
function emitOutputGroup(
  tree: Extract<EvalTree, { kind: 'parallel' }>,
  mode: LoadMode,
  emitter: Emitter,
): void {
  const lanes = tree.lanes;
  const bareSinks = lanes.every((lane) => lane.kind === 'leaf' && !isCondition(lane.node));

  if (mode === 'LD') {
    // Nothing is on the stack yet: these lanes are independent power paths off the left rail,
    // so each one opens its own logic string instead of sharing a duplicated branch point.
    for (const lane of lanes) emitTree(lane, 'LD', emitter);
    return;
  }

  if (bareSinks || lanes.length <= 1) {
    // `=` and friends leave the stack untouched, so stacked coils need no stack juggling at all.
    for (const lane of lanes) emitTree(lane, 'A', emitter);
    return;
  }

  emitter.emit('LPS');
  emitter.push();
  lanes.forEach((lane, index) => {
    if (index > 0 && index < lanes.length - 1) emitter.emit('LRD');
    if (index === lanes.length - 1) {
      emitter.emit('LPP');
      emitter.pop();
    }
    emitLaneWithSinks(lane, emitter);
  });
}

function emitLaneWithSinks(lane: EvalTree, emitter: Emitter): void {
  if (lane.kind === 'series') {
    for (const child of lane.children) {
      if (child.kind === 'leaf' && !isCondition(child.node)) emitSink(child, 'A', emitter);
      else if (child.kind === 'parallel' && containsSink(child)) emitOutputGroup(child, 'A', emitter);
      else combine(child, 'A', emitter);
    }
    return;
  }
  if (lane.kind === 'leaf' && !isCondition(lane.node)) {
    emitSink(lane, 'A', emitter);
    return;
  }
  combine(lane, 'A', emitter);
}

// ---- sinks -------------------------------------------------------------------------------------

function emitSink(tree: Extract<EvalTree, { kind: 'leaf' }>, mode: LoadMode, emitter: Emitter): void {
  const node = tree.node;
  if (mode === 'LD') {
    // An output wired straight to the left rail has no logic to load; SM0.0 is the always-on bit.
    emitter.emit('LD', ['SM0.0'], node.id);
    emitter.push(node.id);
    emitter.report(
      'UNREPRESENTABLE_NODE',
      'warning',
      `${node.id} is driven directly by the power rail; "LD SM0.0" was synthesised to give STL a condition`,
      { nodeId: node.id },
    );
  }

  switch (node.type) {
    case 'coil':
      emitCoil(node, emitter);
      return;
    case 'timer':
      emitTimer(node, emitter);
      return;
    case 'counter':
      emitCounter(node, tree.inlets, emitter);
      return;
    case 'math':
      emitMath(node, emitter);
      return;
    case 'wordLogic':
      emitWordLogic(node, emitter);
      return;
    default: {
      emitter.report('UNREPRESENTABLE_NODE', 'error', `Cannot express node type "${node.type}" in STL`, {
        nodeId: node.id,
      });
    }
  }
}

function emitCoil(node: CoilNode, emitter: Emitter): void {
  switch (node.variant) {
    case 'OUT':
    case 'INTERNAL':
      emitter.emit('=', [address(node.target)], node.id);
      return;
    case 'SET':
      emitter.emit('S', [address(node.target), String(node.count)], node.id);
      return;
    case 'RESET':
      emitter.emit('R', [address(node.target), String(node.count)], node.id);
      return;
    case 'MASTER':
      emitter.emit(node.mode === 'begin' ? 'MCR' : 'MCRE', [], node.id);
      emitter.report(
        'NON_NATIVE_MNEMONIC',
        'warning',
        'MCR/MCRE are not STEP 7-Micro/WIN mnemonics; Micro/WIN will reject them. Use SCR or conditional jumps.',
        { nodeId: node.id },
      );
      return;
    default: {
      const exhaustive: never = node;
      void exhaustive;
    }
  }
}

function emitTimer(node: TimerNode, emitter: Emitter): void {
  emitter.emit(node.fn, [address(node.instance), operand(node.inputs.PT, 'INT')], node.id);
}

function emitCounter(node: CounterNode, inlets: readonly EvalTree[], emitter: Emitter): void {
  // STL reads the counter pins off the logic stack, deepest pin first: the rung supplies the count
  // input and each remaining pin is loaded on its own level before the mnemonic consumes them all.
  for (const inlet of inlets) emitTree(inlet, 'LD', emitter);
  emitter.emit(node.fn, [address(node.instance), operand(node.inputs.PV, 'INT')], node.id);
  emitter.pop(inlets.length, node.id);
}

/** REAL-only unary math boxes: bare mnemonic, `IN, OUT`. */
const UNARY_MATH_MNEMONIC: Readonly<Record<'SQR' | 'SIN' | 'COS' | 'EXP' | 'LN', string>> = {
  SQR: 'SQRT',
  SIN: 'SIN',
  COS: 'COS',
  EXP: 'EXP',
  LN: 'LN',
};

/** Type letter for ABS, which (unlike SQRT/SIN/...) is native to INT/DINT/REAL, not REAL-only. */
const ABS_TYPE_LETTER: Readonly<Record<NumericType, 'I' | 'D' | 'R'>> = {
  BYTE: 'I', // no native byte arithmetic on the S7-200; emitted as INT, like +I/-I/*I//I
  INT: 'I',
  DINT: 'D',
  REAL: 'R',
};

function emitMath(node: MathNode, emitter: Emitter): void {
  const out = address(node.out);

  if (!('in1' in node)) {
    // ABS is the one unary box native to INT/DINT/REAL; the rest (SQRT, SIN, COS, EXP, LN) are
    // REAL-only on the S7-200.
    if (node.fn === 'ABS') {
      if (node.dataType === 'BYTE') {
        emitter.report('UNREPRESENTABLE_NODE', 'warning', `${node.id}: the S7-200 has no BYTE arithmetic; INT is emitted`, {
          nodeId: node.id,
        });
      }
      emitter.emit(`ABS${ABS_TYPE_LETTER[node.dataType]}`, [operand(node.in, node.dataType), out], node.id);
      return;
    }
    if (node.dataType !== 'REAL') {
      emitter.report('UNREPRESENTABLE_NODE', 'warning', `${node.fn} is a REAL instruction on the S7-200`, {
        nodeId: node.id,
      });
    }
    emitter.emit(UNARY_MATH_MNEMONIC[node.fn], [operand(node.in, node.dataType), out], node.id);
    return;
  }

  if (node.dataType === 'BYTE') {
    emitter.report('UNREPRESENTABLE_NODE', 'warning', `${node.id}: the S7-200 has no BYTE arithmetic; INT is emitted`, {
      nodeId: node.id,
    });
  }

  const in1 = operand(node.in1, node.dataType);
  // Destructive form: seed OUT with IN1 unless it already holds it.
  if (in1 !== out) emitter.emit(MOVE_MNEMONIC[node.dataType], [in1, out], node.id);
  emitter.emit(MATH_MNEMONIC[node.fn][node.dataType], [operand(node.in2, node.dataType), out], node.id);
}

function emitWordLogic(node: WordLogicNode, emitter: Emitter): void {
  const out = address(node.out);
  const type: NumericType = node.width === 'BYTE' ? 'BYTE' : node.width === 'WORD' ? 'INT' : 'DINT';

  if (node.fn === 'W_NOT') {
    // Non-destructive: NOT reads its own operand and writes OUT in one step, no MOVx priming needed.
    emitter.emit(`WNOT_${LOGIC_SUFFIX[node.width]}`, [operand(node.in, type), out], node.id);
    return;
  }

  const in1 = operand(node.in1, type);
  if (in1 !== out) emitter.emit(MOVE_MNEMONIC[type], [in1, out], node.id);

  const stem = node.fn === 'W_AND' ? 'WAND' : node.fn === 'W_OR' ? 'WOR' : 'WXOR';
  emitter.emit(`${stem}_${LOGIC_SUFFIX[node.width]}`, [operand(node.in2, type), out], node.id);
}

// ---- text formatting ---------------------------------------------------------------------------

export function formatIlLine(line: IlLine, options: FormatOptions = DEFAULT_FORMAT): string {
  const operands = line.operands.join(', ');
  if (operands === '') return line.comment ? `${line.opcode} // ${line.comment}` : line.opcode;
  const gap = Math.max(1, options.operandColumn - line.opcode.length);
  const text = `${line.opcode}${' '.repeat(gap)}${operands}`;
  return line.comment ? `${text} // ${line.comment}` : text;
}

export function formatIl(networks: readonly IlNetwork[], options: FormatOptions = DEFAULT_FORMAT): string {
  const blocks = networks.map((net) => {
    const header =
      options.includeComments && net.title ? `NETWORK ${net.index} // ${net.title}` : `NETWORK ${net.index}`;
    const body = net.lines.map((line) => formatIlLine(line, options));
    const comment = options.includeComments && net.comment ? [`// ${net.comment}`] : [];
    return [header, ...comment, ...body].join('\n');
  });
  return blocks.join('\n\n');
}

/** LAD -> STL source text. */
export function ladToIl(networks: readonly Network[], options: FormatOptions = DEFAULT_FORMAT): TranspileResult<string> {
  const structured = ladToIlNetworks(networks);
  const text = structured.value === null ? '' : formatIl(structured.value, options);
  return { ok: structured.ok, value: text, diagnostics: structured.diagnostics };
}
