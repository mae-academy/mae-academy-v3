import type { ExampleDefinition, OscilloscopeSettings } from '@/simulators/circuit-engine/examples/types';
import { buildSeriesChain } from '@/simulators/circuit-engine/examples/schematicHelpers';
import { OPAMP_IDEAL_INTEGRATOR } from '@/simulators/circuit-engine/examples/transient-analysis/opamp-ideal-integrator';
import { OPAMP_DIFFERENTIATOR } from '@/simulators/circuit-engine/examples/transient-analysis/opamp-differentiator';
import { OPAMP_COMPARATOR } from '@/simulators/circuit-engine/examples/transient-analysis/opamp-comparator';
import { OPAMP_SCHMITT_TRIGGER } from '@/simulators/circuit-engine/examples/transient-analysis/opamp-schmitt-trigger';
import { OPAMP_SUMMING_AMPLIFIER } from '@/simulators/circuit-engine/examples/transient-analysis/opamp-summing-amplifier';

/* E.1 — RC Charging — Capacitor Transient Response */
const e1Chain = buildSeriesChain({
  x: 300,
  sourceId: 'v1', sourceType: 'dc-voltage', sourceProps: { voltage: 10 }, sourceLabel: 'V1',
  chainParts: [
    { id: 'r1', type: 'resistor', props: { resistance: 1000 }, label: 'R1' },
    { id: 'c1', type: 'capacitor', props: { capacitance: 100e-6 }, label: 'C1' },
  ],
  groundId: 'g1',
});
const e1Scope: OscilloscopeSettings = {
  timeBase: '0 to 500ms',
  channels: [
    { componentId: 'v1', terminal: 'pos', label: 'Source' },
    { componentId: 'r1', terminal: 'b', label: 'V(C1) — capacitor voltage' },
  ],
  measurements: ['rms', 'peak'],
};

const E1: ExampleDefinition = {
  id: 'transient-rc-charging',
  name: 'RC Charging — Capacitor Transient Response',
  category: 'Time-Domain (Transient) / RC',
  categoryGroup: 'Time-Domain (Transient)',
  difficulty: 'Beginner',
  durationMinutes: 6,
  conceptsTaught: ['RC time constant', 'Exponential charging', 'Capacitor current vs. voltage'],
  tags: ['transient', 'rc', 'charging'],
  spiceNetlist: `* Example: RC Charging Curve\n* Purpose: Observe exponential charging v(t) = V(1 - exp(-t/RC))\n* Difficulty: Beginner\n\n.title RC Charging - Exponential Response\n\nV1 1 0 DC 10V\nR1 1 2 1k\nC1 2 0 100u\n\n.tran 0 0.5 0 0.001\n.print tran v(1) v(2) i(C1)\n.end`,
  schematicAscii: `    10V (applied at t=0)\n         |\n        R1 (1kΩ)\n         |\n      Node 2 ──── C1 (100µF) ──── GND`,
  educationalNarrative:
    'Press Run and watch the capacitor voltage rise along V_C(t) = V(1 − e^(−t/τ)) with τ = R×C = 100ms. At t = τ, V_C reaches ≈63.2% of the final value; by t = 5τ it is essentially fully charged (≈99.3%). This app applies the 10V source the instant the simulation starts, which is exactly the ideal step used in the reference SPICE deck.',
  expectedResults: {
    nodeVoltages: { 'Node 2 at t=100ms (=τ)': 6.32, 'Node 2 at t=500ms (=5τ)': 9.93, 'Node 2, t→∞': 10 },
    currents: { 'I(C1) at t=0': 0.01 },
    notes: ['τ = R×C = 1k × 100µF = 100ms.'],
  },
  oscilloscopeSettings: e1Scope,
  suggestedModifications: [
    'Double C1 to 200µF and watch τ double on the oscilloscope',
    'Change R1 to 2k and observe slower charging',
    'Add a second capacitor in parallel with C1 and compute the new τ',
    'Compute the energy stored at full charge: E = ½CV²',
  ],
  theoreticalBackground:
    'RC time constant τ = R×C. Charging: v_C(t) = V(1 − e^{−t/τ}). Discharging: v_C(t) = V×e^{−t/τ}. Current: i(t) = (V/R)×e^{−t/τ}. Energy stored: E = ½CV².',
  schematic: e1Chain,
};

/* E.2 — RL Transient — Inductor Response (interactive: click the switch open mid-run) */
const e2Chain = buildSeriesChain({
  x: 300,
  sourceId: 'v1', sourceType: 'dc-voltage', sourceProps: { voltage: 12 }, sourceLabel: 'V1',
  chainParts: [
    { id: 'sw1', type: 'sw-spst-nc', props: { state: 'closed' }, label: 'SW1' },
    { id: 'r1', type: 'resistor', props: { resistance: 10 }, label: 'R1' },
    { id: 'l1', type: 'inductor', props: { inductance: 0.1 }, label: 'L1' },
  ],
  groundId: 'g1',
});
const e2Scope: OscilloscopeSettings = {
  timeBase: '0 to 100ms',
  channels: [{ componentId: 'l1', terminal: 'a', label: 'V(L1) — across the inductor' }],
  measurements: ['peak'],
};

const E2: ExampleDefinition = {
  id: 'transient-rl-decay',
  name: 'RL Circuit — Inductor Transient',
  category: 'Time-Domain (Transient) / RL',
  categoryGroup: 'Time-Domain (Transient)',
  difficulty: 'Beginner',
  durationMinutes: 6,
  conceptsTaught: ['RL time constant', 'Inductor back-EMF', 'Current continuity through an inductor'],
  tags: ['transient', 'rl', 'decay'],
  spiceNetlist: `* Example: RL Circuit - Inductor Transient\n* Purpose: Observe inductor de-energizing, i(t) = (V/R) exp(-Rt/L)\n* Difficulty: Beginner\n\n.title RL Circuit - Inductor Transient\n\nV1 1 0 DC 12V\nSW1 1 2 (closed at start, open to trigger decay)\nR1 2 3 10\nL1 3 0 100m\n\n.tran 0 0.5 0 0.001\n.print tran v(3) i(L1)\n.end`,
  schematicAscii: `    12V\n     |\n    SW1 (closed)\n     |\n    R1 (10Ω)\n     |\n   Node ──── L1 (100mH) ──── GND`,
  educationalNarrative:
    'This app has no scripted "pulse at t=0.1s" source, so the interesting de-energizing transient is triggered interactively instead — arguably a better lesson, since it shows both halves of inductor behavior in one run: press Run with SW1 closed and the current climbs to its steady value I = V/R = 1.2A (L looks like a short once settled); then click SW1 open and watch the current decay along i(t) = I₀×e^(−t/τ_L), τ_L = L/R = 10ms, as the inductor\'s back-EMF forces current to keep flowing through the loop for a moment.',
  expectedResults: {
    currents: { 'I(L1), steady state (SW1 closed)': 1.2, 'I(L1), one τ_L after opening': 0.441 },
    notes: ['τ_L = L/R = 100mH / 10Ω = 10ms.', 'Voltage across L1 steps to −12V the instant SW1 opens (back-EMF opposing the sudden current interruption), then decays toward 0.'],
  },
  oscilloscopeSettings: e2Scope,
  suggestedModifications: [
    'Add a resistor in parallel with L1 (a "freewheeling" damping path) and see the decay speed up',
    'Change R1 to 20Ω and confirm τ_L halves',
    'Increase L1 to 200mH and observe the slower decay',
    'Measure the energy dissipated during decay: E = ½LI²',
  ],
  theoreticalBackground:
    'Inductor back-EMF: v_L = L×di/dt. RL decay: i(t) = I₀×e^{−Rt/L}. Time constant τ_L = L/R. Energy stored: E = ½LI². Real inductors have parasitic resistance, so real decays are faster than an ideal model predicts.',
  schematic: e2Chain,
};

/* E.3 — RLC Series Resonance — Transient Ringing (ζ ≈ 0.5, underdamped) */
const e3Chain = buildSeriesChain({
  x: 300,
  sourceId: 'v1', sourceType: 'dc-voltage', sourceProps: { voltage: 10 }, sourceLabel: 'V1',
  chainParts: [
    { id: 'r1', type: 'resistor', props: { resistance: 100 }, label: 'R1' },
    { id: 'l1', type: 'inductor', props: { inductance: 0.01 }, label: 'L1' },
    { id: 'c1', type: 'capacitor', props: { capacitance: 100e-6 }, label: 'C1' },
  ],
  groundId: 'g1',
});
const e3Scope: OscilloscopeSettings = {
  timeBase: '0 to 500ms',
  channels: [
    { componentId: 'l1', terminal: 'b', label: 'V(C1) — rings around 10V' },
    { componentId: 'l1', terminal: 'a', label: 'through L1 — damped oscillation' },
  ],
  measurements: ['peak', 'frequency'],
};

const E3: ExampleDefinition = {
  id: 'transient-rlc-series-resonance',
  name: 'RLC Series Resonance — Transient Ringing',
  category: 'Time-Domain (Transient) / RLC',
  categoryGroup: 'Time-Domain (Transient)',
  difficulty: 'Intermediate',
  durationMinutes: 10,
  conceptsTaught: ['Damping ratio ζ', 'Underdamped / critical / overdamped step response', 'Natural frequency ω₀'],
  tags: ['transient', 'rlc', 'resonance', 'damping'],
  spiceNetlist: `* Example: RLC Series Resonance\n* Purpose: Observe underdamped, critically damped, overdamped responses\n* Difficulty: Intermediate\n\n.title RLC Series - Transient Response\n\nV1 1 0 DC 10V\nR1 1 2 100\nL1 2 3 10m\nC1 3 0 100u\n\n.tran 0 1 0 0.0001\n.print tran v(1) v(3) i(L1)\n.end`,
  schematicAscii: `    10V (step at t=0)\n        |\n       R1 (100Ω)\n        |\n       L1 (10mH)\n        |\n       C1 (100µF)\n        |\n       GND\n\nf0 = 1/(2π√LC) ≈ 159 Hz.  ζ = R/(2√(L/C)) = 0.5 (underdamped).`,
  educationalNarrative:
    'RLC circuits fall into three regimes depending on ζ = R/(2√(L/C)): underdamped (ζ<1, oscillatory with overshoot), critically damped (ζ=1, fastest non-oscillatory response), and overdamped (ζ>1, slow, no overshoot). At R=100Ω here, ζ=0.5 — a lightly-damped ringing response. Suggested modifications below walk through all three regimes on the same circuit.',
  expectedResults: {
    nodeVoltages: { 'V(C1) peak overshoot': 16.3 },
    notes: [
      'ω0 = 1/√(LC) ≈ 1000 rad/s ≈ 159 Hz; ζ = R/(2√(L/C)) = 0.5.',
      'Damped oscillation frequency ≈ 159Hz × √(1−ζ²) ≈ 137 Hz.',
      'Settling time (±2%) ≈ 3/(ζ×ω0) ≈ 30ms.',
    ],
  },
  oscilloscopeSettings: e3Scope,
  suggestedModifications: [
    'Increase R1 to 200Ω (ζ=1, critically damped): no overshoot, fastest smooth rise to 10V',
    'Increase R1 to 400Ω (ζ=2, overdamped): slow creep to 10V, no overshoot',
    'Keep R1=100Ω and increase L1: lowers the natural frequency, slower oscillation',
    'Compute Q = ω0×L/R = 0.1 (low Q → heavy damping; try raising Q by lowering R1)',
  ],
  theoreticalBackground:
    'Step response: v(t) depends on ζ = R/(2√(L/C)) and ω0 = 1/√(LC). Underdamped: v(t) = V×[1 − e^{−ζω0t}(cos(ωd t) + (ζ/√(1−ζ²))sin(ωd t))], ωd = ω0√(1−ζ²). Quality factor Q = ω0L/R = 1/(2ζ).',
  suggestedAnalysisMethod: 'mesh',
  schematic: e3Chain,
};

/* E.4 — RC Low-Pass Filter — Frequency & Transient Response */
const e4Chain = buildSeriesChain({
  x: 300,
  sourceId: 'v1', sourceType: 'ac-voltage', sourceProps: { amplitude: 1, frequency: 100, waveform: 'sine', offset: 0 }, sourceLabel: 'V1',
  chainParts: [
    { id: 'r1', type: 'resistor', props: { resistance: 1000 }, label: 'R1' },
    { id: 'c1', type: 'capacitor', props: { capacitance: 1.59e-6 }, label: 'C1' },
  ],
  groundId: 'g1',
});
const e4Scope: OscilloscopeSettings = {
  timeBase: '0 to 100ms (several 100Hz cycles)',
  channels: [
    { componentId: 'v1', terminal: 'pos', label: 'CH1: input (100Hz sine)' },
    { componentId: 'r1', terminal: 'b', label: 'CH2: filtered output' },
  ],
  measurements: ['peak', 'phase'],
};

const E4: ExampleDefinition = {
  id: 'transient-rc-lowpass',
  name: 'RC Low-Pass Filter — Frequency & Transient Response',
  category: 'Time-Domain (Transient) / Filters',
  categoryGroup: 'Time-Domain (Transient)',
  difficulty: 'Intermediate',
  durationMinutes: 10,
  conceptsTaught: ['Cutoff frequency', '-3dB point', 'Phase lag', 'Connecting AC frequency response to a time-domain trace'],
  tags: ['transient', 'ac', 'filter', 'low-pass'],
  spiceNetlist: `* Example: RC Low-Pass Filter (Time & Frequency Domain)\n* Purpose: Connect AC frequency response to transient settling\n* Difficulty: Intermediate\n\n.title RC Low-Pass Filter\n\nV1 1 0 SIN(0 1V 100Hz)\nR1 1 2 1k\nC1 2 0 1.59u\n\n.tran 0 0.1 0 0.00001\n.ac dec 20 1 10k\n.print tran v(1) v(2)\n.end`,
  schematicAscii: `    1V @ 100Hz\n        |\n       R1 (1kΩ)\n        |\n      Node 2 ──── C1 (1.59µF) ──── GND\n\nf_c = 1/(2πRC) = 100 Hz.`,
  educationalNarrative:
    'The drive frequency (100Hz) is set exactly at the filter\'s own cutoff frequency f_c = 1/(2πRC), so on the oscilloscope the output amplitude should read 70.7% of the input (−3dB) with a 45° phase lag — the textbook definition of the cutoff point, seen directly as two traces on the same screen instead of a Bode plot.',
  expectedResults: {
    notes: [
      'At f = f_c = 100Hz: |V_out/V_in| = 0.707 (−3dB), phase lag = 45°.',
      'One decade below (10Hz): |V_out/V_in| ≈ 0.995 (−0.04dB), phase lag ≈ 6°.',
      'One decade above (1kHz): |V_out/V_in| ≈ 0.0995 (−20dB), phase lag ≈ 84°.',
    ],
  },
  oscilloscopeSettings: e4Scope,
  suggestedModifications: [
    'Change C1 to 159nF (f_c → 1kHz) and watch the 100Hz output pass through almost unattenuated',
    'Cascade a second identical RC stage and observe steeper (−40dB/decade) rolloff',
    'Sweep the source frequency and trace out the Bode magnitude/phase response by hand',
    'Measure the group delay: the time shift between input and output zero-crossings',
  ],
  theoreticalBackground:
    'RC low-pass transfer function: H(f) = 1/√(1+(f/f_c)²), f_c = 1/(2πRC). Phase: φ(f) = −arctan(f/f_c). Roll-off: −20dB/decade above f_c for a first-order filter.',
  schematic: e4Chain,
};

/* E.5 — LC Circuit — Undamped Oscillation (Ideal Resonance) */
const e5Chain = buildSeriesChain({
  x: 300,
  sourceId: 'v1', sourceType: 'dc-voltage', sourceProps: { voltage: 10 }, sourceLabel: 'V1',
  chainParts: [
    { id: 'l1', type: 'inductor', props: { inductance: 0.01 }, label: 'L1' },
    { id: 'c1', type: 'capacitor', props: { capacitance: 100e-6 }, label: 'C1' },
  ],
  groundId: 'g1',
});
const e5Scope: OscilloscopeSettings = {
  timeBase: '0 to 50ms (several cycles)',
  channels: [{ componentId: 'l1', terminal: 'b', label: 'V(C1) — sustained ~sinusoidal ringing' }],
  measurements: ['frequency', 'peak'],
};

const E5: ExampleDefinition = {
  id: 'transient-lc-lossless-resonance',
  name: 'LC Circuit — Lossless Resonance',
  category: 'Time-Domain (Transient) / LC',
  categoryGroup: 'Time-Domain (Transient)',
  difficulty: 'Intermediate',
  durationMinutes: 8,
  conceptsTaught: ['Energy exchange between L and C', 'Resonant frequency', 'Ideal (near-lossless) oscillation'],
  tags: ['transient', 'lc', 'resonance'],
  spiceNetlist: `* Example: LC Circuit - Lossless Resonance\n* Purpose: Observe sustained oscillation (no damping resistance)\n* Difficulty: Intermediate\n\n.title LC Circuit - Lossless Resonance\n\nV1 1 0 DC 10V\nL1 1 2 10m\nC1 2 0 100u\n\n.tran 0 1 0 0.0001\n.print tran v(2) i(L1)\n.end`,
  schematicAscii: `    10V (step at t=0)\n        |\n       L1 (10mH)\n        |\n       C1 (100µF)\n        |\n       GND\n\nf0 = 1/(2π√LC) ≈ 159 Hz. With (almost) no series resistance, oscillation barely decays.`,
  educationalNarrative:
    'With no deliberate series resistor, energy oscillates almost losslessly between the inductor\'s magnetic field and the capacitor\'s electric field. The source\'s small internal resistance (0.01Ω, a realistic ideal-source model rather than a true 0Ω short) means the ringing decays extremely slowly — close enough to the textbook "sustained oscillation" case to see many undamped-looking cycles on the oscilloscope before any visible decay.',
  expectedResults: {
    notes: [
      'f0 = 1/(2π√LC) ≈ 159 Hz, period T ≈ 6.3ms.',
      'V(C1) swings between roughly 0V and 20V (voltage can exceed the source voltage at resonance).',
      'Current through L1 is 90° out of phase with V(C1).',
    ],
  },
  oscilloscopeSettings: e5Scope,
  suggestedModifications: [
    'Add a 1Ω resistor in series and watch the oscillation visibly damp out over a few cycles',
    'Add a 10Ω resistor and see the decay speed up further',
    'Try different L and C values and confirm f0 = 1/(2π√LC) each time',
    'Compare the peak inductor current against I_peak ≈ V×√(C/L)',
  ],
  theoreticalBackground:
    'LC resonance: ω0 = 1/√(LC). At resonance, ideal impedance is 0 and energy trades between E_L=½LI² and E_C=½CV² with the sum constant. Quality factor Q = ω0L/R grows without bound as R→0. Real inductors and sources always add some resistance, so real "LC" circuits eventually damp.',
  schematic: e5Chain,
};

/* E.6 — RLC High-Pass Filter with Resonance Peaking */
const e6Chain = buildSeriesChain({
  x: 300,
  sourceId: 'v1', sourceType: 'ac-voltage', sourceProps: { amplitude: 1, frequency: 1000, waveform: 'sine', offset: 0 }, sourceLabel: 'V1',
  chainParts: [
    { id: 'r1', type: 'resistor', props: { resistance: 100 }, label: 'R1' },
    { id: 'l1', type: 'inductor', props: { inductance: 0.001 }, label: 'L1' },
    { id: 'c1', type: 'capacitor', props: { capacitance: 100e-9 }, label: 'C1' },
  ],
  groundId: 'g1',
});
const e6Scope: OscilloscopeSettings = {
  timeBase: '0 to 50ms',
  channels: [
    { componentId: 'v1', terminal: 'pos', label: 'CH1: 1kHz input' },
    { componentId: 'l1', terminal: 'b', label: 'CH2: V(C1) output' },
  ],
  measurements: ['peak', 'phase'],
};

const E6: ExampleDefinition = {
  id: 'transient-rlc-highpass-resonance',
  name: 'High-Pass Filter with Resonance Peaking',
  category: 'Time-Domain (Transient) / Filters',
  categoryGroup: 'Time-Domain (Transient)',
  difficulty: 'Advanced',
  durationMinutes: 12,
  conceptsTaught: ['High-pass behavior from a series capacitor', 'Resonance peaking in a cascaded RLC', 'Quality factor and peak sharpness'],
  tags: ['transient', 'ac', 'rlc', 'high-pass', 'resonance'],
  spiceNetlist: `* Example: High-Pass Filter with Resonance\n* Purpose: Show interaction between high-pass behavior and resonance\n* Difficulty: Advanced\n\n.title High-Pass Filter with Resonance\n\nV1 1 0 SIN(0 1V 1k)\nR1 1 2 100\nL1 2 3 1m\nC1 3 0 100n\n\n.tran 0 0.01 0 0.00001\n.ac dec 20 1 100k\n.print tran v(1) v(3)\n.end`,
  schematicAscii: `    1V @ 1kHz\n       |\n      R1 (100Ω)\n       |\n      L1 (1mH)\n       |\n      C1 (100nF)\n       |\n      GND\n\nHigh-pass due to C1 (blocks DC); resonance peak near f0 = 1/(2π√LC) ≈ 1591 Hz.`,
  educationalNarrative:
    'This circuit combines high-pass filtering (the series capacitor blocks low frequencies) with a mild resonance peak near f0 ≈ 1591 Hz — driven here at 1kHz, just below that peak, so the output is partially attenuated with a rising phase lead. Compare against E.4 (pure RC low-pass): the same "corner frequency" idea, but now with a peaking region caused by the added inductor.',
  expectedResults: {
    notes: [
      'f0 = 1/(2π√LC) ≈ 1591 Hz. Q = ω0L/R ≈ 0.1 (mild peaking, not a sharp spike).',
      'At the 1kHz drive frequency: output is attenuated (roughly −6dB) with a positive (leading) phase shift.',
      'Driving near 1.6kHz instead brings the output close to the input amplitude (resonance).',
    ],
  },
  oscilloscopeSettings: e6Scope,
  suggestedModifications: [
    'Lower R1 to 10Ω for a higher Q and a visibly sharper resonance peak',
    'Raise L1 to 10mH, shifting f0 down toward the 1kHz drive frequency',
    'Re-run at several drive frequencies (100Hz, 1kHz, 1.6kHz, 10kHz) and compare output amplitude',
    'Add a second L-C stage for a sharper high-pass cutoff with an extra resonance',
  ],
  theoreticalBackground:
    'The capacitor\'s impedance Z_C = 1/(j2πfC) is large at low f (blocking) and small at high f (passing) — the high-pass mechanism. Adding the inductor introduces a resonance near ω0 = 1/√(LC), where the two reactances partially cancel. Higher Q = ω0L/R gives a sharper, taller peak.',
  schematic: e6Chain,
};

export const TRANSIENT_ANALYSIS_EXAMPLES: ExampleDefinition[] = [
  E1, E2, E3, E4, E5, E6,
  OPAMP_IDEAL_INTEGRATOR,
  OPAMP_DIFFERENTIATOR,
  OPAMP_COMPARATOR,
  OPAMP_SCHMITT_TRIGGER,
  OPAMP_SUMMING_AMPLIFIER,
];
