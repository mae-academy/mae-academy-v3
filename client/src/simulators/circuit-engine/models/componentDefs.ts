/**
 * ElectroLab - Complete Component Definitions
 * IEEE 315 / IEC 60617 standard symbols
 * All terminals touch the component graphic boundary
 */

export interface Terminal {
  id: string;
  name: string;
  x: number; // relative to component center, on the component boundary
  y: number;
  type: 'input' | 'output' | 'bidirectional';
}

export interface ComponentDef {
  id: string;
  name: string;
  category: string;
  width: number;
  height: number;
  terminals: Terminal[];
  properties: Record<string, PropertyDef>;
  description: string;
  symbol: string;
}

export interface PropertyDef {
  type: 'number' | 'select' | 'boolean' | 'color' | 'text';
  value: any;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  /** Display text per option value, where the stored value is not what a student should read. */
  optionLabels?: Record<string, string>;
  /** Still stored in props and simulated, but derived from another property, so never offered as an
   * editable inspector field — see the LED's forwardVoltage, which its colour dictates. */
  hidden?: boolean;
  label?: string;
}

/**
 * Nominal LED forward voltage by colour, at the 20 mA test current the SPICE model is fitted to.
 *
 * Colour is the single source of truth for Vf: the inspector offers only these presets and writes
 * the matching `forwardVoltage` alongside the colour, because a real LED's forward drop is set by
 * its die chemistry rather than dialled in independently. `forwardVoltage` stays in props because
 * the SPICE model fit (netlistGenerator) and both legacy engines read it from there.
 */
export const LED_FORWARD_VOLTAGES: Record<string, number> = {
  violet: 1.2,
  red: 1.8,
  amber: 2.0,
  orange: 2.0,
  yellow: 2.2,
  green: 3.5,
  blue: 3.8,
  white: 4.0,
};

/** The colour presets the dropdown offers, ordered by ascending forward voltage. */
export const LED_COLOR_OPTIONS = Object.keys(LED_FORWARD_VOLTAGES);

/** Dropdown text, so the choice reads "Red (1.8 V)" rather than a bare colour name. */
export const LED_COLOR_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(LED_FORWARD_VOLTAGES).map(([color, volts]) => [
    color,
    `${color.charAt(0).toUpperCase()}${color.slice(1)} (${volts.toFixed(1)} V)`,
  ]),
);

// ─── SOURCES ─────────────────────────────────────────────────────────────────
const SOURCES: Record<string, ComponentDef> = {
  'ground': {
    id: 'ground', name: 'Ground', category: 'Sources',
    width: 30, height: 30, symbol: 'ground',
    terminals: [
      { id: 'gnd', name: 'GND', x: 0, y: -15, type: 'bidirectional' },
    ],
    properties: {},
    description: 'Ground reference (0 V)',
  },
  'dc-rail': {
    id: 'dc-rail', name: 'DC Power Rail', category: 'Sources',
    width: 70, height: 50, symbol: 'dc-rail',
    terminals: [
      { id: 'pos', name: '+V', x: 0, y: 0, type: 'output' },
    ],
    properties: {
      voltage: { type: 'number', value: 24, unit: 'V', min: 0, max: 10000, label: 'Rail Voltage' },
      internalR: { type: 'number', value: 0.05, unit: 'Ω', min: 0.001, max: 1000, label: 'Internal R' },
    },
    description: 'Positive DC supply rail referenced to a separately placed ground',
  },
  'dc-voltage': {
    id: 'dc-voltage', name: 'DC Voltage Source', category: 'Sources',
    width: 100, height: 100, symbol: 'dc-voltage',
    terminals: [
      { id: 'pos', name: '+', x: 0, y: -50, type: 'output' },
      { id: 'neg', name: '−', x: 0, y: 50, type: 'output' },
    ],
    properties: {
      voltage: { type: 'number', value: 12, unit: 'V', min: 0, max: 10000, label: 'Voltage' },
      internalR: { type: 'number', value: 0.01, unit: 'Ω', min: 0, max: 1000, label: 'Internal R' },
    },
    description: 'Ideal DC voltage source',
  },
  'ac-voltage': {
    id: 'ac-voltage', name: 'AC Voltage Source', category: 'Sources',
    width: 100, height: 100, symbol: 'ac-voltage',
    terminals: [
      { id: 'pos', name: '+', x: 0, y: -50, type: 'output' },
      { id: 'neg', name: '−', x: 0, y: 50, type: 'output' },
    ],
    properties: {
      format: { type: 'select', value: 'polar', options: ['rectangular', 'polar'], label: 'Input Format' },
      real: { type: 'number', value: 10, unit: 'V', min: -10000, max: 10000, label: 'Real (V)' },
      imag: { type: 'number', value: 0, unit: 'V', min: -10000, max: 10000, label: 'Imaginary (V)' },
      amplitude: { type: 'number', value: 10, unit: 'V', min: 0, max: 10000, label: 'Magnitude (Peak)' },
      phase: { type: 'number', value: 0, unit: '', min: -360, max: 360, label: 'Phase (θ)' },
      angleUnit: { type: 'select', value: 'degree', options: ['degree', 'radian'], label: 'Angle Unit' },
      frequency: { type: 'number', value: 60, unit: 'Hz', min: 0.001, max: 1e6, label: 'Frequency' },
      offset: { type: 'number', value: 0, unit: 'V', min: -10000, max: 10000, label: 'DC Offset' },
      waveform: { type: 'select', value: 'sine', options: ['sine', 'square', 'sawtooth', 'triangle'], label: 'Waveform' },
      phases: { type: 'select', value: 'single', options: ['single', 'three-phase'], label: 'Phase Config' },
    },
    description: 'AC voltage source with configurable waveform',
  },
  'three-phase-source': {
    id: 'three-phase-source', name: '3-Phase Source', category: 'Sources',
    width: 100, height: 100, symbol: 'three-phase-source',
    terminals: [
      { id: 'l1', name: 'L1', x: -50, y: -25, type: 'output' },
      { id: 'l2', name: 'L2', x: -50, y: 0, type: 'output' },
      { id: 'l3', name: 'L3', x: -50, y: 25, type: 'output' },
      { id: 'n', name: 'N', x: 50, y: 0, type: 'output' },
    ],
    properties: {
      lineVoltage: { type: 'number', value: 400, unit: 'V RMS', min: 1, max: 100000, label: 'Line Voltage (L-L)' },
      frequency: { type: 'number', value: 50, unit: 'Hz', min: 0.001, max: 100000, label: 'Frequency' },
      phaseSequence: { type: 'select', value: 'ABC', options: ['ABC', 'ACB'], label: 'Phase Sequence' },
      connection: { type: 'select', value: 'Y', options: ['Y', 'Δ'], label: 'Source Connection' },
      internalR: { type: 'number', value: 0.05, unit: 'Ω', min: 0.001, max: 1000, label: 'Internal R / phase' },
    },
    description: 'Balanced three-phase source with L1, L2, L3 and neutral',
  },
  'three-phase-rail': {
    id: 'three-phase-rail', name: '3-Phase Power Rail', category: 'Sources',
    width: 90, height: 60, symbol: 'three-phase-rail',
    terminals: [
      { id: 'l1', name: 'A', x: -50, y: -100 / 3, type: 'output' },
      { id: 'l2', name: 'B', x: -50, y: -50 / 3, type: 'output' },
      { id: 'l3', name: 'C', x: -50, y: 0 / 3, type: 'output' },
      { id: 'n', name: 'N', x: -50, y: 50 / 3, type: 'output' },
    ],
    properties: {
      lineVoltage: { type: 'number', value: 400, unit: 'V RMS', min: 1, max: 100000, label: 'Rail Voltage (L-L)' },
      frequency: { type: 'number', value: 50, unit: 'Hz', min: 0.001, max: 100000, label: 'Frequency' },
      phaseSequence: { type: 'select', value: 'ABC', options: ['ABC', 'ACB'], label: 'Phase Sequence' },
      connection: { type: 'select', value: 'Y', options: ['Y', 'Δ'], label: 'Rail Connection' },
      internalR: { type: 'number', value: 0.05, unit: 'Ω', min: 0.001, max: 1000, label: 'Internal R / phase' },
    },
    description: 'Compact labelled 3-phase power rail for control and motor circuits',
  },
  'dc-current': {
    id: 'dc-current', name: 'DC Current Source', category: 'Sources',
    width: 100, height: 100, symbol: 'dc-current',
    terminals: [
      { id: 'pos', name: '+', x: 0, y: -50, type: 'output' },
      { id: 'neg', name: '−', x: 0, y: 50, type: 'output' },
    ],
    properties: {
      current: { type: 'number', value: 1, unit: 'A', min: 0, max: 10000, label: 'Current' },
    },
    description: 'Ideal DC current source',
  },
  'ac-current': {
    id: 'ac-current', name: 'AC Current Source', category: 'Sources',
    width: 100, height: 100, symbol: 'ac-current',
    terminals: [
      { id: 'pos', name: '+', x: 0, y: -50, type: 'output' },
      { id: 'neg', name: '−', x: 0, y: 50, type: 'output' },
    ],
    properties: {
      format: { type: 'select', value: 'polar', options: ['rectangular', 'polar'], label: 'Input Format' },
      real: { type: 'number', value: 1, unit: 'A', min: -10000, max: 10000, label: 'Real (A)' },
      imag: { type: 'number', value: 0, unit: 'A', min: -10000, max: 10000, label: 'Imaginary (A)' },
      amplitude: { type: 'number', value: 1, unit: 'A', min: 0, max: 10000, label: 'Magnitude (Peak)' },
      phase: { type: 'number', value: 0, unit: '', min: -360, max: 360, label: 'Phase (θ)' },
      angleUnit: { type: 'select', value: 'degree', options: ['degree', 'radian'], label: 'Angle Unit' },
      frequency: { type: 'number', value: 60, unit: 'Hz', min: 0.001, max: 1e6, label: 'Frequency' },
      offset: { type: 'number', value: 0, unit: 'A', min: -10000, max: 10000, label: 'DC Offset' },
      waveform: { type: 'select', value: 'sine', options: ['sine', 'square', 'sawtooth', 'triangle'], label: 'Waveform' },
    },
    description: 'AC current source',
  },
};

// ─── PASSIVE ──────────────────────────────────────────────────────────────────
const PASSIVE: Record<string, ComponentDef> = {
  'resistor': {
    id: 'resistor', name: 'Resistor', category: 'Passive',
    width: 60, height: 20, symbol: 'resistor',
    terminals: [
      { id: 'a', name: 'A', x: -30, y: 0, type: 'bidirectional' },
      { id: 'b', name: 'B', x: 30, y: 0, type: 'bidirectional' },
    ],
    properties: {
      resistance: { type: 'number', value: 1000, unit: 'Ω', min: 0.001, max: 1e9, label: 'Resistance' },
      tolerance: { type: 'select', value: '5%', options: ['1%', '5%', '10%', '20%'], label: 'Tolerance' },
      power: { type: 'number', value: 0.25, unit: 'W', min: 0.125, max: 1000, label: 'Power Rating' },
    },
    description: 'Resistor (IEEE 315)',
  },
  'potentiometer': {
    id: 'potentiometer', name: 'Variable Resistor', category: 'Passive',
    width: 60, height: 50, symbol: 'potentiometer',
    terminals: [
      { id: 't1', name: 'A', x: -30, y: 0, type: 'bidirectional' },
      { id: 't2', name: 'B', x: 30, y: 0, type: 'bidirectional' },
      { id: 'wiper', name: 'W', x: 0, y: -30, type: 'bidirectional' },
    ],
    properties: {
      resistance: { type: 'number', value: 10000, unit: 'Ω', min: 1, max: 1e9, label: 'End-to-End Resistance' },
      wiper: { type: 'number', value: 0.5, unit: '', min: 0, max: 1, step: 0.01, label: 'Wiper Position' },
      taper: { type: 'select', value: 'linear', options: ['linear', 'logarithmic'], label: 'Taper' },
    },
    description: 'Three-terminal variable resistor / potentiometer',
  },
  'capacitor': {
    id: 'capacitor', name: 'Capacitor', category: 'Passive',
    width: 60, height: 30, symbol: 'capacitor',
    terminals: [
      { id: 'a', name: 'A', x: -30, y: 0, type: 'bidirectional' },
      { id: 'b', name: 'B', x: 30, y: 0, type: 'bidirectional' },
    ],
    properties: {
      capacitance: { type: 'number', value: 1e-6, unit: 'F', min: 1e-15, max: 1, label: 'Capacitance' },
      voltage: { type: 'number', value: 50, unit: 'V', min: 1, max: 10000, label: 'Rated Voltage' },
      type: { type: 'select', value: 'ceramic', options: ['ceramic', 'electrolytic', 'film', 'mica', 'tantalum'], label: 'Type' },
    },
    description: 'Capacitor',
  },
  'inductor': {
    id: 'inductor', name: 'Inductor', category: 'Passive',
    width: 60, height: 20, symbol: 'inductor',
    terminals: [
      { id: 'a', name: 'A', x: -30, y: 0, type: 'bidirectional' },
      { id: 'b', name: 'B', x: 30, y: 0, type: 'bidirectional' },
    ],
    properties: {
      inductance: { type: 'number', value: 1e-3, unit: 'H', min: 1e-12, max: 1000, label: 'Inductance' },
      dcr: { type: 'number', value: 0.1, unit: 'Ω', min: 0, max: 1000, label: 'DC Resistance' },
    },
    description: 'Inductor',
  },
  'impedance': {
    id: 'impedance', name: 'Impedance', category: 'Passive',
    width: 60, height: 20, symbol: 'impedance',
    terminals: [
      { id: 'a', name: 'A', x: -30, y: 0, type: 'bidirectional' },
      { id: 'b', name: 'B', x: 30, y: 0, type: 'bidirectional' },
    ],
    properties: {
      format: { type: 'select', value: 'rectangular', options: ['rectangular', 'polar'], label: 'Input Format' },
      r: { type: 'number', value: 3, unit: 'Ω', min: -1e9, max: 1e9, label: 'Resistance (R)' },
      x: { type: 'number', value: 4, unit: 'Ω', min: -1e9, max: 1e9, label: 'Reactance (X)' },
      mag: { type: 'number', value: 5, unit: 'Ω', min: 0, max: 1e9, label: 'Magnitude (|Z|)' },
      ang: { type: 'number', value: 53.13, unit: '', min: -360, max: 360, label: 'Angle (θ)' },
      angleUnit: { type: 'select', value: 'degree', options: ['degree', 'radian'], label: 'Angle Unit' },
    },
    description: 'Complex Impedance (Rectangular or Polar)',
  },
};

// ─── CONTROLLED SOURCES ───────────────────────────────────────────────────────
const CONTROLLED_SOURCES: Record<string, ComponentDef> = {
  'vccs': {
    id: 'vccs', name: 'VCCS', category: 'Controlled Sources', width: 70, height: 70, symbol: 'vccs',
    terminals: [{ id: 'pos', name: '+', x: 0, y: -30, type: 'output' }, { id: 'neg', name: '−', x: 0, y: 30, type: 'output' }],
    properties: { transconductance: { type: 'number', value: 0.001, unit: 'S', min: -1e6, max: 1e6, label: 'Transconductance' }, controlSourceId: { type: 'text', value: '', label: 'Control Source ID' } },
    description: 'Voltage-controlled current source (IEEE dependent source)',
  },
  'vcvs': {
    id: 'vcvs', name: 'VCVS', category: 'Controlled Sources', width: 70, height: 70, symbol: 'vcvs',
    terminals: [{ id: 'pos', name: '+', x: 0, y: -30, type: 'output' }, { id: 'neg', name: '−', x: 0, y: 30, type: 'output' }],
    properties: { gain: { type: 'number', value: 2, unit: 'V/V', min: -1e6, max: 1e6, label: 'Voltage Gain' }, controlSourceId: { type: 'text', value: '', label: 'Control Source ID' } },
    description: 'Voltage-controlled voltage source (IEEE dependent source)',
  },
  'cccs': {
    id: 'cccs', name: 'CCCS', category: 'Controlled Sources', width: 70, height: 70, symbol: 'cccs',
    terminals: [{ id: 'pos', name: '+', x: 0, y: -30, type: 'output' }, { id: 'neg', name: '−', x: 0, y: 30, type: 'output' }],
    properties: { gain: { type: 'number', value: 1, unit: 'A/A', min: -1e6, max: 1e6, label: 'Current Gain' }, controlSourceId: { type: 'text', value: '', label: 'Control Source ID' } },
    description: 'Current-controlled current source with inline 0 V current-sense branch',
  },
  'ccvs': {
    id: 'ccvs', name: 'CCVS', category: 'Controlled Sources', width: 70, height: 70, symbol: 'ccvs',
    terminals: [{ id: 'pos', name: '+', x: 0, y: -30, type: 'output' }, { id: 'neg', name: '−', x: 0, y: 30, type: 'output' }],
    properties: { transresistance: { type: 'number', value: 1000, unit: 'Ω', min: -1e9, max: 1e9, label: 'Transresistance' }, controlSourceId: { type: 'text', value: '', label: 'Control Source ID' } },
    description: 'Current-controlled voltage source with inline 0 V current-sense branch',
  },

};

// ─── DIODES ───────────────────────────────────────────────────────────────────
const DIODES: Record<string, ComponentDef> = {
  'diode': {
    id: 'diode', name: 'Diode', category: 'Diodes',
    width: 60, height: 20, symbol: 'diode',
    terminals: [
      { id: 'anode', name: 'A', x: -30, y: 0, type: 'input' },
      { id: 'cathode', name: 'K', x: 30, y: 0, type: 'output' },
    ],
    properties: {
      material: { type: 'select', value: 'silicon', options: ['ideal', 'silicon', 'germanium', 'gaas'], label: 'Material / Type' },
      forwardVoltage: { type: 'number', value: 0.7, unit: 'V', min: 0, max: 2, label: 'Forward Voltage' },
      Is: { type: 'number', value: 1e-12, unit: 'A', min: 1e-20, max: 1e-3, label: 'Saturation Current' },
    },
    description: 'Material-selectable diode: Ideal, Si, Ge, or GaAs',
  },
  'diode-ideal': {
    id: 'diode-ideal', name: 'Ideal Diode', category: 'Diodes',
    width: 60, height: 20, symbol: 'diode',
    terminals: [
      { id: 'anode', name: 'A', x: -30, y: 0, type: 'input' },
      { id: 'cathode', name: 'K', x: 30, y: 0, type: 'output' },
    ],
    properties: {
      forwardVoltage: { type: 'number', value: 0, unit: 'V', min: 0, max: 5, label: 'Forward Voltage' },
    },
    description: 'Ideal diode (Vf = 0 V)',
  },
  'diode-silicon': {
    id: 'diode-silicon', name: 'PN Diode (Si)', category: 'Diodes',
    width: 60, height: 20, symbol: 'diode',
    terminals: [
      { id: 'anode', name: 'A', x: -30, y: 0, type: 'input' },
      { id: 'cathode', name: 'K', x: 30, y: 0, type: 'output' },
    ],
    properties: {
      material: { type: 'select', value: 'silicon', options: ['silicon'], label: 'Material' },
      forwardVoltage: { type: 'number', value: 0.7, unit: 'V', min: 0.5, max: 1.0, label: 'Forward Voltage' },
      kneeVoltage: { type: 'number', value: 0.6, unit: 'V', min: 0.4, max: 0.8, label: 'Knee Voltage' },
      Is: { type: 'number', value: 1e-12, unit: 'A', min: 1e-15, max: 1e-6, label: 'Saturation Current' },
    },
    description: 'Silicon PN junction diode (Vf ≈ 0.7 V)',
  },
  'diode-germanium': {
    id: 'diode-germanium', name: 'PN Diode (Ge)', category: 'Diodes',
    width: 60, height: 20, symbol: 'diode',
    terminals: [
      { id: 'anode', name: 'A', x: -30, y: 0, type: 'input' },
      { id: 'cathode', name: 'K', x: 30, y: 0, type: 'output' },
    ],
    properties: {
      material: { type: 'select', value: 'germanium', options: ['germanium'], label: 'Material' },
      forwardVoltage: { type: 'number', value: 0.3, unit: 'V', min: 0.2, max: 0.5, label: 'Forward Voltage' },
      kneeVoltage: { type: 'number', value: 0.2, unit: 'V', min: 0.1, max: 0.4, label: 'Knee Voltage' },
      Is: { type: 'number', value: 1e-6, unit: 'A', min: 1e-9, max: 1e-3, label: 'Saturation Current' },
    },
    description: 'Germanium PN junction diode (Vf ≈ 0.3 V)',
  },
  'diode-gaas': {
    id: 'diode-gaas', name: 'PN Diode (GaAs)', category: 'Diodes',
    width: 60, height: 20, symbol: 'diode',
    terminals: [
      { id: 'anode', name: 'A', x: -30, y: 0, type: 'input' },
      { id: 'cathode', name: 'K', x: 30, y: 0, type: 'output' },
    ],
    properties: {
      material: { type: 'select', value: 'gaas', options: ['gaas'], label: 'Material' },
      forwardVoltage: { type: 'number', value: 1.2, unit: 'V', min: 1.0, max: 1.5, label: 'Forward Voltage' },
      kneeVoltage: { type: 'number', value: 1.0, unit: 'V', min: 0.8, max: 1.2, label: 'Knee Voltage' },
      Is: { type: 'number', value: 1e-18, unit: 'A', min: 1e-20, max: 1e-12, label: 'Saturation Current' },
    },
    description: 'GaAs PN junction diode (Vf ≈ 1.2 V)',
  },
  'zener': {
    id: 'zener', name: 'Zener Diode', category: 'Diodes',
    width: 60, height: 20, symbol: 'zener',
    terminals: [
      { id: 'anode', name: 'A', x: -30, y: 0, type: 'input' },
      { id: 'cathode', name: 'K', x: 30, y: 0, type: 'output' },
    ],
    properties: {
      breakdownVoltage: { type: 'number', value: 5.1, unit: 'V', min: 1.8, max: 400, label: 'Breakdown Voltage (Vz)' },
      maxPower: { type: 'number', value: 0.5, unit: 'W', min: 0.1, max: 50, label: 'Max Power' },
    },
    description: 'Zener diode – voltage regulator',
  },
  'led': {
    id: 'led', name: 'LED', category: 'Diodes',
    width: 60, height: 20, symbol: 'led',
    terminals: [
      { id: 'anode', name: 'A', x: -30, y: 0, type: 'input' },
      { id: 'cathode', name: 'K', x: 30, y: 0, type: 'output' },
    ],
    properties: {
      color: { type: 'select', value: 'red', options: LED_COLOR_OPTIONS, optionLabels: LED_COLOR_LABELS, label: 'Color' },
      // Dictated by `color`, never typed in: hidden from the inspector but kept in props, since the
      // SPICE model fit and both legacy engines read the forward voltage from there.
      forwardVoltage: { type: 'number', value: LED_FORWARD_VOLTAGES.red, unit: 'V', min: 1.0, max: 4.5, hidden: true, label: 'Forward Voltage' },
      maxCurrent: { type: 'number', value: 0.02, unit: 'A', min: 0.001, max: 1, label: 'Max Current' },
    },
    description: 'Light-emitting diode',
  },
  'photodiode': {
    id: 'photodiode', name: 'Photodiode', category: 'Diodes',
    width: 60, height: 20, symbol: 'photodiode',
    terminals: [
      { id: 'anode', name: 'A', x: -30, y: 0, type: 'input' },
      { id: 'cathode', name: 'K', x: 30, y: 0, type: 'output' },
    ],
    properties: {
      responsivity: { type: 'number', value: 0.6, unit: 'A/W', min: 0.1, max: 1.1, label: 'Responsivity' },
      darkCurrent: { type: 'number', value: 1e-9, unit: 'A', min: 1e-12, max: 1e-6, label: 'Dark Current' },
      activeArea: { type: 'number', value: 1, unit: 'mm²', min: 0.01, max: 100, label: 'Active Area' },
      operatingMode: { type: 'select', value: 'photoconductive', options: ['photoconductive', 'photovoltaic'], label: 'Operating Mode' },
    },
    description: 'Photodiode – reverse-biased, light-sensitive',
  },
};

// ─── TRANSISTORS ──────────────────────────────────────────────────────────────
const TRANSISTORS: Record<string, ComponentDef> = {
  'bjt-npn': {
    id: 'bjt-npn', name: 'BJT NPN', category: 'Transistors',
    width: 50, height: 50, symbol: 'bjt-npn',
    terminals: [
      { id: 'base', name: 'B', x: -25, y: 0, type: 'input' },
      { id: 'collector', name: 'C', x: 25, y: -25, type: 'output' },
      { id: 'emitter', name: 'E', x: 25, y: 25, type: 'output' },
    ],
    properties: {
      beta: { type: 'number', value: 100, unit: '', min: 10, max: 1000, label: 'β (hFE)' },
      vbe: { type: 'number', value: 0.7, unit: 'V', min: 0.5, max: 0.9, label: 'Vbe' },
      vceSat: { type: 'number', value: 0.2, unit: 'V', min: 0.05, max: 0.5, label: 'Vce(sat)' },
      icMax: { type: 'number', value: 0.1, unit: 'A', min: 0.001, max: 1000, label: 'Ic max' },
    },
    description: 'NPN Bipolar Junction Transistor',
  },
  'bjt-pnp': {
    id: 'bjt-pnp', name: 'BJT PNP', category: 'Transistors',
    width: 50, height: 50, symbol: 'bjt-pnp',
    terminals: [
      { id: 'base', name: 'B', x: -25, y: 0, type: 'input' },
      { id: 'collector', name: 'C', x: 25, y: -25, type: 'output' }, // Top
      { id: 'emitter', name: 'E', x: 25, y: 25, type: 'output' },  // Bottom
    ],
    properties: {
      beta: { type: 'number', value: 100, unit: '', min: 10, max: 1000, label: 'β (hFE)' },
      vbe: { type: 'number', value: -0.7, unit: 'V', min: -0.9, max: -0.5, label: 'Vbe' },
      vceSat: { type: 'number', value: -0.2, unit: 'V', min: -0.5, max: -0.05, label: 'Vce(sat)' },
      icMax: { type: 'number', value: 0.1, unit: 'A', min: 0.001, max: 1000, label: 'Ic max' },
    },
    description: 'PNP Bipolar Junction Transistor',
  },
  'mosfet-n': {
    id: 'mosfet-n', name: 'MOSFET N-ch', category: 'Transistors',
    width: 50, height: 50, symbol: 'mosfet-n',
    terminals: [
      { id: 'gate', name: 'G', x: -25, y: 0, type: 'input' },
      { id: 'drain', name: 'D', x: 25, y: -25, type: 'output' },
      { id: 'source', name: 'S', x: 25, y: 25, type: 'output' },
    ],
    properties: {
      vth: { type: 'number', value: 2, unit: 'V', min: 0.5, max: 10, label: 'Threshold Voltage (Vth)' },
      rdsOn: { type: 'number', value: 0.7, unit: 'Ω', min: 0.001, max: 100, label: 'Rds(on)' },
      idMax: { type: 'number', value: 10, unit: 'A', min: 0.1, max: 1000, label: 'Id max' },
    },
    description: 'N-channel Enhancement MOSFET',
  },
  'mosfet-p': {
    id: 'mosfet-p', name: 'MOSFET P-ch', category: 'Transistors',
    width: 50, height: 50, symbol: 'mosfet-p',
    terminals: [
      { id: 'gate', name: 'G', x: -25, y: 0, type: 'input' },
      { id: 'drain', name: 'D', x: 25, y: -25, type: 'output' },
      { id: 'source', name: 'S', x: 25, y: 25, type: 'output' },
    ],
    properties: {
      vth: { type: 'number', value: -2, unit: 'V', min: -10, max: -0.5, label: 'Threshold Voltage (Vth)' },
      rdsOn: { type: 'number', value: -0.7, unit: 'Ω', min: -100, max: 100, label: 'Rds(on)' },
      idMax: { type: 'number', value: 10, unit: 'A', min: 0.1, max: 1000, label: 'Id max' },
    },
    description: 'P-channel Enhancement MOSFET',
  },
  'jfet-n': {
    id: 'jfet-n', name: 'JFET N-ch', category: 'Transistors',
    width: 50, height: 50, symbol: 'jfet-n',
    terminals: [
      { id: 'gate', name: 'G', x: -25, y: 0, type: 'input' },
      { id: 'drain', name: 'D', x: 25, y: -25, type: 'output' },
      { id: 'source', name: 'S', x: 25, y: 25, type: 'output' },
    ],
    properties: {
      rd: { type: 'number', value: 2, unit: 'Ω', min: -1000, max: 1000, label: 'Rd' },
      vp: { type: 'number', value: -4, unit: 'V', min: -10, max: -0.5, label: 'Pinch-off Voltage (Vp)' },
      idss: { type: 'number', value: 10, unit: 'mA', min: 0.1, max: 1000, label: 'Idss' },
    },
    description: 'N-channel Junction FET',
  },
  'jfet-p': {
    id: 'jfet-p', name: 'JFET P-ch', category: 'Transistors',
    width: 50, height: 50, symbol: 'jfet-p',
    terminals: [
      { id: 'gate', name: 'G', x: -25, y: 0, type: 'input' },
      { id: 'drain', name: 'D', x: 25, y: -25, type: 'output' },
      { id: 'source', name: 'S', x: 25, y: 25, type: 'output' },
    ],
    properties: {
      rd: { type: 'number', value: -2, unit: 'Ω', min: -1000, max: 1000, label: 'Rd' },
      vp: { type: 'number', value: 4, unit: 'V', min: 0.5, max: 10, label: 'Pinch-off Voltage (Vp)' },
      idss: { type: 'number', value: 10, unit: 'mA', min: 0.1, max: 1000, label: 'Idss' },
    },
    description: 'P-channel Junction FET',
  },
};

// ─── SWITCHES ─────────────────────────────────────────────────────────────────
const SWITCHES: Record<string, ComponentDef> = {
  'sw-spst-no': {
    id: 'sw-spst-no', name: 'Switch SPST-NO', category: 'Switches',
    width: 50, height: 25, symbol: 'sw-spst-no',
    terminals: [
      { id: 'a', name: 'A', x: -25, y: 0, type: 'bidirectional' },
      { id: 'b', name: 'B', x: 25, y: 0, type: 'bidirectional' },
    ],
    properties: { state: { type: 'select', value: 'open', options: ['open', 'closed'], label: 'State' } },
    description: 'Single Pole Single Throw – Normally Open',
  },
  'sw-spst-nc': {
    id: 'sw-spst-nc', name: 'Switch SPST-NC', category: 'Switches',
    width: 50, height: 25, symbol: 'sw-spst-nc',
    terminals: [
      { id: 'a', name: 'A', x: -25, y: 0, type: 'bidirectional' },
      { id: 'b', name: 'B', x: 25, y: 0, type: 'bidirectional' },
    ],
    properties: { state: { type: 'select', value: 'closed', options: ['open', 'closed'], label: 'State' } },
    description: 'Single Pole Single Throw – Normally Closed',
  },
  'pb-no': {
    id: 'pb-no', name: 'Push Button NO', category: 'Switches',
    width: 50, height: 25, symbol: 'pb-no',
    terminals: [
      { id: 'a', name: 'A', x: -25, y: 0, type: 'bidirectional' },
      { id: 'b', name: 'B', x: 25, y: 0, type: 'bidirectional' },
    ],
    properties: { state: { type: 'select', value: 'released', options: ['released', 'pressed'], label: 'State' } },
    description: 'Push Button – Normally Open',
  },
  'pb-nc': {
    id: 'pb-nc', name: 'Push Button NC', category: 'Switches',
    width: 50, height: 25, symbol: 'pb-nc',
    terminals: [
      { id: 'a', name: 'A', x: -25, y: 0, type: 'bidirectional' },
      { id: 'b', name: 'B', x: 25, y: 0, type: 'bidirectional' },
    ],
    properties: { state: { type: 'select', value: 'released', options: ['released', 'pressed'], label: 'State' } },
    description: 'Push Button – Normally Closed',
  },
  'sw-spdt': {
    id: 'sw-spdt', name: 'Switch SPDT', category: 'Switches',
    width: 50, height: 25, symbol: 'sw-spdt',
    terminals: [
      { id: 'common', name: 'C', x: -25, y: 0, type: 'bidirectional' },
      { id: 'a', name: 'A', x: 25, y: 0, type: 'bidirectional' },
      { id: 'b', name: 'B', x: 25, y: 25, type: 'bidirectional' },
    ],
    properties: { state: { type: 'select', value: 'a', options: ['a', 'b', 'open'], label: 'Position' } },
    description: 'Single Pole Double Throw',
  },
  'sw-dpst': {
    id: 'sw-dpst', name: 'Switch DPST', category: 'Switches',
    width: 50, height: 25, symbol: 'sw-dpst',
    terminals: [
      { id: 'a1', name: 'A1', x: -25, y: -25, type: 'bidirectional' },
      { id: 'b1', name: 'B1', x: 25, y: -25, type: 'bidirectional' },
      { id: 'a2', name: 'A2', x: -25, y: 0, type: 'bidirectional' },
      { id: 'b2', name: 'B2', x: 25, y: 0, type: 'bidirectional' },
    ],
    properties: { state: { type: 'select', value: 'open', options: ['open', 'closed'], label: 'State' } },
    description: 'Double Pole Single Throw',
  },
  'sw-dpdt': {
    id: 'sw-dpdt', name: 'Switch DPDT', category: 'Switches',
    width: 50, height: 75, symbol: 'sw-dpdt',
    terminals: [
      { id: 'c1', name: 'C1', x: -25, y: -25, type: 'bidirectional' },
      { id: 'a1', name: 'A1', x: 25, y: -25, type: 'bidirectional' },
      { id: 'b1', name: 'B1', x: 25, y: 0, type: 'bidirectional' },
      { id: 'c2', name: 'C2', x: -25, y: 25, type: 'bidirectional' },
      { id: 'a2', name: 'A2', x: 25, y: 25, type: 'bidirectional' },
      { id: 'b2', name: 'B2', x: 25, y: 50, type: 'bidirectional' },
    ],
    properties: { state: { type: 'select', value: 'a', options: ['a', 'b'], label: 'Position' } },
    description: 'Double Pole Double Throw',
  },
  'aux-contact-no': {
    id: 'aux-contact-no', name: 'Auxiliary Contact NO', category: 'Switches',
    width: 50, height: 25, symbol: 'aux-contact-no',
    terminals: [
      { id: 'a', name: '13', x: -25, y: 0, type: 'bidirectional' },
      { id: 'b', name: '14', x: 25, y: 0, type: 'bidirectional' },
    ],
    properties: { linkedTo: { type: 'text', value: '', label: 'Linked Coil Label' } },
    description: 'Normally-open auxiliary contact linked to a relay or contactor label',
  },
  'aux-contact-nc': {
    id: 'aux-contact-nc', name: 'Auxiliary Contact NC', category: 'Switches',
    width: 50, height: 25, symbol: 'aux-contact-nc',
    terminals: [
      { id: 'a', name: '21', x: -25, y: 0, type: 'bidirectional' },
      { id: 'b', name: '22', x: 25, y: 0, type: 'bidirectional' },
    ],
    properties: { linkedTo: { type: 'text', value: '', label: 'Linked Coil Label' } },
    description: 'Normally-closed auxiliary contact linked to a relay or contactor label',
  },
};

// ─── PROTECTION ───────────────────────────────────────────────────────────────
const PROTECTION: Record<string, ComponentDef> = {
  'relay-spst': {
    id: 'relay-spst', name: 'Relay SPST', category: 'Protection',
    width: 100, height: 70, symbol: 'relay-spst',
    terminals: [
      { id: 'coil+', name: 'A1', x: -50, y: -25, type: 'input' },
      { id: 'coil-', name: 'A2', x: 50, y: -25, type: 'input' },
      { id: 'com', name: 'C', x: -50, y: 25, type: 'bidirectional' },
      { id: 'no', name: 'NO', x: 50, y: 25, type: 'bidirectional' },
    ],
    properties: {
      coilVoltage: { type: 'number', value: 12, unit: 'V', min: 3, max: 480, label: 'Coil Voltage' },
      coilR: { type: 'number', value: 400, unit: 'Ω', min: 10, max: 10000, label: 'Coil Resistance' },
      contactType: { type: 'select', value: 'NO', options: ['NO', 'NC'], label: 'Contact Type' },
    },
    description: 'Relay SPST with coil and contact',
  },
  'relay-spdt': {
    id: 'relay-spdt', name: 'Relay SPDT', category: 'Protection',
    width: 100, height: 70, symbol: 'relay-spdt',
    terminals: [
      { id: 'coil+', name: 'A1', x: -50, y: -25, type: 'input' },
      { id: 'coil-', name: 'A2', x: 50, y: -25, type: 'input' },
      { id: 'com', name: 'COM', x: -50, y: 0, type: 'bidirectional' },
      { id: 'nc', name: 'NC', x: 50, y: 0, type: 'bidirectional' },
      { id: 'no', name: 'NO', x: 50, y: 25, type: 'bidirectional' }
    ],
    properties: { coilVoltage: { type: 'number', value: 12, unit: 'V', min: 1, max: 400, label: 'Coil Voltage' }, coilR: { type: 'number', value: 400, unit: 'Ω', min: 1, max: 10000, label: 'Coil Resistance' }, manualState: { type: 'select', value: 'auto', options: ['auto', 'open', 'closed'], label: 'Force State' } },
    description: 'Single-Pole Double-Throw Relay',
  },
  'relay-dpst': {
    id: 'relay-dpst', name: 'Relay DPST', category: 'Protection',
    width: 100, height: 70, symbol: 'relay-dpst',
    terminals: [
      { id: 'coil+', name: 'A1', x: -50, y: -25, type: 'input' },
      { id: 'coil-', name: 'A2', x: 50, y: -25, type: 'input' },
      { id: 'c1', name: '13', x: -50, y: 0, type: 'bidirectional' },
      { id: 'no1', name: '14', x: 50, y: 0, type: 'bidirectional' },
      { id: 'c2', name: '23', x: -50, y: 25, type: 'bidirectional' },
      { id: 'no2', name: '24', x: 50, y: 25, type: 'bidirectional' }
    ],
    properties: { coilVoltage: { type: 'number', value: 12, unit: 'V', min: 1, max: 400, label: 'Coil Voltage' }, coilR: { type: 'number', value: 400, unit: 'Ω', min: 1, max: 10000, label: 'Coil Resistance' }, manualState: { type: 'select', value: 'auto', options: ['auto', 'open', 'closed'], label: 'Force State' } },
    description: 'Double-Pole Single-Throw Relay',
  },
  'contactor': {
    id: 'contactor', name: 'Contactor', category: 'Protection',
    width: 100, height: 145, symbol: 'contactor',
    terminals: [
      { id: 'coil+', name: 'A1', x: -50, y: -50, type: 'input' },
      { id: 'coil-', name: 'A2', x: 50, y: -50, type: 'input' },
      { id: 'l1', name: 'L1', x: -50, y: -25, type: 'bidirectional' },
      { id: 't1', name: 'T1', x: 50, y: -25, type: 'bidirectional' },
      { id: 'l2', name: 'L2', x: -50, y: 0, type: 'bidirectional' },
      { id: 't2', name: 'T2', x: 50, y: 0, type: 'bidirectional' },
      { id: 'l3', name: 'L3', x: -50, y: 25, type: 'bidirectional' },
      { id: 't3', name: 'T3', x: 50, y: 25, type: 'bidirectional' },
      { id: 'aux-no-a', name: '13', x: -50, y: 50, type: 'bidirectional' },
      { id: 'aux-no-b', name: '14', x: 50, y: 50, type: 'bidirectional' },
      { id: 'aux-nc-a', name: '21', x: -50, y: 75, type: 'bidirectional' },
      { id: 'aux-nc-b', name: '22', x: 50, y: 75, type: 'bidirectional' },
    ],
    properties: {
      coilVoltage: { type: 'number', value: 24, unit: 'V', min: 12, max: 480, label: 'Coil Voltage' },
      ratedCurrent: { type: 'number', value: 50, unit: 'A', min: 1, max: 1000, label: 'Rated Current' },
    },
    description: 'Contactor with 3 main contacts + aux NO/NC',
  },
  'fuse': {
    id: 'fuse', name: 'Fuse', category: 'Protection',
    width: 100, height: 40, symbol: 'fuse',
    terminals: [
      { id: 'a', name: 'A', x: -50, y: 0, type: 'bidirectional' },
      { id: 'b', name: 'B', x: 50, y: 0, type: 'bidirectional' },
    ],
    properties: { ratedCurrent: { type: 'number', value: 10, unit: 'A', min: 0.1, max: 1000, label: 'Rated Current' } },
    description: 'Single-phase Fuse',
  },
  'fuse-3phase': {
    id: 'fuse-3phase', name: '3-Phase Fuse', category: 'Protection',
    width: 100, height: 50, symbol: 'fuse-3phase',
    terminals: [
      { id: 'l1', name: 'L1', x: -50, y: -25, type: 'input' },
      { id: 't1', name: 'T1', x: 50, y: -25, type: 'output' },
      { id: 'l2', name: 'L2', x: -50, y: 0, type: 'input' },
      { id: 't2', name: 'T2', x: 50, y: 0, type: 'output' },
      { id: 'l3', name: 'L3', x: -50, y: 25, type: 'input' },
      { id: 't3', name: 'T3', x: 50, y: 25, type: 'output' },
    ],
    properties: { ratedCurrent: { type: 'number', value: 10, unit: 'A', min: 0.1, max: 1000, label: 'Rated Current' } },
    description: 'Three-phase Fuse',
  },
  'circuit-breaker': {
    id: 'circuit-breaker', name: 'Circuit Breaker', category: 'Protection',
    width: 100, height: 50, symbol: 'circuit-breaker',
    terminals: [
      { id: 'a', name: 'A', x: -50, y: 0, type: 'bidirectional' },
      { id: 'b', name: 'B', x: 50, y: 0, type: 'bidirectional' },
    ],
    properties: {
      state: { type: 'select', value: 'closed', options: ['open', 'closed', 'tripped'], label: 'State' },
      ratedCurrent: { type: 'number', value: 10, unit: 'A', min: 0.1, max: 1000, label: 'Rated Current' },
    },
    description: 'Single-phase Thermal-Magnetic Circuit Breaker',
  },
  'circuit-breaker-3phase': {
    id: 'circuit-breaker-3phase', name: '3-Phase Circuit Breaker', category: 'Protection',
    width: 100, height: 50, symbol: 'circuit-breaker-3phase',
    terminals: [
      { id: 'l1', name: 'L1', x: -50, y: -25, type: 'input' },
      { id: 't1', name: 'T1', x: 50, y: -25, type: 'output' },
      { id: 'l2', name: 'L2', x: -50, y: 0, type: 'input' },
      { id: 't2', name: 'T2', x: 50, y: 0, type: 'output' },
      { id: 'l3', name: 'L3', x: -50, y: 25, type: 'input' },
      { id: 't3', name: 'T3', x: 50, y: 25, type: 'output' },
    ],
    properties: {
      state: { type: 'select', value: 'closed', options: ['open', 'closed', 'tripped'], label: 'State' },
      ratedCurrent: { type: 'number', value: 10, unit: 'A', min: 0.1, max: 1000, label: 'Rated Current' },
    },
    description: 'Three-phase Thermal-Magnetic Circuit Breaker',
  },
};

// ─── TRANSFORMERS ─────────────────────────────────────────────────────────────
const TRANSFORMERS: Record<string, ComponentDef> = {
  'transformer': {
    id: 'transformer', name: 'Transformer', category: 'Transformers',
    width: 100, height: 100, symbol: 'transformer',
    terminals: [
      { id: 'p1', name: 'PRI+', x: -50, y: -50, type: 'input' },
      { id: 'p2', name: 'PRI-', x: -50, y: 50, type: 'input' },
      { id: 's1', name: 'SEC+', x: 50, y: -50, type: 'output' },
      { id: 's2', name: 'SEC-', x: 50, y: 50, type: 'output' },
    ],
    properties: { turnRatio: { type: 'number', value: 5, unit: 'n:1', min: 0.001, max: 10000, label: 'Turn Ratio (n)' }, ratedPower: { type: 'number', value: 1000, unit: 'VA', min: 1, max: 1000000, label: 'Rated Apparent Power' } },
    description: 'Standard two-winding transformer',
  },
  'transformer-ct': {
    id: 'transformer-ct', name: 'Transformer (CT)', category: 'Transformers',
    width: 100, height: 100, symbol: 'transformer-ct',
    terminals: [
      { id: 'p1', name: 'PRI+', x: -50, y: -50, type: 'input' },
      { id: 'p2', name: 'PRI-', x: -50, y: 50, type: 'input' },
      { id: 's1', name: 'SEC+', x: 50, y: -50, type: 'output' },
      { id: 'ct', name: 'CT', x: 50, y: 0, type: 'output' },
      { id: 's2', name: 'SEC-', x: 50, y: 50, type: 'output' },
    ],
    properties: { turnRatio: { type: 'number', value: 5, unit: 'n:1', min: 0.001, max: 10000, label: 'Turn Ratio (n)' }, ratedPower: { type: 'number', value: 1000, unit: 'VA', min: 1, max: 1000000, label: 'Rated Apparent Power' } },
    description: 'Center-Tapped Transformer',
  },
  'autotransformer': {
    id: 'autotransformer', name: 'Autotransformer', category: 'Transformers',
    width: 100, height: 100, symbol: 'autotransformer',
    terminals: [
      { id: 'in1', name: 'In1', x: -50, y: -50, type: 'input' },
      { id: 'in2', name: 'In2', x: -50, y: 50, type: 'input' },
      { id: 'tap', name: 'Tap', x: 50, y: 0, type: 'output' },
      { id: 'out1', name: 'Out1', x: 50, y: -50, type: 'output' },
      { id: 'out2', name: 'Out2', x: 50, y: 50, type: 'output' },
    ],
    properties: {
      turnRatio: { type: 'number', value: 2, unit: 'n:1', min: 0.001, max: 10000, label: 'Turn Ratio (n)' },
      ratedPower: { type: 'number', value: 1000, unit: 'VA', min: 1, max: 1000000, label: 'Rated Apparent Power' },
    },
    description: 'Single-winding autotransformer with adjustable tap',
  },
};

// ─── POWER SEMICONDUCTORS ─────────────────────────────────────────────────────
const POWER_SEMI: Record<string, ComponentDef> = {
  'scr': {
    id: 'scr', name: 'SCR (Thyristor)', category: 'Power Semiconductors',
    width: 50, height: 50, symbol: 'scr',
    terminals: [
      { id: 'anode', name: 'A', x: 0, y: -25, type: 'input' },
      { id: 'cathode', name: 'K', x: 0, y: 25, type: 'output' },
      { id: 'gate', name: 'G', x: -25, y: 25, type: 'input' },
    ],
    properties: {
      vdrm: { type: 'number', value: 1200, unit: 'V', min: 50, max: 10000, label: 'VDRM' },
      itav: { type: 'number', value: 100, unit: 'A', min: 1, max: 10000, label: 'IT(AV)' },
      vgt: { type: 'number', value: 1.5, unit: 'V', min: 0.5, max: 5, label: 'Gate Trigger Voltage' },
      igt: { type: 'number', value: 0.05, unit: 'A', min: 0.001, max: 1, label: 'Gate Trigger Current' },
    },
    description: 'Silicon Controlled Rectifier (SCR / Thyristor)',
  },
  'diac': {
    id: 'diac', name: 'Diac', category: 'Power Semiconductors',
    width: 50, height: 50, symbol: 'diac',
    terminals: [
      { id: 'a1', name: 'A1', x: 0, y: -25, type: 'bidirectional' },
      { id: 'a2', name: 'A2', x: 0, y: 25, type: 'bidirectional' },
    ],
    properties: {
      vbo: { type: 'number', value: 30, unit: 'V', min: 10, max: 200, label: 'Breakover Voltage (Vbo)' },
      imax: { type: 'number', value: 2, unit: 'A', min: 0.1, max: 100, label: 'Max Current' },
    },
    description: 'Diac – bidirectional trigger diode',
  },
  'triac': {
    id: 'triac', name: 'Triac', category: 'Power Semiconductors',
    width: 50, height: 50, symbol: 'triac',
    terminals: [
      { id: 't1', name: 'T1', x: 0, y: -25, type: 'bidirectional' },
      { id: 't2', name: 'T2', x: 0, y: 25, type: 'bidirectional' },
      { id: 'gate', name: 'G', x: -25, y: 25, type: 'input' },
    ],
    properties: {
      vdrm: { type: 'number', value: 800, unit: 'V', min: 50, max: 10000, label: 'VDRM' },
      itav: { type: 'number', value: 50, unit: 'A', min: 1, max: 1000, label: 'IT(AV)' },
      vgt: { type: 'number', value: 1.5, unit: 'V', min: 0.5, max: 5, label: 'Gate Trigger Voltage' },
    },
    description: 'Triac – bidirectional thyristor',
  },
  'opamp': {
    id: 'opamp', name: 'Op-Amp', category: 'Power Semiconductors',
    width: 100, height: 75, symbol: 'opamp',
    terminals: [
      { id: 'in-', name: 'IN-', x: -50, y: -25, type: 'input' },
      { id: 'in+', name: 'IN+', x: -50, y: 25, type: 'input' },
      { id: 'out', name: 'OUT', x: 50, y: 0, type: 'output' },
    ],
    properties: { gain: { type: 'number', value: 10, unit: 'V/V', min: 1, max: 1e7, label: 'Open-loop Gain' }, vcc: { type: 'number', value: 15, unit: 'V', min: 1, max: 100, label: 'Supply (±)' } },
    description: 'Operational Amplifier (Ideal)',
  },
};

// ─── OTHER COMPONENTS ────────────────────────────────────────────────────────
const OTHER_COMPONENTS: Record<string, ComponentDef> = {
  'motor-dc': {
    id: 'motor-dc', name: 'DC Motor', category: 'Other Components',
    width: 60, height: 60, symbol: 'motor-dc',
    terminals: [{ id: 'pos', name: '+', x: -30, y: 0, type: 'input' }, { id: 'neg', name: '-', x: 30, y: 0, type: 'output' }],
    properties: { nominalV: { type: 'number', value: 12, unit: 'V', min: 1, max: 1000, label: 'Nominal V' }, nominalPower: { type: 'number', value: 100, unit: 'W', min: 1, max: 10000, label: 'Nominal Power' } },
    description: 'Direct Current Motor',
  },
  'motor-3phase': {
    id: 'motor-3phase', name: '3-Phase Motor', category: 'Other Components',
    width: 80, height: 80, symbol: 'motor-3phase',
    terminals: [{ id: 'u', name: 'U', x: -40, y: -20, type: 'input' }, { id: 'v', name: 'V', x: -40, y: 0, type: 'input' }, { id: 'w', name: 'W', x: -40, y: 20, type: 'input' }, { id: 'pe', name: 'PE', x: 0, y: 40, type: 'output' }],
    properties: { nominalV: { type: 'number', value: 400, unit: 'V', min: 10, max: 10000, label: 'Line Voltage' }, nominalPower: { type: 'number', value: 5000, unit: 'W', min: 10, max: 1000000, label: 'Nominal Power' } },
    description: 'Three-Phase Induction Motor',
  },
  'lamp': {
    id: 'lamp', name: 'Lamp', category: 'Other Components',
    width: 50, height: 50, symbol: 'lamp',
    terminals: [{ id: 'a', name: 'A', x: -25, y: 0, type: 'bidirectional' }, { id: 'b', name: 'B', x: 25, y: 0, type: 'bidirectional' }],
    properties: { ratedV: { type: 'number', value: 12, unit: 'V', min: 1, max: 1000, label: 'Rated V' }, ratedPower: { type: 'number', value: 5, unit: 'W', min: 0.1, max: 1000, label: 'Rated Power' } },
    description: 'Incandescent Lamp',
  },
};

// ─── DIGITAL LOGIC ────────────────────────────────────────────────────────────
const DIGITAL_LOGIC: Record<string, ComponentDef> = {
  'digital-input': {
    id: 'digital-input', name: 'Logic Input', category: 'Digital Logic', width: 60, height: 40, symbol: 'digital-input',
    terminals: [{ id: 'out', name: 'OUT', x: 30, y: 0, type: 'output' }, { id: 'gnd', name: 'GND', x: -30, y: 15, type: 'input' }],
    properties: { state: { type: 'select', value: 'LOW', options: ['LOW', 'HIGH'], label: 'Logic State' }, highVoltage: { type: 'number', value: 5, unit: 'V', min: 1, max: 24, label: 'HIGH Voltage' } },
    description: 'Configurable 0 V / HIGH digital stimulus',
  },
  'digital-output': {
    id: 'digital-output', name: 'Logic Output', category: 'Digital Logic', width: 60, height: 40, symbol: 'digital-output',
    terminals: [{ id: 'in', name: 'IN', x: -30, y: 0, type: 'input' }, { id: 'gnd', name: 'GND', x: 30, y: 15, type: 'input' }],
    properties: { thresholdVoltage: { type: 'number', value: 2.5, unit: 'V', min: 0.5, max: 12, label: 'Threshold Voltage' } },
    description: 'Displays logic HIGH when voltage exceeds threshold',
  },
  'gate-and': { id: 'gate-and', name: 'AND Gate', category: 'Digital Logic', width: 70, height: 50, symbol: 'gate-and', terminals: [{ id: 'a', name: 'A', x: -35, y: -15, type: 'input' }, { id: 'b', name: 'B', x: -35, y: 15, type: 'input' }, { id: 'out', name: 'Y', x: 35, y: 0, type: 'output' }], properties: { highVoltage: { type: 'number', value: 5, unit: 'V', min: 1, max: 15, label: 'Output High Voltage' } }, description: 'Two-input digital AND gate' },
  'gate-or': { id: 'gate-or', name: 'OR Gate', category: 'Digital Logic', width: 70, height: 50, symbol: 'gate-or', terminals: [{ id: 'a', name: 'A', x: -35, y: -15, type: 'input' }, { id: 'b', name: 'B', x: -35, y: 15, type: 'input' }, { id: 'out', name: 'Y', x: 35, y: 0, type: 'output' }], properties: { highVoltage: { type: 'number', value: 5, unit: 'V', min: 1, max: 15, label: 'Output High Voltage' } }, description: 'Two-input digital OR gate' },
  'gate-not': { id: 'gate-not', name: 'NOT Gate', category: 'Digital Logic', width: 70, height: 50, symbol: 'gate-not', terminals: [{ id: 'in', name: 'A', x: -35, y: 0, type: 'input' }, { id: 'out', name: 'Y', x: 35, y: 0, type: 'output' }], properties: { highVoltage: { type: 'number', value: 5, unit: 'V', min: 1, max: 15, label: 'Output High Voltage' } }, description: 'Single-input digital inverter' },
  'gate-nand': { id: 'gate-nand', name: 'NAND Gate', category: 'Digital Logic', width: 70, height: 50, symbol: 'gate-nand', terminals: [{ id: 'a', name: 'A', x: -35, y: -15, type: 'input' }, { id: 'b', name: 'B', x: -35, y: 15, type: 'input' }, { id: 'out', name: 'Y', x: 35, y: 0, type: 'output' }], properties: { highVoltage: { type: 'number', value: 5, unit: 'V', min: 1, max: 15, label: 'Output High Voltage' } }, description: 'Two-input digital NAND gate' },
  'gate-nor': { id: 'gate-nor', name: 'NOR Gate', category: 'Digital Logic', width: 70, height: 50, symbol: 'gate-nor', terminals: [{ id: 'a', name: 'A', x: -35, y: -15, type: 'input' }, { id: 'b', name: 'B', x: -35, y: 15, type: 'input' }, { id: 'out', name: 'Y', x: 35, y: 0, type: 'output' }], properties: { highVoltage: { type: 'number', value: 5, unit: 'V', min: 1, max: 15, label: 'Output High Voltage' } }, description: 'Two-input digital NOR gate' },
  'gate-xor': { id: 'gate-xor', name: 'XOR Gate', category: 'Digital Logic', width: 70, height: 50, symbol: 'gate-xor', terminals: [{ id: 'a', name: 'A', x: -35, y: -15, type: 'input' }, { id: 'b', name: 'B', x: -35, y: 15, type: 'input' }, { id: 'out', name: 'Y', x: 35, y: 0, type: 'output' }], properties: { highVoltage: { type: 'number', value: 5, unit: 'V', min: 1, max: 15, label: 'Output High Voltage' } }, description: 'Two-input digital XOR gate' },
  'gate-xnor': { id: 'gate-xnor', name: 'XNOR Gate', category: 'Digital Logic', width: 70, height: 50, symbol: 'gate-xnor', terminals: [{ id: 'a', name: 'A', x: -35, y: -15, type: 'input' }, { id: 'b', name: 'B', x: -35, y: 15, type: 'input' }, { id: 'out', name: 'Y', x: 35, y: 0, type: 'output' }], properties: { highVoltage: { type: 'number', value: 5, unit: 'V', min: 1, max: 15, label: 'Output High Voltage' } }, description: 'Two-input digital XNOR gate' },
};

// ─── MEASUREMENT ──────────────────────────────────────────────────────────────
const MEASUREMENT: Record<string, ComponentDef> = {
  'voltmeter': {
    id: 'voltmeter', name: 'Voltmeter', category: 'Measurement',
    width: 100, height: 100, symbol: 'voltmeter',
    terminals: [
      { id: 'pos', name: '+', x: -50, y: 0, type: 'input' },
      { id: 'neg', name: '−', x: 50, y: 0, type: 'input' },
    ],
    properties: {
      mode: { type: 'select', value: 'DC', options: ['DC', 'AC'], label: 'Mode' },
      range: { type: 'select', value: 'auto', options: ['auto', '200mV', '2V', '20V', '200V', '1000V'], label: 'Range' },
    },
    description: 'Voltmeter – connected in parallel',
  },
  'ammeter': {
    id: 'ammeter', name: 'Ammeter', category: 'Measurement',
    width: 100, height: 100, symbol: 'ammeter',
    terminals: [
      { id: 'pos', name: '+', x: -50, y: 0, type: 'input' },
      { id: 'neg', name: '−', x: 50, y: 0, type: 'input' },
    ],
    properties: {
      mode: { type: 'select', value: 'DC', options: ['DC', 'AC'], label: 'Mode' },
      range: { type: 'select', value: 'auto', options: ['auto', '200μA', '2mA', '20mA', '200mA', '10A'], label: 'Range' },
    },
    description: 'Ammeter – connected in series',
  },
  'dmm': {
    id: 'dmm', name: 'Digital Multimeter', category: 'Measurement',
    width: 90, height: 100, symbol: 'dmm', // Height upgraded to 100
    terminals: [
      { id: 'hi', name: 'V/Ω/A', x: -25, y: 50, type: 'input' }, // Pushed to y=50
      { id: 'com', name: 'COM', x: 25, y: 50, type: 'input' },  // Pushed to y=50
    ],
    properties: {
      mode: { type: 'select', value: 'DCV', options: ['DCV', 'ACV', 'DCA', 'ACA', 'OHM', 'HZ', 'CONT'], label: 'Mode' },
      range: { type: 'select', value: 'auto', options: ['auto', '200m', '2', '20', '200', '1000'], label: 'Range' },
    },
    description: 'Movable DMM with probes that measure the connected terminals',
  },
  'oscilloscope': {
    id: 'oscilloscope', name: 'Oscilloscope', category: 'Measurement',
    width: 150, height: 100, symbol: 'oscilloscope',
    terminals: [
      { id: 'ch1', name: 'CH1', x: -75, y: -50, type: 'input' },
      { id: 'ch2', name: 'CH2', x: -75, y: -25, type: 'input' },
      { id: 'ch3', name: 'CH3', x: -75, y: 0, type: 'input' },
      { id: 'ch4', name: 'CH4', x: -75, y: 25, type: 'input' },
      { id: 'gnd', name: 'GND', x: 75, y: 25, type: 'input' },
    ],
    properties: {
      timebase: { type: 'number', value: 0.02, unit: 's', min: 0.000001, max: 10, label: 'Time Base' },
      samples: { type: 'number', value: 500, unit: '', min: 50, max: 2000, label: 'Samples' },
    },
    description: 'Four-channel scope; every channel is referenced to its connected ground probe',
  },
};

// ─── MASTER EXPORT ────────────────────────────────────────────────────────────
export const COMPONENT_DEFS: Record<string, ComponentDef> = {
  ...SOURCES,
  ...PASSIVE,
  ...CONTROLLED_SOURCES,
  ...DIODES,
  ...TRANSISTORS,
  ...SWITCHES,
  ...PROTECTION,
  ...TRANSFORMERS,
  ...POWER_SEMI,
  ...OTHER_COMPONENTS,
  ...DIGITAL_LOGIC,
  ...MEASUREMENT,
};

export const CATEGORIES = [
  'Sources',
  'Controlled Sources',
  'Passive',
  'Diodes',
  'Transistors',
  'Power Semiconductors',
  'Switches',
  'Protection',
  'Transformers',
  'Other Components',
  'Digital Logic',
  'Measurement',
] as const;

export type Category = typeof CATEGORIES[number];

export function getComponentsByCategory(cat: string): ComponentDef[] {
  return Object.values(COMPONENT_DEFS).filter(c => c.category === cat);
}

export function getDef(id: string): ComponentDef | undefined {
  return COMPONENT_DEFS[id] ?? (id === 'op-amp' ? COMPONENT_DEFS['opamp'] : undefined);
}

/** LED colors as CSS */
export const LED_COLORS: Record<string, string> = {
  white: '#ffffff', red: '#ff2020', amber: '#ffbf00',
  orange: '#ff6600', yellow: '#ffff00', green: '#00e040',
  blue: '#0080ff', violet: '#8000ff',
};
