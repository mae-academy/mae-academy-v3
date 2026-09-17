import type { ExampleDefinition, OscilloscopeSettings } from '@/simulators/circuit-engine/examples/types';
import { oscilloscopeProps, part, pinWires } from '@/simulators/circuit-engine/examples/schematicHelpers';

/*
 * E.10 — Non-Inverting Schmitt Trigger
 *
 * 3 V-peak, 50 Hz sine → R1 (10 kΩ) → IN+, R2 (100 kΩ) from OUT back to IN+, IN− grounded, ±15 V.
 * IN+ crosses 0 V when V_in = −V_out·R1/R2, so the trip points are V_TH = +1.5 V, V_TL = −1.5 V.
 */
const components = [
  part('v1', 'ac-voltage', 80, 240, { amplitude: 3, frequency: 50, waveform: 'sine', offset: 0 }, { label: 'V1' }),
  part('r1', 'resistor', 200, 185, { resistance: 10000 }, { label: 'R1' }),
  part('r2', 'resistor', 360, 90, { resistance: 100000 }, { label: 'R2' }),
  part('u1', 'opamp', 360, 185, { model: 'ideal', gain: 1e6, vcc: 15 }, { label: 'U1' }),
  part('osc1', 'oscilloscope', 650, 160, oscilloscopeProps(0.005, [5, 5, 5, 5]), { label: 'OSC1' }),
  part('g1', 'ground', 260, 380, {}, { label: 'GND' }),
];
const connect = pinWires(components);
const wires = [
  connect('v1', 'pos', 'r1', 'a'),
  connect('v1', 'neg', 'g1', 'gnd'),
  connect('r1', 'b', 'u1', 'in+'),
  // Positive feedback: the defining feature of a Schmitt trigger.
  connect('u1', 'in+', 'r2', 'a'),
  connect('r2', 'b', 'u1', 'out'),
  connect('u1', 'in-', 'g1', 'gnd'),
  connect('v1', 'pos', 'osc1', 'ch1'),
  connect('u1', 'out', 'osc1', 'ch2'),
  connect('osc1', 'gnd', 'g1', 'gnd'),
];

const scope: OscilloscopeSettings = {
  timeBase: '0 to 50ms (5ms/div)',
  channels: [
    { componentId: 'v1', terminal: 'pos', label: 'CH1: 3 V sine input' },
    { componentId: 'u1', terminal: 'out', label: 'CH2: ±15 V output with hysteresis' },
  ],
  measurements: ['peak', 'frequency'],
};

export const OPAMP_SCHMITT_TRIGGER: ExampleDefinition = {
  id: 'transient-opamp-schmitt-trigger',
  name: 'Schmitt Trigger — Hysteresis Comparator',
  category: 'Time-Domain (Transient) / Op-Amp',
  categoryGroup: 'Time-Domain (Transient)',
  difficulty: 'Intermediate',
  durationMinutes: 10,
  conceptsTaught: ['Positive feedback', 'Hysteresis and noise immunity', 'Upper/lower trip points V_TH and V_TL'],
  tags: ['transient', 'op-amp', 'schmitt-trigger', 'hysteresis', 'comparator'],
  spiceNetlist: `* Example: Non-Inverting Schmitt Trigger\n* Purpose: trip points at +/- Vsat*R1/R2\n* Difficulty: Intermediate\n\n.title Schmitt Trigger\n\nV1 1 0 SIN(0 3 50)\nR1 1 2 10k\nR2 2 3 100k\nXU1 2 0 3 OPAMP_IDEAL\n\n.tran 50u 50m\n.print tran v(1) v(3)\n.end`,
  schematicAscii: `                 R2 (100k)\n            ┌───/\\/\\/───┐\n  V1 ─R1────┴──┤+         │\n (3V) (10k)      U1 ─────┴── Vout → OSC CH2\n  GND ─────────┤−`,
  educationalNarrative:
    'R2 feeds a fraction of the output back to the non-inverting input — positive feedback — so whichever rail the output is on actively holds it there. With the output at −15 V, IN+ only rises past 0 V once V_in exceeds +15·R1/R2 = +1.5 V; the output then snaps to +15 V, which drags IN+ further positive and latches the new state. Coming back down, the input has to fall all the way to −1.5 V before it flips again. That 3 V-wide dead band is the hysteresis: noise smaller than it cannot cause the output to chatter, which is exactly what a plain comparator cannot promise.',
  expectedResults: {
    nodeVoltages: { 'V_TH (input at LOW→HIGH switch)': 1.5, 'V_TL (input at HIGH→LOW switch)': -1.5 },
    notes: [
      'V_TH = +V_sat·R1/R2 = +15 · 10k/100k = +1.5 V; V_TL = −1.5 V.',
      'Hysteresis width V_TH − V_TL = 3 V.',
      'Rising switch at t = sin⁻¹(0.5)/(2π·50) ≈ 1.67 ms, falling at ≈ 11.67 ms.',
    ],
  },
  oscilloscopeSettings: scope,
  suggestedModifications: [
    'Raise R2 to 300 kΩ and watch the hysteresis narrow to ±0.5 V',
    'Drop the input amplitude to 1 V: it never reaches a trip point, so the output never switches',
    'Rebuild it as an inverting Schmitt trigger (input on IN−, divider on IN+) and compare trip points ±V_sat·R1/(R1+R2)',
    'Lower the supplies to ±5 V and confirm both trip points scale with V_sat',
  ],
  theoreticalBackground:
    'Non-inverting Schmitt trigger: V+ = (V_in·R2 + V_out·R1)/(R1 + R2). Switching occurs when V+ = 0, i.e. V_in = −V_out·R1/R2, giving V_TH = +V_sat·R1/R2 and V_TL = −V_sat·R1/R2. Inverting variant: V_TH,TL = ±V_sat·R1/(R1 + R2).',
  schematic: { components, wires },
};
