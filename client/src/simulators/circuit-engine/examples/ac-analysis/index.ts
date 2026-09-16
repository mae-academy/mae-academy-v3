import type { ExampleDefinition, OscilloscopeSettings } from '@/simulators/circuit-engine/examples/types';
import { buildSeriesChain, part, wire } from '@/simulators/circuit-engine/examples/schematicHelpers';

/* F.1 — Impedance & Phase — RC Circuit AC Sweep (parked at its own -3dB corner) */
const f1Chain = buildSeriesChain({
  x: 300,
  sourceId: 'v1', sourceType: 'ac-voltage', sourceProps: { amplitude: 1, frequency: 1591.55, waveform: 'sine', offset: 0 }, sourceLabel: 'V1',
  chainParts: [
    { id: 'r1', type: 'resistor', props: { resistance: 1000 }, label: 'R1' },
    { id: 'c1', type: 'capacitor', props: { capacitance: 100e-9 }, label: 'C1' },
  ],
  groundId: 'g1',
});
const f1Scope: OscilloscopeSettings = {
  timeBase: '0 to 5ms (several cycles at f_c)',
  channels: [
    { componentId: 'v1', terminal: 'pos', label: 'CH1: source' },
    { componentId: 'r1', terminal: 'b', label: 'CH2: V(C1)' },
  ],
  measurements: ['peak', 'phase'],
};

const F1: ExampleDefinition = {
  id: 'ac-rc-impedance-phase',
  name: 'Impedance & Phase — RC Circuit AC Sweep',
  category: 'AC Analysis / Impedance',
  categoryGroup: 'AC Analysis',
  difficulty: 'Intermediate',
  durationMinutes: 10,
  conceptsTaught: ['Complex impedance', 'Capacitive reactance', 'Bode magnitude & phase'],
  tags: ['ac', 'impedance', 'phase', 'bode'],
  spiceNetlist: `* Example: Impedance and Phase Response - RC\n* Purpose: Understand complex impedance, Bode plots\n* Difficulty: Intermediate\n\n.title RC Impedance and Phase\n\nV1 1 0 AC 1 DC 0\nR1 1 2 1k\nC1 2 0 100n\n\n.ac dec 30 1 1Meg\n.print ac vdb(2) vp(2) i(V1)\n.end`,
  schematicAscii: `    1V AC @ f_c\n       |\n      R1 (1kΩ)\n       |\n     Node 2 ──── C1 (100nF) ──── GND\n\nf_c = 1/(2πRC) = 1591.55 Hz.`,
  educationalNarrative:
    'The source is parked exactly at this RC network\'s own cutoff frequency, f_c = 1/(2πRC), so the oscilloscope directly shows the defining −3dB / 45°-phase-lag point of a Bode plot as two live traces rather than a swept curve. Change the source frequency (a suggested modification) to explore the rest of the curve.',
  expectedResults: {
    notes: [
      'At f = f_c = 1591.55Hz: |Z| = R√2 ≈ 1.41kΩ, φ = −45°, |V_out/V_in| = 0.707.',
      'At 100Hz (well below f_c): |V_out/V_in| ≈ 0.0627 (−24dB), φ ≈ −86°.',
      'At 100kHz (well above f_c): |V_out/V_in| ≈ 0.9987 (≈0dB), φ ≈ −5°.',
    ],
  },
  oscilloscopeSettings: f1Scope,
  suggestedModifications: [
    'Lower the source frequency to 100Hz and see the output nearly vanish (deep in the stop-band)',
    'Raise the source frequency to 100kHz and see the output pass through almost unattenuated',
    'Swap R and C\'s positions (high-pass configuration) and compare the phase behavior',
    'Change C1 to 10nF and recompute f_c (should move to 15.9kHz)',
  ],
  theoreticalBackground:
    'Impedance Z = R + jX. Capacitive reactance X_C = −1/(2πfC). |Z| = √(R²+X²), phase φ = arctan(X/R). A Bode plot shows |Z| or |H| in dB on a log-frequency axis alongside phase in degrees.',
  schematic: f1Chain,
};

/* F.2 — Series Resonance — L-C Peak Response (parked at f0, low-R for a sharp effect) */
const f2Chain = buildSeriesChain({
  x: 300,
  sourceId: 'v1', sourceType: 'ac-voltage', sourceProps: { amplitude: 1, frequency: 5032.92, waveform: 'sine', offset: 0 }, sourceLabel: 'V1',
  chainParts: [
    { id: 'r1', type: 'resistor', props: { resistance: 10 }, label: 'R1' },
    { id: 'l1', type: 'inductor', props: { inductance: 1e-3 }, label: 'L1' },
    { id: 'c1', type: 'capacitor', props: { capacitance: 1e-6 }, label: 'C1' },
  ],
  groundId: 'g1',
});
const f2Scope: OscilloscopeSettings = {
  timeBase: '0 to 2ms (several cycles at f0)',
  channels: [
    { componentId: 'v1', terminal: 'pos', label: 'CH1: source' },
    { componentId: 'l1', terminal: 'b', label: 'CH2: V(C1) — should be Q× the source' },
  ],
  measurements: ['peak', 'phase'],
};

const F2: ExampleDefinition = {
  id: 'ac-series-rlc-resonance',
  name: 'Series RLC Resonance',
  category: 'AC Analysis / Resonance',
  categoryGroup: 'AC Analysis',
  difficulty: 'Intermediate',
  durationMinutes: 10,
  conceptsTaught: ['Series resonance', 'Impedance minimum at f0', 'Quality factor and voltage magnification'],
  tags: ['ac', 'resonance', 'rlc', 'series'],
  spiceNetlist: `* Example: Series RLC Resonance\n* Purpose: Observe peak impedance at resonant frequency\n* Difficulty: Intermediate\n\n.title Series RLC Resonance\n\nV1 1 0 AC 1 DC 0\nR1 1 2 10\nL1 2 3 1m\nC1 3 0 1u\n\n.ac dec 30 100 10k\n.print ac vdb(3) vp(3) i(V1)\n.end`,
  schematicAscii: `    1V AC @ f0\n       |\n      R1 (10Ω)\n       |\n      L1 (1mH)\n       |\n      C1 (1µF)\n       |\n      GND\n\nf0 = 1/(2π√LC) ≈ 5032.9 Hz. At resonance, X_L cancels X_C: Z = R (minimum).`,
  educationalNarrative:
    'At resonance the inductive and capacitive reactances cancel exactly (X_L = X_C), leaving a purely resistive impedance Z = R — the minimum possible impedance for this series network — so the source current peaks. Because Q = ω0L/R ≈ 0.5 here, the capacitor voltage is visibly larger than the 1V source amplitude, a direct demonstration of voltage magnification at resonance.',
  expectedResults: {
    currents: { 'I peak at resonance': 0.1 },
    notes: [
      'f0 = 1/(2π√LC) ≈ 5032.9 Hz.',
      'Q = f0×L/R ≈ 0.503; V_C at resonance ≈ Q × V_source ≈ 0.5V (modest magnification at this Q).',
      'Below f0 the network looks capacitive (current leads); above f0 it looks inductive (current lags).',
    ],
  },
  oscilloscopeSettings: f2Scope,
  suggestedModifications: [
    'Lower R1 to 1Ω: Q rises roughly 10×, and V(C1) should noticeably exceed the 1V source',
    'Raise R1 to 50Ω: the resonance broadens and V(C1) barely exceeds the source amplitude',
    'Halve L1 (0.5mH) and confirm f0 shifts up by √2',
    'Compute the power factor cos(φ) at a few frequencies away from f0',
  ],
  theoreticalBackground:
    'Series resonance: f0 = 1/(2π√LC); at f0, Z=R (minimum) and current is maximum. Quality factor Q = f0L/R = 1/(f0RC). Bandwidth BW = f0/Q. Voltage across L or C at resonance can reach Q× the source amplitude.',
  schematic: f2Chain,
};

/* F.3 — Parallel RLC Resonance (Anti-resonance): R, L, C all across the same two nodes */
const f3Components = [
  part('v1', 'ac-voltage', 200, 220, { amplitude: 1, frequency: 503.29, waveform: 'sine', offset: 0 }, { label: 'V1' }),
  part('r1', 'resistor', 420, 150, { resistance: 1000 }, { label: 'R1', rotation: 90 }),
  part('l1', 'inductor', 600, 150, { inductance: 10e-3 }, { label: 'L1', rotation: 90 }),
  part('c1', 'capacitor', 780, 150, { capacitance: 10e-6 }, { label: 'C1', rotation: 90 }),
  part('g1', 'ground', 600, 400, {}),
];
const f3Wires = [
  wire('w1', 'v1', 'pos', 'r1', 'a', [200, 170], [420, 120]),
  wire('w2', 'v1', 'pos', 'l1', 'a', [200, 170], [600, 120]),
  wire('w3', 'v1', 'pos', 'c1', 'a', [200, 170], [780, 120]),
  wire('w4', 'r1', 'b', 'g1', 'gnd', [420, 180], [600, 400]),
  wire('w5', 'l1', 'b', 'g1', 'gnd', [600, 180], [600, 400]),
  wire('w6', 'c1', 'b', 'g1', 'gnd', [780, 180], [600, 400]),
  wire('w7', 'v1', 'neg', 'g1', 'gnd', [200, 270], [600, 400]),
];
const f3Scope: OscilloscopeSettings = {
  timeBase: '0 to 20ms (several cycles at f0)',
  channels: [{ componentId: 'v1', terminal: 'pos', label: 'CH1: source current is minimum here at f0' }],
  measurements: ['peak', 'phase'],
};

const F3: ExampleDefinition = {
  id: 'ac-parallel-rlc-resonance',
  name: 'Parallel RLC Resonance (Anti-resonance)',
  category: 'AC Analysis / Resonance',
  categoryGroup: 'AC Analysis',
  difficulty: 'Intermediate',
  durationMinutes: 10,
  conceptsTaught: ['Parallel resonance', 'Impedance maximum at f0', 'Reactive current cancellation'],
  tags: ['ac', 'resonance', 'rlc', 'parallel', 'anti-resonance'],
  spiceNetlist: `* Example: Parallel RLC Resonance (Anti-resonance)\n* Purpose: Observe impedance peak (opposite of series)\n* Difficulty: Intermediate\n\n.title Parallel RLC Resonance\n\nV1 1 0 AC 1 DC 0\nR1 1 0 1k\nL1 1 0 10m\nC1 1 0 10u\n\n.ac dec 30 100 1k\n.print ac v(1) i(V1) i(R1) i(L1) i(C1)\n.end`,
  schematicAscii: `    1V AC @ f0\n    |\n    ├─ R1 (1kΩ) ─┐\n    |            |\n    ├─ L1 (10mH) ─┤─ GND\n    |            |\n    └─ C1 (10µF) ─┘\n\nf0 = 1/(2π√LC) ≈ 503.29 Hz.`,
  educationalNarrative:
    'This is the mirror image of F.2: instead of series elements, R, L and C all sit in parallel across the same two nodes. At resonance, the inductor and capacitor currents are equal in magnitude and exactly 180° out of phase, so they cancel — the source only has to supply the resistor\'s current, meaning total source current is minimum and the input impedance seen by V1 is maximum (Z=R). This is "anti-resonance," the parallel dual of series resonance.',
  expectedResults: {
    notes: [
      'f0 = 1/(2π√LC) ≈ 503.29 Hz (same formula as series resonance).',
      'At f0: input impedance ≈ R = 1kΩ (maximum), so source current is minimum (I = V/R = 1mA).',
      'Below f0 the network looks inductive from the source\'s side (L\'s low reactance dominates); above f0 it looks capacitive.',
    ],
  },
  oscilloscopeSettings: f3Scope,
  suggestedModifications: [
    'Lower R1 to 100Ω and see the impedance peak (and the current dip) become shallower',
    'Raise R1 to 10kΩ for a sharper, taller impedance peak',
    'Drive well below f0 (e.g. 100Hz) and confirm the source current rises again (inductor dominates)',
    'Compute Q_parallel = ω0×R×C and compare its bandwidth prediction to what you observe',
  ],
  theoreticalBackground:
    '1/Z = 1/R + 1/(jωL) + jωC. At resonance the reactive terms cancel, leaving Z = R (a maximum for a parallel combination). Quality factor (parallel) Q = ω0RC = R/(ω0L). Practical use: tank circuits, band-stop filters, impedance matching.',
  schematic: { components: f3Components, wires: f3Wires },
};

/* F.4 — Three-Phase AC — Balanced Star (Wye) Configuration */
const f4Components = [
  part('v1', 'three-phase-source', 300, 250, {
    voltageReference: 'Phase (L-N)', lineVoltage: 230, frequency: 50, phaseSequence: 'ABC', connection: 'Y',
  }, { label: 'V1' }),
  part('za', 'resistor', 550, 140, { resistance: 30 }, { label: 'Z_a' }),
  part('zb', 'resistor', 550, 250, { resistance: 30 }, { label: 'Z_b' }),
  part('zc', 'resistor', 550, 360, { resistance: 30 }, { label: 'Z_c' }),
  part('g1', 'ground', 300, 420, {}),
];
const f4Wires = [
  wire('w1', 'v1', 'l1', 'za', 'a', [350, 220], [520, 140]),
  wire('w2', 'v1', 'l2', 'zb', 'a', [350, 250], [520, 250]),
  wire('w3', 'v1', 'l3', 'zc', 'a', [350, 280], [520, 360]),
  wire('w4', 'za', 'b', 'v1', 'n', [580, 140], [250, 250]),
  wire('w5', 'zb', 'b', 'v1', 'n', [580, 250], [250, 250]),
  wire('w6', 'zc', 'b', 'v1', 'n', [580, 360], [250, 250]),
  wire('w7', 'v1', 'n', 'g1', 'gnd', [250, 250], [300, 420]),
];
const f4Scope: OscilloscopeSettings = {
  timeBase: '0 to 60ms (three 50Hz cycles)',
  channels: [
    { componentId: 'za', terminal: 'a', label: 'CH1: L1 phase voltage' },
    { componentId: 'zb', terminal: 'a', label: 'CH2: L2 phase voltage (120° behind)' },
    { componentId: 'zc', terminal: 'a', label: 'CH3: L3 phase voltage (240° behind)' },
  ],
  measurements: ['peak', 'phase', 'rms'],
};

const F4: ExampleDefinition = {
  id: 'ac-three-phase-star',
  name: 'Three-Phase Power — Star (Wye) Configuration',
  category: 'AC Analysis / Three-Phase',
  categoryGroup: 'AC Analysis',
  difficulty: 'Intermediate',
  durationMinutes: 10,
  conceptsTaught: ['Three-phase balanced voltages', 'Star (Wye) connection', 'Neutral current cancellation'],
  tags: ['ac', 'three-phase', 'star', 'wye', 'balanced'],
  spiceNetlist: `* Example: Three-Phase Power - Star (Wye) Configuration\n* Purpose: Understand three-phase balanced voltages and currents\n* Difficulty: Intermediate\n\nV_a 1 0 AC 230 SIN(0 325.27 50)\nV_b 2 0 AC 230 SIN(0 325.27 50 0 120)\nV_c 3 0 AC 230 SIN(0 325.27 50 0 240)\n\nZ_a 1 0 30\nZ_b 2 0 30\nZ_c 3 0 30\n\n.ac dec 1 50 50\n.print ac v(1) v(2) v(3) i(V_a) i(V_b) i(V_c)\n.end`,
  schematicAscii: `      V_a (230V, 0°)\n       |\n      Z_a (30Ω)\n       |\n       ├─ Neutral (Node 0)\n       |\n      V_b (230V, -120°)     V_c (230V, -240°)\n       |                     |\n      Z_b (30Ω)            Z_c (30Ω)\n       |                     |\n       └─ Neutral ─────────┘`,
  educationalNarrative:
    'Three voltage sources 120° apart drive a balanced star (Wye) load. With all three phase impedances equal, the three phase currents are also 120° apart and equal in magnitude — so their vector sum is exactly zero, and no current flows in the neutral conductor. This app models a balanced three-phase source as one component (rather than three separate coupled sources) so the 120° phase relationships and internal winding resistance are handled consistently.',
  expectedResults: {
    nodeVoltages: { 'Phase voltage (L-N), each phase': 230 },
    currents: { 'Phase current, each phase (RMS)': 7.67, 'Neutral current': 0 },
    power: { 'Total three-phase power': 5292 },
    notes: ['I_a + I_b + I_c = 0 by the vector sum of three balanced 120°-apart phasors.'],
  },
  oscilloscopeSettings: f4Scope,
  suggestedModifications: [
    'Change Z_c to 60Ω (making the load unbalanced) and observe a non-zero neutral current',
    'Switch the source\'s connection to Δ and compare the resulting line/phase voltage relationships',
    'Measure line-to-line voltage (V_a − V_b) and confirm it is √3 × the phase voltage ≈ 400V',
    'Reverse the phase sequence (ACB) and see the rotation direction reverse on the scope',
  ],
  theoreticalBackground:
    'Three-phase voltages are separated by 120° (2π/3 rad). Star (Wye): V_line = √3×V_phase, I_line = I_phase. The neutral carries only the unbalanced portion of the load current — zero for a perfectly balanced load. Power: P = 3×V_phase×I_phase×cos(φ) for a balanced resistive/reactive load.',
  schematic: { components: f4Components, wires: f4Wires },
};

export const AC_ANALYSIS_EXAMPLES: ExampleDefinition[] = [F1, F2, F3, F4];
