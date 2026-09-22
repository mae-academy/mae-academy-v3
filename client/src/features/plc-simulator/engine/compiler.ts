import { validateAddress } from '../domain/address';
import type {
  Branch,
  BranchId,
  LadNode,
  LadderProgram,
  Network,
  NetworkId,
  NodeId,
  Operand,
} from '../domain/ast';
import type { HardwareProfile } from '../domain/hardware';
import { isIndexedArea, type AccessWidth, type PlcAddress } from '../domain/types';
import { LOGIC_WIDTHS, NUMERIC_TYPES } from './numeric';
import type { Diagnostic, DiagnosticCode, DiagnosticSeverity } from './types';

/**
 * Compiles the spatial LAD grid into an executable series/parallel tree.
 *
 * The AST stores geometry (row/col/branch) rather than an explicit graph, so the compiler derives
 * the topology once, at load time: a rung is a series of elements ordered by column, and a `Branch`
 * expands into a parallel group whose lanes are the rows it spans. A nested branch belongs to the
 * lane it starts on (`rowStart`). Doing this once keeps the per-scan evaluator allocation-free.
 */

export type EvalTree =
  /**
   * One instruction. `inlets` carries the pre-compiled chains feeding a multi-pin box's secondary
   * rows (CTUD: CU is the rung's own power flow, CD and R come from the two rows beneath it).
   */
  | { readonly kind: 'leaf'; readonly node: LadNode; readonly inlets: readonly EvalTree[] }
  /** AND: power flows through every child left to right. */
  | { readonly kind: 'series'; readonly children: readonly EvalTree[] }
  /** OR: every lane receives the incoming flow; the outgoing flow is their union. */
  | {
      readonly kind: 'parallel';
      readonly branchId: BranchId;
      readonly lanes: readonly EvalTree[];
      /** Grid row of each lane; rows claimed by a nested group or a box pin are not lanes. */
      readonly laneRows: readonly number[];
    };

/**
 * Rung rows a box occupies, one per power-flow pin. The first pin is fed by the rung the box sits
 * on; the rest are fed by the rows immediately below, exactly as the S7-200 box symbols are drawn.
 */
export function inletCount(node: LadNode): number {
  if (node.type !== 'counter') return 1;
  return node.fn === 'CTUD' ? 3 : 2;
}

export interface CompiledNetwork {
  readonly id: NetworkId;
  readonly source: Network;
  readonly root: EvalTree;
}

export interface CompiledProgram {
  readonly profileId: string;
  readonly networks: readonly CompiledNetwork[];
  readonly diagnostics: readonly Diagnostic[];
  /** False when any diagnostic has `error` severity; the runtime refuses to enter RUN. */
  readonly ok: boolean;
}

type Reporter = (
  code: DiagnosticCode,
  severity: DiagnosticSeverity,
  message: string,
  ref?: { nodeId?: NodeId; branchId?: BranchId; address?: PlcAddress },
) => void;

const EMPTY_TREE: EvalTree = { kind: 'series', children: [] };

/** Column a grid element starts at, used to order a lane left to right. */
const startCol = (element: LadNode | Branch): number =>
  'layout' in element ? element.layout.col : element.splitCol;
const startRow = (element: LadNode | Branch): number =>
  'layout' in element ? element.layout.row : element.rowStart;

export function compileProgram(program: LadderProgram, profile: HardwareProfile): CompiledProgram {
  const diagnostics: Diagnostic[] = [];
  const networks: CompiledNetwork[] = [];

  if (program.profileId !== profile.id) {
    diagnostics.push({
      code: 'INVALID_OPERAND',
      severity: 'error',
      message: `Program targets profile "${program.profileId}" but "${profile.id}" is loaded`,
    });
  }
  if (program.networks.length > profile.limits.maxNetworks) {
    diagnostics.push({
      code: 'ADDRESS_OUT_OF_RANGE',
      severity: 'error',
      message: `${program.networks.length} networks exceed the ${profile.limits.maxNetworks} supported by ${profile.model}`,
    });
  }

  const instanceOwners = new Map<PlcAddress, NodeId>();
  for (const network of program.networks) {
    networks.push(compileNetwork(network, profile, diagnostics, instanceOwners));
  }

  return {
    profileId: profile.id,
    networks,
    diagnostics,
    ok: !diagnostics.some((d) => d.severity === 'error'),
  };
}

function compileNetwork(
  network: Network,
  profile: HardwareProfile,
  diagnostics: Diagnostic[],
  instanceOwners: Map<PlcAddress, NodeId>,
): CompiledNetwork {
  const add: Reporter = (code, severity, message, ref = {}) => {
    diagnostics.push({ code, severity, message, networkId: network.id, nodeId: ref.nodeId, address: ref.address });
  };
  for (const node of network.nodes) checkNode(node, profile, add, instanceOwners);
  return { id: network.id, source: network, root: buildNetworkTree(network, add) };
}

/**
 * Derives the series/parallel topology of one network from its grid geometry.
 *
 * Profile-free and side-effect free, so the scan engine and the LAD -> STL generator read the
 * layout through exactly one implementation instead of two that can drift apart.
 */
export function buildNetworkTree(network: Network, report?: Reporter): EvalTree {
  const add: Reporter = report ?? (() => {});

  // ---- index the grid --------------------------------------------------------------------
  const branchesById = new Map<BranchId, Branch>();
  for (const branch of network.branches) branchesById.set(branch.id, branch);

  const mainNodes: LadNode[] = [];
  const nodesByBranch = new Map<BranchId, LadNode[]>();
  for (const node of network.nodes) {
    const owner = node.layout.branchId;
    if (owner === null) {
      mainNodes.push(node);
      continue;
    }
    if (!branchesById.has(owner)) {
      add('UNKNOWN_BRANCH', 'error', `Node ${node.id} references missing branch ${owner}`, { nodeId: node.id });
      continue;
    }
    const bucket = nodesByBranch.get(owner);
    if (bucket) bucket.push(node);
    else nodesByBranch.set(owner, [node]);
  }

  const childBranches = new Map<BranchId | null, Branch[]>();
  for (const branch of network.branches) {
    const parent = branch.parentId;
    if (parent !== null && !branchesById.has(parent)) {
      add('UNKNOWN_BRANCH', 'error', `Branch ${branch.id} references missing parent ${parent}`, { branchId: branch.id });
      continue;
    }
    const bucket = childBranches.get(parent);
    if (bucket) bucket.push(branch);
    else childBranches.set(parent, [branch]);
  }

  // ---- build the tree --------------------------------------------------------------------
  const openBranches = new Set<BranchId>();
  /**
   * Rows of a lane space that are already spoken for, keyed `<owner>#<row>`: the extra rows of a
   * multi-pin box and the continuation rows of a nested branch. Without this a nested group's
   * lower rows would also surface as empty lanes of the parent and short it out.
   */
  const claimedRows = new Set<string>();
  const claimRow = (owner: BranchId | null, row: number): void => {
    claimedRows.add(`${owner ?? ''}#${row}`);
  };
  const isClaimed = (owner: BranchId | null, row: number): boolean =>
    claimedRows.has(`${owner ?? ''}#${row}`);

  /**
   * Series of the elements sitting on one lane, ordered left to right.
   * `beforeCol` restricts the chain to what feeds a box inlet on that row.
   */
  const buildLane = (owner: BranchId | null, row: number, beforeCol: number | null): EvalTree => {
    const elements: (LadNode | Branch)[] = [];
    const nodes = owner === null ? mainNodes : (nodesByBranch.get(owner) ?? []);
    for (const node of nodes) {
      if (node.layout.row === row && (beforeCol === null || node.layout.col < beforeCol)) elements.push(node);
    }
    for (const branch of childBranches.get(owner) ?? []) {
      if (branch.rowStart === row && (beforeCol === null || branch.splitCol < beforeCol)) elements.push(branch);
    }
    elements.sort((a, b) => startCol(a) - startCol(b) || startRow(a) - startRow(b));

    const children: EvalTree[] = [];
    for (const element of elements) {
      if ('layout' in element) {
        children.push(buildLeaf(element, owner));
        continue;
      }
      // The rows a nested group extends over belong to that group, not to this lane space.
      for (let r = element.rowStart + 1; r <= element.rowEnd; r++) claimRow(owner, r);
      children.push(buildParallel(element));
    }
    return children.length === 1 ? (children[0] ?? EMPTY_TREE) : { kind: 'series', children };
  };

  const buildLeaf = (node: LadNode, owner: BranchId | null): EvalTree => {
    const pins = inletCount(node);
    if (pins === 1) {
      for (let row = node.layout.row + 1; row < node.layout.row + node.layout.rowSpan; row++) claimRow(owner, row);
      return { kind: 'leaf', node, inlets: [] };
    }

    if (node.layout.rowSpan < pins) {
      add('INVALID_OPERAND', 'warning', `${node.id} needs ${pins} rows for its pins but spans ${node.layout.rowSpan}`, {
        nodeId: node.id,
      });
    }
    const inlets: EvalTree[] = [];
    for (let pin = 1; pin < pins; pin++) {
      const row = node.layout.row + pin;
      claimRow(owner, row);
      inlets.push(buildLane(owner, row, node.layout.col));
    }
    // Rows the box body covers beyond its pins are not parallel lanes either.
    for (let row = node.layout.row + pins; row < node.layout.row + node.layout.rowSpan; row++) {
      claimRow(owner, row);
    }
    return { kind: 'leaf', node, inlets };
  };

  const buildParallel = (branch: Branch): EvalTree => {
    if (openBranches.has(branch.id)) {
      add('BRANCH_CYCLE', 'error', `Branch ${branch.id} is nested inside itself`, { branchId: branch.id });
      return EMPTY_TREE;
    }
    openBranches.add(branch.id);
    const lanes: EvalTree[] = [];
    const laneRows: number[] = [];
    for (let row = branch.rowStart; row <= branch.rowEnd; row++) {
      if (isClaimed(branch.id, row)) continue; // row feeds a box pin or a nested group
      const lane = buildLane(branch.id, row, null);
      if (lane.kind === 'series' && lane.children.length === 0) {
        // An empty lane is an unconditional short across the group, almost always an editing slip.
        add('EMPTY_BRANCH_LANE', 'warning', `Branch ${branch.id} row ${row} is empty and shorts the group`, {
          branchId: branch.id,
        });
      }
      lanes.push(lane);
      laneRows.push(row);
    }
    openBranches.delete(branch.id);
    return { kind: 'parallel', branchId: branch.id, lanes, laneRows };
  };

  return buildLane(null, 0, null);
}

// ---- static operand checking -------------------------------------------------------------------


/** Accepts a true bit address, or a T/C instance whose status bit stands in for one. */
const BIT_OR_INSTANCE = 'bit-or-instance';
type RequiredWidth = AccessWidth | typeof BIT_OR_INSTANCE;

function checkAddress(
  address: PlcAddress,
  required: RequiredWidth,
  profile: HardwareProfile,
  nodeId: NodeId,
  add: Reporter,
): void {
  const result = validateAddress(address, profile);
  if (!result.isValid || !result.parsed) {
    add('ADDRESS_OUT_OF_RANGE', 'error', result.error ?? `Invalid address "${address}"`, { nodeId, address });
    return;
  }
  const { area, width } = result.parsed;
  const ok =
    required === BIT_OR_INSTANCE ? width === 'bit' || isIndexedArea(area) : width === required;
  if (!ok) {
    add(
      'TYPE_WIDTH_MISMATCH',
      'error',
      `"${address}" is ${width}-wide but the instruction needs ${required === BIT_OR_INSTANCE ? 'a bit' : required}`,
      { nodeId, address },
    );
  }
}

function checkOperand(
  operand: Operand,
  required: RequiredWidth,
  profile: HardwareProfile,
  nodeId: NodeId,
  add: Reporter,
): void {
  if (operand.kind === 'address') checkAddress(operand.address, required, profile, nodeId, add);
  else if (!Number.isFinite(operand.value)) {
    add('INVALID_OPERAND', 'error', `Node ${nodeId} has a non-finite constant`, { nodeId });
  }
}

function claimInstance(
  address: PlcAddress,
  node: LadNode,
  owners: Map<PlcAddress, NodeId>,
  add: Reporter,
): void {
  const canonical = address.trim().toUpperCase();
  const existing = owners.get(canonical);
  if (existing !== undefined && existing !== node.id) {
    add('DUPLICATE_INSTANCE', 'error', `Instance ${canonical} is driven by both ${existing} and ${node.id}`, {
      nodeId: node.id,
      address: canonical,
    });
    return;
  }
  owners.set(canonical, node.id);
}

function checkNode(
  node: LadNode,
  profile: HardwareProfile,
  add: Reporter,
  owners: Map<PlcAddress, NodeId>,
): void {
  switch (node.type) {
    case 'contact':
      checkAddress(node.operand, BIT_OR_INSTANCE, profile, node.id, add);
      return;

    case 'coil':
      if (node.variant === 'MASTER') return;
      checkAddress(node.target, BIT_OR_INSTANCE, profile, node.id, add);
      if ((node.variant === 'SET' || node.variant === 'RESET') && (!Number.isInteger(node.count) || node.count < 1)) {
        add('INVALID_OPERAND', 'error', `${node.variant} coil ${node.id} needs a positive bit count`, { nodeId: node.id });
      }
      return;

    case 'timer': {
      const parsed = validateAddress(node.instance, profile).parsed;
      if (!parsed || parsed.area !== 'T') {
        add('ADDRESS_OUT_OF_RANGE', 'error', `Timer ${node.id} needs a T instance, got "${node.instance}"`, {
          nodeId: node.id,
          address: node.instance,
        });
      } else claimInstance(node.instance, node, owners, add);
      checkOperand(node.inputs.PT, 'word', profile, node.id, add);
      if (node.outputs.Q) checkAddress(node.outputs.Q, BIT_OR_INSTANCE, profile, node.id, add);
      if (node.outputs.ENO) checkAddress(node.outputs.ENO, BIT_OR_INSTANCE, profile, node.id, add);
      if (node.outputs.ET) checkAddress(node.outputs.ET, 'word', profile, node.id, add);
      return;
    }

    case 'counter': {
      const parsed = validateAddress(node.instance, profile).parsed;
      if (!parsed || parsed.area !== 'C') {
        add('ADDRESS_OUT_OF_RANGE', 'error', `Counter ${node.id} needs a C instance, got "${node.instance}"`, {
          nodeId: node.id,
          address: node.instance,
        });
      } else claimInstance(node.instance, node, owners, add);
      checkOperand(node.inputs.PV, 'word', profile, node.id, add);
      if (node.outputs.Q) checkAddress(node.outputs.Q, BIT_OR_INSTANCE, profile, node.id, add);
      if (node.outputs.ENO) checkAddress(node.outputs.ENO, BIT_OR_INSTANCE, profile, node.id, add);
      if (node.outputs.CV) checkAddress(node.outputs.CV, 'word', profile, node.id, add);
      return;
    }

    case 'compare': {
      const width = NUMERIC_TYPES[node.dataType].width;
      checkOperand(node.lhs, width, profile, node.id, add);
      checkOperand(node.rhs, width, profile, node.id, add);
      return;
    }

    case 'math': {
      const width = NUMERIC_TYPES[node.dataType].width;
      if ('in1' in node) {
        checkOperand(node.in1, width, profile, node.id, add);
        checkOperand(node.in2, width, profile, node.id, add);
      } else {
        checkOperand(node.in, width, profile, node.id, add);
      }
      checkAddress(node.out, width, profile, node.id, add);
      if (node.eno) checkAddress(node.eno, BIT_OR_INSTANCE, profile, node.id, add);
      return;
    }

    case 'wordLogic': {
      const width = LOGIC_WIDTHS[node.width];
      if ('in1' in node) {
        checkOperand(node.in1, width, profile, node.id, add);
        checkOperand(node.in2, width, profile, node.id, add);
      } else {
        checkOperand(node.in, width, profile, node.id, add);
      }
      checkAddress(node.out, width, profile, node.id, add);
      if (node.eno) checkAddress(node.eno, BIT_OR_INSTANCE, profile, node.id, add);
      return;
    }

    default: {
      const exhaustive: never = node;
      void exhaustive;
    }
  }
}
