/**
 * Function Block Diagram model for the LOGO! environment. LOGO! programs are FBD only: blocks with
 * pins joined by links, no rungs. The graph is plain serialisable data; `compile.ts` lowers it to
 * the ladder AST the engine already executes, so the engine never learns about FBD.
 */

export type BlockId = string;
export type LinkId = string;

export type FbdKind = 'input' | 'output' | 'and' | 'or' | 'nand' | 'nor' | 'xor' | 'not' | 'ton' | 'tof' | 'sr';

export interface FbdBlock {
  readonly id: BlockId;
  readonly kind: FbdKind;
  /** Top-left corner on the canvas, snapped to `GRID`. */
  readonly x: number;
  readonly y: number;
  /** `input` / `output`: 0-based terminal index (I1 = 0). */
  readonly index?: number;
  /** `ton` / `tof`: preset in 100 ms ticks. */
  readonly preset?: number;
}

export interface FbdLink {
  readonly id: LinkId;
  readonly from: BlockId;
  readonly to: BlockId;
  /** Input pin of `to`, 0-based from the top. */
  readonly pin: number;
}

export interface FbdGraph {
  readonly blocks: readonly FbdBlock[];
  readonly links: readonly FbdLink[];
}

export const EMPTY_GRAPH: FbdGraph = { blocks: [], links: [] };

// ---- geometry ----------------------------------------------------------------------------------

export const GRID = 20;
export const BLOCK_W = 100;
export const PIN_PITCH = 20;
export const HEADER_H = 20;

export interface KindSpec {
  readonly label: string;
  readonly description: string;
  readonly category: 'io' | 'logic' | 'timing' | 'memory';
  readonly pins: readonly string[];
  /** Whether the block drives a signal other blocks can read. */
  readonly hasOutput: boolean;
}

const pins = (...names: string[]): readonly string[] => names;

export const KINDS: Readonly<Record<FbdKind, KindSpec>> = {
  input: { label: 'Input', description: 'Digital input terminal (I)', category: 'io', pins: pins(), hasOutput: true },
  output: { label: 'Output', description: 'Relay output terminal (Q)', category: 'io', pins: pins(''), hasOutput: false },
  and: { label: 'AND', description: 'AND, 4 inputs (unused pins are ignored)', category: 'logic', pins: pins('', '', '', ''), hasOutput: true },
  or: { label: 'OR', description: 'OR, 4 inputs (unused pins are ignored)', category: 'logic', pins: pins('', '', '', ''), hasOutput: true },
  nand: { label: 'NAND', description: 'NAND, 4 inputs', category: 'logic', pins: pins('', '', '', ''), hasOutput: true },
  nor: { label: 'NOR', description: 'NOR, 4 inputs', category: 'logic', pins: pins('', '', '', ''), hasOutput: true },
  xor: { label: 'XOR', description: 'Exclusive OR, 2 inputs', category: 'logic', pins: pins('', ''), hasOutput: true },
  not: { label: 'NOT', description: 'Inverter', category: 'logic', pins: pins(''), hasOutput: true },
  ton: { label: 'TON', description: 'On-delay timer', category: 'timing', pins: pins('Trg'), hasOutput: true },
  tof: { label: 'TOF', description: 'Off-delay timer', category: 'timing', pins: pins('Trg'), hasOutput: true },
  sr: { label: 'SR', description: 'Latching relay (reset dominant)', category: 'memory', pins: pins('S', 'R'), hasOutput: true },
};

export const CATEGORIES: readonly { readonly id: KindSpec['category']; readonly label: string }[] = [
  { id: 'io', label: 'Constants & I/O' },
  { id: 'logic', label: 'Basic Functions' },
  { id: 'timing', label: 'Timers' },
  { id: 'memory', label: 'Latching' },
];

export const blockHeight = (kind: FbdKind): number => HEADER_H + Math.max(1, KINDS[kind].pins.length) * PIN_PITCH + 10;

/** Canvas position of an input pin's wire attachment (left edge). */
export const inputPinPos = (block: FbdBlock, pin: number): { x: number; y: number } => ({
  x: block.x,
  y: block.y + HEADER_H + pin * PIN_PITCH + PIN_PITCH / 2,
});

/** Canvas position of the output pin (right edge, centred on the first pin row). */
export const outputPinPos = (block: FbdBlock): { x: number; y: number } => ({
  x: block.x + BLOCK_W,
  y: block.y + HEADER_H + PIN_PITCH / 2,
});

export const snap = (value: number): number => Math.round(value / GRID) * GRID;

// ---- terminals & addresses ---------------------------------------------------------------------

export const inputAddress = (index: number): string => `I${index >> 3}.${index & 7}`;
export const outputAddress = (index: number): string => `Q${index >> 3}.${index & 7}`;
export const markerAddress = (index: number): string => `M${index >> 3}.${index & 7}`;

/** Timers take T37.. in block order, matching the on-delay pool of the LOGO! profile. */
export const TIMER_BASE = 37;

export function timerInstances(graph: FbdGraph): ReadonlyMap<BlockId, string> {
  const map = new Map<BlockId, string>();
  let next = TIMER_BASE;
  for (const block of graph.blocks) if (block.kind === 'ton' || block.kind === 'tof') map.set(block.id, `T${next++}`);
  return map;
}

export function markerIndices(graph: FbdGraph): ReadonlyMap<BlockId, number> {
  const map = new Map<BlockId, number>();
  let next = 0;
  for (const block of graph.blocks) if (block.kind === 'sr') map.set(block.id, next++);
  return map;
}

export function blockCaption(block: FbdBlock): string {
  switch (block.kind) {
    case 'input':
      return `I${(block.index ?? 0) + 1}`;
    case 'output':
      return `Q${(block.index ?? 0) + 1}`;
    case 'ton':
    case 'tof':
      return `${KINDS[block.kind].label} ${(((block.preset ?? 10) * 100) / 1000).toFixed(1)}s`;
    default:
      return KINDS[block.kind].label;
  }
}

// ---- pure edits --------------------------------------------------------------------------------

export function addBlock(graph: FbdGraph, kind: FbdKind, x: number, y: number, id: BlockId): FbdGraph {
  const usedInputs = new Set(graph.blocks.filter((b) => b.kind === 'input').map((b) => b.index));
  const usedOutputs = new Set(graph.blocks.filter((b) => b.kind === 'output').map((b) => b.index));
  const firstFree = (used: ReadonlySet<number | undefined>): number => {
    let n = 0;
    while (used.has(n)) n++;
    return n;
  };
  const block: FbdBlock = {
    id,
    kind,
    x: snap(x),
    y: snap(y),
    ...(kind === 'input' ? { index: firstFree(usedInputs) } : {}),
    ...(kind === 'output' ? { index: firstFree(usedOutputs) } : {}),
    ...(kind === 'ton' || kind === 'tof' ? { preset: 50 } : {}),
  };
  return { ...graph, blocks: [...graph.blocks, block] };
}

export const moveBlock = (graph: FbdGraph, id: BlockId, x: number, y: number): FbdGraph => ({
  ...graph,
  blocks: graph.blocks.map((b) => (b.id === id ? { ...b, x: snap(Math.max(0, x)), y: snap(Math.max(0, y)) } : b)),
});

export const updateBlock = (graph: FbdGraph, id: BlockId, patch: Partial<Pick<FbdBlock, 'index' | 'preset'>>): FbdGraph => ({
  ...graph,
  blocks: graph.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)),
});

export const removeBlock = (graph: FbdGraph, id: BlockId): FbdGraph => ({
  blocks: graph.blocks.filter((b) => b.id !== id),
  links: graph.links.filter((l) => l.from !== id && l.to !== id),
});

export const removeLink = (graph: FbdGraph, id: LinkId): FbdGraph => ({
  ...graph,
  links: graph.links.filter((l) => l.id !== id),
});

export type LinkResult = { readonly ok: true; readonly graph: FbdGraph } | { readonly ok: false; readonly reason: string };

/** Connects a block's output to an input pin, replacing whatever was wired there. */
export function connect(graph: FbdGraph, from: BlockId, to: BlockId, pin: number, id: LinkId): LinkResult {
  const source = graph.blocks.find((b) => b.id === from);
  const target = graph.blocks.find((b) => b.id === to);
  if (!source || !target) return { ok: false, reason: 'That block no longer exists' };
  if (!KINDS[source.kind].hasOutput) return { ok: false, reason: 'An output terminal has nothing to connect from' };
  if (pin < 0 || pin >= KINDS[target.kind].pins.length) return { ok: false, reason: 'That block has no such input' };
  if (from === to) return { ok: false, reason: 'A block cannot drive itself directly' };
  const links = graph.links.filter((l) => !(l.to === to && l.pin === pin));
  return { ok: true, graph: { ...graph, links: [...links, { id, from, to, pin }] } };
}

export function nextId(graph: FbdGraph, prefix: 'b' | 'l'): string {
  const taken = new Set<string>([...graph.blocks.map((b) => b.id), ...graph.links.map((l) => l.id)]);
  let n = 1;
  while (taken.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}
