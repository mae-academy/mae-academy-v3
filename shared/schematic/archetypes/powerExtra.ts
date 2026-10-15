// Extra power-electronics archetypes: three-phase half-wave controlled rectifier, boost converter with RCD snubber,
// inverting buck-boost converter and H-bridge motor driver. Coordinates are grid units (pitch 20).
// Conventions: supply rail on top, ground at the bottom, signal/power flow left to right, gate drives as labelled open ports.

import { Kit } from './kit';
import type { Archetype, ParamDef, ResolvedParams } from './types';

const str = (p: ResolvedParams, k: string): string => String(p[k]);

/** Output terminals: open ports at the right end of the buses and the V_out label between them. */
function outputs(k: Kit, x: number, yTop: number, yBot: number, top = '+', bottom = '−'): void {
  k.part('OUTP', 'port', [x, yTop], { value: top, label: 'above' });
  k.part('OUTN', 'port', [x, yBot], { value: bottom, label: 'below' });
  k.text('V_{\\text{out}}', [x + 1, (yTop + yBot) / 2], 'start');
}

// ---------------------------------------------------------------------------------------------------------------------
// Three-phase half-wave (three-pulse) controlled rectifier. Planar: the star neutral is the common return of sources and load.
// T1 (V_A), T2 (V_B), T3 (V_C): anodes on the phase lines, cathodes joined to the + bus; each gate has its own labelled drive port.
// ---------------------------------------------------------------------------------------------------------------------
const HALF_WAVE_PARAMS: ParamDef[] = [
  { name: 'load', label: 'DC-side load', kind: 'choice', default: 'RL', choices: ['R', 'RL', 'RLE'] },
  { name: 'firing_angle', label: 'Firing delay angle alpha in degrees (shown as a label)', kind: 'int', default: 30, min: 0, max: 180 },
  { name: 'supply_values', label: 'Line-to-neutral rms voltage of each source', kind: 'value', default: '230 V', unit: 'V', min: 0.1, max: 1000 },
  { name: 'R', label: 'Load resistance R_1', kind: 'value', default: '10 Ω', unit: 'ohm', min: 0.001, max: 1e8 },
  { name: 'L', label: 'Load inductance L_1 (RL, RLE)', kind: 'value', default: '50 mH', unit: 'H', min: 1e-9, max: 100 },
  { name: 'E', label: 'Back-EMF E (RLE)', kind: 'value', default: '48 V', unit: 'V', min: 0.1, max: 1000 },
];

export const threePhaseHalfWaveControlledRectifier: Archetype = {
  id: 'three_phase_half_wave_controlled_rectifier',
  title: 'Three-phase half-wave controlled rectifier',
  aliases: [
    'three phase half wave controlled rectifier', '3 phase half wave controlled rectifier', '3-phase half-wave thyristor rectifier',
    'three pulse controlled rectifier', '3 pulse controlled rectifier', 'three phase half wave scr rectifier', 'three phase half wave thyristor converter',
    'three phase half controlled converter', 'three phase half wave rectifier with scr',
  ],
  summary: 'Star sources V_A,V_B,V_C (neutral to ground), SCRs T1..T3 with gate ports G_1..G_3, load R/RL/RLE returning to the neutral, V_out, firing angle label alpha.',
  params: HALF_WAVE_PARAMS,
  build(p) {
    const k = new Kit();
    const NX = 3, SX = 10, XB = 20, XL = 26;
    const rows = [4, 10, 16];
    const yTop = 4, yBot = 22;
    const sv = str(p, 'supply_values');
    const names: [string, string, string, string][] = [['VA', 'T1', 'G1', 'V_A\\ (0°)'], ['VB', 'T2', 'G2', 'V_B\\ (−120°)'], ['VC', 'T3', 'G3', 'V_C\\ (+120°)']];
    names.forEach(([v, t, g, tex], i) => {
      const y = rows[i];
      k.part(v, 'vsource_ac', [SX, y], { value: sv, rot: 180, tex, label: 'above' });
      k.part(t, 'scr', [13, y], { label: 'above' });
      k.part(g, 'port', [16, y + 3], { value: `G_${i + 1}`, label: 'right' });
      k.wire([SX - 4, y], [NX, y]);
      k.wire([SX, y], k.t(t, 'A'));
      k.wire(k.t(t, 'G'), k.t(g, 'P'));
    });
    // neutral bus, ground at its foot, return along the bottom to the load
    k.part('GND', 'ground', [NX, yBot]);
    k.wire([NX, rows[0]], [NX, yBot]);
    k.text('N', [NX - 1, rows[1]], 'end');
    // + bus: cathodes of T1..T3, then the load column
    k.wire(k.t('T1', 'K'), [XB, rows[0]], [XL, rows[0]]);
    k.wire(k.t('T2', 'K'), [XB, rows[1]]);
    k.wire(k.t('T3', 'K'), [XB, rows[2]]);
    k.wire([XB, rows[0]], [XB, rows[2]]);
    // load between the + bus and the neutral return
    const load = str(p, 'load');
    const mid = (yTop + yBot) / 2;
    const R = str(p, 'R'), L = str(p, 'L'), E = str(p, 'E');
    if (load === 'RLE') {
      k.part('R1', 'resistor', [XL, mid - 7], { value: R, rot: 90, label: 'right' });
      k.part('L1', 'inductor', [XL, mid - 2], { value: L, rot: 90, label: 'right' });
      k.part('VE', 'vsource', [XL, mid + 3], { value: E, rot: 90, tex: 'E', label: 'right' });
      k.wire([XL, yTop], k.t('R1', '1'));
      k.wire(k.t('R1', '2'), k.t('L1', '1'));
      k.wire(k.t('L1', '2'), k.t('VE', '+'));
      k.wire(k.t('VE', '-'), [XL, yBot]);
    } else if (load === 'RL') {
      k.part('R1', 'resistor', [XL, mid - 5], { value: R, rot: 90, label: 'right' });
      k.part('L1', 'inductor', [XL, mid + 1], { value: L, rot: 90, label: 'right' });
      k.wire([XL, yTop], k.t('R1', '1'));
      k.wire(k.t('R1', '2'), k.t('L1', '1'));
      k.wire(k.t('L1', '2'), [XL, yBot]);
    } else {
      k.part('R1', 'resistor', [XL, mid - 2], { value: R, rot: 90, label: 'right' });
      k.wire([XL, yTop], k.t('R1', '1'));
      k.wire(k.t('R1', '2'), [XL, yBot]);
    }
    const XO = XL + 8;
    k.wire([XL, yTop], [XO, yTop]);
    k.wire([NX, yBot], [XL, yBot], [XO, yBot]);
    outputs(k, XO, yTop, yBot);
    k.text(`\\alpha\\ =\\ ${Number(p.firing_angle)}°`, [XO + 1, mid + 4], 'start');
    return k.build(this.title);
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Boost converter with the classic RCD turn-off snubber across the switch: D_2 in series with C_s from the switching node to ground,
// R_s in parallel with D_2 (it discharges C_s while the switch is on).
// ---------------------------------------------------------------------------------------------------------------------
const SWITCH_CHOICES = ['switch', 'nmos', 'igbt'] as const;
const BOOST_PARAMS: ParamDef[] = [
  { name: 'Vin', label: 'Input voltage V_in', kind: 'value', default: '12 V', unit: 'V', min: 0.1, max: 1000 },
  { name: 'L', label: 'Input inductance L_1', kind: 'value', default: '100 µH', unit: 'H', min: 1e-9, max: 100 },
  { name: 'C', label: 'Output capacitance C_1', kind: 'value', default: '220 µF', unit: 'F', min: 1e-12, max: 1 },
  { name: 'R_load', label: 'Load resistance R_L', kind: 'value', default: '50 Ω', unit: 'ohm', min: 0.001, max: 1e8 },
  { name: 'R_snub', label: 'Snubber resistance R_s', kind: 'value', default: '100 Ω', unit: 'ohm', min: 0.001, max: 1e8 },
  { name: 'C_snub', label: 'Snubber capacitance C_s', kind: 'value', default: '10 nF', unit: 'F', min: 1e-12, max: 1 },
  { name: 'switch', label: 'Switch symbol', kind: 'choice', default: 'switch', choices: SWITCH_CHOICES },
];

export const boostConverterSnubber: Archetype = {
  id: 'boost_converter_snubber',
  title: 'Boost converter with RCD snubber',
  aliases: [
    'boost converter with snubber', 'boost converter with rcd snubber', 'step up converter with snubber', 'boost snubber', 'boost converter with output snubber',
    'step-up converter with snubber', 'dc dc boost with snubber',
  ],
  summary: 'V_in, L_1, switch S_1 (PWM) to ground, D_1, C_1, load R_L, V_out, plus RCD snubber across S_1 (D_2 + C_s, R_s across D_2).',
  params: BOOST_PARAMS,
  build(p) {
    const k = new Kit();
    const yTop = 2, yBot = 16, XS = 14;
    const sw = str(p, 'switch');
    k.part('VIN', 'vsource', [4, yTop], { value: str(p, 'Vin'), rot: 90, tex: 'V_{\\text{in}}', label: 'left' });
    k.part('L1', 'inductor', [7, yTop], { value: str(p, 'L') });
    k.wire(k.t('VIN', '+'), k.t('L1', '1'));
    // switch column at XS, from the switching node on the rail down to ground
    if (sw === 'switch') {
      k.part('S1', 'switch', [XS, 6], { rot: 90, attrs: { control: 'PWM' }, label: 'left' });
      k.wire([XS, yTop], k.t('S1', '1'));
      k.wire(k.t('S1', '2'), [XS, yBot]);
    } else {
      k.part('Q1', sw === 'nmos' ? 'nmos' : 'igbt', [XS - 2, 8], { tex: 'S_1', label: 'right' });
      k.part('PWM', 'port', [XS - 5, 8], { value: 'PWM', label: 'above' });
      k.wire(k.t('PWM', 'P'), k.t('Q1', 'G'));
      k.wire([XS, yTop], k.t('Q1', sw === 'nmos' ? 'D' : 'C'));
      k.wire(k.t('Q1', sw === 'nmos' ? 'S' : 'E'), [XS, yBot]);
    }
    // RCD snubber: D_2 and R_s in parallel between the node and C_s
    const XD = 18, XC = 20, XR = 22;
    k.part('D2', 'diode', [XD, 4], { rot: 90, label: 'left' });
    k.part('RS', 'resistor', [XR, 4], { value: str(p, 'R_snub'), rot: 90, tex: 'R_s', label: 'right' });
    k.part('CS', 'capacitor', [XC, 12], { value: str(p, 'C_snub'), rot: 90, tex: 'C_s', label: 'right' });
    k.wire([XD, yTop], k.t('D2', 'A'));
    k.wire([XR, yTop], k.t('RS', '1'));
    k.wire(k.t('D2', 'K'), [XD, 10], [XR, 10]);
    k.wire(k.t('RS', '2'), [XR, 10]);
    k.wire([XC, 10], k.t('CS', '1'));
    k.wire(k.t('CS', '2'), [XC, yBot]);
    // output diode, capacitor and load
    const XO1 = 32, XCo = 34, XLd = 40, XO = 46;
    k.part('D1', 'diode', [26, yTop], { label: 'above' });
    k.part('C1', 'polarized_capacitor', [XCo, 6], { value: str(p, 'C'), rot: 90, label: 'right' });
    k.part('RL', 'resistor', [XLd, 6], { value: str(p, 'R_load'), rot: 90, tex: 'R_L', label: 'right' });
    k.wire(k.t('L1', '2'), [XS, yTop], [XD, yTop], [XR, yTop], k.t('D1', 'A'));
    k.wire(k.t('D1', 'K'), [XO1, yTop], [XCo, yTop], [XLd, yTop], [XO, yTop]);
    k.wire([XCo, yTop], k.t('C1', '+'));
    k.wire([XLd, yTop], k.t('RL', '1'));
    // ground bus
    k.part('GND', 'ground', [XS, yBot]);
    k.wire(k.t('VIN', '-'), [4, yBot], [XS, yBot], [XC, yBot], [XCo, yBot], [XLd, yBot], [XO, yBot]);
    k.wire(k.t('C1', '-'), [XCo, yBot]);
    k.wire(k.t('RL', '2'), [XLd, yBot]);
    outputs(k, XO, yTop, yBot);
    k.text('RCD snubber', [XC, 18], 'middle');
    return k.build(this.title);
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Inverting buck-boost converter: V_out = -D/(1-D) V_in. L_1 shunts the switching node to ground; D_1 conducts from the (negative)
// output node to the switching node while the switch is off. C_1 is drawn non-polarised (its + side is the ground rail).
// ---------------------------------------------------------------------------------------------------------------------
const BUCK_BOOST_PARAMS: ParamDef[] = [
  { name: 'Vin', label: 'Input voltage V_in', kind: 'value', default: '12 V', unit: 'V', min: 0.1, max: 1000 },
  { name: 'L', label: 'Inductance L_1', kind: 'value', default: '100 µH', unit: 'H', min: 1e-9, max: 100 },
  { name: 'C', label: 'Output capacitance C_1', kind: 'value', default: '100 µF', unit: 'F', min: 1e-12, max: 1 },
  { name: 'R_load', label: 'Load resistance R_L', kind: 'value', default: '10 Ω', unit: 'ohm', min: 0.001, max: 1e8 },
  { name: 'switch', label: 'High-side switch symbol', kind: 'choice', default: 'switch', choices: SWITCH_CHOICES },
];

export const buckBoostConverter: Archetype = {
  id: 'buck_boost_converter',
  title: 'Inverting buck-boost converter',
  aliases: ['buck boost', 'buck-boost', 'inverting buck boost converter', 'inverting converter', 'buck boost regulator', 'dc dc buck boost', 'step up step down converter'],
  summary: 'V_in, switch S_1 (PWM), L_1 to ground, D_1 (anode to the negative output), C_1, load R_L, V_out (negative, top port marked minus).',
  params: BUCK_BOOST_PARAMS,
  build(p) {
    const k = new Kit();
    const yTop = 2, yBot = 10, XA = 16;
    const sw = str(p, 'switch');
    k.part('VIN', 'vsource', [4, yTop], { value: str(p, 'Vin'), rot: 90, tex: 'V_{\\text{in}}', label: 'left' });
    if (sw === 'switch') {
      k.part('S1', 'switch', [8, yTop], { attrs: { control: 'PWM' } });
    } else {
      k.part('Q1', sw === 'nmos' ? 'nmos' : 'igbt', [10, yTop + 2], { rot: 270, tex: 'S_1', label: 'above' });
      k.part('PWM', 'port', [10, yTop + 4], { value: 'PWM', label: 'right' });
      k.wire(k.t('Q1', 'G'), k.t('PWM', 'P'));
    }
    const swIn = sw === 'switch' ? k.t('S1', '1') : k.t('Q1', sw === 'nmos' ? 'D' : 'C');
    const swOut = sw === 'switch' ? k.t('S1', '2') : k.t('Q1', sw === 'nmos' ? 'S' : 'E');
    k.wire(k.t('VIN', '+'), swIn);

    k.part('L1', 'inductor', [XA, 4], { value: str(p, 'L'), rot: 90, label: 'right' });
    k.part('D1', 'diode', [23, yTop], { rot: 180, label: 'above' });
    const XC = 26, XR = 34, XO = 40;
    k.part('C1', 'capacitor', [XC, 4], { value: str(p, 'C'), rot: 90, label: 'right' });
    k.part('RL', 'resistor', [XR, 4], { value: str(p, 'R_load'), rot: 90, tex: 'R_L', label: 'right' });
    k.part('GND', 'ground', [XA, yBot]);
    k.wire(swOut, [XA, yTop], k.t('D1', 'K'));
    k.wire([XA, yTop], k.t('L1', '1'));
    k.wire(k.t('L1', '2'), [XA, yBot]);
    k.wire(k.t('D1', 'A'), [XC, yTop], [XR, yTop], [XO, yTop]);
    k.wire([XC, yTop], k.t('C1', '1'));
    k.wire([XR, yTop], k.t('RL', '1'));
    k.wire(k.t('VIN', '-'), [4, yBot], [XA, yBot], [XC, yBot], [XR, yBot], [XO, yBot]);
    k.wire(k.t('C1', '2'), [XC, yBot]);
    k.wire(k.t('RL', '2'), [XR, yBot]);
    outputs(k, XO, yTop, yBot, '−', '+');
    return k.build(this.title);
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// H-bridge DC motor driver. Left leg Q1 (high) / Q2 (low), right leg Q3 (high) / Q4 (low); freewheeling diode D_n across each switch,
// cathode on the more positive side (drain/collector). The motor sits between the two mid-points. Q1+Q4 drive it forward, Q3+Q2 reverse.
// ---------------------------------------------------------------------------------------------------------------------
const HBRIDGE_PARAMS: ParamDef[] = [
  { name: 'Vs', label: 'Supply voltage V_s', kind: 'value', default: '24 V', unit: 'V', min: 0.1, max: 1000 },
  { name: 'switch', label: 'Switch symbol', kind: 'choice', default: 'nmos', choices: ['nmos', 'igbt', 'switch'] },
];

export const hBridgeMotorDriver: Archetype = {
  id: 'h_bridge_motor_driver',
  title: 'H-bridge DC motor driver',
  aliases: ['h bridge', 'h-bridge', 'h bridge motor driver', 'dc motor h bridge', 'full bridge motor driver', 'motor driver h bridge', 'four quadrant motor drive', 'h bridge with freewheeling diodes'],
  summary: 'Supply V_s, four switches Q1..Q4 (nmos|igbt|switch) with gate ports G_1..G_4, antiparallel diodes D1..D4, DC motor M between the two legs.',
  params: HBRIDGE_PARAMS,
  build(p) {
    const k = new Kit();
    const yTop = 2, yBot = 18;
    const sw = str(p, 'switch');
    const XL = 14, XR = 30, XDL = 18, XDR = 26;
    const pre = sw === 'switch' ? 'S' : 'Q';
    k.part('VS', 'vsource', [4, 8], { value: str(p, 'Vs'), rot: 90, tex: 'V_s', label: 'left' });
    k.wire(k.t('VS', '+'), [4, yTop], [XR, yTop]);
    k.wire(k.t('VS', '-'), [4, yBot], [XR, yBot]);
    k.part('GND', 'ground', [4, yBot]);

    // one switch: centre y, side (left leg: gate on the left; right leg mirrored)
    const place = (n: number, x: number, y: number, left: boolean): { d: [number, number]; s: [number, number] } => {
      const id = `${pre}${n}`;
      if (sw === 'switch') {
        k.part(id, 'switch', [x, y - 2], { rot: 90, attrs: { control: 'PWM' }, label: left ? 'left' : 'right' });
        return { d: k.t(id, '1'), s: k.t(id, '2') };
      }
      const type = sw === 'nmos' ? 'nmos' : 'igbt';
      const gx = left ? x - 2 : x + 2;
      k.part(id, type, [gx, y], left ? { label: 'right' } : { rot: 180, flip: true, label: 'left' });
      const gp = left ? gx - 4 : gx + 4;
      k.part(`G${n}`, 'port', [gp, y], { value: `G_${n}`, label: 'above' });
      k.wire(k.t(`G${n}`, 'P'), k.t(id, 'G'));
      return { d: k.t(id, sw === 'nmos' ? 'D' : 'C'), s: k.t(id, sw === 'nmos' ? 'S' : 'E') };
    };
    const legs: [number, number, number, number, number, boolean][] = [[XL, XDL, 1, 2, 0, true], [XR, XDR, 3, 4, 1, false]];
    for (const [x, xd, hi, lo, , left] of legs) {
      const up = place(hi, x, 6, left);
      const dn = place(lo, x, 14, left);
      // mid-point and series link
      k.wire(up.s, [x, 10], dn.d);
      k.wire([x, yTop], up.d);
      k.wire(dn.s, [x, yBot]);
      // freewheeling diodes, pointing up (anode on the source/emitter side)
      k.part(`D${hi}`, 'diode', [xd, 8], { rot: 270, label: left ? 'right' : 'left' });
      k.part(`D${lo}`, 'diode', [xd, 16], { rot: 270, label: left ? 'right' : 'left' });
      k.wire(up.s, k.t(`D${hi}`, 'A'));
      k.wire(k.t(`D${hi}`, 'K'), [xd, yTop]);
      k.wire(k.t(`D${lo}`, 'K'), [xd, 12], dn.d);
      k.wire(dn.s, k.t(`D${lo}`, 'A'));
    }
    k.part('M1', 'motor', [20, 10], { label: 'none' });
    k.wire([XL, 10], k.t('M1', '1'));
    k.wire(k.t('M1', '2'), [XR, 10]);
    return k.build(this.title);
  },
};

export const ARCHETYPE_LIST: readonly Archetype[] = [threePhaseHalfWaveControlledRectifier, boostConverterSnubber, buckBoostConverter, hBridgeMotorDriver];
