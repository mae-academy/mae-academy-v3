// Analog archetypes: op-amp amplifiers, active filters, the twin-T notch and the precision half-wave rectifier.
// Coordinates are grid units (pitch 20). Op-amp: IN- (0,0), IN+ (0,2), OUT (6,1); a flipped op-amp (flip: true) has IN+ on top.
// Every figure has inputs on the left, the output on the right, feedback routed above or below the amplifier and ground at N0.

import { formatValue, parseValue } from '../values';
import type { Dim } from '../values';
import type { Pt } from '../types';
import { Kit } from './kit';
import type { Archetype, ParamDef, ResolvedParams } from './types';

const str = (p: ResolvedParams, k: string): string => String(p[k]);
const R_PARAM = (name: string, label: string, def: string): ParamDef => ({ name, label, kind: 'value', default: def, unit: 'ohm', min: 1, max: 1e8 });
const C_PARAM = (name: string, label: string, def: string): ParamDef => ({ name, label, kind: 'value', default: def, unit: 'F', min: 1e-12, max: 1e-2 });

/** SI number -> display text ("4.7 kΩ"), three significant digits at most. */
function eng(si: number, unit: Dim): string {
  const steps: [number, string][] = [[1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p']];
  for (const [f, pre] of steps) {
    if (si >= f * 0.9999999) return formatValue(`${Number((si / f).toPrecision(3))} ${pre}`, unit);
  }
  return formatValue(`${Number(si.toPrecision(3))} p`, unit);
}
/** Multiply a normalised display value by a factor (R/2, 2C, ...). */
function scaled(display: string, factor: number, unit: Dim): string {
  const pv = parseValue(display);
  return eng((pv ? pv.si : 1) * factor, unit);
}

const out = (k: Kit, id: string, at: Pt, tex: string, label: 'above' | 'below' | 'left' | 'right' = 'above'): void => {
  k.part(id, 'port', at, { value: tex, label });
};

// ---------------------------------------------------------------------------------------------------------------------
// Non-inverting amplifier. The op-amp is flipped so + is on top: V_in enters the top input, the feedback network hangs below.
// ---------------------------------------------------------------------------------------------------------------------
export const nonInvertingAmplifier: Archetype = {
  id: 'non_inverting_amplifier',
  title: 'Non-inverting op-amp amplifier',
  aliases: ['non inverting amplifier', 'noninverting amplifier', 'non-inverting op amp', 'non inverting op amp amplifier', 'non inverting opamp'],
  summary: 'V_in to +, R_f from OUT to -, R_1 to ground; A_v = 1 + R_f/R_1.',
  params: [
    R_PARAM('R_f', 'Feedback resistance R_f', '10 kΩ'),
    R_PARAM('R_1', 'Ground-leg resistance R_1', '1 kΩ'),
    { name: 'supply_pins', label: 'Draw the supply pins', kind: 'bool', default: false },
  ],
  build(p) {
    const k = new Kit();
    const sup = p.supply_pins === true;
    const yF = sup ? 14 : 12;
    k.part('U1', 'opamp', [14, 8], { flip: true, tex: 'A_1', label: 'above', attrs: sup ? { supply: true } : {} });
    out(k, 'VIN', [3, 6], 'V_{\\text{in}}');
    k.route('VIN.P', 'U1.IN+');
    // - input: down the left, R_1 to ground, R_f back to the output underneath
    k.route('U1.IN-', [11, 8], [11, yF]);
    k.part('R1', 'resistor', [11, yF], { value: str(p, 'R_1'), rot: 90, tex: 'R_1', label: 'left' });
    k.part('GND', 'ground', [11, yF + 5]);
    k.route('R1.2', 'GND.G');
    k.part('RF', 'resistor', [14, yF], { value: str(p, 'R_f'), tex: 'R_f', label: 'below' });
    k.wire([11, yF], k.t('RF', '1'));
    k.wire(k.t('RF', '2'), [24, yF], [24, 7]);
    k.route('U1.OUT', [24, 7], [30, 7]);
    out(k, 'VOUT', [30, 7], 'V_{\\text{out}}', 'above');
    if (sup) {
      out(k, 'VCC', [17, 3], '+V_{\\text{CC}}', 'above');
      out(k, 'VEE', [17, 12], '−V_{\\text{EE}}', 'below');
      k.route('U1.V+', 'VCC.P');
      k.route('U1.V-', 'VEE.P');
    }
    k.text('A_v\\;=\\;1\\;+\\;R_f/R_1', [26, yF + 2], 'start');
    return k.build(this.title);
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Inverting amplifier: R_in into the - input, R_f over the top, + input to ground.
// ---------------------------------------------------------------------------------------------------------------------
export const invertingAmplifier: Archetype = {
  id: 'inverting_amplifier',
  title: 'Inverting op-amp amplifier',
  aliases: ['inverting op amp', 'inverting opamp amplifier', 'inverting op-amp amplifier', 'inverting amp'],
  summary: 'V_in via R_in to -, R_f feedback, + grounded; A_v = -R_f/R_in.',
  params: [R_PARAM('R_in', 'Input resistance R_in', '1 kΩ'), R_PARAM('R_f', 'Feedback resistance R_f', '10 kΩ')],
  build(p) {
    const k = new Kit();
    k.part('U1', 'opamp', [14, 5], { tex: 'A_1', label: 'below' });
    out(k, 'VIN', [3, 5], 'V_{\\text{in}}');
    k.part('RIN', 'resistor', [5, 5], { value: str(p, 'R_in'), tex: 'R_{\\text{in}}', label: 'above' });
    k.wire([3, 5], k.t('RIN', '1'));
    k.route('RIN.2', [12, 5], 'U1.IN-');
    // feedback over the top
    k.part('RF', 'resistor', [14, 1], { value: str(p, 'R_f'), tex: 'R_f', label: 'above' });
    k.wire([12, 5], [12, 1], k.t('RF', '1'));
    k.wire(k.t('RF', '2'), [24, 1], [24, 6]);
    k.route('U1.OUT', [24, 6], [30, 6]);
    out(k, 'VOUT', [30, 6], 'V_{\\text{out}}', 'above');
    // + input to ground
    k.part('GND', 'ground', [12, 9]);
    k.route('U1.IN+', [12, 7], 'GND.G');
    k.text('A_v\\;=\\;−R_f/R_{\\text{in}}', [22, 9], 'start');
    return k.build(this.title);
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Inverting summing amplifier with 2..4 inputs: each V_i through R_i onto the summing bus (the - input), R_f over the top.
// ---------------------------------------------------------------------------------------------------------------------
export const invertingSummingAmplifier: Archetype = {
  id: 'inverting_summing_amplifier',
  title: 'Inverting summing amplifier',
  aliases: ['summing amplifier', 'inverting summer', 'op amp adder', 'summing op amp', 'inverting adder', 'weighted summer'],
  summary: 'V_1..V_n via R_1..R_n to the summing node, R_f feedback; V_out = -R_f(sum V_i/R_i).',
  params: [
    { name: 'inputs', label: 'Number of inputs', kind: 'int', default: 3, min: 2, max: 4 },
    R_PARAM('R_1', 'Input resistance R_1', '10 kΩ'),
    R_PARAM('R_2', 'Input resistance R_2', '10 kΩ'),
    R_PARAM('R_3', 'Input resistance R_3', '10 kΩ'),
    R_PARAM('R_4', 'Input resistance R_4 (4 inputs)', '10 kΩ'),
    R_PARAM('R_f', 'Feedback resistance R_f', '10 kΩ'),
  ],
  build(p) {
    const k = new Kit();
    const n = Number(p.inputs);
    const y0 = 4, dy = 4;
    const yLast = y0 + dy * (n - 1);
    const yFb = y0 - 3;
    for (let i = 1; i <= n; i++) {
      const y = y0 + dy * (i - 1);
      out(k, `V${i}`, [3, y], `V_${i}`, 'above');
      k.part(`R${i}`, 'resistor', [5, y], { value: str(p, `R_${i}`), tex: `R_${i}`, label: 'above' });
      k.wire([3, y], k.t(`R${i}`, '1'));
      k.wire(k.t(`R${i}`, '2'), [12, y]);
    }
    k.part('U1', 'opamp', [14, yLast], { tex: 'A_1', label: 'below' });
    k.wire([12, yFb], [12, yLast]); // the summing bus
    k.wire([12, yLast], k.t('U1', 'IN-'));
    k.part('RF', 'resistor', [14, yFb], { value: str(p, 'R_f'), tex: 'R_f', label: 'above' });
    k.wire([12, yFb], k.t('RF', '1'));
    const xo = 24;
    k.wire(k.t('RF', '2'), [xo, yFb], [xo, yLast + 1]);
    k.route('U1.OUT', [xo, yLast + 1], [30, yLast + 1]);
    out(k, 'VOUT', [30, yLast + 1], 'V_{\\text{out}}', 'above');
    k.part('GND', 'ground', [12, yLast + 4]);
    k.route('U1.IN+', [12, yLast + 2], 'GND.G');
    const sum = Array.from({ length: n }, (_, i) => `V_${i + 1}/R_${i + 1}`).join('\\;+\\;');
    k.text(`V_{\\text{out}}\\;=\\;−R_f(${sum})`, [4, yLast + 8], 'start');
    return k.build(this.title);
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Instrumentation amplifier (three op-amps). A_1 is flipped (+ on top, V_1), A_2 is not (- on top, V_2): both - inputs face the
// middle, where R_G and the two R_1 feedback resistors sit, so no wire crosses another.
// ---------------------------------------------------------------------------------------------------------------------
export const instrumentationAmplifier: Archetype = {
  id: 'instrumentation_amplifier',
  title: 'Instrumentation amplifier (three op-amps)',
  aliases: ['instrumentation amp', 'in amp', 'inamp', 'three op amp instrumentation amplifier', 'instrumentation op amp', '3 op amp instrumentation amplifier'],
  summary: '3 op-amps: buffers A_1,A_2 with R_G and R_1, difference stage A_3 (R_2,R_3); A_v = (1+2R_1/R_G)(R_3/R_2).',
  params: [
    R_PARAM('R_G', 'Gain resistor R_G', '1 kΩ'),
    R_PARAM('R_1', 'Input-stage feedback R_1 (two matched)', '10 kΩ'),
    R_PARAM('R_2', 'Difference-stage input R_2 (two matched)', '10 kΩ'),
    R_PARAM('R_3', 'Difference-stage feedback R_3 (two matched)', '10 kΩ'),
  ],
  build(p) {
    const k = new Kit();
    const R1 = str(p, 'R_1'), R2 = str(p, 'R_2'), R3 = str(p, 'R_3');
    k.part('U1', 'opamp', [12, 8], { flip: true, tex: 'A_1', label: 'above' });
    k.part('U2', 'opamp', [12, 18], { tex: 'A_2', label: 'below' });
    out(k, 'V1', [3, 6], 'V_1');
    out(k, 'V2', [3, 20], 'V_2');
    k.route('V1.P', 'U1.IN+');
    k.route('V2.P', 'U2.IN+');
    // R_G between the two inverting inputs
    k.route('U1.IN-', [9, 8]);
    k.route('U2.IN-', [9, 18]);
    k.part('RG', 'resistor', [9, 11], { value: str(p, 'R_G'), rot: 90, tex: 'R_G', label: 'left' });
    k.wire([9, 8], k.t('RG', '1'));
    k.wire(k.t('RG', '2'), [9, 18]);
    // feedback resistors inside the middle region
    k.part('R1', 'resistor', [14, 10], { value: R1, tex: 'R_1', label: 'above' });
    k.part('R4', 'resistor', [14, 16], { value: R1, tex: 'R_1', label: 'below' });
    k.wire([9, 10], k.t('R1', '1'));
    k.wire([9, 16], k.t('R4', '1'));
    k.wire(k.t('R1', '2'), [21, 10], [21, 7]);
    k.wire(k.t('R4', '2'), [21, 16], [21, 19]);
    // outputs to the difference amplifier A_3 (- input on top)
    k.part('U3', 'opamp', [32, 11], { tex: 'A_3', label: 'below' });
    k.route('U1.OUT', [21, 7]);
    k.part('R2', 'resistor', [24, 7], { value: R2, tex: 'R_2', label: 'above' });
    k.wire([21, 7], k.t('R2', '1'));
    k.wire(k.t('R2', '2'), [30, 7], [30, 11], k.t('U3', 'IN-'));
    k.part('R5', 'resistor', [24, 19], { value: R2, tex: 'R_2', label: 'below' });
    k.route('U2.OUT', [21, 19]);
    k.wire([21, 19], k.t('R5', '1'));
    k.wire(k.t('R5', '2'), [30, 19], [30, 13], k.t('U3', 'IN+'));
    k.part('R3', 'resistor', [34, 9], { value: R3, tex: 'R_3', label: 'above' });
    k.wire([30, 9], k.t('R3', '1'));
    k.wire(k.t('R3', '2'), [41, 9], [41, 12]);
    k.route('U3.OUT', [41, 12], [46, 12]);
    out(k, 'VOUT', [46, 12], 'V_{\\text{out}}', 'above');
    k.part('R6', 'resistor', [34, 15], { value: R3, rot: 90, tex: 'R_3', label: 'right' });
    k.wire([30, 15], k.t('R6', '1'));
    k.part('GND', 'ground', [34, 20]);
    k.route('R6.2', 'GND.G');
    k.text('A_v\\;=\\;(1+2R_1/R_G)(R_3/R_2)', [24, 25], 'start');
    return k.build(this.title);
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Sallen-Key low-pass: R_1 - R_2 in series, C_2 from the R_2 side to ground, C_1 from the R_1/R_2 node back to the output.
// ---------------------------------------------------------------------------------------------------------------------
export const sallenKeyLowpass: Archetype = {
  id: 'sallen_key_lowpass',
  title: 'Sallen-Key second-order low-pass filter',
  aliases: ['sallen key low pass', 'sallen-key lowpass', 'sallen key filter', 'second order low pass filter', 'sallen key', 'active low pass filter'],
  summary: '2nd-order low-pass: R_1,R_2,C_1 (to OUT),C_2 (to ground), follower; equal_component adds gain K=1+R_a/R_b (R_2=R_1, C_2=C_1).',
  params: [
    { name: 'gain', label: 'unity follower, or equal-component with gain K = 1 + R_a/R_b', kind: 'choice', default: 'unity', choices: ['unity', 'equal_component'] },
    R_PARAM('R_1', 'Resistance R_1', '10 kΩ'),
    R_PARAM('R_2', 'Resistance R_2 (unity only; equal_component uses R_1)', '10 kΩ'),
    C_PARAM('C_1', 'Feedback capacitance C_1', '10 nF'),
    C_PARAM('C_2', 'Grounded capacitance C_2 (unity only; equal_component uses C_1)', '10 nF'),
    R_PARAM('R_b', 'Gain-network resistor R_b to ground (equal_component)', '10 kΩ'),
    R_PARAM('R_a', 'Gain-network resistor R_a from the output (equal_component)', '5.86 kΩ'),
  ],
  build(p) {
    const k = new Kit();
    const eq = str(p, 'gain') === 'equal_component';
    const R1 = str(p, 'R_1'), C1 = str(p, 'C_1');
    const R2 = eq ? R1 : str(p, 'R_2'), C2 = eq ? C1 : str(p, 'C_2');
    k.part('U1', 'opamp', [22, 8], { flip: true, tex: 'A_1', label: 'above' });
    out(k, 'VIN', [3, 6], 'V_{\\text{in}}');
    k.part('R1', 'resistor', [5, 6], { value: R1, tex: 'R_1', label: 'above' });
    k.part('R2', 'resistor', [13, 6], { value: R2, tex: 'R_2', label: 'above' });
    k.wire([3, 6], k.t('R1', '1'));
    k.wire(k.t('R1', '2'), k.t('R2', '1'));
    k.wire(k.t('R2', '2'), [19, 6], k.t('U1', 'IN+'));
    // C_2 from the R_2 / + input node down to ground
    k.part('C2', 'capacitor', [19, 6], { value: C2, rot: 90, tex: 'C_2', label: 'left' });
    k.part('GND2', 'ground', [19, 10]);
    k.route('C2.2', 'GND2.G');
    // C_1 from the R_1 / R_2 node over the top to the output
    k.part('C1', 'capacitor', [17, 1], { value: C1, tex: 'C_1', label: 'above' });
    k.wire([9, 6], [9, 1], k.t('C1', '1'));
    k.wire(k.t('C1', '2'), [31, 1], [31, 7]);
    k.route('U1.OUT', [31, 7], [37, 7]);
    out(k, 'VOUT', [37, 7], 'V_{\\text{out}}', 'above');
    if (!eq) {
      k.route('U1.IN-', [22, 12], [31, 12], [31, 7]);
      k.text('f_c\\;=\\;1/(2π√(R_1R_2C_1C_2))', [3, 14], 'start');
      k.text('Q\\;=\\;√(R_1R_2C_1C_2)/(C_2(R_1+R_2))', [3, 16], 'start');
    } else {
      k.route('U1.IN-', [22, 11]);
      k.part('RA', 'resistor', [24, 11], { value: str(p, 'R_a'), tex: 'R_a', label: 'above' });
      k.wire([22, 11], k.t('RA', '1'));
      k.wire(k.t('RA', '2'), [31, 11], [31, 7]);
      k.part('RB', 'resistor', [22, 11], { value: str(p, 'R_b'), rot: 90, tex: 'R_b', label: 'left' });
      k.part('GND', 'ground', [22, 16]);
      k.route('RB.2', 'GND.G');
      k.text('R_1=R_2=R,\\;\\;C_1=C_2=C,\\;\\;K\\;=\\;1+R_a/R_b', [3, 18], 'start');
      k.text('f_c\\;=\\;1/(2πRC),\\;\\;Q\\;=\\;1/(3−K)', [3, 20], 'start');
    }
    return k.build(this.title);
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Multiple-feedback band-pass (equal capacitors C_1 = C_2 = C).
// ---------------------------------------------------------------------------------------------------------------------
export const mfbBandpass: Archetype = {
  id: 'mfb_bandpass',
  title: 'Multiple-feedback band-pass filter',
  aliases: ['multiple feedback band pass filter', 'multiple feedback bandpass', 'mfb band pass', 'mfb bandpass filter', 'band pass active filter', 'rauch band pass'],
  summary: 'MFB band-pass: R_1, C_1 (to -), C_2 (to OUT), R_2 (to ground), R_3 feedback; C_1=C_2=C.',
  params: [
    R_PARAM('R_1', 'Input resistance R_1', '10 kΩ'),
    R_PARAM('R_2', 'Resistance R_2 from the node to ground', '10 kΩ'),
    R_PARAM('R_3', 'Feedback resistance R_3', '100 kΩ'),
    C_PARAM('C', 'Capacitance C (C_1 = C_2)', '10 nF'),
  ],
  build(p) {
    const k = new Kit();
    const C = str(p, 'C');
    k.part('U1', 'opamp', [19, 6], { tex: 'A_1', label: 'below' });
    out(k, 'VIN', [3, 6], 'V_{\\text{in}}');
    k.part('R1', 'resistor', [5, 6], { value: str(p, 'R_1'), tex: 'R_1', label: 'above' });
    k.wire([3, 6], k.t('R1', '1'));
    k.wire(k.t('R1', '2'), [11, 6]); // node X
    k.part('C1', 'capacitor', [13, 6], { value: C, tex: 'C_1', label: 'above' });
    k.wire([11, 6], k.t('C1', '1'));
    k.wire(k.t('C1', '2'), [17, 6], k.t('U1', 'IN-'));
    k.part('R2', 'resistor', [11, 6], { value: str(p, 'R_2'), rot: 90, tex: 'R_2', label: 'left' });
    k.part('GND', 'ground', [11, 11]);
    k.route('R2.2', 'GND.G');
    k.part('GND2', 'ground', [17, 11]);
    k.route('U1.IN+', [17, 8], 'GND2.G');
    // R_3: - input to OUT (inner loop); C_2: node X to OUT (outer loop)
    k.part('R3', 'resistor', [19, 2], { value: str(p, 'R_3'), tex: 'R_3', label: 'above' });
    k.wire([17, 6], [17, 2], k.t('R3', '1'));
    k.wire(k.t('R3', '2'), [28, 2], [28, 7]);
    k.part('C2', 'capacitor', [19, -2], { value: C, tex: 'C_2', label: 'above' });
    k.wire([11, 6], [11, -2], k.t('C2', '1'));
    k.wire(k.t('C2', '2'), [31, -2], [31, 7]);
    k.route('U1.OUT', [28, 7], [31, 7], [37, 7]);
    out(k, 'VOUT', [37, 7], 'V_{\\text{out}}', 'above');
    k.text('f_0\\;=\\;(1/2πC)√((R_1+R_2)/(R_1R_2R_3)),\\;\\;Q\\;=\\;πf_0R_3C', [3, 15], 'start');
    k.text('A_0\\;=\\;−R_3/(2R_1)\\text{ at }f_0,\\;\\;C_1=C_2=C', [3, 17], 'start');
    return k.build(this.title);
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Twin-T notch: upper T (R, R, 2C to ground), lower T (C, C, R/2 to ground), both between V_in and V_out.
// ---------------------------------------------------------------------------------------------------------------------
export const twinTNotch: Archetype = {
  id: 'twin_t_notch',
  title: 'Twin-T notch filter',
  aliases: ['twin t notch filter', 'twin-t notch', 'twin t filter', 'twin t', 'notch filter', 'twin t network'],
  summary: 'Passive twin-T (R,R,2C and C,C,R/2) between V_in and V_out; f = 1/(4πRC); buffer adds a follower.',
  params: [
    R_PARAM('R', 'Resistance R', '10 kΩ'),
    C_PARAM('C', 'Capacitance C', '10 nF'),
    { name: 'buffer', label: 'Op-amp voltage-follower buffer on the output', kind: 'bool', default: false },
  ],
  build(p) {
    const k = new Kit();
    const R = str(p, 'R'), C = str(p, 'C');
    const buf = p.buffer === true;
    out(k, 'VIN', [3, 8], 'V_{\\text{in}}');
    k.wire([3, 8], [6, 8]);
    k.wire([6, 2], [6, 14]);
    // upper T: R - R, 2C to ground
    k.part('R1', 'resistor', [8, 2], { value: R, tex: 'R', label: 'above' });
    k.part('R2', 'resistor', [16, 2], { value: R, tex: 'R', label: 'above' });
    k.wire([6, 2], k.t('R1', '1'));
    k.wire(k.t('R1', '2'), k.t('R2', '1'));
    k.wire(k.t('R2', '2'), [24, 2]);
    k.part('C3', 'capacitor', [14, 3], { value: scaled(C, 2, 'F'), rot: 90, tex: '2{C}', label: 'right' });
    k.wire([14, 2], k.t('C3', '1'));
    // lower T: C - C, R/2 to ground
    k.part('C1', 'capacitor', [8, 14], { value: C, tex: 'C', label: 'below' });
    k.part('C2', 'capacitor', [16, 14], { value: C, tex: 'C', label: 'below' });
    k.wire([6, 14], k.t('C1', '1'));
    k.wire(k.t('C1', '2'), [14, 14]);
    k.wire([14, 14], k.t('C2', '1'));
    k.wire(k.t('C2', '2'), [24, 14]);
    k.part('R3', 'resistor', [14, 10], { value: scaled(R, 0.5, 'ohm'), rot: 90, tex: '{R}/2', label: 'right' });
    // shared ground
    k.part('GND', 'ground', [18, 8]);
    k.wire(k.t('C3', '2'), [14, 8], [18, 8]);
    k.wire([14, 8], k.t('R3', '1'));
    // output node
    k.wire([24, 2], [24, 14]);
    if (buf) {
      k.part('U1', 'opamp', [28, 10], { flip: true, tex: 'A_1', label: 'above' });
      k.wire([24, 8], [26, 8], k.t('U1', 'IN+'));
      k.route('U1.IN-', [26, 10], [26, 12], [35, 12], [35, 9]);
      k.route('U1.OUT', [35, 9], [40, 9]);
      out(k, 'VOUT', [40, 9], 'V_{\\text{out}}', 'above');
    } else {
      k.wire([24, 8], [30, 8]);
      out(k, 'VOUT', [30, 8], 'V_{\\text{out}}', 'above');
    }
    k.text('f_{\\text{notch}}\\;=\\;1/(4πRC)', [3, 18], 'start');
    return k.build(this.title);
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Precision half-wave rectifier (two-diode inverting "super-diode"): D_1 clamps the op-amp output when V_in > 0,
// D_2 passes it to the output when V_in < 0, so V_out = -(R_2/R_1)V_in for V_in < 0 and 0 otherwise.
// ---------------------------------------------------------------------------------------------------------------------
export const precisionHalfWaveRectifier: Archetype = {
  id: 'precision_half_wave_rectifier',
  title: 'Precision half-wave rectifier (super-diode)',
  aliases: ['superdiode', 'super diode', 'precision rectifier', 'active half wave rectifier', 'precision half wave rectifier', 'ideal diode op amp'],
  summary: 'Super-diode: A_1, R_1, R_2, D_1, D_2, load R_L; V_out = -(R_2/R_1)V_in for V_in<0, else 0.',
  params: [R_PARAM('R_1', 'Input resistance R_1', '10 kΩ'), R_PARAM('R_2', 'Feedback resistance R_2', '10 kΩ'), R_PARAM('R_L', 'Load resistance R_L', '10 kΩ')],
  build(p) {
    const k = new Kit();
    k.part('U1', 'opamp', [14, 5], { tex: 'A_1', label: 'below' });
    out(k, 'VIN', [3, 5], 'V_{\\text{in}}');
    k.part('R1', 'resistor', [5, 5], { value: str(p, 'R_1'), tex: 'R_1', label: 'above' });
    k.wire([3, 5], k.t('R1', '1'));
    k.route('R1.2', [12, 5], 'U1.IN-');
    k.route('U1.IN+', [12, 7], [12, 9]);
    k.part('GND1', 'ground', [12, 9]);
    // D_1 across the op-amp: anode at the - input node, cathode at OUT
    k.part('D1', 'diode', [14, 2], { tex: 'D_1', label: 'above' });
    k.wire([12, 5], [12, 2], k.t('D1', 'A'));
    k.wire(k.t('D1', 'K'), [23, 2], [23, 6]);
    k.route('U1.OUT', [23, 6]);
    // D_2 from OUT to the output node; R_2 from the - input node to the output node
    k.part('D2', 'diode', [24, 6], { tex: 'D_2', label: 'above' });
    k.wire([23, 6], k.t('D2', 'A'));
    k.wire(k.t('D2', 'K'), [31, 6]);
    k.part('R2', 'resistor', [14, -2], { value: str(p, 'R_2'), tex: 'R_2', label: 'above' });
    k.wire([12, 2], [12, -2], k.t('R2', '1'));
    k.wire(k.t('R2', '2'), [31, -2], [31, 6]);
    k.part('RL', 'resistor', [31, 6], { value: str(p, 'R_L'), rot: 90, tex: 'R_L', label: 'right' });
    k.part('GND2', 'ground', [31, 11]);
    k.route('RL.2', 'GND2.G');
    k.wire([31, 6], [36, 6]);
    out(k, 'VOUT', [36, 6], 'V_{\\text{out}}', 'above');
    k.text('V_{\\text{out}}\\;=\\;−(R_2/R_1)V_{\\text{in}}\\;\\;(V_{\\text{in}}\\;<\\;0)', [3, 13], 'start');
    k.text('V_{\\text{out}}\\;=\\;0\\;\\;(V_{\\text{in}}\\;\\geq\\;0)', [3, 15], 'start');
    return k.build(this.title);
  },
};

export const ARCHETYPE_LIST: readonly Archetype[] = [
  nonInvertingAmplifier,
  invertingAmplifier,
  invertingSummingAmplifier,
  instrumentationAmplifier,
  sallenKeyLowpass,
  mfbBandpass,
  twinTNotch,
  precisionHalfWaveRectifier,
];
