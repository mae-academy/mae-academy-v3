import type { CircuitComponent, CircuitWire } from '@/simulators/circuit-engine/models/circuitTypes';

export type ExampleDifficulty = 'Beginner' | 'Intermediate' | 'Advanced';

/** Top-level grouping; must match a folder under `examples/`. */
export type ExampleCategory =
  | 'Nodal Analysis'
  | 'Mesh Analysis'
  | 'Superposition'
  | 'Thévenin & Norton'
  | 'Time-Domain (Transient)'
  | 'AC Analysis';

/** Which Academic Analysis Workspace tab best matches the circuit's teaching point, if any. */
export type SuggestedAnalysisMethod = 'nodal' | 'mesh' | 'superposition' | 'transform' | 'thevenin';

export interface ExpectedResults {
  /** Node label -> expected steady-state / DC voltage in volts. */
  nodeVoltages?: Record<string, number>;
  /** Branch/element id or label -> expected current in amperes. */
  currents?: Record<string, number>;
  /** Element id or label -> expected dissipated/delivered power in watts. */
  power?: Record<string, number>;
  /** Free-form notes for quantities that aren't a single node voltage (e.g. τ, f0, Q, phase). */
  notes?: string[];
}

export interface OscilloscopeChannelSetting {
  /** Component id + terminal probed, e.g. { componentId: 'c1', terminal: 'a' }. */
  componentId: string;
  terminal: string;
  label: string;
}

export interface OscilloscopeSettings {
  timeBase: string;
  channels: OscilloscopeChannelSetting[];
  measurements: Array<'peak' | 'frequency' | 'phase' | 'rms' | 'vpp' | 'mean'>;
}

/** A ready-to-load schematic: exactly what `loadCircuitDocument` needs. */
export interface ExampleSchematic {
  components: CircuitComponent[];
  wires: CircuitWire[];
}

export interface ExampleDefinition {
  id: string;
  name: string;
  /** "Category / Subcategory" display string, e.g. "Nodal Analysis / DC". */
  category: string;
  /** Structured grouping used for the modal's filter/sidebar. */
  categoryGroup: ExampleCategory;
  difficulty: ExampleDifficulty;
  durationMinutes: number;
  conceptsTaught: string[];
  tags: string[];
  /** Reference SPICE netlist as published in the spec (display-only; the live schematic is `schematic`). */
  spiceNetlist: string;
  /** ASCII-art or plain-text schematic description shown alongside the live preview. */
  schematicAscii: string;
  educationalNarrative: string;
  expectedResults: ExpectedResults;
  oscilloscopeSettings?: OscilloscopeSettings;
  suggestedModifications: string[];
  theoreticalBackground: string;
  suggestedAnalysisMethod?: SuggestedAnalysisMethod;
  /** The actual loadable circuit for the "Load into Simulator" action. */
  schematic: ExampleSchematic;
}
