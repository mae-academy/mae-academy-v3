// Deterministic schematic engine: shared types. Pure TypeScript, no DOM dependency.

export const PART_TYPES = [
  'resistor', 'potentiometer', 'capacitor', 'polarized_capacitor', 'inductor', 'transformer',
  'vsource', 'vsource_ac', 'isource', 'battery',
  'ground', 'rail', 'port', 'junction',
  'diode', 'zener', 'led', 'schottky',
  'switch', 'switch_spdt',
  'npn', 'pnp', 'nmos', 'pmos', 'igbt',
  'opamp', 'optocoupler',
  'block', 'sum', 'gain',
  'and', 'or', 'nand', 'nor', 'xor', 'xnor', 'not', 'buffer', 'dff',
] as const;
export type PartType = (typeof PART_TYPES)[number];

export type Pt = [number, number];
export type Rot = 0 | 90 | 180 | 270;
export type Standard = 'IEC' | 'IEEE';
export type LabelPref = 'auto' | 'none' | 'above' | 'below' | 'left' | 'right';
export type Compass = 'N' | 'E' | 'S' | 'W';

export interface PartAttrs {
  state?: string;
  body_diode?: boolean;
  w?: number;
  h?: number;
  signs?: Partial<Record<Compass, '+' | '−'>>;
  supply?: boolean;
  control?: string;
}

export interface PartSpec {
  id: string;
  type: PartType;
  value?: string;
  at: Pt;
  rot: Rot;
  flip: boolean;
  label: LabelPref;
  attrs: PartAttrs;
}

export interface WireSpec {
  pts: Pt[];
  arrow?: boolean;
  power?: boolean;
}

export interface LabelSpec {
  text: string;
  at: Pt;
  anchor: 'start' | 'middle' | 'end';
}

export interface DomainSpec {
  name: string;
  rect: [number, number, number, number];
}

/** Normalised (defaults applied, shape checked) spec. */
export interface SchematicSpec {
  title: string;
  standard: Standard;
  pitch: 10 | 20;
  parts: PartSpec[];
  wires: WireSpec[];
  labels: LabelSpec[];
  domains: DomainSpec[];
}

export interface Issue {
  code: string;
  message: string;
  where?: string;
}

export const LIMITS = {
  maxParts: 200,
  maxWires: 600,
  maxLabels: 200,
  maxDomains: 12,
  maxPtsPerWire: 80,
  maxCoord: 400,
  maxString: 80,
  maxTextChars: 200_000,
  maxBlockDim: 40,
} as const;
