import type { ExampleDefinition, OscilloscopeSettings } from '@/simulators/circuit-engine/examples/types';
import { oscilloscopeProps, part, pinWires } from '@/simulators/circuit-engine/examples/schematicHelpers';

/*
 * E.11 — Weighted Summing Amplifier (DC + AC mixing)
 *
 * V1 = 1 V DC through R1 = 10 kΩ, V2 = 1 V-peak 100 Hz sine through R2 = 20 kΩ, Rf = 20 kΩ:
 * V_out = −Rf·(V1/R1 + V2/R2) = −(2·V1 + 1·V2) = −2 − sin(2π·100·t): a sine swinging −3 V … −1 V.
 */
const components = [
  part('v1', 'dc-voltage', 60, 110, { voltage: 1 }, { label: 'V1' }),
  part('v2', 'ac-voltage', 60, 290, { amplitude: 1, frequency: 100, waveform: 'sine', offset: 0 }, { label: 'V2' }),
  part('r1', 'resistor', 190, 60, { resistance: 10000 }, { label: 'R1' }),
  part('r2', 'resistor', 190, 240, { resistance: 20000 }, { label: 'R2' }),
  part('rf', 'resistor', 360, 60, { resistance: 20000 }, { label: 'Rf' }),
  part('u1', 'opamp', 360, 175, { model: 'ideal', gain: 1e6, vcc: 15 }, { label: 'U1' }),
  part('osc1', 'oscilloscope', 650, 160, oscilloscopeProps(0.005, [1, 1, 5, 5]), { label: 'OSC1' }),
  part('g1', 'ground', 240, 440, {}, { label: 'GND' }),
];
const connect = pinWires(components);
const wires = [
  connect('v1', 'pos', 'r1', 'a'),
  connect('v1', 'neg', 'g1', 'gnd'),
  connect('v2', 'pos', 'r2', 'a'),
  connect('v2', 'neg', 'g1', 'gnd'),
  // Summing junction: both input currents meet at the virtual ground.
  connect('r1', 'b', 'u1', 'in-'),
  connect('r2', 'b', 'u1', 'in-'),
  connect('u1', 'in-', 'rf', 'a'),
  connect('rf', 'b', 'u1', 'out'),
  connect('u1', 'in+', 'g1', 'gnd'),
  connect('v2', 'pos', 'osc1', 'ch1'),
  connect('u1', 'out', 'osc1', 'ch2'),
  connect('osc1', 'gnd', 'g1', 'gnd'),
];

const scope: OscilloscopeSettings = {
  timeBase: '0 to 50ms (5ms/div)',
  channels: [
    { componentId: 'v2', terminal: 'pos', label: 'CH1: V2, 1 V sine' },
    { componentId: 'u1', terminal: 'out', label: 'CH2: −(2·V1 + V2), −3 V … −1 V' },
  ],
  measurements: ['peak', 'mean', 'vpp'],
};

export const OPAMP_SUMMING_AMPLIFIER: ExampleDefinition = {
  id: 'transient-opamp-summing-amplifier',
  name: 'Summing Amplifier — Weighted DC + AC Mix',
  category: 'Time-Domain (Transient) / Op-Amp',
  categoryGroup: 'Time-Domain (Transient)',
  difficulty: 'Beginner',
  durationMinutes: 8,
  conceptsTaught: ['Virtual ground as a summing junction', 'Weighted summation', 'Superposition in a linear op-amp stage', 'DC level shifting'],
  tags: ['transient', 'op-amp', 'summing-amplifier', 'mixer'],
  spiceNetlist: `* Example: Weighted Summing Amplifier\n* Purpose: Vout = -Rf*(V1/R1 + V2/R2)\n* Difficulty: Beginner\n\n.title Summing Amplifier\n\nV1 1 0 DC 1\nV2 2 0 SIN(0 1 100)\nR1 1 3 10k\nR2 2 3 20k\nRf 3 4 20k\nXU1 0 3 4 OPAMP_IDEAL\n\n.tran 50u 50m\n.print tran v(2) v(4)\n.end`,
  schematicAscii: `  V1 (1V DC) ─R1 (10k)─┐        Rf (20k)\n                       ├───┬──/\\/\\/──┐\n  V2 (1V~) ──R2 (20k)──┘   └┤−        │\n                               U1 ────┴── Vout → OSC CH2\n  GND ──────────────────────┤+`,
  educationalNarrative:
    'The inverting input is held at 0 V, so each input sees only its own resistor: I1 = V1/R1 and I2 = V2/R2, independently of each other. Both currents meet at the summing junction and all of it flows through Rf, giving V_out = −Rf·(V1/R1 + V2/R2). Because Rf/R1 = 2 and Rf/R2 = 1, the 1 V DC input contributes −2 V and the 1 V sine contributes −sin(ωt) — the output is the inverted sine riding on a −2 V level, swinging from −3 V to −1 V. This is superposition made physical, and it is exactly how an audio mixer sets each channel\'s level with its own input resistor.',
  expectedResults: {
    nodeVoltages: { 'Mean V(out)': -2, 'Max V(out)': -1, 'Min V(out)': -3 },
    currents: { 'I(R1)': 1e-4, 'I(Rf) mean': 1e-4 },
    notes: ['Channel weights: Rf/R1 = 2, Rf/R2 = 1.', 'Output peak-to-peak = 2 V, inverted against V2.'],
  },
  oscilloscopeSettings: scope,
  suggestedModifications: [
    'Make R2 = 10 kΩ so both channels have equal weight',
    'Add a third input through its own resistor and predict the new output before running',
    'Set V1 to 0.5 V and confirm the output now centres on −1 V, swinging −2 V … 0 V',
    'Raise V2 to 10 V peak and watch the output clip at the −15 V rail',
  ],
  theoreticalBackground:
    'Summing amplifier: V_out = −R_f·Σ(V_k/R_k). With every R_k = R_f it is a plain inverting adder; unequal resistors weight each input by R_f/R_k. Each channel sees a virtual ground, so the inputs do not load one another.',
  schematic: { components, wires },
};
