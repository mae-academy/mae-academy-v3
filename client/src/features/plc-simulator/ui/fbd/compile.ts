import type { Branch, BranchId, LadNode, Network } from '../../domain/ast';
import type { HardwareProfile } from '../../domain/hardware';
import {
  inputAddress,
  markerAddress,
  markerIndices,
  outputAddress,
  timerInstances,
  type BlockId,
  type FbdBlock,
  type FbdGraph,
} from './model';

/**
 * FBD -> LAD lowering. The engine only executes ladder networks, so every signal path is turned
 * into the equivalent series / parallel contact network: AND = contacts in series, OR = parallel
 * branches, NOT = normally-closed contact (inversions are pushed to the leaves with De Morgan).
 * Timers and latching relays become their own networks whose done / marker bit is read back as a
 * contact by whatever they drive, so any block can feed any other.
 */

export interface FbdDiagnostic {
  readonly severity: 'error' | 'warning';
  readonly blockId?: BlockId;
  readonly message: string;
}

export interface FbdCompilation {
  readonly networks: readonly Network[];
  readonly diagnostics: readonly FbdDiagnostic[];
  /** Timer instance address -> block, so the LCD can write a preset back into the diagram. */
  readonly timerBlocks: ReadonlyMap<string, BlockId>;
}

// ---- expressions -------------------------------------------------------------------------------

type Raw =
  | { readonly t: 'leaf'; readonly addr: string; readonly dep?: BlockId }
  | { readonly t: 'not'; readonly a: Raw }
  | { readonly t: 'and' | 'or'; readonly args: readonly Raw[] };

type Nnf =
  | { readonly t: 'leaf'; readonly addr: string; readonly neg: boolean; readonly dep?: BlockId }
  | { readonly t: 'and' | 'or'; readonly args: readonly Nnf[] };

/** Negation normal form: NOT only ever sits on a leaf, and nested same-operator groups are merged. */
function toNnf(raw: Raw, neg: boolean): Nnf {
  switch (raw.t) {
    case 'leaf':
      return { t: 'leaf', addr: raw.addr, neg, ...(raw.dep === undefined ? {} : { dep: raw.dep }) };
    case 'not':
      return toNnf(raw.a, !neg);
    case 'and':
    case 'or': {
      const op: 'and' | 'or' = neg ? (raw.t === 'and' ? 'or' : 'and') : raw.t;
      const args: Nnf[] = [];
      for (const child of raw.args) {
        const inner = toNnf(child, neg);
        if (inner.t === op) args.push(...inner.args);
        else args.push(inner);
      }
      return { t: op, args };
    }
  }
}

const depsOf = (e: Nnf, into: Set<BlockId> = new Set()): Set<BlockId> => {
  if (e.t === 'leaf') {
    if (e.dep !== undefined) into.add(e.dep);
  } else e.args.forEach((child) => depsOf(child, into));
  return into;
};

// ---- layout ------------------------------------------------------------------------------------

interface Size {
  readonly w: number;
  readonly h: number;
}

function measure(e: Nnf): Size {
  if (e.t === 'leaf') return { w: 1, h: 1 };
  const sizes = e.args.map(measure);
  return e.t === 'and'
    ? { w: sizes.reduce((sum, s) => sum + s.w, 0), h: Math.max(...sizes.map((s) => s.h)) }
    : { w: Math.max(...sizes.map((s) => s.w)), h: sizes.reduce((sum, s) => sum + s.h, 0) };
}

class Builder {
  readonly nodes: LadNode[] = [];
  readonly branches: Branch[] = [];
  constructor(private readonly prefix: string) {}

  private cell(row: number, col: number, branchId: BranchId | null, rowSpan = 1) {
    return { row, col, rowSpan, colSpan: 1, branchId };
  }

  /** Series = left to right on one row; parallel = one lane per operand, stacked downwards. */
  place(e: Nnf, col: number, row: number, owner: BranchId | null): void {
    if (e.t === 'leaf') {
      this.nodes.push({
        id: `${this.prefix}_n${this.nodes.length + 1}`,
        type: 'contact',
        variant: e.neg ? 'NC' : 'NO',
        operand: e.addr,
        layout: this.cell(row, col, owner),
      });
      return;
    }
    if (e.t === 'and') {
      let c = col;
      for (const child of e.args) {
        this.place(child, c, row, owner);
        c += measure(child).w;
      }
      return;
    }
    const size = measure(e);
    const id = `${this.prefix}_b${this.branches.length + 1}`;
    this.branches.push({ id, parentId: owner, splitCol: col, mergeCol: col + size.w - 1, rowStart: row, rowEnd: row + size.h - 1 });
    let r = row;
    for (const child of e.args) {
      this.place(child, col, r, id);
      r += measure(child).h;
    }
  }

  push(node: LadNode): void {
    this.nodes.push(node);
  }

  count(): number {
    return this.nodes.length;
  }
}

type Terminal =
  | { readonly kind: 'coil'; readonly variant: 'OUT' | 'SET' | 'RESET'; readonly target: string }
  | { readonly kind: 'timer'; readonly fn: 'TON' | 'TOF'; readonly instance: string; readonly preset: number };

function buildNetwork(id: string, title: string, expr: Nnf, terminal: Terminal): Network {
  const size = measure(expr);
  const builder = new Builder(id);
  builder.place(expr, 0, 0, null);
  // The terminal element always takes the last column, i.e. it sits on the right power rail.
  const col = size.w;
  const tail = { row: 0, col, colSpan: 1, branchId: null };
  const nodeId = `${id}_out`;
  if (terminal.kind === 'coil') {
    builder.push(
      terminal.variant === 'OUT'
        ? { id: nodeId, type: 'coil', variant: 'OUT', target: terminal.target, layout: { ...tail, rowSpan: 1 } }
        : { id: nodeId, type: 'coil', variant: terminal.variant, target: terminal.target, count: 1, layout: { ...tail, rowSpan: 1 } },
    );
  } else {
    builder.push({
      id: nodeId,
      type: 'timer',
      fn: terminal.fn,
      instance: terminal.instance,
      timeBaseMs: 100,
      inputs: { IN: { kind: 'flow' }, PT: { kind: 'constant', value: terminal.preset } },
      outputs: {},
      layout: { ...tail, rowSpan: 2 },
    });
  }
  return {
    id,
    title,
    grid: { rows: Math.max(size.h, terminal.kind === 'timer' ? 2 : 1), cols: col + 1 },
    nodes: builder.nodes,
    branches: builder.branches,
  };
}

// ---- the compiler ------------------------------------------------------------------------------

export function compileFbd(graph: FbdGraph, profile: HardwareProfile): FbdCompilation {
  const diagnostics: FbdDiagnostic[] = [];
  const byId = new Map(graph.blocks.map((block) => [block.id, block]));
  const timers = timerInstances(graph);
  const markers = markerIndices(graph);

  const inputBits = profile.memory.I?.bitCount ?? 0;
  const outputBits = profile.memory.Q?.bitCount ?? 0;
  const markerBits = profile.memory.M?.bitCount ?? 0;

  const linkInto = (block: FbdBlock, pin: number) => graph.links.find((link) => link.to === block.id && link.pin === pin);
  const visiting = new Set<BlockId>();

  const sourceOf = (block: FbdBlock, pin: number): Raw | null => {
    const link = linkInto(block, pin);
    const from = link === undefined ? undefined : byId.get(link.from);
    return from === undefined ? null : signalOf(from);
  };

  /** The signal a block drives, as an expression over addresses; null while its inputs are open. */
  function signalOf(block: FbdBlock): Raw | null {
    switch (block.kind) {
      case 'input': {
        const index = block.index ?? 0;
        if (index >= inputBits) diagnostics.push({ severity: 'error', blockId: block.id, message: `I${index + 1} does not exist on ${profile.model}` });
        return { t: 'leaf', addr: inputAddress(index) };
      }
      case 'ton':
      case 'tof':
        return { t: 'leaf', addr: timers.get(block.id) ?? 'T37', dep: block.id };
      case 'sr':
        return { t: 'leaf', addr: markerAddress(markers.get(block.id) ?? 0), dep: block.id };
      case 'output':
        return null;
      default:
    }

    if (visiting.has(block.id)) {
      diagnostics.push({ severity: 'error', blockId: block.id, message: 'Feedback loop: route it through a timer or SR block' });
      return null;
    }
    visiting.add(block.id);
    try {
      const args = Array.from({ length: block.kind === 'xor' ? 2 : block.kind === 'not' ? 1 : 4 }, (_, pin) => sourceOf(block, pin));
      const open = args.filter((arg): arg is Raw => arg !== null);
      switch (block.kind) {
        case 'not':
          return args[0] ? { t: 'not', a: args[0] } : null;
        case 'and':
        case 'or':
        case 'nand':
        case 'nor': {
          if (open.length === 0) return null;
          const single = open[0];
          const joined: Raw = open.length === 1 && single ? single : { t: block.kind === 'and' || block.kind === 'nand' ? 'and' : 'or', args: open };
          return block.kind === 'nand' || block.kind === 'nor' ? { t: 'not', a: joined } : joined;
        }
        case 'xor': {
          const [a, b] = args;
          if (!a || !b) return null;
          return {
            t: 'or',
            args: [
              { t: 'and', args: [a, { t: 'not', a: b }] },
              { t: 'and', args: [{ t: 'not', a }, b] },
            ],
          };
        }
        default:
          return null;
      }
    } finally {
      visiting.delete(block.id);
    }
  }

  const networks: Network[] = [];
  const done = new Set<BlockId>();
  const expression = (block: FbdBlock, pin: number): Nnf | null => {
    const raw = sourceOf(block, pin);
    return raw === null ? null : toNnf(raw, false);
  };

  /** Stateful blocks are emitted ahead of whatever reads them so a value is fresh within one scan. */
  const emitStateful = (block: FbdBlock): void => {
    if (done.has(block.id)) return;
    done.add(block.id);

    if (block.kind === 'ton' || block.kind === 'tof') {
      const trigger = expression(block, 0);
      if (trigger === null) {
        diagnostics.push({ severity: 'warning', blockId: block.id, message: `${block.kind.toUpperCase()} has no trigger connected` });
        return;
      }
      depsOf(trigger).forEach((dep) => emitDependency(dep));
      networks.push(
        buildNetwork(`fbd_${block.id}`, `${timers.get(block.id) ?? ''} ${block.kind.toUpperCase()}`.trim(), trigger, {
          kind: 'timer',
          fn: block.kind === 'ton' ? 'TON' : 'TOF',
          instance: timers.get(block.id) ?? 'T37',
          preset: block.preset ?? 50,
        }),
      );
      return;
    }

    if (block.kind === 'sr') {
      const index = markers.get(block.id) ?? 0;
      if (index >= markerBits) diagnostics.push({ severity: 'error', blockId: block.id, message: 'Out of latching relays on this device' });
      const target = markerAddress(index);
      const set = expression(block, 0);
      const reset = expression(block, 1);
      const needed = new Set<BlockId>();
      if (set) depsOf(set, needed);
      if (reset) depsOf(reset, needed);
      needed.forEach((dep) => emitDependency(dep));
      if (set) networks.push(buildNetwork(`fbd_${block.id}_s`, `${target} set`, set, { kind: 'coil', variant: 'SET', target }));
      // Reset comes last, so it wins when both fire in the same scan.
      if (reset) networks.push(buildNetwork(`fbd_${block.id}_r`, `${target} reset`, reset, { kind: 'coil', variant: 'RESET', target }));
    }
  };

  function emitDependency(id: BlockId): void {
    const block = byId.get(id);
    if (block) emitStateful(block);
  }

  for (const block of graph.blocks) {
    if (block.kind === 'ton' || block.kind === 'tof' || block.kind === 'sr') emitStateful(block);
  }

  for (const block of graph.blocks) {
    if (block.kind !== 'output') continue;
    const index = block.index ?? 0;
    if (index >= outputBits) {
      diagnostics.push({ severity: 'error', blockId: block.id, message: `Q${index + 1} does not exist on ${profile.model}` });
      continue;
    }
    const expr = expression(block, 0);
    if (expr === null) {
      diagnostics.push({ severity: 'warning', blockId: block.id, message: `Q${index + 1} has no signal connected` });
      continue;
    }
    depsOf(expr).forEach((dep) => emitDependency(dep));
    networks.push(buildNetwork(`fbd_${block.id}`, `Q${index + 1}`, expr, { kind: 'coil', variant: 'OUT', target: outputAddress(index) }));
  }

  const { limits } = profile;
  for (const network of networks) {
    if (network.grid.cols > limits.maxGridCols || network.grid.rows > limits.maxGridRows || network.nodes.length > limits.maxNodesPerNetwork) {
      diagnostics.push({
        severity: 'error',
        message: `${network.title ?? network.id} is too large for ${profile.model}: split the logic with an intermediate block`,
      });
    }
  }

  const timerBlocks = new Map<string, BlockId>();
  timers.forEach((instance, blockId) => timerBlocks.set(instance, blockId));
  return { networks, diagnostics, timerBlocks };
}

// ---- live evaluation ---------------------------------------------------------------------------

/**
 * Logic level at every block output given a bit reader, for wire colouring. Independent of the
 * runtime: it evaluates the same graph the compiler lowers, so the picture can never disagree with
 * the gates it shows (timer and latch outputs are read from the controller's own bits).
 */
export function evaluateLevels(graph: FbdGraph, readBit: (address: string) => boolean): ReadonlyMap<BlockId, boolean> {
  const byId = new Map(graph.blocks.map((block) => [block.id, block]));
  const timers = timerInstances(graph);
  const markers = markerIndices(graph);
  const levels = new Map<BlockId, boolean>();
  const active = new Set<BlockId>();

  const pinLevel = (block: FbdBlock, pin: number): boolean | null => {
    const link = graph.links.find((entry) => entry.to === block.id && entry.pin === pin);
    const from = link === undefined ? undefined : byId.get(link.from);
    return from === undefined ? null : levelOf(from);
  };

  function levelOf(block: FbdBlock): boolean {
    const known = levels.get(block.id);
    if (known !== undefined) return known;
    if (active.has(block.id)) return false;
    active.add(block.id);

    let value = false;
    switch (block.kind) {
      case 'input':
        value = readBit(inputAddress(block.index ?? 0));
        break;
      case 'ton':
      case 'tof':
        value = readBit(timers.get(block.id) ?? 'T37');
        break;
      case 'sr':
        value = readBit(markerAddress(markers.get(block.id) ?? 0));
        break;
      case 'output':
        value = pinLevel(block, 0) ?? false;
        break;
      case 'not':
        value = !(pinLevel(block, 0) ?? false);
        break;
      case 'xor': {
        const a = pinLevel(block, 0);
        const b = pinLevel(block, 1);
        value = a !== null && b !== null && a !== b;
        break;
      }
      case 'and':
      case 'nand':
      case 'or':
      case 'nor': {
        const open = [0, 1, 2, 3].map((pin) => pinLevel(block, pin)).filter((level): level is boolean => level !== null);
        const raw = open.length > 0 && (block.kind === 'and' || block.kind === 'nand' ? open.every(Boolean) : open.some(Boolean));
        value = open.length === 0 ? false : block.kind === 'nand' || block.kind === 'nor' ? !raw : raw;
        break;
      }
    }
    active.delete(block.id);
    levels.set(block.id, value);
    return value;
  }

  graph.blocks.forEach(levelOf);
  return levels;
}
