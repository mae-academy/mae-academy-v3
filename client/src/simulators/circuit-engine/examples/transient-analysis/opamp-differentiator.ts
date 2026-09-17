import type { ExampleDefinition, OscilloscopeSettings } from '@/simulators/circuit-engine/examples/types';
import { oscilloscopeProps, part, pinWires } from '@/simulators/circuit-engine/examples/schematicHelpers';

/*
 * E.8 — Op-Amp Differentiator (triangle → square)
 *
 * 1 V-peak, 250 Hz triangle → Rs (100 Ω) → C1 (100 nF) → U1 inverting input, Rf = 10 kΩ feedback.
 * The triangle ramps at 4·A·f = 1000 V/s, so V_out = −Rf·C1·dV/dt = ∓1 V: a ±1 V square wave.
 */
const components = [
  part('v1', 'ac-voltage', 80, 220, { amplitude: 1, frequency: 250, waveform: 'triangle', offset: 0 }, { label: 'V1' }),
  part('rs', 'resistor', 170, 140, { resistance: 100 }, { label: 'Rs' }),
  part('c1', 'capacitor', 260, 140, { capacitance: 100e-9 }, { label: 'C1' }),
  part('rf', 'resistor', 385, 60, { resistance: 10000 }, { label: 'Rf' }),
  part('u1', 'opamp', 385, 165, { model: 'ideal', gain: 1e6, vcc: 15 }, { label: 'U1' }),
  part('osc1', 'oscilloscope', 650, 150, oscilloscopeProps(0.002, [0.5, 0.5, 5, 5]), { label: 'OSC1' }),
  part('g1', 'ground', 300, 360, {}, { label: 'GND' }),
];
const connect = pinWires(components);
const wires = [
  connect('v1', 'pos', 'rs', 'a'),
  connect('v1', 'neg', 'g1', 'gnd'),
  connect('rs', 'b', 'c1', 'a'),
  connect('c1', 'b', 'u1', 'in-'),
  connect('u1', 'in-', 'rf', 'a'),
  connect('rf', 'b', 'u1', 'out'),
  connect('u1', 'in+', 'g1', 'gnd'),
  connect('v1', 'pos', 'osc1', 'ch1'),
  connect('u1', 'out', 'osc1', 'ch2'),
  connect('osc1', 'gnd', 'g1', 'gnd'),
];

const scope: OscilloscopeSettings = {
  timeBase: '0 to 20ms (2ms/div)',
  channels: [
    { componentId: 'v1', terminal: 'pos', label: 'CH1: triangle input (±1 V)' },
    { componentId: 'u1', terminal: 'out', label: 'CH2: square output (∓1 V)' },
  ],
  measurements: ['peak', 'frequency', 'vpp'],
};

export const OPAMP_DIFFERENTIATOR: ExampleDefinition = {
  id: 'transient-opamp-differentiator',
  name: 'Op-Amp Differentiator — Triangle to Square',
  category: 'Time-Domain (Transient) / Op-Amp',
  categoryGroup: 'Time-Domain (Transient)',
  difficulty: 'Intermediate',
  durationMinutes: 10,
  conceptsTaught: ['Inverting differentiator', 'V_out = −RC·dV_in/dt', 'High-frequency stabilisation with a series input resistor'],
  tags: ['transient', 'op-amp', 'differentiator', 'waveshaping'],
  spiceNetlist: `* Example: Op-Amp Differentiator\n* Purpose: Vout = -Rf*C * dVin/dt (triangle -> square)\n* Difficulty: Intermediate\n\n.title Op-Amp Differentiator\n\nV1 1 0 PULSE(-1 1 0 2m 2m 1n 4m)\nRs 1 2 100\nC1 2 3 100n\nRf 3 4 10k\nXU1 0 3 4 OPAMP_IDEAL\n\n.tran 5u 20m\n.print tran v(1) v(4)\n.end`,
  schematicAscii: `                 Rf (10k)\n            ┌────/\\/\\/────┐\n  V1 ─Rs─C1─┴──┤−          │\n (tri) 100Ω 100nF   U1 ────┴── Vout → OSC CH2\n  GND ─────────┤+`,
  educationalNarrative:
    'The capacitor\'s current is C·dV/dt, and the virtual ground forces all of it through Rf, so V_out = −Rf·C·dV_in/dt. A triangle has only two slopes — +1000 V/s rising and −1000 V/s falling at 1 V peak and 250 Hz — so the output is a square wave at ∓Rf·C·1000 = ∓1 V, inverted against the input\'s slope. Rs is not decoration: a bare capacitor on the inverting input makes the feedback factor rise with frequency, and a real op-amp would ring or oscillate. 100 Ω puts a corner at 1/(2π·Rs·C) ≈ 16 kHz, far above the signal, where it quietly caps the high-frequency gain.',
  expectedResults: {
    nodeVoltages: { 'V(out) on the rising ramp': -1, 'V(out) on the falling ramp': 1 },
    notes: [
      'Triangle slope = 4·A·f = 4 · 1 V · 250 Hz = 1000 V/s.',
      '|V_out| = Rf·C·slope = 10 kΩ · 100 nF · 1000 V/s = 1 V.',
      'Switching the source to a square wave turns each edge into a narrow spike instead.',
    ],
  },
  oscilloscopeSettings: scope,
  suggestedModifications: [
    'Switch V1 to a square wave and watch every edge become a decaying spike',
    'Double the frequency to 500 Hz: the slope doubles, and so does the output (±2 V)',
    'Remove Rs (set it to 0.001 Ω) and set U1 to the Realistic model to see why it is there',
    'Switch V1 to a sine: the derivative of sin is cos, so the output leads the input by 90°',
  ],
  theoreticalBackground:
    'Inverting differentiator: V_out = −R_f·C·dV_in/dt. In the frequency domain H(jω) = −jωR_fC, a gain rising at +20 dB/decade — which is exactly why a practical differentiator adds a series input resistor R_s, flattening the gain to R_f/R_s above ω = 1/(R_sC).',
  schematic: { components, wires },
};
