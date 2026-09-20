import type { PlcAddress } from './types';

export type NetworkId = string;
export type NodeId = string;
export type BranchId = string;

// ---- operands & pins -------------------------------------------------------------------------

export type Operand =
  | { readonly kind: 'address'; readonly address: PlcAddress }
  | { readonly kind: 'constant'; readonly value: number };

/** Pin driven by rung power flow (wired through the grid), not by a data operand. */
export interface PowerFlow {
  readonly kind: 'flow';
}

export type NumericType = 'BYTE' | 'INT' | 'DINT' | 'REAL';
export type LogicWidth = 'BYTE' | 'WORD' | 'DWORD';

// ---- layout ----------------------------------------------------------------------------------

/**
 * Integer grid placement (0-based cells; pixel size is the renderer's concern).
 * Footprint = [col, col + colSpan) x [row, row + rowSpan). A node with `branchId` sits on that
 * parallel lane and must lie inside the branch bounds; `null` = main rung.
 */
export interface GridPlacement {
  readonly row: number;
  readonly col: number;
  readonly rowSpan: number;
  readonly colSpan: number;
  readonly branchId: BranchId | null;
}

/**
 * Parallel branch. Renderers draw the split rail on the left edge of `splitCol` and the merge rail
 * on the right edge of `mergeCol`, spanning rows [rowStart, rowEnd]; lane wires fill any gap between
 * nodes inside those bounds. Explicit bounds remove the need for geometric inference (no stray wires).
 */
export interface Branch {
  readonly id: BranchId;
  readonly parentId: BranchId | null;
  readonly splitCol: number;
  readonly mergeCol: number;
  readonly rowStart: number;
  readonly rowEnd: number;
}

interface NodeBase {
  readonly id: NodeId;
  readonly layout: GridPlacement;
  readonly symbol?: string;
}

// ---- contacts & coils ------------------------------------------------------------------------

/** NO = normally open, NC = normally closed, P/N = positive/negative edge. */
export type ContactVariant = 'NO' | 'NC' | 'P' | 'N';

export interface ContactNode extends NodeBase {
  readonly type: 'contact';
  readonly variant: ContactVariant;
  readonly operand: PlcAddress;
}

interface AddressedCoil extends NodeBase {
  readonly type: 'coil';
  readonly target: PlcAddress;
}
export interface OutputCoil extends AddressedCoil {
  readonly variant: 'OUT' | 'INTERNAL'; // INTERNAL: target is an M (merker) bit
}
export interface SetResetCoil extends AddressedCoil {
  readonly variant: 'SET' | 'RESET';
  /** Number of consecutive bits affected starting at `target`. */
  readonly count: number;
}
/** Master control zone delimiter (MCR begin/end); has no target. */
export interface MasterCoil extends NodeBase {
  readonly type: 'coil';
  readonly variant: 'MASTER';
  readonly mode: 'begin' | 'end';
}
export type CoilNode = OutputCoil | SetResetCoil | MasterCoil;

// ---- timers & counters -----------------------------------------------------------------------

export type TimerFn = 'TON' | 'TOF' | 'TONR';

export interface TimerNode extends NodeBase {
  readonly type: 'timer';
  readonly fn: TimerFn;
  /** Instance address, e.g. "T37". */
  readonly instance: PlcAddress;
  readonly timeBaseMs: 1 | 10 | 100;
  readonly inputs: { readonly EN?: PowerFlow; readonly IN: PowerFlow; readonly PT: Operand };
  /** Optional bindings mirroring ENO (bit), Q (bit) and ET (elapsed time word). */
  readonly outputs: { readonly ENO?: PlcAddress; readonly Q?: PlcAddress; readonly ET?: PlcAddress };
}

interface CounterBase extends NodeBase {
  readonly type: 'counter';
  readonly instance: PlcAddress; // e.g. "C0"
  readonly outputs: { readonly ENO?: PlcAddress; readonly Q?: PlcAddress; readonly CV?: PlcAddress };
}
/** Counter pins follow the native S7 names: CU/CD count, R/LD reset/load, PV = preset. */
export interface CtuNode extends CounterBase {
  readonly fn: 'CTU';
  readonly inputs: { readonly EN?: PowerFlow; readonly CU: PowerFlow; readonly R: PowerFlow; readonly PV: Operand };
}
export interface CtdNode extends CounterBase {
  readonly fn: 'CTD';
  readonly inputs: { readonly EN?: PowerFlow; readonly CD: PowerFlow; readonly LD: PowerFlow; readonly PV: Operand };
}
export interface CtudNode extends CounterBase {
  readonly fn: 'CTUD';
  readonly inputs: {
    readonly EN?: PowerFlow;
    readonly CU: PowerFlow;
    readonly CD: PowerFlow;
    readonly R: PowerFlow;
    readonly PV: Operand;
  };
}
export type CounterNode = CtuNode | CtdNode | CtudNode;

// ---- box instructions ------------------------------------------------------------------------
// EN is implicit power flow; `eno` optionally mirrors success (no overflow / div-by-zero) to a bit.

export type CompareOp = '==' | '<>' | '>=' | '<=' | '>' | '<';

export interface CompareNode extends NodeBase {
  readonly type: 'compare';
  readonly op: CompareOp;
  readonly dataType: NumericType;
  readonly lhs: Operand;
  readonly rhs: Operand;
}

interface BoxBase extends NodeBase {
  readonly dataType: NumericType;
  readonly out: PlcAddress;
  readonly eno?: PlcAddress;
}
export interface BinaryMathNode extends BoxBase {
  readonly type: 'math';
  readonly fn: 'ADD' | 'SUB' | 'MUL' | 'DIV';
  readonly in1: Operand;
  readonly in2: Operand;
}
/** SQR = square root (S7 SQRT); SIN operates in radians on REAL. */
export interface UnaryMathNode extends BoxBase {
  readonly type: 'math';
  readonly fn: 'SQR' | 'SIN';
  readonly in: Operand;
}
export type MathNode = BinaryMathNode | UnaryMathNode;

export interface WordLogicNode extends NodeBase {
  readonly type: 'wordLogic';
  readonly fn: 'W_AND' | 'W_OR' | 'W_XOR';
  readonly width: LogicWidth;
  readonly in1: Operand;
  readonly in2: Operand;
  readonly out: PlcAddress;
  readonly eno?: PlcAddress;
}

export type LadNode =
  | ContactNode
  | CoilNode
  | TimerNode
  | CounterNode
  | CompareNode
  | MathNode
  | WordLogicNode;

// ---- IL / STL projection ---------------------------------------------------------------------

export type ILStackOp =
  | 'LD' | 'LDN' | 'A' | 'AN' | 'O' | 'ON'
  | 'ALD' | 'OLD' | 'LPS' | 'LRD' | 'LPP'
  | 'EU' | 'ED' | '=' | 'S' | 'R' | 'MCR' | 'MCRE';
export type ILBoxOp = TimerFn | CounterNode['fn'] | MathNode['fn'] | WordLogicNode['fn'] | 'CMP';

/**
 * One IL line. `nodeId` links back to the originating LAD node so both views stay in sync;
 * LAD is canonical, IL is a derived projection (or a parse result awaiting LAD reconstruction).
 */
export interface ILInstruction {
  readonly opcode: ILStackOp | ILBoxOp;
  readonly operands: readonly Operand[];
  readonly cmp?: CompareOp;
  readonly label?: string;
  readonly nodeId?: NodeId;
}

// ---- program ---------------------------------------------------------------------------------

export interface Network {
  readonly id: NetworkId;
  readonly title?: string;
  readonly comment?: string;
  readonly grid: { readonly rows: number; readonly cols: number };
  readonly nodes: readonly LadNode[];
  readonly branches: readonly Branch[];
  readonly il?: readonly ILInstruction[];
}

export interface LadderProgram {
  readonly schemaVersion: 1;
  readonly profileId: string;
  /** Execution order = array order. */
  readonly networks: readonly Network[];
}

// ---- layout validation -----------------------------------------------------------------------

export type LayoutIssueCode =
  | 'INVALID_SPAN'
  | 'OUT_OF_GRID'
  | 'CELL_OVERLAP'
  | 'UNKNOWN_BRANCH'
  | 'OUTSIDE_BRANCH'
  | 'BRANCH_OUTSIDE_PARENT';

export interface LayoutIssue {
  readonly networkId: NetworkId;
  readonly code: LayoutIssueCode;
  readonly nodeId?: NodeId;
  readonly branchId?: BranchId;
  readonly message: string;
}

/** Structural layout check; run before rendering so the SVG router can assume a clean grid. */
export function validateNetworkLayout(network: Network): LayoutIssue[] {
  const issues: LayoutIssue[] = [];
  const add = (code: LayoutIssueCode, message: string, ref: { nodeId?: NodeId; branchId?: BranchId } = {}) =>
    issues.push({ networkId: network.id, code, message, ...ref });

  const branches = new Map(network.branches.map((b) => [b.id, b]));
  const { rows, cols } = network.grid;

  for (const b of network.branches) {
    const parent = b.parentId === null ? undefined : branches.get(b.parentId);
    if (b.parentId !== null && !parent) {
      add('UNKNOWN_BRANCH', `Branch ${b.id} references missing parent ${b.parentId}`, { branchId: b.id });
    } else if (
      parent &&
      (b.splitCol < parent.splitCol || b.mergeCol > parent.mergeCol || b.rowStart < parent.rowStart || b.rowEnd > parent.rowEnd)
    ) {
      add('BRANCH_OUTSIDE_PARENT', `Branch ${b.id} exceeds parent ${parent.id}`, { branchId: b.id });
    }
  }

  const occupied = new Map<string, NodeId>();
  for (const { id, layout: l } of network.nodes) {
    const ref = { nodeId: id };
    if (![l.row, l.col, l.rowSpan, l.colSpan].every(Number.isInteger) || l.rowSpan < 1 || l.colSpan < 1 || l.row < 0 || l.col < 0) {
      add('INVALID_SPAN', `Node ${id} has non-integer, negative or empty placement`, ref);
      continue;
    }
    const lastRow = l.row + l.rowSpan - 1;
    const lastCol = l.col + l.colSpan - 1;
    if (lastRow >= rows || lastCol >= cols) add('OUT_OF_GRID', `Node ${id} exceeds ${rows}x${cols} grid`, ref);

    if (l.branchId !== null) {
      const b = branches.get(l.branchId);
      if (!b) add('UNKNOWN_BRANCH', `Node ${id} references missing branch ${l.branchId}`, ref);
      else if (l.col < b.splitCol || lastCol > b.mergeCol || l.row < b.rowStart || lastRow > b.rowEnd) {
        add('OUTSIDE_BRANCH', `Node ${id} lies outside branch ${b.id}`, ref);
      }
    }

    let overlapped = false;
    for (let r = l.row; r <= lastRow && !overlapped; r++) {
      for (let c = l.col; c <= lastCol; c++) {
        const key = `${r},${c}`;
        const other = occupied.get(key);
        if (other !== undefined) {
          add('CELL_OVERLAP', `Node ${id} overlaps ${other} at (${r},${c})`, ref);
          overlapped = true;
          break;
        }
        occupied.set(key, id);
      }
    }
  }
  return issues;
}
