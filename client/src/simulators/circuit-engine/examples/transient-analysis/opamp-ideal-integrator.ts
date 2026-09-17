import type { ExampleDefinition, OscilloscopeSettings } from '@/simulators/circuit-engine/examples/types';
import { oscilloscopeProps, part, pinWires } from '@/simulators/circuit-engine/examples/schematicHelpers';

/*
 * E.7 — Ideal Op-Amp Integrator (with unity-gain inverter)
 *
 * The canonical integrator ramp: 2 V DC → R4 (1 kΩ) → U1 with C1 (1 µF) as its only feedback, then
 * U2 as a −1 inverter so the scope shows a rising ramp. dV/dt = V_in/(R4·C1) = 2000 V/s = 2 V/ms,
 * so U2 reaches +20 V at exactly 10 ms. Both op-amps run on ±30 V rails: on the default ±15 V the
 * integrator would clip at 7.5 ms, which is correct behaviour but not what this example teaches.
 */
const components = [
  part('v1', 'dc-voltage', 80, 160, { voltage: 2 }, { label: 'V1' }),
  part('r4', 'resistor', 150, 240, { resistance: 1000 }, { label: 'R4' }),
  part('c1', 'capacitor', 265, 160, { capacitance: 1e-6 }, { label: 'C1' }),
  part('u1', 'opamp', 265, 265, { model: 'ideal', gain: 1e6, vcc: 30 }, { label: 'U1' }),
  part('r2', 'resistor', 400, 240, { resistance: 1000 }, { label: 'R2' }),
  part('r3', 'resistor', 500, 180, { resistance: 1000 }, { label: 'R3' }),
  part('u2', 'opamp', 505, 295, { model: 'ideal', gain: 1e6, vcc: 30 }, { label: 'U2' }),
  // 10 V/div keeps both the +20 V point at 10 ms and the ±30 V rail clip on the ±40 V screen.
  part('osc1', 'oscilloscope', 770, 125, oscilloscopeProps(0.01, [10, 10, 5, 5]), { label: 'OSC1' }),
  part('g1', 'ground', 210, 410, {}, { label: 'GND' }),
];
const connect = pinWires(components);
const wires = [
  connect('v1', 'pos', 'r4', 'a'),
  connect('v1', 'neg', 'g1', 'gnd'),
  // Integrating stage: C1 is the only path from U1's output back to its inverting input.
  connect('r4', 'b', 'u1', 'in-'),
  connect('u1', 'in-', 'c1', 'a'),
  connect('c1', 'b', 'u1', 'out'),
  connect('u1', 'in+', 'g1', 'gnd'),
  // Unity-gain inverter.
  connect('u1', 'out', 'r2', 'a'),
  connect('r2', 'b', 'u2', 'in-'),
  connect('u2', 'in-', 'r3', 'a'),
  connect('r3', 'b', 'u2', 'out'),
  connect('u2', 'in+', 'g1', 'gnd'),
  // CH1: final ramp. CH2: the integrator's own (negative) ramp.
  connect('u2', 'out', 'osc1', 'ch1'),
  connect('u1', 'out', 'osc1', 'ch2'),
  connect('osc1', 'gnd', 'g1', 'gnd'),
];

const scope: OscilloscopeSettings = {
  timeBase: '0 to 100ms (10ms/div)',
  channels: [
    { componentId: 'u2', terminal: 'out', label: 'CH1: V(U2 out) — +2 V/ms ramp' },
    { componentId: 'u1', terminal: 'out', label: 'CH2: V(U1 out) — −2 V/ms ramp' },
  ],
  measurements: ['peak'],
};

export const OPAMP_IDEAL_INTEGRATOR: ExampleDefinition = {
  id: 'transient-opamp-ideal-integrator',
  name: 'Op-Amp Integrator — Linear Ramp',
  category: 'Time-Domain (Transient) / Op-Amp',
  categoryGroup: 'Time-Domain (Transient)',
  difficulty: 'Intermediate',
  durationMinutes: 10,
  conceptsTaught: ['Inverting integrator', 'Virtual ground', 'Open-loop gain and integrator accuracy', 'Output saturation at the supply rails'],
  tags: ['transient', 'op-amp', 'integrator', 'ramp'],
  spiceNetlist: `* Example: Ideal Op-Amp Integrator\n* Purpose: Vout(t) = -(1/RC) * integral(Vin dt), followed by a -1 inverter\n* Difficulty: Intermediate\n\n.title Op-Amp Integrator - Linear Ramp\n\nV1 1 0 DC 2\nR4 1 2 1k\nC1 2 3 1u\nXU1 0 2 3 OPAMP_IDEAL\nR2 3 4 1k\nR3 4 5 1k\nXU2 0 4 5 OPAMP_IDEAL\n\n.subckt OPAMP_IDEAL inp inm out\nRIN inp inm 1e12\nBGAIN int 0 V={30*tanh(1e6*(V(inp)-V(inm))/30)}\nROUT int out 1m\n.ends\n\n.tran 50u 100m uic\n.print tran v(3) v(5)\n.end`,
  schematicAscii: `              C1 (1µF)\n          ┌────||────┐\n  2V ─R4─┬┤−         │\n   (1k)  │    U1  ───┴── Node 3 ─R2─┬┤−          \n  GND ───┴┤+             (1k)  │   U2 ───── Node 5 → OSC CH1\n                               └R3┘ (1k)\n                    GND ─────────┤+`,
  educationalNarrative:
    'The inverting input is a virtual ground, so R4 carries a constant I = 2 V / 1 kΩ = 2 mA — and with nowhere else to go, all of it charges C1. A constant current into a capacitor is a constant dV/dt = I/C = 2000 V/s, so U1\'s output ramps linearly down at −2 V/ms and U2 flips it to a rising +2 V/ms ramp that reaches +20 V at exactly 10 ms, then clips at the +30 V rail at 15 ms. The linearity depends entirely on the op-amp\'s open-loop gain A: the exact response is a first-order lag with τ = RC(A + 1). At A = 10⁶ that is 1000 s, so across 100 ms the ramp is straight to parts per million. Drop A to 10 and τ collapses to 11 ms — the ramp bends into an exponential that softly plateaus at 20 V, which is a low-pass filter, not an integrator.',
  expectedResults: {
    nodeVoltages: {
      'V(U2 out) at t = 2.5 ms': 5,
      'V(U2 out) at t = 5 ms': 10,
      'V(U2 out) at t = 10 ms': 20,
      'V(U1 out) at t = 10 ms': -20,
    },
    currents: { 'I(R4) = I(C1)': 0.002 },
    notes: [
      'Slope dV/dt = V_in / (R·C) = 2 / (1 kΩ · 1 µF) = 2000 V/s = 2 V/ms.',
      'U1 clips at −30 V (and U2 at +30 V) at t = 15 ms.',
      'The simulation starts from rest (C1 uncharged): with no DC feedback path an integrator has no meaningful DC operating point, so the transient uses UIC.',
    ],
  },
  oscilloscopeSettings: scope,
  suggestedModifications: [
    'Set both op-amps to Open-loop Gain 10⁵ and confirm the ramp is still straight to within 0.1%',
    'Double C1 to 2 µF and watch the slope halve to 1 V/ms',
    'Lower the supplies to ±15 V and find the new clipping time (7.5 ms)',
    'Add a 1 MΩ resistor in parallel with C1 — a practical "leaky" integrator — and watch it settle at −2000 V instead of ramping forever (clipped by the rail)',
  ],
  theoreticalBackground:
    'Inverting integrator: V_out(t) = −(1/RC)∫V_in dt + V_out(0). With a finite open-loop gain A the transfer function is V_out/V_in = −A / (1 + sRC(A + 1)), a single pole at ω_p = 1/(RC(A + 1)). The circuit integrates for t ≪ RC(A + 1), which is why a real op-amp integrator needs A in the 10⁵–10⁶ range. A unity-gain inverter (R2 = R3) then gives V = −V_out.',
  schematic: { components, wires },
};
