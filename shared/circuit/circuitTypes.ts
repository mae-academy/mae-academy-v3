/** Canvas coordinate. */
export type Point = [number, number];

/** Absolute maximum electrical ratings before a component is considered burned out. */
export interface ComponentRatings {
  maxPower?: number;
  maxCurrent?: number;
  maxVoltage?: number;
}

/** Runtime component state that persists independently of simulation results (e.g. burnout). */
export interface ComponentState {
  isBurned?: boolean;
  [key: string]: unknown;
}

export interface CircuitComponent {
  id: string;
  type: string;
  x: number;
  y: number;
  rotation: number;
  flipH: boolean;
  flipV: boolean;
  label: string;
  props: Record<string, unknown>;
  /** Overrides the catalog default ratings from ComponentDef when set. */
  ratings?: ComponentRatings;
  state?: ComponentState;
}

export type DependentSourceType = 'vcvs' | 'vccs' | 'ccvs' | 'cccs';

export interface DependentSourceProps {
  gain: number;
  targetId: string;
}

export type WireRouting = 'orthogonal' | 'straight' | 'manual';

export interface CircuitWire {
  id: string;
  fromComp: string;
  fromTerm: string;
  toComp: string;
  toTerm: string;
  sourceComponentId?: string;
  sourcePinId?: string;
  targetComponentId?: string;
  targetPinId?: string;
  path: Point[];
  waypoints?: Point[];
  routing: WireRouting;
  color?: string;
  junctionPoint?: Point;
  junctionWireId?: string;
}

export interface WorkspaceText {
  id: string;
  x: number;
  y: number;
  text: string;
  fontSize: number;
  color: string;
  rotation: number;
}

export type Selection =
  | { kind: 'component'; id: string }
  | { kind: 'wire'; id: string }
  | { kind: 'text'; id: string }
  | null;

export interface ProbeRef {
  componentId: string;
  terminalId: string;
}

export interface SamplePoint {
  time: number;
  value: number;
}

export interface SimulationWarning {
  code: string;
  message: string;
  componentId?: string;
}

export interface InstrumentReading {
  value: number;
  unit: string;
  status: 'ready' | 'open' | 'overflow' | 'unsupported';
  continuity?: boolean;
  frequency?: number;
  samples?: SamplePoint[];
}

export interface SimulationSnapshot {
  time: number;
  nodeVoltages: Record<string, number>;
  terminalVoltages: Record<string, number>;
  branchCurrents: Record<string, number>;
  wireCurrents: Record<string, number>;
  wirePhases?: Record<string, number>;
  componentPowered: Record<string, boolean>;
  componentIntensity: Record<string, number>;
  nodeHistory: Record<string, SamplePoint[]>;
  branchHistory: Record<string, SamplePoint[]>;
  instrumentReadings: Record<string, InstrumentReading>;
  warnings: SimulationWarning[];
  converged: boolean;
}

const PREFIXES: Record<string, string> = {
  'dc-voltage': 'V',
  'ac-voltage': 'V',
  'dc-rail': 'V',
  'three-phase-source': 'V3',
  'three-phase-rail': 'V3',
  'dc-current': 'I',
  'ac-current': 'I',
  ground: 'GND',
  resistor: 'R',
  potentiometer: 'R',
  capacitor: 'C',
  inductor: 'L',
  impedance: 'Z',
  vcvs: 'CS',
  vccs: 'CS',
  cccs: 'CS',
  ccvs: 'CS',
  diode: 'D',
  'diode-ideal': 'D',
  'diode-silicon': 'D',
  'diode-germanium': 'D',
  'diode-gaas': 'D',
  zener: 'D',
  led: 'D',
  photodiode: 'D',
  'bjt-npn': 'Q',
  'bjt-pnp': 'Q',
  'mosfet-n': 'Q',
  'mosfet-p': 'Q',
  'jfet-n': 'Q',
  'jfet-p': 'Q',
  'sw-spst-no': 'S',
  'sw-spst-nc': 'S',
  'sw-spdt': 'S',
  'sw-dpst': 'S',
  'sw-dpdt': 'S',
  'pb-no': 'S',
  'pb-nc': 'S',
  coil: 'K',
  'aux-contact-no': 'K',
  'aux-contact-nc': 'K',
  'aux-contact-3phase': 'K',
  'relay-spst': 'K',
  'relay-spdt': 'K',
  'relay-dpst': 'K',
  contactor: 'K',
  fuse: 'F',
  'fuse-3phase': 'F',
  'circuit-breaker': 'QF',
  'circuit-breaker-3phase': 'QF',
  transformer: 'T',
  'transformer-ct': 'T',
  autotransformer: 'T',
  scr: 'SCR',
  diac: 'D',
  triac: 'TR',
  'motor-dc': 'M',
  'motor-3phase': 'M',
  lamp: 'H',
  opamp: 'U',
  voltmeter: 'VM',
  ammeter: 'AM',
  dmm: 'DMM',
  oscilloscope: 'OSC',
};

export function componentPrefix(type: string): string {
  return PREFIXES[type] ?? 'X';
}

export function nextComponentLabel(type: string, components: CircuitComponent[]): string {
  if (type === 'ground') return 'GND';
  if (type === 'aux-contact-no' || type === 'aux-contact-nc' || type === 'aux-contact-3phase') return 'K?';
  const prefix = componentPrefix(type);
  const expression = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)$`, 'i');
  const next = components.reduce((max, component) => {
    const match = component.label.match(expression);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0) + 1;
  return `${prefix}${next}`;
}

export function terminalKey(componentId: string, terminalId: string): string {
  return `${componentId}:${terminalId}`;
}

export function copyComponentForPaste(
  source: CircuitComponent,
  id: string,
  label: string,
  x: number,
  y: number,
): CircuitComponent {
  return {
    ...source,
    id,
    label: source.type === 'ground' ? 'GND' : label,
    x,
    y,
    props: structuredClone(source.props),
  };
}

export interface ReplaceComponentResult {
  components: CircuitComponent[];
  wires: CircuitWire[];
}

/**
 * Swaps `oldComponentId` for `replacement`, inheriting its position/rotation/flip. `oldTerminalIds`
 * and `newTerminalIds` are each definition's `terminals` in declared order — wires reconnect
 * pin-for-pin by that order (pin 1 -> pin 1, pin 2 -> pin 2, …) only when both parts have the same
 * terminal count; terminal id strings differ across kinds (a resistor's `a`/`b` vs a diode's
 * `anode`/`cathode`), so matching by position rather than by literal id is what actually preserves
 * "the same pin". A differing count has no safe mapping, so those wires are dropped instead of
 * risking a wire stitched onto the wrong physical pin.
 */
export function replaceComponent(
  components: CircuitComponent[],
  wires: CircuitWire[],
  oldComponentId: string,
  oldTerminalIds: string[],
  newTerminalIds: string[],
  replacement: Omit<CircuitComponent, 'x' | 'y' | 'rotation' | 'flipH' | 'flipV'>,
): ReplaceComponentResult | null {
  const oldIndex = components.findIndex((component) => component.id === oldComponentId);
  if (oldIndex === -1) return null;
  const oldComponent = components[oldIndex];

  const newComponent: CircuitComponent = {
    ...replacement,
    x: oldComponent.x,
    y: oldComponent.y,
    rotation: oldComponent.rotation,
    flipH: oldComponent.flipH,
    flipV: oldComponent.flipV,
  };
  const nextComponents = components.map((component, index) => (index === oldIndex ? newComponent : component));

  const pinsMatch = oldTerminalIds.length > 0 && oldTerminalIds.length === newTerminalIds.length;
  const remapTerminal = (terminalId: string): string | undefined => {
    const position = oldTerminalIds.indexOf(terminalId);
    return position === -1 ? undefined : newTerminalIds[position];
  };

  const nextWires = pinsMatch
    ? wires.reduce<CircuitWire[]>((kept, wire) => {
        const touchesFrom = wire.fromComp === oldComponentId;
        const touchesTo = wire.toComp === oldComponentId;
        if (!touchesFrom && !touchesTo) {
          kept.push(wire);
          return kept;
        }
        const nextFromTerm = touchesFrom ? remapTerminal(wire.fromTerm) : wire.fromTerm;
        const nextToTerm = touchesTo ? remapTerminal(wire.toTerm) : wire.toTerm;
        // Defensive: a wire whose recorded terminal isn't in the old definition can't be remapped
        // safely, so it is dropped rather than left pointing at a nonexistent or wrong pin.
        if (nextFromTerm === undefined || nextToTerm === undefined) return kept;
        kept.push({
          ...wire,
          fromComp: touchesFrom ? newComponent.id : wire.fromComp,
          fromTerm: nextFromTerm,
          toComp: touchesTo ? newComponent.id : wire.toComp,
          toTerm: nextToTerm,
        });
        return kept;
      }, [])
    : wires.filter((wire) => wire.fromComp !== oldComponentId && wire.toComp !== oldComponentId);

  return { components: nextComponents, wires: nextWires };
}

export function formatEngineering(value: number, unit: string, precision = 3): string {
  if (!Number.isFinite(value)) return 'O.L';
  const isOhm = unit === 'Ω' || unit === 'Ohm' || unit === 'ohms';
  if (isOhm && Math.abs(value) >= 1e7) return 'O.L';
  const absolute = Math.abs(value);
  const prefixes: Array<[number, string]> = [
    [1e9, 'G'],
    [1e6, 'M'],
    [1e3, 'k'],
    [1, ''],
    [1e-3, 'm'],
    [1e-6, 'µ'],
    [1e-9, 'n'],
  ];
  const found = prefixes.find(([scale]) => absolute >= scale) ?? prefixes[prefixes.length - 1];
  const [scale, prefix] = found;
  return `${(value / scale).toFixed(precision)} ${prefix}${unit}`;
}

export { isACCircuit, AC_COMPONENT_TYPES } from './isACCircuit';
