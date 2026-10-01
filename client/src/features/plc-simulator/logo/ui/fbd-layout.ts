import { BLOCK_SPECS, connectorName, sinkName, type ConnectorRef, type LogoBlock, type LogoProgram, type PinName, type Sink } from '@shared/logo/types';

/**
 * Layered (Sugiyama-style) layout of a LOGO! circuit program as a function block diagram:
 * column 0 = sources (I, M, Q read-backs, hi/lo), columns 1..N-1 = blocks by dependency depth,
 * column N = sinks (Q, M). Edges that skip columns are threaded through reserved dummy slots, so a long
 * wire never runs through a block body; every wire is orthogonal, with a private vertical lane per net
 * in each column gap.
 */

export type Point = readonly [number, number];

export interface FbdPin {
  readonly name: PinName | 'In';
  readonly y: number;
  readonly invert: boolean;
  /** Net key of the driving source, null for an open (`x`) pin. */
  readonly net: string | null;
}

export type FbdNode =
  | { readonly kind: 'source'; readonly key: string; readonly ref: ConnectorRef }
  | { readonly kind: 'block'; readonly key: string; readonly block: LogoBlock }
  | { readonly kind: 'sink'; readonly key: string; readonly sink: Sink };

export interface PlacedNode {
  readonly node: FbdNode;
  readonly col: number;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly pins: readonly FbdPin[];
  /** Output anchor (right edge), absent for sinks. */
  readonly out: Point | null;
}

export interface FbdEdge {
  /** Net key: the connector that drives it (`B3`, `I1`, `Q2`, ...). */
  readonly net: string;
  readonly ref: ConnectorRef;
  readonly points: readonly Point[];
}

export interface FbdLayout {
  readonly nodes: readonly PlacedNode[];
  readonly edges: readonly FbdEdge[];
  readonly width: number;
  readonly height: number;
}

export const FBD = {
  pad: 16,
  pinPitch: 18,
  header: 22,
  blockW: 112,
  terminalW: 58,
  terminalH: 26,
  dummyH: 6,
  rowGap: 18,
  laneStep: 8,
  gapBase: 30,
} as const;

const netOf = (ref: ConnectorRef): string => connectorName(ref);

interface Hop {
  readonly net: string;
  readonly ref: ConnectorRef;
  readonly fromKey: string;
  readonly toKey: string;
  /** Pin index on the target, -1 when the target is a dummy slot. */
  readonly pin: number;
}

export function layoutFbd(program: LogoProgram): FbdLayout {
  const blocks = [...program.blocks].sort((a, b) => a.id - b.id);
  const byId = new Map(blocks.map((block) => [block.id, block] as const));

  // ---- depth (column) of every block --------------------------------------------------------
  const depth = new Map<number, number>();
  const depthOf = (id: number, trail: ReadonlySet<number> = new Set()): number => {
    const known = depth.get(id);
    if (known !== undefined) return known;
    const block = byId.get(id);
    if (!block || trail.has(id)) return 1;
    const next = new Set(trail).add(id);
    let d = 1;
    for (const pin of BLOCK_SPECS[block.type].pins) {
      const r = block.inputs[pin]?.ref;
      if (r?.kind === 'block-output') d = Math.max(d, depthOf(r.blockId, next) + 1);
    }
    depth.set(id, d);
    return d;
  };
  blocks.forEach((block) => depthOf(block.id));
  const sinkCol = Math.max(0, ...Array.from(depth.values())) + 1;

  // ---- nodes -------------------------------------------------------------------------------
  const nodes = new Map<string, { node: FbdNode; col: number; h: number; w: number }>();
  const addSource = (ref: ConnectorRef): string => {
    const key = `src:${netOf(ref)}`;
    if (!nodes.has(key)) nodes.set(key, { node: { kind: 'source', key, ref }, col: 0, h: FBD.terminalH, w: FBD.terminalW });
    return key;
  };
  const colOfNet = (ref: ConnectorRef): number => (ref.kind === 'block-output' ? depth.get(ref.blockId) ?? 1 : 0);
  const keyOfNet = (ref: ConnectorRef): string => (ref.kind === 'block-output' ? `blk:${ref.blockId}` : addSource(ref));

  for (const block of blocks) {
    const pins = BLOCK_SPECS[block.type].pins.length;
    nodes.set(`blk:${block.id}`, {
      node: { kind: 'block', key: `blk:${block.id}`, block },
      col: depth.get(block.id) ?? 1,
      h: FBD.header + Math.max(2, pins) * FBD.pinPitch + 6,
      w: FBD.blockW,
    });
  }
  program.sinks.forEach((sink, index) => {
    const key = `snk:${index}`;
    nodes.set(key, { node: { kind: 'sink', key, sink }, col: sinkCol, h: FBD.terminalH, w: FBD.terminalW });
  });

  // ---- hops, with dummy slots for edges that skip columns -------------------------------------
  const hops: Hop[] = [];
  const dummies = new Map<string, { col: number; net: string }>();
  const connect = (ref: ConnectorRef, toKey: string, toCol: number, pin: number): void => {
    const net = netOf(ref);
    const fromCol = colOfNet(ref);
    let fromKey = keyOfNet(ref);
    for (let c = fromCol + 1; c < toCol; c++) {
      const dummyKey = `dmy:${net}@${c}`;
      if (!dummies.has(dummyKey)) {
        dummies.set(dummyKey, { col: c, net });
        hops.push({ net, ref, fromKey, toKey: dummyKey, pin: -1 });
      }
      fromKey = dummyKey;
    }
    hops.push({ net, ref, fromKey, toKey, pin });
  };
  for (const block of blocks) {
    const col = depth.get(block.id) ?? 1;
    BLOCK_SPECS[block.type].pins.forEach((pin, index) => {
      const r = block.inputs[pin]?.ref;
      if (r && r.kind !== 'x') connect(r, `blk:${block.id}`, col, index);
    });
  }
  program.sinks.forEach((sink, index) => connect(sink.source, `snk:${index}`, sinkCol, 0));
  dummies.forEach((dummy, key) => {
    nodes.set(key, { node: { kind: 'source', key, ref: { kind: 'x' } }, col: dummy.col, h: FBD.dummyH, w: 0 });
  });

  // ---- vertical placement, right to left (barycentre of consumers) ---------------------------
  const center = new Map<string, number>();
  const top = new Map<string, number>();
  const pinY = (key: string, pin: number): number => {
    const placedTop = top.get(key) ?? 0;
    const entry = nodes.get(key);
    if (!entry) return 0;
    if (entry.node.kind === 'block') return placedTop + FBD.header + pin * FBD.pinPitch + FBD.pinPitch / 2;
    return placedTop + entry.h / 2;
  };
  const columns = new Map<number, string[]>();
  nodes.forEach((entry, key) => columns.set(entry.col, [...(columns.get(entry.col) ?? []), key]));
  let height = 0;
  for (let col = sinkCol; col >= 0; col--) {
    const keys = columns.get(col) ?? [];
    const desired = (key: string): number => {
      const ys = hops.filter((hop) => hop.fromKey === key).map((hop) => pinY(hop.toKey, Math.max(0, hop.pin)));
      if (ys.length === 0) return Number.POSITIVE_INFINITY;
      return ys.reduce((sum, y) => sum + y, 0) / ys.length;
    };
    const order = col === sinkCol ? keys : [...keys].sort((a, b) => desired(a) - desired(b) || a.localeCompare(b, 'en', { numeric: true }));
    let cursor = FBD.pad;
    for (const key of order) {
      const entry = nodes.get(key);
      if (!entry) continue;
      const want = desired(key);
      const offset = entry.node.kind === 'block' ? FBD.header + FBD.pinPitch / 2 : entry.h / 2;
      const y = Number.isFinite(want) ? Math.max(cursor, want - offset) : cursor;
      top.set(key, y);
      center.set(key, y + offset);
      cursor = y + entry.h + (entry.node.kind === 'source' && entry.w === 0 ? 4 : FBD.rowGap);
    }
    height = Math.max(height, cursor);
  }

  // ---- lanes per column gap, then x coordinates ----------------------------------------------
  const lanes = new Map<number, string[]>(); // gap c = between column c and c + 1
  for (const hop of hops) {
    const gap = (nodes.get(hop.toKey)?.col ?? 1) - 1;
    const list = lanes.get(gap) ?? [];
    if (!list.includes(hop.net)) list.push(hop.net);
    lanes.set(gap, list);
  }
  const colWidth = (col: number): number => (col === 0 || col === sinkCol ? FBD.terminalW : FBD.blockW);
  const colX: number[] = [];
  const gapX: number[] = [];
  let x = FBD.pad;
  for (let col = 0; col <= sinkCol; col++) {
    colX[col] = x;
    x += colWidth(col);
    gapX[col] = x;
    if (col < sinkCol) x += FBD.gapBase + (lanes.get(col)?.length ?? 1) * FBD.laneStep;
  }
  const width = x + FBD.pad;

  // Sort each gap's lanes by the y of the net where it enters the gap, so verticals rarely cross.
  lanes.forEach((list, gap) => {
    const entryY = (net: string): number => {
      const hop = hops.find((h) => h.net === net && (nodes.get(h.toKey)?.col ?? 0) - 1 === gap);
      return hop ? center.get(hop.fromKey) ?? 0 : 0;
    };
    list.sort((a, b) => entryY(a) - entryY(b));
  });
  const laneX = (gap: number, net: string): number => (gapX[gap] ?? 0) + FBD.gapBase / 2 + (lanes.get(gap)?.indexOf(net) ?? 0) * FBD.laneStep;

  // ---- placed nodes ------------------------------------------------------------------------
  const placed: PlacedNode[] = [];
  nodes.forEach((entry, key) => {
    if (key.startsWith('dmy:')) return;
    const nx = colX[entry.col] ?? 0;
    const ny = top.get(key) ?? 0;
    const pins: FbdPin[] =
      entry.node.kind === 'block'
        ? BLOCK_SPECS[entry.node.block.type].pins.map((name, index) => {
            const wire = entry.node.kind === 'block' ? entry.node.block.inputs[name] : undefined;
            return { name, y: pinY(key, index), invert: wire?.invert === true, net: wire && wire.ref.kind !== 'x' ? netOf(wire.ref) : null };
          })
        : entry.node.kind === 'sink'
          ? [{ name: 'In', y: pinY(key, 0), invert: false, net: netOf(entry.node.sink.source) }]
          : [];
    const outY = entry.node.kind === 'block' ? pinY(key, 0) : ny + entry.h / 2;
    placed.push({ node: entry.node, col: entry.col, x: nx, y: ny, w: entry.w, h: entry.h, pins, out: entry.node.kind === 'sink' ? null : [nx + entry.w, outY] });
  });

  // ---- orthogonal edge routes --------------------------------------------------------------
  const anchorOut = (key: string): Point => {
    const entry = nodes.get(key);
    if (!entry) return [0, 0];
    const nx = colX[entry.col] ?? 0;
    if (key.startsWith('dmy:')) return [nx + colWidth(entry.col), center.get(key) ?? 0];
    const y = entry.node.kind === 'block' ? pinY(key, 0) : (top.get(key) ?? 0) + entry.h / 2;
    return [nx + entry.w, y];
  };
  const edges: FbdEdge[] = hops.map((hop) => {
    const target = nodes.get(hop.toKey);
    const [x1, y1] = anchorOut(hop.fromKey);
    const col = target?.col ?? 1;
    const tx = colX[col] ?? 0;
    const ty = hop.pin < 0 ? center.get(hop.toKey) ?? 0 : pinY(hop.toKey, hop.pin);
    const lx = laneX(col - 1, hop.net);
    const points: Point[] = y1 === ty ? [[x1, y1], [tx, ty]] : [[x1, y1], [lx, y1], [lx, ty], [tx, ty]];
    // a dummy slot carries the wire straight across its column
    if (hop.pin < 0) points.push([tx + colWidth(col), ty]);
    return { net: hop.net, ref: hop.ref, points };
  });

  return { nodes: placed, edges, width, height: height + FBD.pad };
}

export const sinkLabel = (sink: Sink): string => sinkName(sink.target);
