import type {
  CompareOp,
  GridPlacement,
  LadNode,
  NodeId,
  NumericType,
} from '../../domain/ast';
import type { PlcAddress } from '../../domain/types';

/**
 * Palette catalogue: what can be placed, grouped as Micro/WIN groups its instruction tree, and the
 * factory that turns a palette entry into a fully-formed AST node with sensible defaults.
 * Pure data + functions, so both the toolbox and the editor reducer share one definition.
 */

/** MIME type carrying a `PaletteItemId` during a drag from the toolbox to the canvas. */
export const PALETTE_DRAG_TYPE = 'application/x-mae-plc-palette';

export type PaletteCategoryId = 'bit' | 'timerCounter' | 'compare' | 'mathLogic';

export type PaletteItemId =
  | 'contact-no'
  | 'contact-nc'
  | 'contact-p'
  | 'contact-n'
  | 'coil-out'
  | 'coil-set'
  | 'coil-reset'
  | 'timer-ton'
  | 'timer-tof'
  | 'timer-tonr'
  | 'counter-ctu'
  | 'counter-ctd'
  | 'counter-ctud'
  | 'cmp-eq'
  | 'cmp-ne'
  | 'cmp-ge'
  | 'cmp-le'
  | 'cmp-gt'
  | 'cmp-lt'
  | 'math-add'
  | 'math-sub'
  | 'math-mul'
  | 'math-div'
  | 'math-sqr'
  | 'math-sin'
  | 'math-cos'
  | 'math-exp'
  | 'math-ln'
  | 'math-abs'
  | 'wl-and'
  | 'wl-or'
  | 'wl-xor'
  | 'wl-not';

const RAIL_ITEMS: ReadonlySet<PaletteItemId> = new Set<PaletteItemId>([
  'coil-out',
  'coil-set',
  'coil-reset',
  'timer-ton',
  'timer-tof',
  'timer-tonr',
  'counter-ctu',
  'counter-ctd',
  'counter-ctud',
]);

/** Coils, timers and counters terminate the rung, so they only ever live on the right rail. */
export const anchorsToRail = (item: PaletteItemId): boolean => RAIL_ITEMS.has(item);

export interface PlacementContext {
  /** Timer / counter instances already claimed by the program, upper-case. */
  readonly usedInstances: ReadonlySet<string>;
  /** Bit addresses already claimed by the program, upper-case. */
  readonly usedAddresses?: ReadonlySet<string>;
}

export interface PaletteItem {
  readonly id: PaletteItemId;
  readonly category: PaletteCategoryId;
  readonly label: string;
  readonly description: string;
  readonly rowSpan: number;
  readonly create: (id: NodeId, at: GridPlacement, ctx: PlacementContext) => LadNode;
}

export interface PaletteCategory {
  readonly id: PaletteCategoryId;
  readonly label: string;
  readonly items: readonly PaletteItem[];
}

// ---- defaults ----------------------------------------------------------------------------------

/** First unused bit address in prefix 'I' or 'Q', e.g. I0.0, I0.1, I0.2... */
function freeBitAddress(prefix: 'I' | 'Q', used?: ReadonlySet<string>): PlcAddress {
  if (!used) return `${prefix}0.0`;
  for (let byte = 0; byte < 8; byte++) {
    for (let bit = 0; bit < 8; bit++) {
      const addr = `${prefix}${byte}.${bit}`;
      if (!used.has(addr)) return addr;
    }
  }
  return `${prefix}0.0`;
}

/** First unused instance in the listed inclusive ranges, e.g. T37..T63. */
function freeInstance(prefix: 'T' | 'C', ranges: readonly (readonly [number, number])[], used: ReadonlySet<string>): PlcAddress {
  for (const [from, to] of ranges) {
    for (let n = from; n <= to; n++) if (!used.has(`${prefix}${n}`)) return `${prefix}${n}`;
  }
  // Every instance in the pool is taken; hand back the pool's first so the compiler reports it.
  return `${prefix}${ranges[0]?.[0] ?? 0}`;
}

const placement = (at: GridPlacement, rowSpan: number): GridPlacement => ({ ...at, rowSpan, colSpan: 1 });

const timer = (fn: 'TON' | 'TOF' | 'TONR', ranges: readonly (readonly [number, number])[]) =>
  (id: NodeId, at: GridPlacement, ctx: PlacementContext): LadNode => ({
    id,
    type: 'timer',
    fn,
    instance: freeInstance('T', ranges, ctx.usedInstances),
    timeBaseMs: 100,
    inputs: { IN: { kind: 'flow' }, PT: { kind: 'constant', value: 10 } },
    outputs: {},
    layout: placement(at, 2),
  });

const counter = (fn: 'CTU' | 'CTD' | 'CTUD') =>
  (id: NodeId, at: GridPlacement, ctx: PlacementContext): LadNode => {
    const instance = freeInstance('C', [[0, 255]], ctx.usedInstances);
    const PV = { kind: 'constant' as const, value: 10 };
    const flow = { kind: 'flow' as const };
    // Rows follow the pin count so the compiler finds every inlet row inside the box footprint.
    switch (fn) {
      case 'CTU':
        return { id, type: 'counter', fn, instance, inputs: { CU: flow, R: flow, PV }, outputs: {}, layout: placement(at, 2) };
      case 'CTD':
        return { id, type: 'counter', fn, instance, inputs: { CD: flow, LD: flow, PV }, outputs: {}, layout: placement(at, 2) };
      case 'CTUD':
        return { id, type: 'counter', fn, instance, inputs: { CU: flow, CD: flow, R: flow, PV }, outputs: {}, layout: placement(at, 3) };
    }
  };

const compare = (op: CompareOp) =>
  (id: NodeId, at: GridPlacement): LadNode => ({
    id,
    type: 'compare',
    op,
    dataType: 'INT',
    lhs: { kind: 'address', address: 'VW0' },
    rhs: { kind: 'constant', value: 0 },
    layout: placement(at, 1),
  });

const binaryMath = (fn: 'ADD' | 'SUB' | 'MUL' | 'DIV') =>
  (id: NodeId, at: GridPlacement): LadNode => ({
    id,
    type: 'math',
    fn,
    dataType: 'INT' satisfies NumericType,
    in1: { kind: 'address', address: 'VW0' },
    in2: { kind: 'constant', value: 1 },
    out: 'VW2',
    layout: placement(at, 2),
  });

const unaryMath = (fn: 'SQR' | 'SIN' | 'COS' | 'EXP' | 'LN') =>
  (id: NodeId, at: GridPlacement): LadNode => ({
    id,
    type: 'math',
    fn,
    dataType: 'REAL',
    in: { kind: 'address', address: 'VD0' },
    out: 'VD4',
    layout: placement(at, 2),
  });

/** ABS is native to INT/DINT/REAL (no BYTE), unlike the REAL-only trig/exponential boxes. */
const absMath = (id: NodeId, at: GridPlacement): LadNode => ({
  id,
  type: 'math',
  fn: 'ABS',
  dataType: 'INT',
  in: { kind: 'address', address: 'VW0' },
  out: 'VW2',
  layout: placement(at, 2),
});

const wordLogic = (fn: 'W_AND' | 'W_OR' | 'W_XOR') =>
  (id: NodeId, at: GridPlacement): LadNode => ({
    id,
    type: 'wordLogic',
    fn,
    width: 'WORD',
    in1: { kind: 'address', address: 'VW0' },
    in2: { kind: 'constant', value: 255 },
    out: 'VW2',
    layout: placement(at, 2),
  });

const wordNot = (id: NodeId, at: GridPlacement): LadNode => ({
  id,
  type: 'wordLogic',
  fn: 'W_NOT',
  width: 'WORD',
  in: { kind: 'address', address: 'VW0' },
  out: 'VW2',
  layout: placement(at, 2),
});

const contact = (variant: 'NO' | 'NC' | 'P' | 'N') =>
  (id: NodeId, at: GridPlacement, ctx: PlacementContext): LadNode => ({
    id,
    type: 'contact',
    variant,
    operand: freeBitAddress('I', ctx.usedAddresses),
    symbol: '',
    layout: placement(at, 1),
  });

const outCoil = (id: NodeId, at: GridPlacement, ctx: PlacementContext): LadNode => ({
  id,
  type: 'coil',
  variant: 'OUT',
  target: freeBitAddress('Q', ctx.usedAddresses),
  symbol: '',
  layout: placement(at, 1),
});

const setReset = (variant: 'SET' | 'RESET') =>
  (id: NodeId, at: GridPlacement, ctx: PlacementContext): LadNode => ({
    id,
    type: 'coil',
    variant,
    target: freeBitAddress('Q', ctx.usedAddresses),
    count: 1,
    symbol: '',
    layout: placement(at, 1),
  });

const item = (
  id: PaletteItemId,
  category: PaletteCategoryId,
  label: string,
  description: string,
  rowSpan: number,
  create: PaletteItem['create'],
): PaletteItem => ({ id, category, label, description, rowSpan, create });

// ---- catalogue ---------------------------------------------------------------------------------

export const PALETTE_CATEGORIES: readonly PaletteCategory[] = [
  {
    id: 'bit',
    label: 'Bit Logic',
    items: [
      item('contact-no', 'bit', 'NO', 'Normally open contact', 1, contact('NO')),
      item('contact-nc', 'bit', 'NC', 'Normally closed contact', 1, contact('NC')),
      item('contact-p', 'bit', 'P', 'Positive edge contact', 1, contact('P')),
      item('contact-n', 'bit', 'N', 'Negative edge contact', 1, contact('N')),
      item('coil-out', 'bit', 'Coil', 'Output coil', 1, outCoil),
      item('coil-set', 'bit', 'Set', 'Set coil (S)', 1, setReset('SET')),
      item('coil-reset', 'bit', 'Reset', 'Reset coil (R)', 1, setReset('RESET')),
    ],
  },
  {
    id: 'timerCounter',
    label: 'Timers & Counters',
    items: [
      item('timer-ton', 'timerCounter', 'TON', 'On-delay timer', 2, timer('TON', [[37, 63], [101, 255]])),
      item('timer-tof', 'timerCounter', 'TOF', 'Off-delay timer', 2, timer('TOF', [[37, 63], [101, 255]])),
      item('timer-tonr', 'timerCounter', 'TONR', 'Retentive on-delay timer', 2, timer('TONR', [[5, 31], [69, 95]])),
      item('counter-ctu', 'timerCounter', 'CTU', 'Count up', 2, counter('CTU')),
      item('counter-ctd', 'timerCounter', 'CTD', 'Count down', 2, counter('CTD')),
      item('counter-ctud', 'timerCounter', 'CTUD', 'Count up / down', 3, counter('CTUD')),
    ],
  },
  {
    id: 'compare',
    label: 'Comparators',
    items: [
      item('cmp-eq', 'compare', '==', 'Equal', 1, compare('==')),
      item('cmp-ne', 'compare', '<>', 'Not equal', 1, compare('<>')),
      item('cmp-ge', 'compare', '>=', 'Greater or equal', 1, compare('>=')),
      item('cmp-le', 'compare', '<=', 'Less or equal', 1, compare('<=')),
      item('cmp-gt', 'compare', '>', 'Greater than', 1, compare('>')),
      item('cmp-lt', 'compare', '<', 'Less than', 1, compare('<')),
    ],
  },
  {
    id: 'mathLogic',
    label: 'Math & Word Logic',
    items: [
      item('math-add', 'mathLogic', 'ADD', 'Add', 2, binaryMath('ADD')),
      item('math-sub', 'mathLogic', 'SUB', 'Subtract', 2, binaryMath('SUB')),
      item('math-mul', 'mathLogic', 'MUL', 'Multiply', 2, binaryMath('MUL')),
      item('math-div', 'mathLogic', 'DIV', 'Divide', 2, binaryMath('DIV')),
      item('math-sqr', 'mathLogic', 'SQR', 'Square root (REAL)', 2, unaryMath('SQR')),
      item('math-sin', 'mathLogic', 'SIN', 'Sine (REAL, radians)', 2, unaryMath('SIN')),
      item('math-cos', 'mathLogic', 'COS', 'Cosine (REAL, radians)', 2, unaryMath('COS')),
      item('math-exp', 'mathLogic', 'EXP', 'Natural exponential (REAL)', 2, unaryMath('EXP')),
      item('math-ln', 'mathLogic', 'LN', 'Natural logarithm (REAL, x > 0)', 2, unaryMath('LN')),
      item('math-abs', 'mathLogic', 'ABS', 'Absolute value (INT/DINT/REAL)', 2, absMath),
      item('wl-and', 'mathLogic', 'W-AND', 'Bitwise AND', 2, wordLogic('W_AND')),
      item('wl-or', 'mathLogic', 'W-OR', 'Bitwise OR', 2, wordLogic('W_OR')),
      item('wl-xor', 'mathLogic', 'W-XOR', 'Bitwise XOR', 2, wordLogic('W_XOR')),
      item('wl-not', 'mathLogic', 'NOT', "Bitwise inversion (one's complement)", 2, wordNot),
    ],
  },
];

const BY_ID: ReadonlyMap<PaletteItemId, PaletteItem> = new Map(
  PALETTE_CATEGORIES.flatMap((category) => category.items).map((entry) => [entry.id, entry]),
);

export const getPaletteItem = (id: PaletteItemId): PaletteItem => {
  const found = BY_ID.get(id);
  if (!found) throw new Error(`Unknown palette item "${id}"`);
  return found;
};

export const isPaletteItemId = (value: string): value is PaletteItemId => BY_ID.has(value as PaletteItemId);

/** Instantiates a palette entry at a grid position. */
export function createNode(
  itemId: PaletteItemId,
  nodeId: NodeId,
  at: GridPlacement,
  ctx: PlacementContext,
): LadNode {
  return getPaletteItem(itemId).create(nodeId, at, ctx);
}
