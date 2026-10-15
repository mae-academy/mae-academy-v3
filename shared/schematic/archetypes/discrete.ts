// Discrete-device and bridge archetypes: Wheatstone bridge, BJT/MOSFET amplifier stages, CMOS inverter, 555 astable,
// Colpitts and Wien-bridge oscillators. Coordinates are grid units (pitch 20). See ./types.ts for the contract.

import type { Pt } from '../types';
import { Kit } from './kit';
import type { Archetype, ParamDef, ResolvedParams } from './types';

const str = (p: ResolvedParams, k: string): string => String(p[k]);
const R_RANGE = { unit: 'ohm', min: 10, max: 1e7 } as const;
const C_RANGE = { unit: 'F', min: 1e-12, max: 1e-2 } as const;
const L_RANGE = { unit: 'H', min: 1e-9, max: 1 } as const;
const V_RANGE = { unit: 'V', min: 1, max: 100 } as const;

// ---------------------------------------------------------------------------------------------------------------------
// Wheatstone bridge. Orthogonal "diamond": the four nodes sit at the top, left, right and bottom middle; each arm runs along the
// frame of the diamond with its resistor on the horizontal edge. The supply is wired around the left side (no crossing),
// the detector (open port pair or R_G) closes the horizontal diagonal.
// ---------------------------------------------------------------------------------------------------------------------
const WHEATSTONE_PARAMS: ParamDef[] = [
  { name: 'Vs', label: 'Supply voltage V_s', kind: 'value', default: '10 V', ...V_RANGE },
  { name: 'R1', label: 'Arm R_1 (top, left)', kind: 'value', default: '1 kΩ', ...R_RANGE },
  { name: 'R2', label: 'Arm R_2 (top, right)', kind: 'value', default: '1 kΩ', ...R_RANGE },
  { name: 'R3', label: 'Arm R_3 (bottom, left)', kind: 'value', default: '1 kΩ', ...R_RANGE },
  { name: 'R4', label: 'Arm R_4 (bottom, right)', kind: 'value', default: '1 kΩ', ...R_RANGE },
  { name: 'detector', label: 'Detector across the bridge', kind: 'choice', default: 'ports', choices: ['ports', 'resistor'] },
  { name: 'RG', label: 'Detector resistance R_G (detector = resistor)', kind: 'value', default: '100 Ω', ...R_RANGE },
];

export const wheatstoneBridge: Archetype = {
  id: 'wheatstone_bridge',
  title: 'Wheatstone bridge',
  aliases: ['wheatstone', 'wheatstone bridge circuit', 'resistor bridge', 'bridge circuit', 'diamond bridge'],
  summary: 'Supply V_s across a four-resistor bridge R_1..R_4 (R_1,R_3 left arm; R_2,R_4 right arm); differential output V_out between the mid-nodes (open ports, or a detector resistor R_G); ground at the supply negative.',
  params: WHEATSTONE_PARAMS,
  build(p) {
    const k = new Kit();
    const XT = 20, YT = 7, YB = 21, YM = 14, XL = 8, XR = 32;
    k.part('VS', 'vsource', [4, 12], { value: str(p, 'Vs'), rot: 90, tex: 'V_s', label: 'left' });
    k.part('R1', 'resistor', [12, YT], { value: str(p, 'R1'), tex: 'R_1', label: 'above' });
    k.part('R2', 'resistor', [24, YT], { value: str(p, 'R2'), tex: 'R_2', label: 'above' });
    k.part('R3', 'resistor', [12, YB], { value: str(p, 'R3'), tex: 'R_3', label: 'below' });
    k.part('R4', 'resistor', [24, YB], { value: str(p, 'R4'), tex: 'R_4', label: 'below' });
    // top node: supply + enters from above, arms left and right
    k.wire(k.t('VS', '+'), [4, 1], [XT, 1], [XT, YT]);
    k.wire([XL, YT], k.t('R1', '1'));
    k.wire(k.t('R1', '2'), [XT, YT], k.t('R2', '1'));
    k.wire(k.t('R2', '2'), [XR, YT]);
    // bottom node: supply - (ground) leaves below
    k.wire(k.t('VS', '-'), [4, 27], [12, 27], [XT, 27], [XT, YB]);
    k.part('GND', 'ground', [12, 27]);
    k.wire([XL, YB], k.t('R3', '1'));
    k.wire(k.t('R3', '2'), [XT, YB], k.t('R4', '1'));
    k.wire(k.t('R4', '2'), [XR, YB]);
    // left and right mid-nodes
    k.wire([XL, YT], [XL, YM], [XL, YB]);
    k.wire([XR, YT], [XR, YM], [XR, YB]);
    if (str(p, 'detector') === 'resistor') {
      k.part('RG', 'resistor', [18, YM], { value: str(p, 'RG'), tex: 'R_G', label: 'above' });
      k.wire([XL, YM], k.t('RG', '1'));
      k.wire(k.t('RG', '2'), [XR, YM]);
      k.text('V_{\\text{out}}', [XT, YM + 2], 'middle');
    } else {
      k.part('OUTP', 'port', [16, YM], { value: '+', label: 'above' });
      k.part('OUTN', 'port', [24, YM], { value: '−', label: 'above' });
      k.wire([XL, YM], k.t('OUTP', 'P'));
      k.wire([XR, YM], k.t('OUTN', 'P'));
      k.text('V_{\\text{out}}', [XT, YM], 'middle');
    }
    return k.build(this.title);
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Voltage-divider-biased amplifier stage shared by the BJT common-emitter and the MOSFET common-source archetypes.
// ---------------------------------------------------------------------------------------------------------------------
type Dev = 'bjt' | 'mos';

function amplifierParams(dev: Dev): ParamDef[] {
  const bjt = dev === 'bjt';
  return [
    { name: 'Vcc', label: bjt ? 'Supply V_CC' : 'Supply V_DD', kind: 'value', default: bjt ? '12 V' : '15 V', ...V_RANGE },
    { name: 'R1', label: bjt ? 'Upper bias resistor R_1 (rail to base)' : 'Upper bias resistor R_1 (rail to gate)', kind: 'value', default: bjt ? '47 kΩ' : '2 MΩ', ...R_RANGE },
    { name: 'R2', label: bjt ? 'Lower bias resistor R_2 (base to ground)' : 'Lower bias resistor R_2 (gate to ground)', kind: 'value', default: bjt ? '10 kΩ' : '1 MΩ', ...R_RANGE },
    { name: bjt ? 'RC' : 'RD', label: bjt ? 'Collector resistor R_C' : 'Drain resistor R_D', kind: 'value', default: '4.7 kΩ', ...R_RANGE },
    { name: bjt ? 'RE' : 'RS', label: bjt ? 'Emitter resistor R_E' : 'Source resistor R_S', kind: 'value', default: '1 kΩ', ...R_RANGE },
    { name: bjt ? 'CE' : 'CS', label: bjt ? 'Emitter bypass capacitor C_E' : 'Source bypass capacitor C_S', kind: 'value', default: '100 µF', ...C_RANGE },
    { name: 'Cin', label: 'Input coupling capacitor C_in', kind: 'value', default: '10 µF', ...C_RANGE },
    { name: 'Cout', label: 'Output coupling capacitor C_out', kind: 'value', default: '10 µF', ...C_RANGE },
    { name: 'load', label: 'Load resistor R_L', kind: 'choice', default: 'RL', choices: ['none', 'RL'] },
    { name: 'RL', label: 'Load resistance R_L', kind: 'value', default: '10 kΩ', ...R_RANGE },
    { name: 'Vin', label: 'Input signal amplitude V_in', kind: 'value', default: '10 mV', unit: 'V', min: 1e-6, max: 100 },
  ];
}

function amplifier(k: Kit, p: ResolvedParams, dev: Dev): void {
  const bjt = dev === 'bjt';
  const top = bjt ? 'RC' : 'RD', bot = bjt ? 'RE' : 'RS', byp = bjt ? 'CE' : 'CS';
  const supply = bjt ? 'V_{\\text{CC}}' : 'V_{\\text{DD}}';
  const YB = 20, YM = 10;
  // supply bus with the rail symbol
  k.part('VCC', 'rail', [14, 2], { value: str(p, 'Vcc'), tex: supply });
  k.wire([10, 2], [14, 2], [18, 2]);
  // bias divider R1 / R2, tap at the base (gate) height
  k.part('R1', 'resistor', [10, 4], { value: str(p, 'R1'), rot: 90, tex: 'R_1', label: 'right' });
  k.part('R2', 'resistor', [10, 12], { value: str(p, 'R2'), rot: 90, tex: 'R_2', label: 'right' });
  k.wire([10, 2], k.t('R1', '1'));
  k.wire(k.t('R1', '2'), [10, YM], k.t('R2', '1'));
  k.wire(k.t('R2', '2'), [10, YB]);
  // device: base (gate) on the tap level
  if (bjt) k.part('Q1', 'npn', [16, YM], { tex: 'Q_1', label: 'right' });
  else k.part('Q1', 'nmos', [16, YM], { tex: 'M_1', label: 'right' });
  const ctl = bjt ? 'B' : 'G', hi = bjt ? 'C' : 'D', lo = bjt ? 'E' : 'S';
  k.wire([10, YM], k.t('Q1', ctl));
  // collector (drain) resistor and output tap
  k.part(top, 'resistor', [18, 2], { value: str(p, top), rot: 90, tex: bjt ? 'R_C' : 'R_D', label: 'right' });
  k.wire(k.t(top, '2'), [18, 7], k.t('Q1', hi));
  // emitter (source) resistor with the bypass capacitor in parallel
  k.part(bot, 'resistor', [18, 14], { value: str(p, bot), rot: 90, tex: bjt ? 'R_E' : 'R_S', label: 'left' });
  k.part(byp, 'capacitor', [22, 15], { value: str(p, byp), rot: 90, tex: bjt ? 'C_E' : 'C_S', label: 'right' });
  k.wire(k.t('Q1', lo), [18, 13], k.t(bot, '1'));
  k.wire([18, 13], [22, 13], k.t(byp, '1'));
  k.wire(k.t(bot, '2'), [18, YB]);
  k.wire(k.t(byp, '2'), [22, YB]);
  // input: signal source and coupling capacitor
  k.part('VIN', 'vsource_ac', [3, 10], { value: str(p, 'Vin'), rot: 90, tex: 'V_{\\text{in}}', label: 'left' });
  k.part('CIN', 'capacitor', [5, YM], { value: str(p, 'Cin'), tex: 'C_{\\text{in}}', label: 'above' });
  k.wire(k.t('VIN', '1'), k.t('CIN', '1'));
  k.wire(k.t('CIN', '2'), [10, YM]);
  // output: coupling capacitor, optional load
  k.part('COUT', 'capacitor', [21, 7], { value: str(p, 'Cout'), tex: 'C_{\\text{out}}', label: 'above' });
  k.wire([18, 7], k.t('COUT', '1'));
  const load = str(p, 'load') === 'RL';
  const XO = 28;
  k.wire(k.t('COUT', '2'), [XO, 7], [XO + 4, 7]);
  k.part('OUT', 'port', [XO + 4, 7], { value: 'V_{\\text{out}}', label: 'above' });
  if (load) {
    k.part('RL', 'resistor', [XO, 7], { value: str(p, 'RL'), rot: 90, tex: 'R_L', label: 'right' });
    k.wire(k.t('RL', '2'), [XO, YB]);
  }
  // ground return
  k.part('GND', 'ground', [14, YB]);
  k.wire(k.t('VIN', '2'), [3, YB], [10, YB], [14, YB], [18, YB], [22, YB], ...(load ? [[XO, YB] as Pt] : []));
}

export const bjtCommonEmitter: Archetype = {
  id: 'bjt_common_emitter',
  title: 'BJT common-emitter amplifier with divider bias',
  aliases: ['common emitter amplifier', 'common-emitter amplifier', 'bjt amplifier', 'ce amplifier', 'common emitter', 'bjt common emitter stage', 'voltage divider bias bjt amplifier'],
  summary: 'NPN Q_1, divider bias R_1/R_2 to the base, R_C to V_CC, R_E with bypass C_E, coupling capacitors C_in/C_out, source V_in, optional load R_L, output V_out.',
  params: amplifierParams('bjt'),
  build(p) {
    const k = new Kit();
    amplifier(k, p, 'bjt');
    return k.build(this.title);
  },
};

export const mosfetCommonSource: Archetype = {
  id: 'mosfet_common_source',
  title: 'MOSFET common-source amplifier',
  aliases: ['common source amplifier', 'common-source amplifier', 'mosfet amplifier', 'cs amplifier', 'common source', 'nmos amplifier', 'fet amplifier'],
  summary: 'n-MOSFET M_1, gate divider R_1/R_2, R_D to V_DD, R_S with bypass C_S, coupling capacitors C_in/C_out, source V_in, optional load R_L, output V_out.',
  params: amplifierParams('mos'),
  build(p) {
    const k = new Kit();
    amplifier(k, p, 'mos');
    return k.build(this.title);
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// CMOS inverter, drawn vertically: pMOS (source to V_DD) above nMOS (source to ground), common gate, common drain.
// ---------------------------------------------------------------------------------------------------------------------
export const cmosInverter: Archetype = {
  id: 'cmos_inverter',
  title: 'CMOS inverter',
  aliases: ['cmos inverter', 'cmos not gate', 'complementary mos inverter', 'cmos inverter circuit', 'inverter cmos'],
  summary: 'pMOS M_P (source to V_DD) over nMOS M_N (source to ground), gates tied to V_in, drains tied to V_out, optional load capacitor C_L.',
  params: [
    { name: 'Vdd', label: 'Supply V_DD', kind: 'value', default: '5 V', ...V_RANGE },
    { name: 'load', label: 'Output load', kind: 'choice', default: 'C', choices: ['none', 'C'] },
    { name: 'CL', label: 'Load capacitance C_L', kind: 'value', default: '10 pF', ...C_RANGE },
  ],
  build(p) {
    const k = new Kit();
    k.part('VDD', 'rail', [18, 2], { value: str(p, 'Vdd'), tex: 'V_{\\text{DD}}' });
    k.part('MP', 'pmos', [16, 6], { flip: true, tex: 'M_P', label: 'right' });
    k.part('MN', 'nmos', [16, 14], { tex: 'M_N', label: 'right' });
    k.wire([18, 2], k.t('MP', 'S'));
    k.wire(k.t('MP', 'G'), [12, 6], [12, 10], [12, 14], k.t('MN', 'G'));
    k.part('IN', 'port', [6, 10], { value: 'V_{\\text{in}}', label: 'above' });
    k.wire([6, 10], [12, 10]);
    const load = str(p, 'load') === 'C';
    k.wire(k.t('MP', 'D'), [18, 10], k.t('MN', 'D'));
    k.part('OUT', 'port', [30, 10], { value: 'V_{\\text{out}}', label: 'above' });
    k.wire([18, 10], ...(load ? [[24, 10] as Pt] : []), [30, 10]);
    if (load) {
      k.part('CL', 'capacitor', [24, 10], { value: str(p, 'CL'), rot: 90, tex: 'C_L', label: 'right' });
      k.part('GND2', 'ground', [24, 15]);
      k.wire(k.t('CL', '2'), [24, 15]);
    }
    k.part('GND', 'ground', [18, 18]);
    k.wire(k.t('MN', 'S'), [18, 18]);
    return k.build(this.title);
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// 555 astable. Schematic pin arrangement (functional, grouped by use): left DIS / THR / TRIG (timing network), top V_CC / RESET,
// bottom GND / CTRL, right OUT. R_A: V_CC to DIS, R_B: DIS to THR+TRIG (tied), C_1: THR+TRIG to ground.
// ---------------------------------------------------------------------------------------------------------------------
export const timer555Astable: Archetype = {
  id: 'timer555_astable',
  title: '555 astable multivibrator',
  aliases: ['555 astable', '555 timer astable', '555 timer', 'astable multivibrator', '555 oscillator', 'astable 555', '555 astable multivibrator'],
  summary: '555 timer U_1: R_A from V_CC to DIS, R_B from DIS to THR/TRIG, C_1 to ground, RESET to V_CC, C_2 on CTRL, output V_out (optional LED load); f = 1.44/((R_A + 2R_B)C_1).',
  params: [
    { name: 'Vcc', label: 'Supply V_CC', kind: 'value', default: '9 V', ...V_RANGE },
    { name: 'RA', label: 'Resistor R_A', kind: 'value', default: '1 kΩ', ...R_RANGE },
    { name: 'RB', label: 'Resistor R_B', kind: 'value', default: '10 kΩ', ...R_RANGE },
    { name: 'C1', label: 'Timing capacitor C_1', kind: 'value', default: '10 µF', ...C_RANGE },
    { name: 'C2', label: 'Control-pin capacitor C_2', kind: 'value', default: '10 nF', ...C_RANGE },
    { name: 'ctrl_cap', label: 'Draw C_2 on the CTRL pin (false omits the CTRL pin)', kind: 'bool', default: true },
    { name: 'load', label: 'Output load', kind: 'choice', default: 'none', choices: ['none', 'led'] },
    { name: 'RL', label: 'LED series resistor R_L', kind: 'value', default: '470 Ω', ...R_RANGE },
  ],
  build(p) {
    const k = new Kit();
    const YB = 22;
    const ctrl = p.ctrl_cap === true;
    k.part('U1', 'ic', [22, 6], {
      value: '555', tex: 'U_1',
      attrs: { w: 12, h: 12, pins: [
        { name: 'DIS', side: 'L', pos: 3 }, { name: 'THR', side: 'L', pos: 6 }, { name: 'TRIG', side: 'L', pos: 9 },
        { name: 'VCC', side: 'T', pos: 4 }, { name: 'RESET', side: 'T', pos: 8 },
        { name: 'GND', side: 'B', pos: 4 }, ...(ctrl ? [{ name: 'CTRL', side: 'B' as const, pos: 8 }] : []), { name: 'OUT', side: 'R', pos: 6 },
      ] },
    });
    k.part('VCC', 'rail', [20, 2], { value: str(p, 'Vcc'), tex: 'V_{\\text{CC}}' });
    k.wire([14, 2], [20, 2], [26, 2], [30, 2]);
    k.wire(k.t('U1', 'VCC'), [26, 2]);
    k.wire(k.t('U1', 'RESET'), [30, 2]);
    // timing network
    k.part('RA', 'resistor', [14, 2], { value: str(p, 'RA'), rot: 90, tex: 'R_A', label: 'left' });
    k.part('RB', 'resistor', [14, 10], { value: str(p, 'RB'), rot: 90, tex: 'R_B', label: 'left' });
    k.part('C1', 'capacitor', [14, 16], { value: str(p, 'C1'), rot: 90, tex: 'C_1', label: 'left' });
    k.wire(k.t('RA', '2'), [14, 9], k.t('RB', '1'));
    k.wire([14, 9], k.t('U1', 'DIS'));
    k.wire(k.t('RB', '2'), k.t('C1', '1'));
    k.wire([14, 14], [20, 14]);
    k.wire(k.t('U1', 'THR'), [20, 12], [20, 14], [20, 15], k.t('U1', 'TRIG'));
    // ground bus
    k.part('GND', 'ground', [20, YB]);
    const busX = [14, 20, 26, ...(ctrl ? [30] : [])];
    const load = str(p, 'load') === 'led';
    k.wire(k.t('C1', '2'), [14, YB]);
    k.wire(k.t('U1', 'GND'), [26, YB]);
    if (ctrl) {
      k.part('C2', 'capacitor', [30, 19], { value: str(p, 'C2'), rot: 90, tex: 'C_2', label: 'right' });
      k.wire(k.t('U1', 'CTRL'), k.t('C2', '1'));
    }
    // output
    k.part('OUT', 'port', [42, 12], { value: 'V_{\\text{out}}', label: 'above' });
    if (load) {
      k.wire(k.t('U1', 'OUT'), [38, 12], [42, 12]);
      k.part('RL', 'resistor', [38, 12], { value: str(p, 'RL'), rot: 90, tex: 'R_L', label: 'right' });
      k.part('D1', 'led', [38, 16], { rot: 90, tex: 'D_1', label: 'right' });
      k.wire(k.t('D1', 'K'), [38, YB]);
      busX.push(38);
    } else {
      k.wire(k.t('U1', 'OUT'), [42, 12]);
    }
    k.wire(...busX.map((x): Pt => [x, YB]));
    k.text('f\\,=\\,1.44\\,/\\,((R_A+2R_B)\\,C_1)', [14, 26], 'start');
    k.text('D\\,=\\,(R_A+R_B)\\,/\\,(R_A+2R_B)', [14, 28], 'start');
    return k.build(this.title);
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Colpitts oscillator, common-emitter. Tank: L_1 (in series with the DC-blocking coupling capacitor C_c) between collector and base,
// C_1 collector-to-ground, C_2 base-to-ground; the C_1/C_2 junction is ground (emitter, AC). L_RFC feeds the collector from V_CC.
// ---------------------------------------------------------------------------------------------------------------------
export const colpittsOscillator: Archetype = {
  id: 'colpitts_oscillator',
  title: 'Colpitts oscillator',
  aliases: ['colpitts', 'colpitts oscillator circuit', 'lc oscillator colpitts', 'bjt colpitts oscillator'],
  summary: 'Common-emitter BJT Q_1 with divider bias R_1/R_2, R_E/C_E, RFC feeding the collector; tank L_1 with C_1/C_2 capacitive divider (midpoint grounded), coupling C_c, output V_out; f_0 = 1/(2π√(L_1 C_1C_2/(C_1+C_2))).',
  params: [
    { name: 'Vcc', label: 'Supply V_CC', kind: 'value', default: '12 V', ...V_RANGE },
    { name: 'L1', label: 'Tank inductor L_1', kind: 'value', default: '10 µH', ...L_RANGE },
    { name: 'C1', label: 'Tank capacitor C_1 (collector side)', kind: 'value', default: '470 pF', ...C_RANGE },
    { name: 'C2', label: 'Tank capacitor C_2 (base side)', kind: 'value', default: '470 pF', ...C_RANGE },
    { name: 'R1', label: 'Bias resistor R_1', kind: 'value', default: '33 kΩ', ...R_RANGE },
    { name: 'R2', label: 'Bias resistor R_2', kind: 'value', default: '10 kΩ', ...R_RANGE },
    { name: 'RE', label: 'Emitter resistor R_E', kind: 'value', default: '1 kΩ', ...R_RANGE },
    { name: 'CE', label: 'Emitter bypass capacitor C_E', kind: 'value', default: '100 nF', ...C_RANGE },
    { name: 'Cc', label: 'Coupling capacitor C_c', kind: 'value', default: '1 nF', ...C_RANGE },
    { name: 'Cout', label: 'Output coupling capacitor C_out', kind: 'value', default: '10 nF', ...C_RANGE },
    { name: 'LRFC', label: 'RF choke L_RFC', kind: 'value', default: '1 mH', ...L_RANGE },
  ],
  build(p) {
    const k = new Kit();
    const YB = 24;
    k.part('VCC', 'rail', [12, 2], { value: str(p, 'Vcc'), tex: 'V_{\\text{CC}}' });
    k.wire([6, 2], [12, 2], [18, 2]);
    // bias divider with the tap at the base node
    k.part('R1', 'resistor', [6, 2], { value: str(p, 'R1'), rot: 90, tex: 'R_1', label: 'left' });
    k.part('R2', 'resistor', [6, 16], { value: str(p, 'R2'), rot: 90, tex: 'R_2', label: 'left' });
    k.wire(k.t('R1', '2'), [6, 14], k.t('R2', '1'));
    k.wire([6, 14], [10, 14]);
    k.wire(k.t('R2', '2'), [6, YB]);
    // transistor
    k.part('Q1', 'npn', [16, 14], { tex: 'Q_1', label: 'right' });
    k.wire([10, 14], k.t('Q1', 'B'));
    // collector: RF choke from the rail, node at y = 9
    k.part('LRFC', 'inductor', [18, 2], { value: str(p, 'LRFC'), rot: 90, tex: 'L_{\\text{RFC}}', label: 'right' });
    k.wire(k.t('LRFC', '2'), [18, 9], k.t('Q1', 'C'));
    // tank branch: L_1 and C_c from the collector node to the base node
    k.part('L1', 'inductor', [10, 9], { value: str(p, 'L1'), tex: 'L_1', label: 'above' });
    k.part('CC', 'capacitor', [15, 9], { value: str(p, 'Cc'), tex: 'C_c', label: 'above' });
    k.wire([10, 14], [10, 9]);
    k.wire(k.t('L1', '2'), k.t('CC', '1'));
    
    // capacitive divider: C_2 base-to-ground, C_1 collector-to-ground
    k.part('C2', 'capacitor', [10, 16], { value: str(p, 'C2'), rot: 90, tex: 'C_2', label: 'right' });
    k.wire([10, 14], k.t('C2', '1'));
    k.wire(k.t('C2', '2'), [10, YB]);
    k.part('C1', 'capacitor', [26, 9], { value: str(p, 'C1'), rot: 90, tex: 'C_1', label: 'right' });
    k.wire(k.t('CC', '2'), [26, 9], [28, 9]);
    k.wire(k.t('C1', '2'), [26, YB]);
    // emitter network
    k.part('RE', 'resistor', [18, 18], { value: str(p, 'RE'), rot: 90, tex: 'R_E', label: 'left' });
    k.part('CE', 'capacitor', [22, 18], { value: str(p, 'CE'), rot: 90, tex: 'C_E', label: 'right' });
    k.wire(k.t('Q1', 'E'), [18, 17], k.t('RE', '1'));
    k.wire([18, 17], [22, 17], k.t('CE', '1'));
    k.wire(k.t('RE', '2'), [18, YB]);
    k.wire(k.t('CE', '2'), [22, YB]);
    // output
    k.part('COUT', 'capacitor', [28, 9], { value: str(p, 'Cout'), tex: 'C_{\\text{out}}', label: 'above' });
    k.part('OUT', 'port', [35, 9], { value: 'V_{\\text{out}}', label: 'above' });
    k.wire(k.t('COUT', '2'), [35, 9]);
    // ground
    k.part('GND', 'ground', [14, YB]);
    k.wire([6, YB], [10, YB], [14, YB], [18, YB], [22, YB], [26, YB]);
    k.text('f_0\\,=\\,1\\,/\\,(2π\\,√(L_1\\,·\\,C_1C_2\\,/\\,(C_1+C_2)))', [6, 28], 'start');
    return k.build(this.title);
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Wien-bridge oscillator. Op-amp drawn with IN+ on top: the Wien network (series R_1 C_1 from OUT, parallel R_2 C_2 to ground)
// feeds IN+; R_f / R_g set the gain 1 + R_f/R_g (> 3 for start-up).
// ---------------------------------------------------------------------------------------------------------------------
export const wienBridgeOscillator: Archetype = {
  id: 'wien_bridge_oscillator',
  title: 'Wien-bridge oscillator',
  aliases: ['wien bridge', 'wien bridge oscillator circuit', 'wien oscillator', 'op amp wien bridge oscillator', 'rc oscillator wien'],
  summary: 'Op-amp U_1; Wien network R_1-C_1 (series) and R_2-C_2 (parallel to ground) on IN+, R_f/R_g on IN- (gain 1 + R_f/R_g > 3), output V_out; f_0 = 1/(2πRC).',
  params: [
    { name: 'R', label: 'Wien resistors R_1 = R_2 = R', kind: 'value', default: '10 kΩ', ...R_RANGE },
    { name: 'C', label: 'Wien capacitors C_1 = C_2 = C', kind: 'value', default: '16 nF', ...C_RANGE },
    { name: 'Rg', label: 'Gain resistor R_g (IN- to ground)', kind: 'value', default: '10 kΩ', ...R_RANGE },
    { name: 'Rf', label: 'Feedback resistor R_f (OUT to IN-), at least 2 R_g', kind: 'value', default: '22 kΩ', ...R_RANGE },
  ],
  build(p) {
    const k = new Kit();
    const YB = 20;
    k.part('U1', 'opamp', [24, 12], { flip: true, tex: 'U_1', label: 'above' });
    // Wien network: series branch along the top, parallel branch down to ground
    k.part('R1', 'resistor', [20, 2], { value: str(p, 'R'), tex: 'R_1', label: 'above' });
    k.part('C1', 'capacitor', [13, 2], { value: str(p, 'C'), tex: 'C_1', label: 'above' });
    k.wire([34, 11], [34, 2], [24, 2]);
    k.wire(k.t('R1', '1'), [17, 2], k.t('C1', '2'));
    k.wire(k.t('C1', '1'), [4, 2], [4, 10]);
    k.part('R2', 'resistor', [4, 10], { value: str(p, 'R'), rot: 90, tex: 'R_2', label: 'left' });
    k.part('C2', 'capacitor', [9, 10], { value: str(p, 'C'), rot: 90, tex: 'C_2', label: 'left' });
    k.wire([4, 10], [9, 10], k.t('U1', 'IN+'));
    k.wire(k.t('R2', '2'), [4, YB]);
    k.wire(k.t('C2', '2'), [9, YB]);
    // output node and feedback
    k.wire(k.t('U1', 'OUT'), [34, 11]);
    k.wire([34, 11], [34, 17], [29, 17]);
    k.part('RF', 'resistor', [25, 17], { value: str(p, 'Rf'), tex: 'R_f', label: 'below' });
    k.wire(k.t('RF', '1'), [21, 17], [21, 12], k.t('U1', 'IN-'));
    k.part('RG', 'resistor', [14, 12], { value: str(p, 'Rg'), rot: 90, tex: 'R_g', label: 'right' });
    k.wire([21, 12], k.t('RG', '1'));
    k.wire(k.t('RG', '2'), [14, YB]);
    k.part('OUT', 'port', [38, 11], { value: 'V_{\\text{out}}', label: 'above' });
    k.wire([34, 11], k.t('OUT', 'P'));
    k.part('GND', 'ground', [9, YB]);
    k.wire([4, YB], [9, YB], [14, YB]);
    k.text('f_0\\,=\\,1\\,/\\,(2πRC),\\;\\;R_f\\,≥\\,2R_g', [4, 24], 'start');
    return k.build(this.title);
  },
};

export const ARCHETYPE_LIST: readonly Archetype[] = [
  wheatstoneBridge, bjtCommonEmitter, mosfetCommonSource, cmosInverter, timer555Astable, colpittsOscillator, wienBridgeOscillator,
];
