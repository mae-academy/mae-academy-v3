// Rectifier archetypes. Coordinates are grid units (pitch 20). Every diode points up (rot 270: anode at the part origin, cathode 3 units above),
// so a leg reads bottom-to-top exactly like the current does. See ../archetypes/types.ts for the contract.

import type { Pt } from '../types';
import { Kit } from './kit';
import type { Archetype, ParamDef, ResolvedParams } from './types';

const str = (p: ResolvedParams, k: string): string => String(p[k]);

/** Output terminals: open ports "+" / "−" at the right end of the buses and the V_out label between them. */
function outputs(k: Kit, x: number, yTop: number, yBot: number): void {
  k.part('OUTP', 'port', [x, yTop], { value: '+', label: 'above' });
  k.part('OUTN', 'port', [x, yBot], { value: '−', label: 'below' });
  k.text('V_{\\text{out}}', [x + 1, (yTop + yBot) / 2], 'start');
}

// ---------------------------------------------------------------------------------------------------------------------
// Three-phase full-wave (six-pulse) bridge, IEEE diode numbering: upper D1 (A) D3 (B) D5 (C), lower D4 (A) D6 (B) D2 (C).
// The source/bridge graph is K3,3 (non-planar), so three phase lines necessarily cross the legs; they are drawn as a clean staircase.
// ---------------------------------------------------------------------------------------------------------------------
const THREE_PHASE_PARAMS: ParamDef[] = [
  { name: 'load', label: 'DC-side load', kind: 'choice', default: 'RL', choices: ['R', 'RL', 'RC', 'RLE'] },
  { name: 'supply_values', label: 'Line-to-neutral rms voltage of each source', kind: 'value', default: '230 V', unit: 'V', min: 0.1, max: 1000 },
  { name: 'R', label: 'Load resistance R_1', kind: 'value', default: '10 Ω', unit: 'ohm', min: 0.001, max: 1e8 },
  { name: 'L', label: 'Load inductance L_1 (RL, RLE)', kind: 'value', default: '50 mH', unit: 'H', min: 1e-9, max: 100 },
  { name: 'C', label: 'Filter capacitance C_1 (RC)', kind: 'value', default: '1000 µF', unit: 'F', min: 1e-12, max: 1 },
  { name: 'E', label: 'Back-EMF E (RLE)', kind: 'value', default: '48 V', unit: 'V', min: 0.1, max: 1000 },
];

/** Series/parallel load between the buses at column x; returns the x of the right-most column used. */
function dcLoad(k: Kit, load: string, p: ResolvedParams, x: number, yTop: number, yBot: number): number {
  const R = str(p, 'R'), L = str(p, 'L'), C = str(p, 'C'), E = str(p, 'E');
  const mid = (yTop + yBot) / 2;
  if (load === 'RLE') {
    k.part('R1', 'resistor', [x, mid - 7], { value: R, rot: 90, label: 'right' });
    k.part('L1', 'inductor', [x, mid - 2], { value: L, rot: 90, label: 'right' });
    k.part('VE', 'vsource', [x, mid + 3], { value: E, rot: 90, tex: 'E', label: 'right' });
    k.wire([x, yTop], k.t('R1', '1'));
    k.wire(k.t('R1', '2'), k.t('L1', '1'));
    k.wire(k.t('L1', '2'), k.t('VE', '+'));
    k.wire(k.t('VE', '-'), [x, yBot]);
    return x;
  }
  if (load === 'RL') {
    k.part('R1', 'resistor', [x, mid - 5], { value: R, rot: 90, label: 'right' });
    k.part('L1', 'inductor', [x, mid + 1], { value: L, rot: 90, label: 'right' });
    k.wire([x, yTop], k.t('R1', '1'));
    k.wire(k.t('R1', '2'), k.t('L1', '1'));
    k.wire(k.t('L1', '2'), [x, yBot]);
    return x;
  }
  k.part('R1', 'resistor', [x, mid - 2], { value: R, rot: 90, label: 'right' });
  k.wire([x, yTop], k.t('R1', '1'));
  k.wire(k.t('R1', '2'), [x, yBot]);
  if (load === 'RC') {
    const cx = x + 8;
    k.part('C1', 'polarized_capacitor', [cx, mid - 1], { value: C, rot: 90, label: 'right' });
    k.wire([cx, yTop], k.t('C1', '+'));
    k.wire(k.t('C1', '-'), [cx, yBot]);
    return cx;
  }
  return x;
}

export const threePhaseFullWaveRectifier: Archetype = {
  id: 'three_phase_full_wave_rectifier',
  title: 'Three-phase full-wave (six-pulse) bridge rectifier',
  aliases: ['three phase bridge rectifier', '3 phase full wave rectifier', '3-phase bridge rectifier', 'six pulse rectifier', 'three phase full bridge diode rectifier'],
  summary: 'Star-connected sources V_A,V_B,V_C (neutral to ground), six diodes D1..D6 in a bridge, DC load across the buses, V_out.',
  params: THREE_PHASE_PARAMS,
  build(p) {
    const k = new Kit();
    const XA = 16, XB = 24, XC = 32;
    const yTop = 2, yBot = 18;
    const legs: [number, string, string][] = [[XA, 'D1', 'D4'], [XB, 'D3', 'D6'], [XC, 'D5', 'D2']];
    for (const [x, up, lo] of legs) {
      k.part(up, 'diode', [x, 6], { rot: 270, label: 'right' });
      k.part(lo, 'diode', [x, 17], { rot: 270, label: 'right' });
    }
    // sources: terminal 1 (the phase side) on the right, the neutral side on the left
    const sv = str(p, 'supply_values');
    const NX = 3, SX = 10, yA = 4, yB = 10, yC = 16;
    k.part('VA', 'vsource_ac', [SX, yA], { value: sv, rot: 180, tex: 'V_A\\ (0°)', label: 'above' });
    k.part('VB', 'vsource_ac', [SX, yB], { value: sv, rot: 180, tex: 'V_B\\ (−120°)', label: 'above' });
    k.part('VC', 'vsource_ac', [SX, yC], { value: sv, rot: 180, tex: 'V_C\\ (+120°)', label: 'above' });
    // neutral bus with ground
    k.part('GND', 'ground', [NX, 19]);
    k.wire([SX - 4, yA], [NX, yA], [NX, 19]);
    k.wire([SX - 4, yB], [NX, yB]);
    k.wire([SX - 4, yC], [NX, yC]);
    k.text('N', [NX - 1, yB], 'end');
    // phase lines (staircase into the leg mid-links at y = 8, 10, 12)
    k.wire([SX, yA], [13, yA], [13, 8], [XA, 8]);
    k.wire([SX, yB], [XB, yB]);
    k.wire([SX, yC], [13, yC], [13, 12], [XC, 12]);
    // leg links, stubs and buses
    for (const [x] of legs) {
      k.wire([x, 6], [x, 14]);
      k.wire([x, 3], [x, yTop]);
      k.wire([x, 17], [x, yBot]);
    }
    const load = str(p, 'load');
    const XL = XC + 7;
    const lastCol = dcLoad(k, load, p, XL, yTop, yBot);
    const XO = lastCol + 8;
    const cols = load === 'RC' ? [XA, XB, XC, XL, lastCol, XO] : [XA, XB, XC, XL, XO];
    k.wire(...cols.map((x): Pt => [x, yTop]));
    k.wire(...cols.map((x): Pt => [x, yBot]));
    outputs(k, XO, yTop, yBot);
    return k.build(this.title);
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Single-phase full bridge: legs X (D1 upper, D4 lower) and Y (D2 upper, D3 lower); the source sits between the legs, so there is no crossing.
// D1 and D3 conduct while X is positive, D2 and D4 while Y is positive.
// ---------------------------------------------------------------------------------------------------------------------
const SINGLE_PHASE_PARAMS: ParamDef[] = [
  { name: 'filter', label: 'Output filter', kind: 'choice', default: 'none', choices: ['none', 'C', 'LC'] },
  { name: 'supply', label: 'AC source rms voltage', kind: 'value', default: '230 V', unit: 'V', min: 0.1, max: 1000 },
  { name: 'R_load', label: 'Load resistance R_L', kind: 'value', default: '100 Ω', unit: 'ohm', min: 0.001, max: 1e8 },
  { name: 'C', label: 'Filter capacitance C_1', kind: 'value', default: '470 µF', unit: 'F', min: 1e-12, max: 1 },
  { name: 'L', label: 'Filter inductance L_1 (LC)', kind: 'value', default: '10 mH', unit: 'H', min: 1e-9, max: 100 },
];

export const singlePhaseFullBridgeRectifier: Archetype = {
  id: 'single_phase_full_bridge_rectifier',
  title: 'Single-phase full-bridge rectifier',
  aliases: ['full bridge rectifier', 'bridge rectifier', 'single phase bridge rectifier', 'full wave bridge rectifier', 'diode bridge'],
  summary: 'AC source V_s, four diodes D1..D4 in a bridge, optional C or LC filter, load R_L, V_out.',
  params: SINGLE_PHASE_PARAMS,
  build(p) {
    const k = new Kit();
    const X = 10, Y = 22;
    const yTop = 2, yBot = 14;
    for (const [x, up, lo] of [[X, 'D1', 'D4'], [Y, 'D2', 'D3']] as [number, string, string][]) {
      k.part(up, 'diode', [x, 6], { rot: 270, label: 'right' });
      k.part(lo, 'diode', [x, 13], { rot: 270, label: 'right' });
      k.wire([x, 6], [x, 10]);
      k.wire([x, 3], [x, yTop]);
      k.wire([x, 13], [x, yBot]);
    }
    k.part('VS', 'vsource_ac', [14, 8], { value: str(p, 'supply'), tex: 'V_s', label: 'above' });
    k.wire([X, 8], k.t('VS', '1'));
    k.wire(k.t('VS', '2'), [Y, 8]);

    const filter = str(p, 'filter');
    const topXs: number[] = [X, Y];
    const botXs: number[] = [X, Y];
    let x = Y + 8;
    if (filter === 'LC') {
      k.part('L1', 'inductor', [Y + 4, yTop], { value: str(p, 'L') });
    }
    const split = filter === 'LC' ? Y + 8 : null;
    const cols: number[] = [];
    if (filter !== 'none') {
      const cx = filter === 'LC' ? Y + 12 : x;
      k.part('C1', 'polarized_capacitor', [cx, 6], { value: str(p, 'C'), rot: 90, label: 'right' });
      k.wire([cx, yTop], k.t('C1', '+'));
      k.wire(k.t('C1', '-'), [cx, yBot]);
      cols.push(cx);
      x = cx + 8;
    }
    k.part('RL', 'resistor', [x, 6], { value: str(p, 'R_load'), rot: 90, tex: 'R_L', label: 'right' });
    k.wire([x, yTop], k.t('RL', '1'));
    k.wire(k.t('RL', '2'), [x, yBot]);
    cols.push(x);
    const XO = x + 8;
    // ground = the negative DC rail, taken at the load column
    k.part('GND', 'ground', [x, yBot]);
    if (split === null) {
      k.wire(...[...topXs, ...cols, XO].map((cx): Pt => [cx, yTop]));
    } else {
      k.wire(...[X, Y].map((cx): Pt => [cx, yTop]), k.t('L1', '1'));
      k.wire(k.t('L1', '2'), ...[...cols, XO].map((cx): Pt => [cx, yTop]));
    }
    k.wire(...[...botXs, ...cols, XO].map((cx): Pt => [cx, yBot]));
    outputs(k, XO, yTop, yBot);
    return k.build(this.title);
  },
};

export const ARCHETYPE_LIST: readonly Archetype[] = [threePhaseFullWaveRectifier, singlePhaseFullBridgeRectifier];
