import type { CircuitComponent, CircuitWire } from '@/simulators/circuit-engine/models/circuitTypes';
import { getDef } from '@/simulators/circuit-engine/models/componentDefs';

/**
 * Authoring helpers for example schematics. Wire *paths* below are deliberately only
 * approximate straight lines between component centers: `loadCircuitDocument` (Home.tsx)
 * re-runs `recalculateAllOrthogonalPaths` on the next two animation frames after any
 * import, exactly as it does for a `.nad` file, so hand-computing pixel-perfect orthogonal
 * routing here would be wasted precision — only `fromComp/fromTerm/toComp/toTerm`
 * (the actual electrical connection) has to be right.
 */

let uidCounter = 0;
/** Deterministic-enough unique id, scoped by an example-local prefix to avoid collisions. */
export function uid(prefix: string): string {
  uidCounter += 1;
  return `${prefix}_${uidCounter}`;
}

export function part(id: string, type: string, x: number, y: number, props: Record<string, unknown> = {}, opts: { rotation?: number; label?: string } = {}): CircuitComponent {
  return { id, type, x, y, rotation: opts.rotation ?? 0, flipH: false, flipV: false, label: opts.label ?? id.toUpperCase(), props };
}

export function wire(id: string, fromComp: string, fromTerm: string, toComp: string, toTerm: string, fromPt: [number, number], toPt: [number, number]): CircuitWire {
  return { id, fromComp, fromTerm, toComp, toTerm, path: [fromPt, toPt], routing: 'orthogonal' };
}

/**
 * Oscilloscope props for an example: one shared time base on all four channels (which also sets
 * the live `.tran` window — Home.tsx runs for 10 × the widest time/div) and per-channel volts/div.
 */
export function oscilloscopeProps(timeDiv: number, voltDiv: [number, number, number, number]): Record<string, number> {
  const props: Record<string, number> = {};
  (['ch1', 'ch2', 'ch3', 'ch4'] as const).forEach((channel, index) => {
    props[`timeDiv_${channel}`] = timeDiv;
    props[`voltDiv_${channel}`] = voltDiv[index];
  });
  return props;
}

/**
 * Returns a `wire` factory bound to a set of placed components, which fills each wire's end points
 * from the terminal's own offset in componentDefs — so a hand-placed, unrotated multi-terminal
 * schematic (an op-amp stage, say) needs only the electrical connection spelled out.
 */
export function pinWires(components: CircuitComponent[]): (fromComp: string, fromTerm: string, toComp: string, toTerm: string) => CircuitWire {
  const byId = new Map(components.map((component) => [component.id, component]));
  const pin = (componentId: string, terminalId: string): [number, number] => {
    const component = byId.get(componentId);
    const terminal = component ? getDef(component.type)?.terminals.find((t) => t.id === terminalId) : undefined;
    return component && terminal ? [component.x + terminal.x, component.y + terminal.y] : [component?.x ?? 0, component?.y ?? 0];
  };
  return (fromComp, fromTerm, toComp, toTerm) => {
    const from = pin(fromComp, fromTerm);
    const to = pin(toComp, toTerm);
    // Horizontal–vertical–horizontal dog-leg, so the wire is orthogonal even before (or without)
    // the canvas re-routing it.
    const midX = Math.round((from[0] + to[0]) / 2);
    const path: Array<[number, number]> = from[0] === to[0] || from[1] === to[1] ? [from, to] : [from, [midX, from[1]], [midX, to[1]], to];
    return { id: uid('w'), fromComp, fromTerm, toComp, toTerm, path, routing: 'orthogonal' };
  };
}

/**
 * Lays out a vertical series chain: a two-terminal source at the top (terminals 'pos'/'neg'
 * or 'a'/'b', y = -50/+50 or -30/+30 respectively — handled via `sourceTerminals`), then each
 * part in `chainParts` end-to-end, ending at a ground symbol. Returns every component and wire
 * needed, plus the id of each inter-part junction node (`node_1`, `node_2`, ...) for callers
 * that need to branch off the chain (e.g. tap a voltage, add a parallel load).
 */
export interface ChainPart {
  id: string;
  type: string;
  props?: Record<string, unknown>;
  label?: string;
  /** 'a'/'b' for resistor/capacitor/inductor (default), or an explicit pair for other parts. */
  terminals?: [string, string];
  rotation?: number;
}

export function buildSeriesChain(opts: {
  x: number;
  sourceId: string;
  sourceType: string;
  sourceProps?: Record<string, unknown>;
  sourceLabel?: string;
  /** [outputTerminal, returnTerminal] — output feeds the chain top, return ties to ground. */
  sourceTerminals?: [string, string];
  chainParts: ChainPart[];
  groundId: string;
  startY?: number;
  stepY?: number;
}): { components: CircuitComponent[]; wires: CircuitWire[]; junctionComponentIds: string[] } {
  const { x, sourceId, sourceType, sourceProps = {}, sourceLabel, sourceTerminals = ['pos', 'neg'], chainParts, groundId, startY = 120, stepY = 130 } = opts;
  const [outputTerm, returnTerm] = sourceTerminals;
  const components: CircuitComponent[] = [];
  const wires: CircuitWire[] = [];

  const source = part(sourceId, sourceType, x, startY, sourceProps, { label: sourceLabel });
  components.push(source);
  let previousId = sourceId;
  let previousTerm = outputTerm;
  let previousY = startY - 50;

  const junctionComponentIds: string[] = [];

  chainParts.forEach((chainPart, index) => {
    const y = startY + 50 + (index + 1) * stepY;
    const terms: [string, string] = chainPart.terminals ?? ['a', 'b'];
    const component = part(chainPart.id, chainPart.type, x, y, chainPart.props ?? {}, { label: chainPart.label, rotation: chainPart.rotation ?? 90 });
    components.push(component);
    wires.push(wire(uid('w'), previousId, previousTerm, chainPart.id, terms[0], [x, previousY], [x, y - 30]));
    previousId = chainPart.id;
    previousTerm = terms[1];
    previousY = y + 30;
    junctionComponentIds.push(chainPart.id);
  });

  const groundY = previousY + 60;
  const ground = part(groundId, 'ground', x, groundY, {});
  components.push(ground);
  wires.push(wire(uid('w'), previousId, previousTerm, groundId, 'gnd', [x, previousY], [x, groundY]));

  // Close the loop: the source's return terminal ties to the same ground net as the chain's tail.
  wires.push(wire(uid('w'), sourceId, returnTerm, groundId, 'gnd', [x, startY + 50], [x, groundY]));

  return { components, wires, junctionComponentIds };
}
