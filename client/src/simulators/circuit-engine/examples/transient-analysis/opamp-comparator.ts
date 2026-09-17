import type { ExampleDefinition, OscilloscopeSettings } from '@/simulators/circuit-engine/examples/types';
import { oscilloscopeProps, part, pinWires } from '@/simulators/circuit-engine/examples/schematicHelpers';

/*
 * E.9 — Open-Loop Op-Amp Comparator
 *
 * 5 V-peak, 50 Hz sine on IN+, a 2 V DC reference on IN−, no feedback, ±12 V rails. With A = 10⁶ a
 * 12 µV differential is already full swing, so the output is a ±12 V rectangle that switches each
 * time the sine crosses 2 V — at sin⁻¹(0.4)/(2π·50) = 1.31 ms and 10 − 1.31 = 8.69 ms.
 */
const components = [
  part('v1', 'ac-voltage', 80, 250, { amplitude: 5, frequency: 50, waveform: 'sine', offset: 0 }, { label: 'V1' }),
  part('vref', 'dc-voltage', 200, 110, { voltage: 2 }, { label: 'VREF' }),
  part('u1', 'opamp', 360, 200, { model: 'ideal', gain: 1e6, vcc: 12 }, { label: 'U1' }),
  part('rl', 'resistor', 480, 260, { resistance: 10000 }, { label: 'RL' }),
  part('osc1', 'oscilloscope', 680, 180, oscilloscopeProps(0.005, [5, 5, 5, 5]), { label: 'OSC1' }),
  part('g1', 'ground', 260, 400, {}, { label: 'GND' }),
];
const connect = pinWires(components);
const wires = [
  connect('v1', 'pos', 'u1', 'in+'),
  connect('v1', 'neg', 'g1', 'gnd'),
  connect('vref', 'pos', 'u1', 'in-'),
  connect('vref', 'neg', 'g1', 'gnd'),
  connect('u1', 'out', 'rl', 'a'),
  connect('rl', 'b', 'g1', 'gnd'),
  connect('v1', 'pos', 'osc1', 'ch1'),
  connect('u1', 'out', 'osc1', 'ch2'),
  connect('osc1', 'gnd', 'g1', 'gnd'),
];

const scope: OscilloscopeSettings = {
  timeBase: '0 to 50ms (5ms/div)',
  channels: [
    { componentId: 'v1', terminal: 'pos', label: 'CH1: 5 V sine input' },
    { componentId: 'u1', terminal: 'out', label: 'CH2: ±12 V comparator output' },
  ],
  measurements: ['peak', 'frequency'],
};

export const OPAMP_COMPARATOR: ExampleDefinition = {
  id: 'transient-opamp-comparator',
  name: 'Op-Amp Comparator — Rail-to-Rail Switching',
  category: 'Time-Domain (Transient) / Op-Amp',
  categoryGroup: 'Time-Domain (Transient)',
  difficulty: 'Beginner',
  durationMinutes: 6,
  conceptsTaught: ['Open-loop operation', 'Saturation at the supply rails', 'Threshold detection', 'Duty cycle set by the reference'],
  tags: ['transient', 'op-amp', 'comparator', 'saturation'],
  spiceNetlist: `* Example: Op-Amp Comparator\n* Purpose: open-loop op-amp slams between the rails at a reference crossing\n* Difficulty: Beginner\n\n.title Op-Amp Comparator\n\nV1 1 0 SIN(0 5 50)\nVREF 2 0 DC 2\nXU1 1 2 3 OPAMP_IDEAL\nRL 3 0 10k\n\n.tran 50u 50m\n.print tran v(1) v(3)\n.end`,
  schematicAscii: `  V1 (5V, 50Hz) ──┤+\n                     U1 ───┬── Vout → OSC CH2\n  VREF (2V) ──────┤−       RL (10k)\n                           GND`,
  educationalNarrative:
    'With no feedback the op-amp amplifies the raw difference V+ − V− by its full open-loop gain. At A = 10⁶ even 12 µV is enough to demand 12 V, so for all practical purposes the output is always pinned to one rail or the other: +12 V while the sine is above the 2 V reference, −12 V while it is below. Because the reference is above zero, the HIGH interval is shorter than the LOW one — the duty cycle is (π − 2·sin⁻¹(0.4))/2π ≈ 36.9%. Set VREF to 0 V and it becomes a 50% zero-crossing detector.',
  expectedResults: {
    nodeVoltages: { 'V(out) while V1 > 2 V': 12, 'V(out) while V1 < 2 V': -12 },
    notes: [
      'Switching instants: t = sin⁻¹(2/5)/(2π·50) ≈ 1.31 ms (rising) and ≈ 8.69 ms (falling), every 20 ms.',
      'Duty cycle ≈ 36.9%.',
    ],
  },
  oscilloscopeSettings: scope,
  suggestedModifications: [
    'Set VREF to 0 V for a 50% zero-crossing detector',
    'Raise VREF above 5 V: the output never goes HIGH',
    'Switch U1 to the Realistic model and zoom into an edge to see the slew-rate-limited transition',
    'Add a small ripple to the input and watch the output chatter — then fix it with the Schmitt trigger example',
  ],
  theoreticalBackground:
    'An op-amp without feedback is a comparator: V_out = A·(V+ − V−), clipped to the rails. Since A is enormous the linear region is microvolts wide, so V_out ≈ +V_sat when V+ > V− and −V_sat when V+ < V−.',
  schematic: { components, wires },
};
