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
  label?: string;
}

// ─── SOURCES ─────────────────────────────────────────────────────────────────
const SOURCES: Record<string, ComponentDef> = {
  'dc-voltage': {
    id: 'dc-voltage', name: 'DC Voltage Source', category: 'Sources',
    width: 60, height: 60, symbol: 'dc-voltage',
    terminals: [
      { id: 'pos', name: '+', x: 0, y: -30, type: 'output' },
      { id: 'neg', name: '−', x: 0, y: 30, type: 'output' },
    ],
    properties: {
      voltage: { type: 'number', value: 12, unit: 'V', min: 0, max: 10000, label: 'Voltage' },
      internalR: { type: 'number', value: 0.01, unit: 'Ω', min: 0, max: 1000, label: 'Internal R' },
    },
    description: 'Ideal DC voltage source',
  },
  'dc-rail': {
    id: 'dc-rail', name: 'DC Power Rail', category: 'Sources',
    width: 80, height: 40, symbol: 'dc-rail',
    terminals: [
      { id: 'pos', name: '+V', x: -40, y: 0, type: 'output' },
      { id: 'neg', name: '0V', x: 40, y: 0, type: 'output' },
    ],
    properties: {
      voltage: { type: 'number', value: 24, unit: 'V', min: 0, max: 10000, label: 'Rail Voltage' },
      internalR: { type: 'number', value: 0.05, unit: 'Ω', min: 0.001, max: 1000, label: 'Internal R' },
    },
    description: 'Labelled DC supply rail with positive and return terminals',
  },
  'ac-voltage': {
    id: 'ac-voltage', name: 'AC Voltage Source', category: 'Sources',
    width: 60, height: 60, symbol: 'ac-voltage',
    terminals: [
      { id: 'pos', name: '+', x: 0, y: -30, type: 'output' },
      { id: 'neg', name: '−', x: 0, y: 30, type: 'output' },
    ],
    properties: {
      amplitude: { type: 'number', value: 10, unit: 'V', min: 0, max: 10000, label: 'Amplitude (peak)' },
      frequency: { type: 'number', value: 60, unit: 'Hz', min: 0.001, max: 1e6, label: 'Frequency' },
      phase: { type: 'number', value: 0, unit: '°', min: -360, max: 360, label: 'Phase Shift' },
      offset: { type: 'number', value: 0, unit: 'V', min: -10000, max: 10000, label: 'DC Offset' },
      waveform: { type: 'select', value: 'sine', options: ['sine', 'square', 'sawtooth', 'triangle'], label: 'Waveform' },
      phases: { type: 'select', value: 'single', options: ['single', 'three-phase'], label: 'Phase Config' },
    },
    description: 'AC voltage source with configurable waveform',
  },
  'three-phase-source': {
    id: 'three-phase-source', name: '3-Phase Voltage Source', category: 'Sources',
    width: 80, height: 90, symbol: 'three-phase-source',
    terminals: [
      { id: 'l1', name: 'L1', x: 40, y: -15, type: 'output' },
      { id: 'l2', name: 'L2', x: 40, y: 0, type: 'output' },
      { id: 'l3', name: 'L3', x: 40, y: 15, type: 'output' },
      { id: 'n', name: 'N', x: -40, y: 0, type: 'output' },
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
    width: 90, height: 90, symbol: 'three-phase-rail',
    terminals: [
      { id: 'l1', name: 'L1', x: -40, y: -30, type: 'output' },
      { id: 'l2', name: 'L2', x: -40, y: -10, type: 'output' },
      { id: 'l3', name: 'L3', x: -40, y: 10, type: 'output' },
      { id: 'n', name: 'N', x: -40, y: 30, type: 'output' },
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
    width: 60, height: 60, symbol: 'dc-current',
    terminals: [
      { id: 'pos', name: '+', x: 0, y: -30, type: 'output' },
      { id: 'neg', name: '−', x: 0, y: 30, type: 'output' },
    ],
    properties: {
      current: { type: 'number', value: 1, unit: 'A', min: 0, max: 10000, label: 'Current' },
    },
    description: 'Ideal DC current source',
  },
  'ac-current': {
    id: 'ac-current', name: 'AC Current Source', category: 'Sources',
    width: 60, height: 60, symbol: 'ac-current',
    terminals: [
      { id: 'pos', name: '+', x: 0, y: -30, type: 'output' },
      { id: 'neg', name: '−', x: 0, y: 30, type: 'output' },
    ],
    properties: {
      amplitude: { type: 'number', value: 1, unit: 'A', min: 0, max: 10000, label: 'Amplitude (peak)' },
      frequency: { type: 'number', value: 60, unit: 'Hz', min: 0.001, max: 1e6, label: 'Frequency' },
      phase: { type: 'number', value: 0, unit: '°', min: -360, max: 360, label: 'Phase Shift' },
      waveform: { type: 'select', value: 'sine', options: ['sine', 'square', 'sawtooth', 'triangle'], label: 'Waveform' },
    },
    description: 'AC current source',
  },
  'ground': {
    id: 'ground', name: 'Ground', category: 'Sources',
    width: 30, height: 30, symbol: 'ground',
    terminals: [
      { id: 'gnd', name: 'GND', x: 0, y: -15, type: 'bidirectional' },
    ],
    properties: {},
    description: 'Ground reference (0 V)',
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
    width: 70, height: 60, symbol: 'potentiometer',
    terminals: [
      { id: 't1', name: 'A', x: -30, y: 0, type: 'bidirectional' },
      { id: 't2', name: 'B', x: 30, y: 0, type: 'bidirectional' },
      { id: 'wiper', name: 'W', x: 0, y: -30, type: 'bidirectional' },
    ],
    properties: {
      resistance: { type: 'number', value: 10000, unit: 'Ω', min: 1, max: 1e9, label: 'End-to-End Resistance' },
      wiper: { type: 'number', value: 0.5, unit: '', min: 0, max: 1, step: 0.01, label: 'Wiper' },
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
};

// ─── CONTROLLED SOURCES & GROUPED NETWORKS ─────────────────────────────────────
const CONTROLLED_NETWORKS: Record<string, ComponentDef> = {
  'vccs': {
    id: 'vccs', name: 'VCCS', category: 'Controlled Sources & Networks', width: 70, height: 70, symbol: 'vccs',
    terminals: [{ id: 'pos', name: '+', x: 0, y: -35, type: 'output' }, { id: 'neg', name: '−', x: 0, y: 35, type: 'output' }, { id: 'cp', name: 'C+', x: -35, y: -20, type: 'input' }, { id: 'cn', name: 'C−', x: -35, y: 20, type: 'input' }],
    properties: { transconductance: { type: 'number', value: 0.001, unit: 'S', min: -1e6, max: 1e6, label: 'Transconductance' } },
    description: 'Voltage-controlled current source (IEEE dependent source)',
  },
  'vcvs': {
    id: 'vcvs', name: 'VCVS', category: 'Controlled Sources & Networks', width: 70, height: 70, symbol: 'vcvs',
    terminals: [{ id: 'pos', name: '+', x: 0, y: -35, type: 'output' }, { id: 'neg', name: '−', x: 0, y: 35, type: 'output' }, { id: 'cp', name: 'C+', x: -35, y: -20, type: 'input' }, { id: 'cn', name: 'C−', x: -35, y: 20, type: 'input' }],
    properties: { gain: { type: 'number', value: 2, unit: 'V/V', min: -1e6, max: 1e6, label: 'Voltage Gain' } },
    description: 'Voltage-controlled voltage source (IEEE dependent source)',
  },
  'cccs': {
    id: 'cccs', name: 'CCCS', category: 'Controlled Sources & Networks', width: 70, height: 70, symbol: 'cccs',
    terminals: [{ id: 'pos', name: '+', x: 0, y: -35, type: 'output' }, { id: 'neg', name: '−', x: 0, y: 35, type: 'output' }, { id: 'cp', name: 'S+', x: -35, y: -20, type: 'input' }, { id: 'cn', name: 'S−', x: -35, y: 20, type: 'input' }],
    properties: { gain: { type: 'number', value: 1, unit: 'A/A', min: -1e6, max: 1e6, label: 'Current Gain' } },
    description: 'Current-controlled current source with inline 0 V current-sense branch',
  },
  'ccvs': {
    id: 'ccvs', name: 'CCVS', category: 'Controlled Sources & Networks', width: 70, height: 70, symbol: 'ccvs',
    terminals: [{ id: 'pos', name: '+', x: 0, y: -35, type: 'output' }, { id: 'neg', name: '−', x: 0, y: 35, type: 'output' }, { id: 'cp', name: 'S+', x: -35, y: -20, type: 'input' }, { id: 'cn', name: 'S−', x: -35, y: 20, type: 'input' }],
    properties: { transresistance: { type: 'number', value: 1000, unit: 'Ω', min: -1e9, max: 1e9, label: 'Transresistance' } },
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
      color: { type: 'select', value: 'red', options: ['white', 'red', 'amber', 'orange', 'yellow', 'green', 'blue', 'violet'], label: 'Color' },
      forwardVoltage: { type: 'number', value: 2.0, unit: 'V', min: 1.5, max: 4.0, label: 'Forward Voltage' },
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
    width: 40, height: 60, symbol: 'bjt-npn',
    terminals: [
      { id: 'base', name: 'B', x: -20, y: 0, type: 'input' },
      { id: 'collector', name: 'C', x: 20, y: -30, type: 'output' },
      { id: 'emitter', name: 'E', x: 20, y: 30, type: 'output' },
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
    width: 40, height: 60, symbol: 'bjt-pnp',
    terminals: [
      { id: 'base', name: 'B', x: -20, y: 0, type: 'input' },
      { id: 'collector', name: 'C', x: 20, y: -30, type: 'output' },
      { id: 'emitter', name: 'E', x: 20, y: 30, type: 'output' },
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
    width: 40, height: 60, symbol: 'mosfet-n',
    terminals: [
      { id: 'gate', name: 'G', x: -20, y: 0, type: 'input' },
      { id: 'drain', name: 'D', x: 20, y: -30, type: 'output' },
      { id: 'source', name: 'S', x: 20, y: 30, type: 'output' },
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
    width: 40, height: 60, symbol: 'mosfet-p',
    terminals: [
      { id: 'gate', name: 'G', x: -20, y: 0, type: 'input' },
      { id: 'drain', name: 'D', x: 20, y: -30, type: 'output' },
      { id: 'source', name: 'S', x: 20, y: 30, type: 'output' },
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
    width: 40, height: 60, symbol: 'jfet-n',
    terminals: [
      { id: 'gate', name: 'G', x: -20, y: 0, type: 'input' },
      { id: 'drain', name: 'D', x: 20, y: -30, type: 'output' },
      { id: 'source', name: 'S', x: 20, y: 30, type: 'output' },
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
    width: 40, height: 60, symbol: 'jfet-p',
    terminals: [
      { id: 'gate', name: 'G', x: -20, y: 0, type: 'input' },
      { id: 'drain', name: 'D', x: 20, y: -30, type: 'output' },
      { id: 'source', name: 'S', x: 20, y: 30, type: 'output' },
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
    width: 50, height: 30, symbol: 'sw-spst-no',
    terminals: [
      { id: 'a', name: 'A', x: -25, y: 0, type: 'bidirectional' },
      { id: 'b', name: 'B', x: 25, y: 0, type: 'bidirectional' },
    ],
    properties: {
      state: { type: 'select', value: 'open', options: ['open', 'closed'], label: 'State' },
    },
    description: 'Single Pole Single Throw – Normally Open',
  },
  'sw-spst-nc': {
    id: 'sw-spst-nc', name: 'Switch SPST-NC', category: 'Switches',
    width: 50, height: 30, symbol: 'sw-spst-nc',
    terminals: [
      { id: 'a', name: 'A', x: -25, y: 0, type: 'bidirectional' },
      { id: 'b', name: 'B', x: 25, y: 0, type: 'bidirectional' },
    ],
    properties: {
      state: { type: 'select', value: 'closed', options: ['open', 'closed'], label: 'State' },
    },
    description: 'Single Pole Single Throw – Normally Closed',
  },
  'sw-spdt': {
    id: 'sw-spdt', name: 'Switch SPDT', category: 'Switches',
    width: 60, height: 40, symbol: 'sw-spdt',
    terminals: [
      { id: 'common', name: 'C', x: -30, y: 0, type: 'bidirectional' },
      { id: 'a', name: 'A', x: 30, y: -15, type: 'bidirectional' },
      { id: 'b', name: 'B', x: 30, y: 15, type: 'bidirectional' },
    ],
    properties: {
      state: { type: 'select', value: 'a', options: ['a', 'b', 'open'], label: 'Position' },
    },
    description: 'Single Pole Double Throw',
  },
  'sw-dpst': {
    id: 'sw-dpst', name: 'Switch DPST', category: 'Switches',
    width: 60, height: 50, symbol: 'sw-dpst',
    terminals: [
      { id: 'a1', name: 'A1', x: -30, y: -15, type: 'bidirectional' },
      { id: 'b1', name: 'B1', x: 30, y: -15, type: 'bidirectional' },
      { id: 'a2', name: 'A2', x: -30, y: 15, type: 'bidirectional' },
      { id: 'b2', name: 'B2', x: 30, y: 15, type: 'bidirectional' },
    ],
    properties: {
      state: { type: 'select', value: 'open', options: ['open', 'closed'], label: 'State' },
    },
    description: 'Double Pole Single Throw',
  },
  'sw-dpdt': {
    id: 'sw-dpdt', name: 'Switch DPDT', category: 'Switches',
    width: 70, height: 60, symbol: 'sw-dpdt',
    terminals: [
      { id: 'c1', name: 'C1', x: -35, y: -15, type: 'bidirectional' },
      { id: 'a1', name: 'A1', x: 35, y: -25, type: 'bidirectional' },
      { id: 'b1', name: 'B1', x: 35, y: -5, type: 'bidirectional' },
      { id: 'c2', name: 'C2', x: -35, y: 15, type: 'bidirectional' },
      { id: 'a2', name: 'A2', x: 35, y: 5, type: 'bidirectional' },
      { id: 'b2', name: 'B2', x: 35, y: 25, type: 'bidirectional' },
    ],
    properties: {
      state: { type: 'select', value: 'a', options: ['a', 'b'], label: 'Position' },
    },
    description: 'Double Pole Double Throw',
  },
  'pb-no': {
    id: 'pb-no', name: 'Push Button NO', category: 'Switches',
    width: 40, height: 40, symbol: 'pb-no',
    terminals: [
      { id: 'a', name: 'A', x: -20, y: 0, type: 'bidirectional' },
      { id: 'b', name: 'B', x: 20, y: 0, type: 'bidirectional' },
    ],
    properties: {
      state: { type: 'select', value: 'released', options: ['released', 'pressed'], label: 'State' },
    },
    description: 'Push Button – Normally Open',
  },
  'pb-nc': {
    id: 'pb-nc', name: 'Push Button NC', category: 'Switches',
    width: 40, height: 40, symbol: 'pb-nc',
    terminals: [
      { id: 'a', name: 'A', x: -20, y: 0, type: 'bidirectional' },
      { id: 'b', name: 'B', x: 20, y: 0, type: 'bidirectional' },
    ],
    properties: {
      state: { type: 'select', value: 'released', options: ['released', 'pressed'], label: 'State' },
    },
    description: 'Push Button – Normally Closed',
  },
  'aux-contact-no': {
    id: 'aux-contact-no', name: 'Auxiliary Contact NO', category: 'Switches',
    width: 60, height: 30, symbol: 'aux-contact-no',
    terminals: [
      { id: 'a', name: '13', x: -30, y: 0, type: 'bidirectional' },
      { id: 'b', name: '14', x: 30, y: 0, type: 'bidirectional' },
    ],
    properties: {
      linkedTo: { type: 'text', value: '', label: 'Linked Coil Label' },
    },
    description: 'Normally-open auxiliary contact linked to a relay or contactor label',
  },
  'aux-contact-nc': {
    id: 'aux-contact-nc', name: 'Auxiliary Contact NC', category: 'Switches',
    width: 60, height: 30, symbol: 'aux-contact-nc',
    terminals: [
      { id: 'a', name: '21', x: -30, y: 0, type: 'bidirectional' },
      { id: 'b', name: '22', x: 30, y: 0, type: 'bidirectional' },
    ],
    properties: {
      linkedTo: { type: 'text', value: '', label: 'Linked Coil Label' },
    },
    description: 'Normally-closed auxiliary contact linked to a relay or contactor label',
  },
};

// ─── PROTECTION ───────────────────────────────────────────────────────────────
const PROTECTION: Record<string, ComponentDef> = {
  'relay-spst': {
    id: 'relay-spst', name: 'Relay SPST', category: 'Protection',
    width: 60, height: 70, symbol: 'relay-spst',
    terminals: [
      { id: 'coil+', name: 'A1', x: -30, y: -35, type: 'input' },
      { id: 'coil-', name: 'A2', x: 30, y: -35, type: 'input' },
      { id: 'com', name: 'C', x: -30, y: 35, type: 'bidirectional' },
      { id: 'no', name: 'NO', x: 30, y: 35, type: 'bidirectional' },
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
    width: 60, height: 80, symbol: 'relay-spdt',
    terminals: [
      { id: 'coil+', name: 'A1', x: -30, y: -40, type: 'input' },
      { id: 'coil-', name: 'A2', x: 30, y: -40, type: 'input' },
      { id: 'com', name: 'C', x: -30, y: 40, type: 'bidirectional' },
      { id: 'no', name: 'NO', x: 30, y: 25, type: 'bidirectional' },
      { id: 'nc', name: 'NC', x: 30, y: 40, type: 'bidirectional' },
    ],
    properties: {
      coilVoltage: { type: 'number', value: 12, unit: 'V', min: 3, max: 480, label: 'Coil Voltage' },
      coilR: { type: 'number', value: 400, unit: 'Ω', min: 10, max: 10000, label: 'Coil Resistance' },
    },
    description: 'Relay SPDT',
  },
  'relay-dpst': {
    id: 'relay-dpst', name: 'Relay DPST', category: 'Protection',
    width: 70, height: 80, symbol: 'relay-dpst',
    terminals: [
      { id: 'coil+', name: 'A1', x: -35, y: -40, type: 'input' },
      { id: 'coil-', name: 'A2', x: 35, y: -40, type: 'input' },
      { id: 'c1', name: 'C1', x: -35, y: 20, type: 'bidirectional' },
      { id: 'no1', name: 'NO1', x: 35, y: 20, type: 'bidirectional' },
      { id: 'c2', name: 'C2', x: -35, y: 40, type: 'bidirectional' },
      { id: 'no2', name: 'NO2', x: 35, y: 40, type: 'bidirectional' },
    ],
    properties: {
      coilVoltage: { type: 'number', value: 12, unit: 'V', min: 3, max: 480, label: 'Coil Voltage' },
      contactType: { type: 'select', value: 'NO', options: ['NO', 'NC'], label: 'Contact Type' },
    },
    description: 'Relay DPST',
  },
  'relay-dpdt': {
    id: 'relay-dpdt', name: 'Relay DPDT', category: 'Protection',
    width: 80, height: 90, symbol: 'relay-dpdt',
    terminals: [
      { id: 'coil+', name: 'A1', x: -40, y: -45, type: 'input' },
      { id: 'coil-', name: 'A2', x: 40, y: -45, type: 'input' },
      { id: 'c1', name: 'C1', x: -40, y: 15, type: 'bidirectional' },
      { id: 'no1', name: 'NO1', x: 40, y: 5, type: 'bidirectional' },
      { id: 'nc1', name: 'NC1', x: 40, y: 25, type: 'bidirectional' },
      { id: 'c2', name: 'C2', x: -40, y: 45, type: 'bidirectional' },
      { id: 'no2', name: 'NO2', x: 40, y: 35, type: 'bidirectional' },
      { id: 'nc2', name: 'NC2', x: 40, y: 45, type: 'bidirectional' },
    ],
    properties: {
      coilVoltage: { type: 'number', value: 12, unit: 'V', min: 3, max: 480, label: 'Coil Voltage' },
    },
    description: 'Relay DPDT',
  },
  'contactor': {
    id: 'contactor', name: 'Contactor', category: 'Protection',
    width: 80, height: 130, symbol: 'contactor',
    terminals: [
      { id: 'coil+', name: 'A1', x: -40, y: -50, type: 'input' },
      { id: 'coil-', name: 'A2', x: 40, y: -50, type: 'input' },
      { id: 'l1', name: 'L1', x: -40, y: 0, type: 'bidirectional' },
      { id: 't1', name: 'T1', x: 40, y: 0, type: 'bidirectional' },
      { id: 'l2', name: 'L2', x: -40, y: 20, type: 'bidirectional' },
      { id: 't2', name: 'T2', x: 40, y: 20, type: 'bidirectional' },
      { id: 'l3', name: 'L3', x: -40, y: 40, type: 'bidirectional' },
      { id: 't3', name: 'T3', x: 40, y: 40, type: 'bidirectional' },
      { id: 'aux-no-a', name: '13', x: -40, y: 50, type: 'bidirectional' },
      { id: 'aux-no-b', name: '14', x: 40, y: 50, type: 'bidirectional' },
      { id: 'aux-nc-a', name: '21', x: -40, y: 65, type: 'bidirectional' },
      { id: 'aux-nc-b', name: '22', x: 40, y: 65, type: 'bidirectional' },
    ],
    properties: {
      coilVoltage: { type: 'number', value: 24, unit: 'V', min: 12, max: 480, label: 'Coil Voltage' },
      ratedCurrent: { type: 'number', value: 50, unit: 'A', min: 1, max: 1000, label: 'Rated Current' },
    },
    description: 'Contactor with 3 main contacts + aux NO/NC',
  },
  'fuse': {
    id: 'fuse', name: 'Fuse', category: 'Protection',
    width: 50, height: 20, symbol: 'fuse',
    terminals: [
      { id: 'a', name: 'A', x: -25, y: 0, type: 'bidirectional' },
      { id: 'b', name: 'B', x: 25, y: 0, type: 'bidirectional' },
    ],
    properties: {
      ratedCurrent: { type: 'number', value: 10, unit: 'A', min: 0.1, max: 1000, label: 'Rated Current' },
      voltage: { type: 'number', value: 250, unit: 'V', min: 32, max: 1000, label: 'Voltage Rating' },
      type: { type: 'select', value: 'fast', options: ['fast', 'slow', 'medium'], label: 'Type' },
    },
    description: 'Fuse – overcurrent protection',
  },
  'circuit-breaker': {
    id: 'circuit-breaker', name: 'Circuit Breaker', category: 'Protection',
    width: 50, height: 30, symbol: 'circuit-breaker',
    terminals: [
      { id: 'a', name: 'A', x: -25, y: 0, type: 'bidirectional' },
      { id: 'b', name: 'B', x: 25, y: 0, type: 'bidirectional' },
    ],
    properties: {
      ratedCurrent: { type: 'number', value: 20, unit: 'A', min: 1, max: 1000, label: 'Rated Current' },
      tripCurrent: { type: 'number', value: 25, unit: 'A', min: 1, max: 1000, label: 'Trip Current' },
      curve: { type: 'select', value: 'C', options: ['B', 'C', 'D'], label: 'Curve Type' },
      state: { type: 'select', value: 'closed', options: ['closed', 'tripped'], label: 'State' },
    },
    description: 'Circuit breaker – overcurrent + short-circuit',
  },
};

// ─── TRANSFORMERS ─────────────────────────────────────────────────────────────
const TRANSFORMERS: Record<string, ComponentDef> = {
  'transformer': {
    id: 'transformer', name: 'Transformer', category: 'Transformers',
    width: 70, height: 60, symbol: 'transformer',
    terminals: [
      { id: 'p1', name: 'P1', x: -35, y: -20, type: 'input' },
      { id: 'p2', name: 'P2', x: -35, y: 20, type: 'input' },
      { id: 's1', name: 'S1', x: 35, y: -20, type: 'output' },
      { id: 's2', name: 'S2', x: 35, y: 20, type: 'output' },
    ],
    properties: {
      primaryV: { type: 'number', value: 230, unit: 'V', min: 1, max: 100000, label: 'Primary Voltage' },
      secondaryV: { type: 'number', value: 12, unit: 'V', min: 1, max: 100000, label: 'Secondary Voltage' },
      turnRatio: { type: 'number', value: 19.17, unit: 'n:1', min: 0.001, max: 10000, label: 'Turn Ratio (n:1)' },
      maxPower: { type: 'number', value: 1000, unit: 'VA', min: 1, max: 1e7, label: 'Max Power' },
      efficiency: { type: 'number', value: 95, unit: '%', min: 50, max: 100, label: 'Efficiency' },
    },
    description: 'Standard two-winding transformer',
  },
  'transformer-ct': {
    id: 'transformer-ct', name: 'Transformer (CT)', category: 'Transformers',
    width: 70, height: 70, symbol: 'transformer-ct',
    terminals: [
      { id: 'p1', name: 'P1', x: -35, y: -25, type: 'input' },
      { id: 'p2', name: 'P2', x: -35, y: 25, type: 'input' },
      { id: 's1', name: 'S1', x: 35, y: -25, type: 'output' },
      { id: 'ct', name: 'CT', x: 35, y: 0, type: 'output' },
      { id: 's2', name: 'S2', x: 35, y: 25, type: 'output' },
    ],
    properties: {
      primaryV: { type: 'number', value: 230, unit: 'V', min: 1, max: 100000, label: 'Primary Voltage' },
      secondaryV: { type: 'number', value: 24, unit: 'V', min: 1, max: 100000, label: 'Secondary Voltage (full)' },
      turnRatio: { type: 'number', value: 9.58, unit: 'n:1', min: 0.001, max: 10000, label: 'Turn Ratio (n:1)' },
    },
    description: 'Center-tapped transformer',
  },
  'autotransformer': {
    id: 'autotransformer', name: 'Autotransformer', category: 'Transformers',
    width: 60, height: 60, symbol: 'autotransformer',
    terminals: [
      { id: 'in1', name: 'In1', x: -30, y: -25, type: 'input' },
      { id: 'in2', name: 'In2', x: -30, y: 25, type: 'input' },
      { id: 'out1', name: 'Out1', x: 30, y: -25, type: 'output' },
      { id: 'out2', name: 'Out2', x: 30, y: 25, type: 'output' },
    ],
    properties: {
      inputV: { type: 'number', value: 230, unit: 'V', min: 1, max: 100000, label: 'Input Voltage' },
      outputV: { type: 'number', value: 120, unit: 'V', min: 1, max: 100000, label: 'Output Voltage' },
      turnRatio: { type: 'number', value: 1.92, unit: 'n:1', min: 0.001, max: 10000, label: 'Turn Ratio' },
    },
    description: 'Single-winding autotransformer',
  },
};

// ─── POWER SEMICONDUCTORS ─────────────────────────────────────────────────────
const POWER_SEMI: Record<string, ComponentDef> = {
  'scr': {
    id: 'scr', name: 'SCR (Thyristor)', category: 'Power Semiconductors',
    width: 40, height: 60, symbol: 'scr',
    terminals: [
      { id: 'anode', name: 'A', x: 0, y: -30, type: 'input' },
      { id: 'cathode', name: 'K', x: 0, y: 30, type: 'output' },
      { id: 'gate', name: 'G', x: -20, y: 15, type: 'input' },
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
    width: 40, height: 20, symbol: 'diac',
    terminals: [
      { id: 'a1', name: 'A1', x: -20, y: 0, type: 'bidirectional' },
      { id: 'a2', name: 'A2', x: 20, y: 0, type: 'bidirectional' },
    ],
    properties: {
      vbo: { type: 'number', value: 30, unit: 'V', min: 10, max: 200, label: 'Breakover Voltage (Vbo)' },
      imax: { type: 'number', value: 2, unit: 'A', min: 0.1, max: 100, label: 'Max Current' },
    },
    description: 'Diac – bidirectional trigger diode',
  },
  'triac': {
    id: 'triac', name: 'Triac', category: 'Power Semiconductors',
    width: 40, height: 60, symbol: 'triac',
    terminals: [
      { id: 't1', name: 'T1', x: 0, y: -30, type: 'bidirectional' },
      { id: 't2', name: 'T2', x: 0, y: 30, type: 'bidirectional' },
      { id: 'gate', name: 'G', x: -20, y: 15, type: 'input' },
    ],
    properties: {
      vdrm: { type: 'number', value: 800, unit: 'V', min: 50, max: 10000, label: 'VDRM' },
      itav: { type: 'number', value: 50, unit: 'A', min: 1, max: 1000, label: 'IT(AV)' },
      vgt: { type: 'number', value: 1.5, unit: 'V', min: 0.5, max: 5, label: 'Gate Trigger Voltage' },
    },
    description: 'Triac – bidirectional thyristor',
  },
};

// ─── MOTORS & LAMPS ───────────────────────────────────────────────────────────
const MOTORS_LAMPS: Record<string, ComponentDef> = {
  'motor-dc': {
    id: 'motor-dc', name: 'DC Motor', category: 'Motors & Lamps',
    width: 60, height: 60, symbol: 'motor-dc',
    terminals: [
      { id: 'pos', name: '+', x: -30, y: 0, type: 'input' },
      { id: 'neg', name: '−', x: 30, y: 0, type: 'input' },
    ],
    properties: {
      nominalV: { type: 'number', value: 12, unit: 'V', min: 1, max: 1000, label: 'Nominal Voltage' },
      nominalPower: { type: 'number', value: 100, unit: 'W', min: 0.1, max: 1e6, label: 'Nominal Power' },
      nominalSpeed: { type: 'number', value: 3000, unit: 'RPM', min: 10, max: 100000, label: 'Nominal Speed' },
    },
    description: 'DC motor – rotates when powered',
  },
  'motor-3phase': {
    id: 'motor-3phase', name: '3-Phase Motor', category: 'Motors & Lamps',
    width: 60, height: 70, symbol: 'motor-3phase',
    terminals: [
      { id: 'u', name: 'U', x: -30, y: -20, type: 'input' },
      { id: 'v', name: 'V', x: -30, y: 0, type: 'input' },
      { id: 'w', name: 'W', x: -30, y: 20, type: 'input' },
      { id: 'pe', name: 'PE', x: 30, y: 0, type: 'input' },
    ],
    properties: {
      nominalV: { type: 'number', value: 400, unit: 'V', min: 100, max: 10000, label: 'Nominal Voltage (L-L)' },
      nominalPower: { type: 'number', value: 5000, unit: 'W', min: 100, max: 1e7, label: 'Nominal Power' },
      nominalSpeed: { type: 'number', value: 1500, unit: 'RPM', min: 100, max: 10000, label: 'Synchronous Speed' },
      poles: { type: 'number', value: 4, unit: '', min: 2, max: 12, label: 'Poles' },
    },
    description: '3-phase induction motor',
  },
  'lamp': {
    id: 'lamp', name: 'Lamp', category: 'Motors & Lamps',
    width: 40, height: 40, symbol: 'lamp',
    terminals: [
      { id: 'a', name: 'A', x: -20, y: 0, type: 'bidirectional' },
      { id: 'b', name: 'B', x: 20, y: 0, type: 'bidirectional' },
    ],
    properties: {
      ratedV: { type: 'number', value: 230, unit: 'V', min: 1, max: 1000, label: 'Rated Voltage' },
      ratedPower: { type: 'number', value: 60, unit: 'W', min: 0.1, max: 10000, label: 'Rated Power' },
    },
    description: 'Incandescent lamp – glows when powered',
  },
};

// ─── OP-AMPS ──────────────────────────────────────────────────────────────────
const OPAMPS: Record<string, ComponentDef> = {
  'opamp': {
    id: 'opamp', name: 'Op-Amp', category: 'Op-Amps',
    width: 60, height: 60, symbol: 'opamp',
    terminals: [
      { id: 'in+', name: '+', x: -30, y: -15, type: 'input' },
      { id: 'in-', name: '−', x: -30, y: 15, type: 'input' },
      { id: 'out', name: 'OUT', x: 30, y: 0, type: 'output' },
      { id: 'vcc', name: 'V+', x: 0, y: -30, type: 'input' },
      { id: 'vee', name: 'V−', x: 0, y: 30, type: 'input' },
    ],
    properties: {
      gain: { type: 'number', value: 1e5, unit: 'V/V', min: 1, max: 1e8, label: 'Open-Loop Gain' },
      vcc: { type: 'number', value: 15, unit: 'V', min: 1, max: 100, label: 'Supply Voltage (±)' },
      gbw: { type: 'number', value: 1e6, unit: 'Hz', min: 1e3, max: 1e10, label: 'GBW Product' },
      slewRate: { type: 'number', value: 0.5, unit: 'V/μs', min: 0.01, max: 10000, label: 'Slew Rate' },
    },
    description: 'Ideal operational amplifier (5-terminal)',
  },
};

// ─── DIGITAL LOGIC ────────────────────────────────────────────────────────────
const DIGITAL_LOGIC: Record<string, ComponentDef> = {
  'digital-input': {
    id: 'digital-input', name: 'Logic Input', category: 'Digital Logic', width: 60, height: 40, symbol: 'digital-input',
    terminals: [{ id: 'out', name: 'OUT', x: 25, y: 0, type: 'output' }],
    properties: { state: { type: 'select', value: 'LOW', options: ['LOW', 'HIGH'], label: 'Logic State' } },
    description: 'Ideal Boolean 0/1 stimulus',
  },
  'digital-output': {
    id: 'digital-output', name: 'Logic Output', category: 'Digital Logic', width: 60, height: 40, symbol: 'digital-output',
    terminals: [{ id: 'in', name: 'IN', x: -25, y: 0, type: 'input' }],
    properties: {},
    description: 'Ideal Boolean state output',
  },
  'gate-and': {
    id: 'gate-and', name: 'AND Gate', category: 'Digital Logic', width: 100, height: 100, symbol: 'gate-and',
    // Slot model N=2: pins at y=−25 and y=+25. Centre slot y=0 stays open for a 3rd pin.
    terminals: [{ id: 'a', name: 'A', x: -50, y: -25, type: 'input' }, { id: 'b', name: 'B', x: -50, y: 25, type: 'input' }, { id: 'y', name: 'Y', x: 50, y: 0, type: 'output' }],
    properties: { inputCount: { type: 'select', value: '2', options: ['2', '3', '4', '5', '6', '7', '8'], label: 'Input Count' } },
    description: 'Ideal configurable-input AND gate',
  },
  'gate-or': {
    id: 'gate-or', name: 'OR Gate', category: 'Digital Logic', width: 100, height: 100, symbol: 'gate-or',
    terminals: [{ id: 'a', name: 'A', x: -50, y: -25, type: 'input' }, { id: 'b', name: 'B', x: -50, y: 25, type: 'input' }, { id: 'y', name: 'Y', x: 50, y: 0, type: 'output' }],
    properties: { inputCount: { type: 'select', value: '2', options: ['2', '3', '4', '5', '6', '7', '8'], label: 'Input Count' } },
    description: 'Ideal configurable-input OR gate',
  },
  'gate-not': {
    id: 'gate-not', name: 'NOT Gate', category: 'Digital Logic', width: 50, height: 50, symbol: 'gate-not',
    terminals: [{ id: 'a', name: 'A', x: -25, y: 0, type: 'input' }, { id: 'y', name: 'Y', x: 25, y: 0, type: 'output' }],
    properties: {},
    description: 'Ideal NOT gate',
  },
  'gate-nand': {
    id: 'gate-nand', name: 'NAND Gate', category: 'Digital Logic', width: 100, height: 100, symbol: 'gate-nand',
    terminals: [{ id: 'a', name: 'A', x: -50, y: -25, type: 'input' }, { id: 'b', name: 'B', x: -50, y: 25, type: 'input' }, { id: 'y', name: 'Y', x: 50, y: 0, type: 'output' }],
    properties: { inputCount: { type: 'select', value: '2', options: ['2', '3', '4', '5', '6', '7', '8'], label: 'Input Count' } },
    description: 'Ideal configurable-input NAND gate',
  },
  'gate-nor': {
    id: 'gate-nor', name: 'NOR Gate', category: 'Digital Logic', width: 100, height: 100, symbol: 'gate-nor',
    terminals: [{ id: 'a', name: 'A', x: -50, y: -25, type: 'input' }, { id: 'b', name: 'B', x: -50, y: 25, type: 'input' }, { id: 'y', name: 'Y', x: 50, y: 0, type: 'output' }],
    properties: { inputCount: { type: 'select', value: '2', options: ['2', '3', '4', '5', '6', '7', '8'], label: 'Input Count' } },
    description: 'Ideal configurable-input NOR gate',
  },
  'gate-xor': {
    id: 'gate-xor', name: 'XOR Gate', category: 'Digital Logic', width: 100, height: 100, symbol: 'gate-xor',
    terminals: [{ id: 'a', name: 'A', x: -50, y: -25, type: 'input' }, { id: 'b', name: 'B', x: -50, y: 25, type: 'input' }, { id: 'y', name: 'Y', x: 50, y: 0, type: 'output' }],
    properties: { inputCount: { type: 'select', value: '2', options: ['2', '3', '4', '5', '6', '7', '8'], label: 'Input Count' } },
    description: 'Ideal configurable-input XOR gate',
  },
  'gate-xnor': {
    id: 'gate-xnor', name: 'XNOR Gate', category: 'Digital Logic', width: 100, height: 100, symbol: 'gate-xnor',
    terminals: [{ id: 'a', name: 'A', x: -50, y: -25, type: 'input' }, { id: 'b', name: 'B', x: -50, y: 25, type: 'input' }, { id: 'y', name: 'Y', x: 50, y: 0, type: 'output' }],
    properties: { inputCount: { type: 'select', value: '2', options: ['2', '3', '4', '5', '6', '7', '8'], label: 'Input Count' } },
    description: 'Ideal configurable-input XNOR gate',
  },
};

// Expandable-slot pin Y-offset for IC block terminals.
// Mirrors slotPinsFor() from dynamicLogicGeometry: odd N centres on 0,
// even N skips the centre slot so y=0 stays open (symmetric around 0).
// Every result is an exact multiple of 25.
const pinY = (index: number, total: number): number => {
  if (total === 1) return 0;
  if (total % 2 === 0) {
    const half = total / 2;
    // slots: -(half),-(half-1),...,-1, +1,...,+(half)
    const allSlots = [
      ...Array.from({ length: half }, (_, i) => -(half - i) * 25),
      ...Array.from({ length: half }, (_, i) => (i + 1) * 25),
    ];
    return allSlots[index];
  } else {
    const half = Math.floor(total / 2);
    return (index - half) * 25;
  }
};


const logicBlock = (id: string, name: string, inputs: string[], outputs: string[], description: string): ComponentDef => ({
  id, name, category: 'Digital Logic', width: 100, height: 80, symbol: id,
  terminals: [
    ...inputs.map((pin, index) => ({ id: pin, name: pin.toUpperCase(), x: -50, y: pinY(index, inputs.length), type: 'input' as const })),
    ...outputs.map((pin, index) => ({ id: pin, name: pin.toUpperCase(), x: 50, y: pinY(index, outputs.length), type: 'output' as const })),
  ],
  properties: { propagationDelayNs: { type: 'number', value: 10, unit: 'ns', min: 0, max: 10000, label: 'Propagation Delay' } },
  description,
});


const DIGITAL_LOGIC_ADVANCED: Record<string, ComponentDef> = {
  'logic-half-adder': logicBlock('logic-half-adder', 'Half Adder', ['a', 'b'], ['sum', 'carry'], 'Behavioral half adder: Sum = A XOR B, Carry = A AND B'),
  'logic-full-adder': logicBlock('logic-full-adder', 'Full Adder', ['a', 'b', 'cin'], ['sum', 'cout'], 'Behavioral full adder using bitwise Boolean equations'),
  'logic-half-subtractor': logicBlock('logic-half-subtractor', 'Half Subtractor', ['a', 'b'], ['diff', 'borrow'], 'Behavioral half subtractor'),
  'logic-full-subtractor': logicBlock('logic-full-subtractor', 'Full Subtractor', ['a', 'b', 'cin'], ['diff', 'bout'], 'Behavioral full subtractor'),
  'logic-comparator': logicBlock('logic-comparator', 'Comparator', ['a', 'b'], ['gt', 'eq', 'lt'], 'One-bit comparator with greater, equal, and less outputs'),
  'logic-encoder': { ...logicBlock('logic-encoder', 'Encoder', ['d0', 'd1', 'd2', 'd3'], ['y0', 'y1', 'valid'], 'Selector-scalable ordinary one-hot encoder'), properties: { propagationDelayNs: { type: 'number', value: 10, unit: 'ns', min: 0, max: 10000, label: 'Propagation Delay' }, selectorCount: { type: 'select', value: '2', options: ['1', '2', '3'], label: 'Selector Count' } } },
  'logic-decoder': { ...logicBlock('logic-decoder', 'Decoder', ['s0', 's1', 'en'], ['y0', 'y1', 'y2', 'y3'], 'Selector-scalable enabled decoder'), properties: { propagationDelayNs: { type: 'number', value: 10, unit: 'ns', min: 0, max: 10000, label: 'Propagation Delay' }, selectorCount: { type: 'select', value: '2', options: ['1', '2', '3'], label: 'Selector Count' } } },
  'logic-mux': { ...logicBlock('logic-mux', 'Multiplexer (MUX)', ['d0', 'd1', 'd2', 'd3', 's0', 's1'], ['y'], 'Selector-scalable multiplexer'), properties: { propagationDelayNs: { type: 'number', value: 10, unit: 'ns', min: 0, max: 10000, label: 'Propagation Delay' }, selectorCount: { type: 'select', value: '2', options: ['1', '2', '3'], label: 'Selector Count' } } },
  'logic-demux': { ...logicBlock('logic-demux', 'Demultiplexer (DEMUX)', ['d', 's0', 's1'], ['y0', 'y1', 'y2', 'y3'], 'Selector-scalable demultiplexer'), properties: { propagationDelayNs: { type: 'number', value: 10, unit: 'ns', min: 0, max: 10000, label: 'Propagation Delay' }, selectorCount: { type: 'select', value: '2', options: ['1', '2', '3'], label: 'Selector Count' } } },
  'logic-nbit-adder': { ...logicBlock('logic-nbit-adder', 'N-Bit Adder', ['a0', 'a1', 'a2', 'a3', 'b0', 'b1', 'b2', 'b3', 'cin'], ['sum0', 'sum1', 'sum2', 'sum3', 'cout'], 'Behavioral ripple-carry adder with selectable 4-bit or 8-bit width'), properties: { propagationDelayNs: { type: 'number', value: 10, unit: 'ns', min: 0, max: 10000, label: 'Propagation Delay' }, bitWidth: { type: 'select', value: '4', options: ['4', '8'], label: 'Bit Width' } } },
  'logic-parity': logicBlock('logic-parity', 'Parity Generator / Checker', ['d0', 'd1', 'd2', 'd3', 'p'], ['even', 'odd', 'valid'], 'Four-bit even/odd parity generator with even-parity checker'),
  'logic-alu-4bit': logicBlock('logic-alu-4bit', 'ALU (4-bit)', ['a0', 'a1', 'a2', 'a3', 'b0', 'b1', 'b2', 'b3', 'op0', 'op1', 'cin'], ['y0', 'y1', 'y2', 'y3', 'cout', 'zero'], '4-bit ALU: 00 ADD, 01 SUB, 10 AND, 11 OR'),
  'logic-clock': {
    ...logicBlock('logic-clock', 'Clock', [], ['out'], 'Discrete-event oscillator'), properties: {
      propagationDelayNs: { type: 'number', value: 10, unit: 'ns', min: 0, max: 10000, label: 'Propagation Delay' },
      clockPeriodMs: { type: 'number', value: 250, unit: 'ms', min: 0.002, max: 60000, label: 'Clock Period' },
    }
  },
  'logic-ff-sr': logicBlock('logic-ff-sr', 'SR Flip-Flop', ['s', 'r', 'clk'], ['q', 'qn'], 'Edge-triggered SR flip-flop'),
  'logic-ff-d': logicBlock('logic-ff-d', 'D Flip-Flop', ['d', 'clk'], ['q', 'qn'], 'Edge-triggered D flip-flop with two-phase commit'),
  'logic-ff-jk': logicBlock('logic-ff-jk', 'JK Flip-Flop', ['j', 'k', 'clk'], ['q', 'qn'], 'Edge-triggered JK flip-flop'),
  'logic-ff-t': logicBlock('logic-ff-t', 'T Flip-Flop', ['t', 'clk'], ['q', 'qn'], 'Edge-triggered T flip-flop'),
  'logic-shift-register': logicBlock('logic-shift-register', 'Shift Register', ['d', 'clk'], ['q0', 'q1', 'q2', 'q3'], 'Four-stage edge-triggered shift register'),
  'logic-counter': logicBlock('logic-counter', 'Counter', ['clk', 'reset'], ['q0', 'q1', 'q2', 'q3'], 'Four-bit edge-triggered binary counter'),
  'logic-nbit-register': { ...logicBlock('logic-nbit-register', 'N-Bit Register', ['d0', 'd1', 'd2', 'd3', 'clk', 'clear'], ['q0', 'q1', 'q2', 'q3'], 'Edge-triggered register with synchronous clear and selectable 4-bit or 8-bit width'), properties: { propagationDelayNs: { type: 'number', value: 10, unit: 'ns', min: 0, max: 10000, label: 'Propagation Delay' }, bitWidth: { type: 'select', value: '4', options: ['4', '8'], label: 'Bit Width' } } },
  'logic-ram-16x8': logicBlock('logic-ram-16x8', 'RAM (16×8)', ['a0', 'a1', 'a2', 'a3', 'd0', 'd1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'we', 'oe', 'clk'], ['q0', 'q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7'], 'Basic 16-word × 8-bit RAM with synchronous write and output enable'),
  'logic-rom-16x8': logicBlock('logic-rom-16x8', 'ROM (16×8)', ['a0', 'a1', 'a2', 'a3', 'oe'], ['q0', 'q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7'], 'Immutable 16-word × 8-bit educational address-image ROM'),
  'logic-frequency-divider': { ...logicBlock('logic-frequency-divider', 'Frequency Divider', ['clk', 'reset'], ['q'], 'Edge-triggered clock divider'), properties: { propagationDelayNs: { type: 'number', value: 10, unit: 'ns', min: 0, max: 10000, label: 'Propagation Delay' }, divideBy: { type: 'select', value: '2', options: ['2', '4', '8', '16'], label: 'Divide By' } } },
};

// ─── MEASUREMENT ──────────────────────────────────────────────────────────────
const MEASUREMENT: Record<string, ComponentDef> = {
  'voltmeter': {
    id: 'voltmeter', name: 'Voltmeter', category: 'Measurement',
    width: 50, height: 50, symbol: 'voltmeter',
    terminals: [
      { id: 'pos', name: '+', x: -25, y: 0, type: 'input' },
      { id: 'neg', name: '−', x: 25, y: 0, type: 'input' },
    ],
    properties: {
      mode: { type: 'select', value: 'DC', options: ['DC', 'AC'], label: 'Mode' },
      range: { type: 'select', value: 'auto', options: ['auto', '200mV', '2V', '20V', '200V', '1000V'], label: 'Range' },
    },
    description: 'Voltmeter – connected in parallel',
  },
  'ammeter': {
    id: 'ammeter', name: 'Ammeter', category: 'Measurement',
    width: 50, height: 50, symbol: 'ammeter',
    terminals: [
      { id: 'pos', name: '+', x: -25, y: 0, type: 'input' },
      { id: 'neg', name: '−', x: 25, y: 0, type: 'input' },
    ],
    properties: {
      mode: { type: 'select', value: 'DC', options: ['DC', 'AC'], label: 'Mode' },
      range: { type: 'select', value: 'auto', options: ['auto', '200μA', '2mA', '20mA', '200mA', '10A'], label: 'Range' },
    },
    description: 'Ammeter – connected in series',
  },
  'dmm': {
    id: 'dmm', name: 'Digital Multimeter', category: 'Measurement',
    width: 90, height: 100, symbol: 'dmm',
    terminals: [
      { id: 'hi', name: 'V/Ω/A', x: -45, y: 35, type: 'input' },
      { id: 'com', name: 'COM', x: 45, y: 35, type: 'input' },
    ],
    properties: {
      mode: { type: 'select', value: 'DCV', options: ['DCV', 'ACV', 'DCA', 'ACA', 'OHM', 'HZ', 'CONT'], label: 'Mode' },
      range: { type: 'select', value: 'auto', options: ['auto', '200m', '2', '20', '200', '1000'], label: 'Range' },
    },
    description: 'Movable DMM with probes that measure the connected terminals',
  },
  'oscilloscope': {
    id: 'oscilloscope', name: 'Oscilloscope', category: 'Measurement',
    width: 110, height: 100, symbol: 'oscilloscope',
    terminals: [
      { id: 'ch1', name: 'CH1', x: -55, y: -30, type: 'input' },
      { id: 'ch2', name: 'CH2', x: -55, y: -10, type: 'input' },
      { id: 'ch3', name: 'CH3', x: -55, y: 10, type: 'input' },
      { id: 'ch4', name: 'CH4', x: -55, y: 30, type: 'input' },
      { id: 'gnd', name: 'GND', x: 55, y: 30, type: 'input' },
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
  ...CONTROLLED_NETWORKS,
  ...DIODES,
  ...TRANSISTORS,
  ...SWITCHES,
  ...PROTECTION,
  ...TRANSFORMERS,
  ...POWER_SEMI,
  ...MOTORS_LAMPS,
  ...OPAMPS,
  ...DIGITAL_LOGIC,
  ...DIGITAL_LOGIC_ADVANCED,
  ...MEASUREMENT,
};

export const CATEGORIES = [
  'Sources',
  'Passive',
  'Controlled Sources & Networks',
  'Diodes',
  'Transistors',
  'Switches',
  'Protection',
  'Transformers',
  'Power Semiconductors',
  'Motors & Lamps',
  'Op-Amps',
  'Digital Logic',
  'Measurement',
] as const;

export type Category = typeof CATEGORIES[number];

export function getComponentsByCategory(cat: string): ComponentDef[] {
  return Object.values(COMPONENT_DEFS).filter(c => c.category === cat);
}

export function getDef(id: string): ComponentDef | undefined {
  return COMPONENT_DEFS[id];
}

/** LED forward voltage by color */
export const LED_FORWARD_VOLTAGES: Record<string, number> = {
  white: 3.2, red: 2.0, amber: 2.1, orange: 2.1,
  yellow: 2.2, green: 2.2, blue: 3.3, violet: 3.5,
};

/** LED colors as CSS */
export const LED_COLORS: Record<string, string> = {
  white: '#ffffff', red: '#ff2020', amber: '#ffbf00',
  orange: '#ff6600', yellow: '#ffff00', green: '#00e040',
  blue: '#0080ff', violet: '#8000ff',
};
