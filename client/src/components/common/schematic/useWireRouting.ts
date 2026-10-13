import { useCallback, useMemo, useState } from 'react';
import type React from 'react';
import { nanoid } from 'nanoid';
import { toast } from 'sonner';
import {
  JUNCTION_PREFIX,
  insertPointIntoWirePath,
  lockWireCorner,
  moveOrthogonalLane,
  orthogonalDraftPath,
  projectPointOntoWire,
  routeTJunctionPath,
  simplifyOrthogonalPath,
  snapPointToGrid,
} from '@/components/common/schematic/schematicGeometry';
import type { SchematicDocumentState } from '@/components/common/schematic/useSchematicDocument';
import type {
  SchematicComponent,
  SchematicComponentLibrary,
  SchematicPoint,
  SchematicWire,
  SchematicWiringState,
  TerminalHit,
} from '@/components/common/schematic/schematicTypes';

export type WireProjection = NonNullable<ReturnType<typeof projectPointOntoWire>>;

export interface WireHit {
  wire: SchematicWire;
  projection: WireProjection;
}

export const WIRE_HIT_THRESHOLD = 14;
export const WIRE_SNAP_PREVIEW_THRESHOLD = 10;

function withWaypoints(path: SchematicPoint[]): SchematicPoint[] | undefined {
  return path.length > 2 ? path.slice(1, -1) : undefined;
}

export interface UseWireRoutingArgs<C extends SchematicComponent> {
  library: SchematicComponentLibrary<C>;
  document: SchematicDocumentState<C>;
  gridSize: number;
  snapEnabled: boolean;
  cursor: SchematicPoint;
  /** Suppresses the live snap ring while the viewport is being panned. */
  panning: boolean;
  /** Pin the pointer is currently magnetised to; the draft wire ends exactly on it. */
  terminalSnap?: TerminalHit | null;
}

export interface WireRouting {
  wiring: SchematicWiringState;
  setWiring: React.Dispatch<React.SetStateAction<SchematicWiringState>>;
  cancelWiring: () => void;
  /** First click arms a wire at a pin; the second click on another pin completes it. */
  handleTerminal: (hit: TerminalHit) => void;
  connectToWire: (wire: SchematicWire, point: SchematicPoint) => void;
  /** Free-space click while drafting: locks an axis-aligned corner. */
  lockCornerAt: (point: SchematicPoint) => void;
  findWireNear: (point: SchematicPoint, threshold?: number) => WireHit | null;
  insertCorner: (wire: SchematicWire, point: SchematicPoint) => void;
  /** Live lane drag of an interior corner (uncommitted; the canvas commits on release). */
  dragCorner: (wireId: string, corner: number, point: SchematicPoint) => void;
  draftPath: SchematicPoint[] | null;
  snapProjection: WireProjection | null;
}

export function useWireRouting<C extends SchematicComponent>({
  library,
  document,
  gridSize,
  snapEnabled,
  cursor,
  panning,
  terminalSnap = null,
}: UseWireRoutingArgs<C>): WireRouting {
  const [wiring, setWiring] = useState<SchematicWiringState>({});
  const { components, wires, setWires, setSelection, setMarqueeIds, commit } = document;

  const cancelWiring = useCallback(() => setWiring({}), []);

  const addWireBetween = useCallback((from: TerminalHit, target: TerminalHit, lockedCorners: SchematicPoint[]) => {
    if (from.componentId === target.componentId && from.terminalId === target.terminalId) {
      setWiring({});
      return;
    }
    const duplicate = wires.some(wire =>
      (wire.fromComp === from.componentId && wire.fromTerm === from.terminalId && wire.toComp === target.componentId && wire.toTerm === target.terminalId)
      || (wire.fromComp === target.componentId && wire.fromTerm === target.terminalId && wire.toComp === from.componentId && wire.toTerm === from.terminalId));
    if (duplicate) {
      toast.message('These terminals are already connected');
      setWiring({});
      return;
    }
    const path = lockedCorners.length
      ? orthogonalDraftPath(from.position, target.position, lockedCorners, from.axis)
      : library.route(from.position, target.position, components, new Set([from.componentId, target.componentId]), from.axis, target.axis);
    const wire: SchematicWire = {
      id: nanoid(10),
      fromComp: from.componentId,
      fromTerm: from.terminalId,
      toComp: target.componentId,
      toTerm: target.terminalId,
      routing: lockedCorners.length ? 'manual' : 'orthogonal',
      path,
      waypoints: withWaypoints(path),
    };
    const nextWires = [...wires, wire];
    setWires(nextWires);
    commit({ wires: nextWires });
    setMarqueeIds([]);
    setSelection({ kind: 'wire', id: wire.id });
    setWiring({});
    toast.success('Wire connected');
  }, [commit, components, library, setMarqueeIds, setSelection, setWires, wires]);

  const handleTerminal = useCallback((hit: TerminalHit) => {
    if (!wiring.from) {
      setWiring({ from: hit, lockedCorners: [] });
      return;
    }
    addWireBetween(wiring.from, hit, wiring.lockedCorners ?? []);
  }, [addWireBetween, wiring.from, wiring.lockedCorners]);

  const findWireNear = useCallback((point: SchematicPoint, threshold = WIRE_HIT_THRESHOLD): WireHit | null => {
    let best: WireHit | null = null;
    for (const wire of wires) {
      const projection = projectPointOntoWire(point, wire.path, gridSize);
      if (projection && projection.distance <= threshold && (!best || projection.distance < best.projection.distance)) {
        best = { wire, projection };
      }
    }
    return best;
  }, [gridSize, wires]);

  const connectToWire = useCallback((target: SchematicWire, point: SchematicPoint) => {
    const from = wiring.from;
    if (!from) return;
    const projection = projectPointOntoWire(point, target.path, gridSize);
    if (!projection) return;
    if ((from.componentId === target.fromComp && from.terminalId === target.fromTerm) || (from.componentId === target.toComp && from.terminalId === target.toTerm)) {
      toast.message('Already connected to this wire');
      setWiring({});
      return;
    }
    const lockedCorners = wiring.lockedCorners ?? [];
    const junction = projection.point;
    const junctionId = `${JUNCTION_PREFIX}${nanoid(10)}`;
    const branchPath = routeTJunctionPath(from.position, junction, projection.axis, lockedCorners, from.axis);
    const branch: SchematicWire = {
      id: nanoid(10),
      fromComp: from.componentId,
      fromTerm: from.terminalId,
      toComp: junctionId,
      toTerm: 'p',
      routing: lockedCorners.length ? 'manual' : 'orthogonal',
      path: branchPath,
      waypoints: withWaypoints(branchPath),
    };
    const headPath = simplifyOrthogonalPath([...target.path.slice(0, projection.segmentIndex + 1), junction]);
    const tailPath = simplifyOrthogonalPath([junction, ...target.path.slice(projection.segmentIndex + 1)]);
    const head: SchematicWire = { ...target, toComp: junctionId, toTerm: 'p', path: headPath, waypoints: withWaypoints(headPath) };
    const tail: SchematicWire = { ...target, id: nanoid(10), fromComp: junctionId, fromTerm: 'p', path: tailPath, waypoints: withWaypoints(tailPath) };
    const nextWires = [...wires.map(wire => (wire.id === target.id ? head : wire)), tail, branch];
    setWires(nextWires);
    commit({ wires: nextWires });
    setMarqueeIds([]);
    setSelection({ kind: 'wire', id: branch.id });
    setWiring({});
    toast.success('Wire connected and split at junction');
  }, [commit, gridSize, setMarqueeIds, setSelection, setWires, wires, wiring.from, wiring.lockedCorners]);

  const lockCornerAt = useCallback((point: SchematicPoint) => {
    const from = wiring.from;
    if (!from) return;
    const snapped = snapEnabled ? snapPointToGrid(point, gridSize) : point;
    const locked = wiring.lockedCorners ?? [];
    const anchor = locked.at(-1) ?? from.position;
    const corner: SchematicPoint = locked.length > 0
      ? lockWireCorner(anchor, snapped)
      : from.axis === 'horizontal' ? [snapped[0], anchor[1]] : [anchor[0], snapped[1]];
    if (corner[0] === anchor[0] && corner[1] === anchor[1]) return;
    setWiring(current => (current.from ? { ...current, lockedCorners: [...(current.lockedCorners ?? []), corner] } : current));
  }, [gridSize, snapEnabled, wiring.from, wiring.lockedCorners]);

  const insertCorner = useCallback((target: SchematicWire, point: SchematicPoint) => {
    const projection = projectPointOntoWire(point, target.path, gridSize);
    if (!projection) return;
    const path = insertPointIntoWirePath(target.path, projection.point, projection.segmentIndex);
    const nextWires = wires.map(wire => (wire.id === target.id ? { ...wire, routing: 'manual' as const, path, waypoints: withWaypoints(path) } : wire));
    setWires(nextWires);
    commit({ wires: nextWires });
    setMarqueeIds([]);
    setSelection({ kind: 'wire', id: target.id });
  }, [commit, gridSize, setMarqueeIds, setSelection, setWires, wires]);

  const dragCorner = useCallback((wireId: string, corner: number, point: SchematicPoint) => {
    const position = snapEnabled ? snapPointToGrid(point, gridSize) : point;
    setWires(previous => previous.map(wire => {
      if (wire.id !== wireId) return wire;
      const path = simplifyOrthogonalPath(moveOrthogonalLane(wire.path, corner, position, gridSize));
      return { ...wire, routing: 'manual' as const, path, waypoints: withWaypoints(path) };
    }));
  }, [gridSize, setWires, snapEnabled]);

  const snapProjection = useMemo(() => {
    if (!wiring.from || panning) return null;
    return findWireNear(cursor, WIRE_SNAP_PREVIEW_THRESHOLD)?.projection ?? null;
  }, [cursor, findWireNear, panning, wiring.from]);

  const draftPath = useMemo(() => {
    const from = wiring.from;
    if (!from) return null;
    const target = terminalSnap?.position ?? snapProjection?.point ?? (snapEnabled ? snapPointToGrid(cursor, gridSize) : cursor);
    if (wiring.lockedCorners && wiring.lockedCorners.length > 0) {
      return orthogonalDraftPath(from.position, target, wiring.lockedCorners, from.axis);
    }
    return library.route(from.position, target, components, new Set([from.componentId]), from.axis);
  }, [components, cursor, gridSize, library, snapEnabled, snapProjection, terminalSnap, wiring.from, wiring.lockedCorners]);

  return {
    wiring,
    setWiring,
    cancelWiring,
    handleTerminal,
    connectToWire,
    lockCornerAt,
    findWireNear,
    insertCorner,
    dragCorner,
    draftPath,
    snapProjection,
  };
}
