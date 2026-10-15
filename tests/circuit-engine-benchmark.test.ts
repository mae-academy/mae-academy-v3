// @vitest-environment jsdom
// 20-circuit headless benchmark for the archetype schematic engine. Every circuit must build from its archetype and come out with
// 0 errors, 0 warnings (no floating node, no body collision, no label/wire clearance problem), a closed netlist, well-formed
// deterministic SVG and standard topology. Later agents implement the pending archetypes and delete their ids from PENDING_ARCHETYPES.

import { describe, expect, it } from 'vitest';
import { ARCHETYPES, buildArchetype, renderSpec, validateSchematic, type ValidationResult } from '../shared/schematic';

/** Archetype ids NOT implemented yet. Each agent that adds an archetype removes its id here; the set must end empty (BENCHMARK_STRICT=1). */
export const PENDING_ARCHETYPES = new Set<string>([
]);

interface Ctx {
  v: ValidationResult;
  /** net id of "ID.TERMINAL" */
  net: (key: string) => string;
  /** all terminal keys on the net of `key` */
  peers: (key: string) => string[];
  partsOfType: (type: string) => string[];
}

interface Entry {
  n: number;
  title: string;
  archetypeId: string;
  params?: Record<string, unknown>;
  /** Extra roster archetype that is not part of the user's 20. */
  extra?: boolean;
  /** Designators that must exist in the drawing. */
  designators?: string[];
  /** True for digital/mixed circuits that legitimately have no ground part. */
  noGround?: boolean;
  topologyChecks?: (c: Ctx) => void;
}

const same = (c: Ctx, ...keys: string[]): void => {
  const nets = keys.map((k) => c.net(k));
  for (const n of nets) expect(n, `${keys.join(' ')} must be on a net`).toBeTruthy();
  expect(new Set(nets).size, `${keys.join(' = ')} must share one net (got ${nets.join(', ')})`).toBe(1);
};
const apart = (c: Ctx, a: string, b: string): void => expect(c.net(a), `${a} and ${b} must be on different nets`).not.toBe(c.net(b));

export const REQUIRED_BENCHMARK: Entry[] = [
  {
    n: 1, title: '3-phase full-wave rectifier with RL load', archetypeId: 'three_phase_full_wave_rectifier', params: { load: 'RL' },
    designators: ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'VA', 'VB', 'VC', 'R1', 'L1'],
    topologyChecks: (c) => {
      expect(c.partsOfType('diode').sort()).toEqual(['D1', 'D2', 'D3', 'D4', 'D5', 'D6']);
      // upper diodes (phase -> +bus), lower diodes (-bus -> phase)
      same(c, 'D1.K', 'D3.K', 'D5.K', 'OUTP.P', 'R1.1');
      same(c, 'D4.A', 'D6.A', 'D2.A', 'OUTN.P', 'L1.2');
      apart(c, 'D1.K', 'D4.A');
      same(c, 'D1.A', 'D4.K', 'VA.1');
      same(c, 'D3.A', 'D6.K', 'VB.1');
      same(c, 'D5.A', 'D2.K', 'VC.1');
      apart(c, 'D1.A', 'D3.A');
      apart(c, 'D3.A', 'D5.A');
      apart(c, 'D1.A', 'D5.A');
      // each phase node: exactly one upper-diode anode, one lower-diode cathode and one source terminal
      for (const [a, k, src] of [['D1', 'D4', 'VA'], ['D3', 'D6', 'VB'], ['D5', 'D2', 'VC']]) {
        expect(c.peers(`${a}.A`).sort()).toEqual([`${a}.A`, `${k}.K`, `${src}.1`].sort());
      }
      // star neutral = ground = node 0
      same(c, 'VA.2', 'VB.2', 'VC.2', 'GND.G');
      expect(c.net('GND.G')).toBe('N0');
      // load in series between the buses
      same(c, 'R1.2', 'L1.1');
    },
  },
  {
    n: 2, title: '3-phase half-wave controlled rectifier', archetypeId: 'three_phase_half_wave_controlled_rectifier', params: { load: 'RL', firing_angle: 30 },
    designators: ['VA', 'VB', 'VC', 'T1', 'T2', 'T3', 'G1', 'G2', 'G3', 'R1', 'L1'],
    topologyChecks: (c) => {
      expect(c.partsOfType('scr').sort()).toEqual(['T1', 'T2', 'T3']);
      expect(c.partsOfType('vsource_ac').sort()).toEqual(['VA', 'VB', 'VC']);
      // phase line -> SCR anode; the three cathodes join the + bus that feeds the load
      same(c, 'VA.1', 'T1.A');
      same(c, 'VB.1', 'T2.A');
      same(c, 'VC.1', 'T3.A');
      apart(c, 'T1.A', 'T2.A');
      apart(c, 'T2.A', 'T3.A');
      apart(c, 'T1.A', 'T3.A');
      same(c, 'T1.K', 'T2.K', 'T3.K', 'R1.1', 'OUTP.P');
      apart(c, 'T1.A', 'T1.K');
      // star neutral = ground = node 0 = load return = negative output
      same(c, 'VA.2', 'VB.2', 'VC.2', 'GND.G', 'L1.2', 'OUTN.P');
      expect(c.net('GND.G')).toBe('N0');
      same(c, 'R1.2', 'L1.1');
      // each gate has its own drive port, distinct from every power net
      same(c, 'T1.G', 'G1.P');
      same(c, 'T2.G', 'G2.P');
      same(c, 'T3.G', 'G3.P');
      apart(c, 'T1.G', 'T2.G');
      apart(c, 'T2.G', 'T3.G');
      apart(c, 'T1.G', 'T1.K');
      expect(c.v.stats.crossovers).toBe(0);
    },
  },
  {
    n: 3, title: 'Single-phase full-bridge diode rectifier with C filter', archetypeId: 'single_phase_full_bridge_rectifier', params: { filter: 'C' },
    designators: ['D1', 'D2', 'D3', 'D4', 'VS', 'C1', 'RL'],
    topologyChecks: (c) => {
      expect(c.partsOfType('diode').sort()).toEqual(['D1', 'D2', 'D3', 'D4']);
      same(c, 'D1.K', 'D2.K', 'C1.+', 'RL.1', 'OUTP.P');
      same(c, 'D3.A', 'D4.A', 'C1.-', 'RL.2', 'OUTN.P', 'GND.G');
      same(c, 'D1.A', 'D4.K', 'VS.1');
      same(c, 'D2.A', 'D3.K', 'VS.2');
      apart(c, 'VS.1', 'VS.2');
      expect(c.net('GND.G')).toBe('N0');
    },
  },
  {
    n: 4, title: 'Non-inverting op-amp amplifier, A_v = 1 + R_f/R_1', archetypeId: 'non_inverting_amplifier',
    designators: ['U1', 'RF', 'R1', 'VIN', 'VOUT', 'GND'],
    topologyChecks: (c) => {
      expect(c.partsOfType('opamp')).toEqual(['U1']);
      same(c, 'VIN.P', 'U1.IN+'); // the input drives the + terminal
      same(c, 'U1.IN-', 'RF.1', 'R1.1'); // divider tap on the - terminal
      same(c, 'RF.2', 'U1.OUT', 'VOUT.P'); // R_f from the output back to the - terminal
      same(c, 'R1.2', 'GND.G');
      expect(c.net('GND.G')).toBe('N0');
      apart(c, 'U1.IN-', 'U1.IN+');
      apart(c, 'U1.OUT', 'U1.IN-');
      apart(c, 'VIN.P', 'GND.G');
    },
  },
  {
    n: 5, title: 'Inverting summing amplifier with 3 inputs', archetypeId: 'inverting_summing_amplifier',
    designators: ['U1', 'V1', 'V2', 'V3', 'R1', 'R2', 'R3', 'RF', 'VOUT'],
    topologyChecks: (c) => {
      expect(c.partsOfType('opamp')).toEqual(['U1']);
      expect(c.partsOfType('resistor').sort()).toEqual(['R1', 'R2', 'R3', 'RF']);
      same(c, 'U1.IN-', 'R1.2', 'R2.2', 'R3.2', 'RF.1'); // summing node
      for (const i of [1, 2, 3]) same(c, `V${i}.P`, `R${i}.1`);
      apart(c, 'V1.P', 'V2.P');
      apart(c, 'V2.P', 'V3.P');
      same(c, 'RF.2', 'U1.OUT', 'VOUT.P');
      same(c, 'U1.IN+', 'GND.G');
      expect(c.net('GND.G')).toBe('N0');
      apart(c, 'U1.IN-', 'U1.IN+');
    },
  },
  {
    n: 6, title: 'Instrumentation amplifier (3 op-amps)', archetypeId: 'instrumentation_amplifier',
    designators: ['U1', 'U2', 'U3', 'RG', 'R1', 'R4', 'R2', 'R5', 'R3', 'R6', 'V1', 'V2', 'VOUT'],
    topologyChecks: (c) => {
      expect(c.partsOfType('opamp').sort()).toEqual(['U1', 'U2', 'U3']);
      same(c, 'V1.P', 'U1.IN+');
      same(c, 'V2.P', 'U2.IN+');
      same(c, 'U1.IN-', 'RG.1', 'R1.1'); // R_G between the two inverting inputs
      same(c, 'U2.IN-', 'RG.2', 'R4.1');
      apart(c, 'RG.1', 'RG.2');
      same(c, 'U1.OUT', 'R1.2', 'R2.1'); // input-stage feedback resistors
      same(c, 'U2.OUT', 'R4.2', 'R5.1');
      same(c, 'R2.2', 'U3.IN-', 'R3.1'); // difference amplifier
      same(c, 'R5.2', 'U3.IN+', 'R6.1');
      same(c, 'R3.2', 'U3.OUT', 'VOUT.P');
      same(c, 'R6.2', 'GND.G');
      expect(c.net('GND.G')).toBe('N0');
      const val = (id: string): string | undefined => c.v.spec!.parts.find((p) => p.id === id)?.value;
      expect(val('R1')).toBe(val('R4')); // matched pairs
      expect(val('R2')).toBe(val('R5'));
      expect(val('R3')).toBe(val('R6'));
    },
  },
  {
    n: 7, title: 'Sallen-Key 2nd-order low-pass filter', archetypeId: 'sallen_key_lowpass',
    designators: ['U1', 'R1', 'R2', 'C1', 'C2', 'VIN', 'VOUT'],
    topologyChecks: (c) => {
      expect(c.partsOfType('opamp')).toEqual(['U1']);
      same(c, 'VIN.P', 'R1.1');
      same(c, 'R1.2', 'R2.1', 'C1.1'); // node between the resistors
      same(c, 'R2.2', 'C2.1', 'U1.IN+'); // C_2 to ground from the + input node
      same(c, 'C2.2', 'GND2.G');
      expect(c.net('GND2.G')).toBe('N0');
      same(c, 'C1.2', 'U1.OUT', 'VOUT.P', 'U1.IN-'); // C_1 to the output; unity-gain follower
      apart(c, 'R1.2', 'R2.2');
    },
  },
  {
    n: 8, title: 'Multiple-feedback band-pass filter', archetypeId: 'mfb_bandpass',
    designators: ['U1', 'R1', 'R2', 'R3', 'C1', 'C2', 'VIN', 'VOUT'],
    topologyChecks: (c) => {
      expect(c.partsOfType('opamp')).toEqual(['U1']);
      same(c, 'VIN.P', 'R1.1');
      same(c, 'R1.2', 'C1.1', 'R2.1', 'C2.1'); // node X
      same(c, 'R2.2', 'GND.G');
      same(c, 'C1.2', 'U1.IN-', 'R3.1'); // C_1 into the inverting input
      same(c, 'R3.2', 'U1.OUT', 'C2.2', 'VOUT.P'); // R_3 and C_2 both return to the output
      same(c, 'U1.IN+', 'GND2.G', 'GND.G');
      expect(c.net('GND.G')).toBe('N0');
      apart(c, 'C1.1', 'C1.2');
    },
  },
  {
    n: 9, title: 'Buck converter', archetypeId: 'buck_converter',
    designators: ['VIN', 'S1', 'D1', 'L1', 'C1', 'RL'],
    topologyChecks: (c) => {
      same(c, 'S1.2', 'D1.K', 'L1.1'); // the switching node
      same(c, 'D1.A', 'VIN.-', 'C1.-', 'RL.2', 'GND.G', 'OUTN.P');
      expect(c.net('GND.G')).toBe('N0');
      same(c, 'VIN.+', 'S1.1');
      same(c, 'L1.2', 'C1.+', 'RL.1', 'OUTP.P');
      apart(c, 'VIN.+', 'S1.2');
      apart(c, 'S1.2', 'L1.2');
    },
  },
  {
    n: 10, title: 'Boost converter with output snubber', archetypeId: 'boost_converter_snubber',
    designators: ['VIN', 'L1', 'S1', 'D1', 'D2', 'RS', 'CS', 'C1', 'RL'],
    topologyChecks: (c) => {
      same(c, 'VIN.+', 'L1.1');
      // switching node: inductor, switch, output-diode anode and the snubber diode anode / resistor
      same(c, 'L1.2', 'S1.1', 'D1.A', 'D2.A', 'RS.1');
      // RCD snubber: D2 in series with CS to ground, RS across D2
      same(c, 'D2.K', 'RS.2', 'CS.1');
      apart(c, 'D2.A', 'D2.K');
      // output: D1 cathode, C1+, load
      same(c, 'D1.K', 'C1.+', 'RL.1', 'OUTP.P');
      apart(c, 'L1.2', 'D1.K');
      // ground = switch return = snubber capacitor = output return
      same(c, 'S1.2', 'CS.2', 'C1.-', 'RL.2', 'VIN.-', 'GND.G', 'OUTN.P');
      expect(c.net('GND.G')).toBe('N0');
      expect(c.partsOfType('diode').sort()).toEqual(['D1', 'D2']);
    },
  },
  {
    n: 11, title: 'H-bridge DC motor driver with freewheeling diodes', archetypeId: 'h_bridge_motor_driver',
    designators: ['VS', 'Q1', 'Q2', 'Q3', 'Q4', 'D1', 'D2', 'D3', 'D4', 'M1', 'G1', 'G2', 'G3', 'G4'],
    topologyChecks: (c) => {
      expect(c.partsOfType('nmos').sort()).toEqual(['Q1', 'Q2', 'Q3', 'Q4']);
      expect(c.partsOfType('diode').sort()).toEqual(['D1', 'D2', 'D3', 'D4']);
      expect(c.partsOfType('motor')).toEqual(['M1']);
      // upper switches and their diode cathodes on the supply rail
      same(c, 'VS.+', 'Q1.D', 'Q3.D', 'D1.K', 'D3.K');
      // lower switches and diode anodes on ground (node 0)
      same(c, 'VS.-', 'Q2.S', 'Q4.S', 'D2.A', 'D4.A', 'GND.G');
      expect(c.net('GND.G')).toBe('N0');
      // mid-points carry the motor; each diode is antiparallel across its switch (anode on the source side)
      same(c, 'Q1.S', 'Q2.D', 'D1.A', 'D2.K', 'M1.1');
      same(c, 'Q3.S', 'Q4.D', 'D3.A', 'D4.K', 'M1.2');
      apart(c, 'M1.1', 'M1.2');
      // four independent gate drives
      for (const n of [1, 2, 3, 4]) same(c, `Q${n}.G`, `G${n}.P`);
      expect(new Set([1, 2, 3, 4].map((n) => c.net(`Q${n}.G`))).size).toBe(4);
    },
  },
  {
    n: 12, title: 'Wheatstone bridge with differential output', archetypeId: 'wheatstone_bridge',
    designators: ['VS', 'R1', 'R2', 'R3', 'R4', 'OUTP', 'OUTN', 'GND'],
    topologyChecks: (c) => {
      // supply + feeds the top node (R1, R2), supply - is ground and feeds the bottom node (R3, R4)
      same(c, 'VS.+', 'R1.2', 'R2.1');
      same(c, 'VS.-', 'R3.2', 'R4.1', 'GND.G');
      expect(c.net('GND.G')).toBe('N0');
      // left mid-node: R1 over R3 and the + output; right mid-node: R2 over R4 and the - output
      same(c, 'R1.1', 'R3.1', 'OUTP.P');
      same(c, 'R2.2', 'R4.2', 'OUTN.P');
      apart(c, 'OUTP.P', 'OUTN.P');
      apart(c, 'VS.+', 'VS.-');
      apart(c, 'R1.1', 'R2.2');
      expect(c.peers('R1.1').sort()).toEqual(['OUTP.P', 'R1.1', 'R3.1']);
    },
  },
  {
    n: 13, title: 'Twin-T notch filter', archetypeId: 'twin_t_notch',
    designators: ['R1', 'R2', 'R3', 'C1', 'C2', 'C3', 'VIN', 'VOUT'],
    topologyChecks: (c) => {
      same(c, 'VIN.P', 'R1.1', 'C1.1'); // both T networks start at the input
      same(c, 'R2.2', 'C2.2', 'VOUT.P'); // and end at the output
      same(c, 'R1.2', 'R2.1', 'C3.1'); // R - R with 2C from the middle
      same(c, 'C1.2', 'C2.1', 'R3.2'); // C - C with R/2 from the middle
      same(c, 'C3.2', 'R3.1', 'GND.G');
      expect(c.net('GND.G')).toBe('N0');
      apart(c, 'R1.2', 'C1.2');
      const val = (id: string): string | undefined => c.v.spec!.parts.find((p) => p.id === id)?.value;
      expect(val('R1')).toBe(val('R2'));
      expect(val('C1')).toBe(val('C2'));
      expect(val('C3')).toBe('20 nF'); // 2C
      expect(val('R3')).toBe('5 kΩ'); // R/2
    },
  },
  {
    n: 14, title: 'BJT common-emitter amplifier with divider bias', archetypeId: 'bjt_common_emitter',
    designators: ['Q1', 'R1', 'R2', 'RC', 'RE', 'CE', 'CIN', 'COUT', 'RL', 'VIN', 'VCC'],
    topologyChecks: (c) => {
      expect(c.partsOfType('npn')).toEqual(['Q1']);
      // divider between the rail and ground with its tap at the base, fed through C_in
      same(c, 'VCC.V', 'R1.1', 'RC.1');
      same(c, 'R1.2', 'R2.1', 'Q1.B', 'CIN.2');
      same(c, 'R2.2', 'GND.G');
      expect(c.net('GND.G')).toBe('N0');
      same(c, 'VIN.1', 'CIN.1');
      same(c, 'VIN.2', 'GND.G');
      // collector: R_C to the rail, output through C_out into R_L
      same(c, 'RC.2', 'Q1.C', 'COUT.1');
      same(c, 'COUT.2', 'RL.1', 'OUT.P');
      same(c, 'RL.2', 'GND.G');
      // R_E and C_E in parallel from the emitter to ground
      same(c, 'Q1.E', 'RE.1', 'CE.1');
      same(c, 'RE.2', 'CE.2', 'GND.G');
      apart(c, 'Q1.B', 'Q1.C');
      apart(c, 'Q1.C', 'Q1.E');
    },
  },
  {
    n: 15, title: 'MOSFET common-source amplifier', archetypeId: 'mosfet_common_source',
    designators: ['Q1', 'R1', 'R2', 'RD', 'RS', 'CS', 'CIN', 'COUT', 'RL', 'VIN', 'VCC'],
    topologyChecks: (c) => {
      expect(c.partsOfType('nmos')).toEqual(['Q1']);
      same(c, 'VCC.V', 'R1.1', 'RD.1');
      same(c, 'R1.2', 'R2.1', 'Q1.G', 'CIN.2'); // gate divider tap
      same(c, 'R2.2', 'GND.G');
      expect(c.net('GND.G')).toBe('N0');
      same(c, 'RD.2', 'Q1.D', 'COUT.1');
      same(c, 'COUT.2', 'RL.1', 'OUT.P');
      same(c, 'Q1.S', 'RS.1', 'CS.1');
      same(c, 'RS.2', 'CS.2', 'GND.G');
      apart(c, 'Q1.G', 'Q1.D');
      apart(c, 'Q1.D', 'Q1.S');
    },
  },
  {
    n: 16, title: 'CMOS inverter', archetypeId: 'cmos_inverter', noGround: false,
    designators: ['MP', 'MN', 'VDD', 'IN', 'OUT', 'CL'],
    topologyChecks: (c) => {
      expect(c.partsOfType('pmos')).toEqual(['MP']);
      expect(c.partsOfType('nmos')).toEqual(['MN']);
      same(c, 'MP.S', 'VDD.V'); // pMOS source to the rail
      same(c, 'MN.S', 'GND.G'); // nMOS source to ground
      expect(c.net('GND.G')).toBe('N0');
      same(c, 'MP.G', 'MN.G', 'IN.P'); // common gate = input
      same(c, 'MP.D', 'MN.D', 'OUT.P', 'CL.1'); // common drain = output
      same(c, 'CL.2', 'GND2.G', 'GND.G');
      apart(c, 'MP.G', 'MP.D');
      apart(c, 'VDD.V', 'MP.D');
    },
  },
  {
    n: 17, title: '555 astable multivibrator', archetypeId: 'timer555_astable',
    designators: ['U1', 'RA', 'RB', 'C1', 'C2', 'VCC', 'OUT'],
    topologyChecks: (c) => {
      same(c, 'VCC.V', 'RA.1', 'U1.VCC', 'U1.RESET'); // supply, R_A and RESET tied high
      same(c, 'RA.2', 'RB.1', 'U1.DIS'); // R_A from V_CC to DIS, R_B from DIS
      same(c, 'RB.2', 'U1.THR', 'U1.TRIG', 'C1.1'); // R_B to the tied THR/TRIG, which charge C_1
      same(c, 'C1.2', 'U1.GND', 'GND.G', 'C2.2');
      expect(c.net('GND.G')).toBe('N0');
      same(c, 'U1.CTRL', 'C2.1'); // CTRL decoupled to ground
      same(c, 'U1.OUT', 'OUT.P');
      apart(c, 'U1.DIS', 'U1.THR');
      apart(c, 'U1.OUT', 'U1.DIS');
      apart(c, 'VCC.V', 'U1.CTRL');
    },
  },
  {
    n: 18, title: 'Colpitts oscillator', archetypeId: 'colpitts_oscillator',
    designators: ['Q1', 'L1', 'C1', 'C2', 'LRFC', 'CC', 'R1', 'R2', 'RE', 'CE', 'COUT', 'VCC'],
    topologyChecks: (c) => {
      expect(c.partsOfType('npn')).toEqual(['Q1']);
      same(c, 'VCC.V', 'R1.1', 'LRFC.1'); // bias divider and RF choke from the rail
      same(c, 'R1.2', 'R2.1', 'Q1.B', 'L1.1', 'C2.1'); // base node: divider tap, tank inductor, C_2
      same(c, 'LRFC.2', 'Q1.C', 'CC.2', 'C1.1', 'COUT.1'); // collector node: choke, C_c, C_1, output
      same(c, 'L1.2', 'CC.1'); // tank branch L_1 in series with the blocking capacitor
      // capacitive divider: both capacitors meet at ground (= emitter AC ground)
      same(c, 'C1.2', 'C2.2', 'R2.2', 'GND.G', 'RE.2', 'CE.2');
      expect(c.net('GND.G')).toBe('N0');
      same(c, 'Q1.E', 'RE.1', 'CE.1');
      same(c, 'COUT.2', 'OUT.P');
      apart(c, 'Q1.B', 'Q1.C');
      apart(c, 'L1.1', 'L1.2');
    },
  },
  {
    n: 19, title: 'Wien-bridge oscillator', archetypeId: 'wien_bridge_oscillator',
    designators: ['U1', 'R1', 'C1', 'R2', 'C2', 'RF', 'RG', 'OUT'],
    topologyChecks: (c) => {
      expect(c.partsOfType('opamp')).toEqual(['U1']);
      // positive feedback: OUT -> R_1 -> C_1 -> IN+ ; R_2 || C_2 from IN+ to ground
      same(c, 'U1.OUT', 'R1.2', 'RF.2', 'OUT.P');
      same(c, 'R1.1', 'C1.2');
      same(c, 'C1.1', 'R2.1', 'C2.1', 'U1.IN+');
      same(c, 'R2.2', 'C2.2', 'RG.2', 'GND.G');
      expect(c.net('GND.G')).toBe('N0');
      // negative feedback: R_f from OUT to IN-, R_g from IN- to ground
      same(c, 'U1.IN-', 'RF.1', 'RG.1');
      apart(c, 'U1.IN+', 'U1.IN-');
      apart(c, 'U1.OUT', 'U1.IN+');
    },
  },
  {
    n: 20, title: 'Precision half-wave rectifier (super-diode)', archetypeId: 'precision_half_wave_rectifier',
    designators: ['U1', 'R1', 'R2', 'RL', 'D1', 'D2', 'VIN', 'VOUT'],
    topologyChecks: (c) => {
      expect(c.partsOfType('opamp')).toEqual(['U1']);
      expect(c.partsOfType('diode').sort()).toEqual(['D1', 'D2']);
      same(c, 'VIN.P', 'R1.1');
      same(c, 'R1.2', 'U1.IN-', 'D1.A', 'R2.1'); // D_1 conducts from the summing node to the output when V_in > 0
      same(c, 'D1.K', 'U1.OUT', 'D2.A');
      same(c, 'D2.K', 'R2.2', 'RL.1', 'VOUT.P'); // D_2 feeds the output node, R_2 closes the loop around it
      same(c, 'RL.2', 'GND2.G');
      same(c, 'U1.IN+', 'GND1.G', 'GND2.G');
      expect(c.net('GND1.G')).toBe('N0');
      apart(c, 'U1.OUT', 'D2.K');
      apart(c, 'U1.IN-', 'U1.OUT');
    },
  },
];

/** Roster archetypes beyond the user's 20 (named in the archetype list). */
export const EXTRA_BENCHMARK: Entry[] = [
  {
    n: 21, title: 'Inverting amplifier', archetypeId: 'inverting_amplifier', extra: true,
    designators: ['U1', 'RIN', 'RF', 'VIN', 'VOUT', 'GND'],
    topologyChecks: (c) => {
      expect(c.partsOfType('opamp')).toEqual(['U1']);
      same(c, 'VIN.P', 'RIN.1');
      same(c, 'RIN.2', 'U1.IN-', 'RF.1');
      same(c, 'RF.2', 'U1.OUT', 'VOUT.P');
      same(c, 'U1.IN+', 'GND.G');
      expect(c.net('GND.G')).toBe('N0');
      apart(c, 'U1.IN-', 'U1.IN+');
    },
  },
  {
    n: 22, title: 'Buck-boost converter', archetypeId: 'buck_boost_converter', extra: true,
    designators: ['VIN', 'S1', 'L1', 'D1', 'C1', 'RL'],
    topologyChecks: (c) => {
      same(c, 'VIN.+', 'S1.1');
      // switching node: switch, inductor (shunt to ground) and the diode CATHODE (inverting topology)
      same(c, 'S1.2', 'L1.1', 'D1.K');
      same(c, 'D1.A', 'C1.1', 'RL.1', 'OUTP.P');
      same(c, 'L1.2', 'C1.2', 'RL.2', 'VIN.-', 'GND.G', 'OUTN.P');
      expect(c.net('GND.G')).toBe('N0');
      apart(c, 'S1.2', 'D1.A');
      apart(c, 'VIN.+', 'S1.2');
      expect(c.partsOfType('diode')).toEqual(['D1']);
    },
  },
];

const ALL = [...REQUIRED_BENCHMARK, ...EXTRA_BENCHMARK];
const PART_NUMBER_RE = /\b(1N\d{3,4}|LM\d{3}|TL0\d\d|NE555|IRF\w+|2N\d{4}|BC\d{3}|BD\d{3}|MC\d{4}|CD4\d{3})\b/;
const ANALOG_NO_GROUND_OK = new Set(['cmos_inverter']);

function context(v: ValidationResult): Ctx {
  const by = new Map<string, string[]>();
  for (const [key, id] of Object.entries(v.netlist.netOfTerminal)) (by.get(id) ?? by.set(id, []).get(id)!).push(key);
  return {
    v,
    net: (key) => v.netlist.netOfTerminal[key] ?? '',
    peers: (key) => by.get(v.netlist.netOfTerminal[key] ?? '') ?? [],
    partsOfType: (type) => v.spec!.parts.filter((p) => p.type === type).map((p) => p.id),
  };
}

function wellFormed(svg: string): void {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
  expect(doc.documentElement.tagName).toBe('svg');
  expect(doc.querySelector('script, foreignObject, image, a, style')).toBeNull();
  for (const el of Array.from(doc.getElementsByTagName('*'))) for (const at of Array.from(el.attributes)) expect(at.name.startsWith('on')).toBe(false);
}

describe('circuit engine benchmark (20 required circuits)', () => {
  for (const e of ALL) {
    const pending = PENDING_ARCHETYPES.has(e.archetypeId);
    const name = `${String(e.n).padStart(2, '0')} ${e.title} [${e.archetypeId}]`;
    if (pending) {
      it.skip(`${name} - PENDING: archetype not implemented yet`, () => undefined);
      continue;
    }
    describe(name, () => {
      const request = { archetype: e.archetypeId, params: e.params ?? {} };
      const built = buildArchetype(e.archetypeId, e.params ?? {});
      const v = validateSchematic(request);

      it('exists in the registry and builds', () => {
        expect(ARCHETYPES.has(e.archetypeId)).toBe(true);
        expect(built.ok, built.ok ? '' : JSON.stringify(built.errors)).toBe(true);
      });
      it('validates with 0 errors and 0 warnings (all gates passed)', () => {
        expect(v.errors.map((x) => x.message)).toEqual([]);
        expect(v.warnings.map((x) => x.message)).toEqual([]);
        expect(v.ok).toBe(true);
      });
      it('has a closed netlist: 0 floating nodes, ground = N0 for analog circuits', () => {
        const declared = new Set(v.spec!.parts.filter((p) => p.type === 'port').map((p) => `${p.id}.P`));
        for (const net of v.netlist.nets) {
          const real = net.terminals;
          expect(real.length >= 2 || real.every((t) => declared.has(t)) || net.labelled, `net ${net.id} (${real.join(', ')}) is floating`).toBe(true);
        }
        expect(v.errors.filter((x) => x.code === 'G4_FLOATING')).toHaveLength(0);
        if (!e.noGround && !ANALOG_NO_GROUND_OK.has(e.archetypeId)) expect(v.netlist.groundNet).toBe('N0');
      });
      it('has no body collisions and no clearance or label problems', () => {
        const codes = [...v.errors, ...v.warnings].map((x) => x.code);
        for (const bad of ['G7_WIRE_THROUGH_PART', 'GEOM_OVERLAP', 'GEOM_CLEARANCE', 'LABEL_OVERLAP', 'LABEL_NO_SLOT', 'LABEL_WIRE_OVERLAP', 'G7_OVERLAP', 'G6_WIRE_OVER_TERMINAL', 'G6_NEAR_MISS']) {
          expect(codes).not.toContain(bad);
        }
      });
      it('renders well-formed, deterministic SVG with no part numbers', () => {
        const a = renderSpec(v.spec!).svg;
        const b = renderSpec(validateSchematic(request).spec!).svg;
        expect(a).toBe(b);
        wellFormed(a);
        expect(a).not.toMatch(PART_NUMBER_RE);
      });
      it('has the declared designators, each part labelled', () => {
        const ids = new Set(v.spec!.parts.map((p) => p.id));
        for (const d of e.designators ?? []) expect(ids.has(d), `missing ${d}`).toBe(true);
        for (const p of v.spec!.parts) expect(p.id.length).toBeGreaterThan(0);
      });
      it('has the standard topology', () => {
        expect(e.topologyChecks, 'an implemented archetype needs topologyChecks').toBeTruthy();
        e.topologyChecks!(context(v));
      });
    });
  }

  it('summarises progress and (with BENCHMARK_STRICT=1) requires every archetype', () => {
    const done = REQUIRED_BENCHMARK.filter((e) => !PENDING_ARCHETYPES.has(e.archetypeId)).length;
    console.info(`circuit-engine benchmark: ${done}/20 required circuits implemented; pending: ${Array.from(PENDING_ARCHETYPES).join(', ') || 'none'}`);
    if (process.env.BENCHMARK_STRICT === '1') expect(Array.from(PENDING_ARCHETYPES)).toEqual([]);
    else expect(done).toBeGreaterThanOrEqual(3);
  });

  it('keeps PENDING_ARCHETYPES honest: pending ids are unregistered, implemented ids are not pending', () => {
    for (const id of Array.from(PENDING_ARCHETYPES)) expect(ARCHETYPES.has(id), `${id} is registered: delete it from PENDING_ARCHETYPES`).toBe(false);
    for (const e of ALL) if (!PENDING_ARCHETYPES.has(e.archetypeId)) expect(ARCHETYPES.has(e.archetypeId)).toBe(true);
  });
});
