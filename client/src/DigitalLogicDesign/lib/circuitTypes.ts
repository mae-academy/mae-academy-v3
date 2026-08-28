import type { Point } from './wiring';

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
}

export type WireRouting = 'orthogonal' | 'straight' | 'manual';

export interface CircuitWire {
  id: string;
  fromComp: string;
  fromTerm: string;
  toComp: string;
  toTerm: string;
  path: Point[];
  routing: WireRouting;
  color?: string;
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
  potentiometer: 'RV',
  capacitor: 'C',
  inductor: 'L',
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
  'aux-contact-no': 'K',
  'aux-contact-nc': 'K',
  'relay-spst': 'K',
  'relay-spdt': 'K',
  'relay-dpst': 'K',
  'relay-dpdt': 'K',
  contactor: 'K',
  fuse: 'F',
  'circuit-breaker': 'QF',
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
    label,
    x,
    y,
    props: structuredClone(source.props),
  };
}

export function formatEngineering(value: number, unit: string, precision = 3): string {
  if (!Number.isFinite(value)) return 'OL';
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
