// DC-DC converter archetypes.

import { Kit } from './kit';
import type { Archetype, ParamDef } from './types';

const BUCK_PARAMS: ParamDef[] = [
  { name: 'Vin', label: 'Input voltage V_in', kind: 'value', default: '12 V', unit: 'V', min: 0.1, max: 1000 },
  { name: 'L', label: 'Inductance L_1', kind: 'value', default: '100 µH', unit: 'H', min: 1e-9, max: 100 },
  { name: 'C', label: 'Output capacitance C_1', kind: 'value', default: '100 µF', unit: 'F', min: 1e-12, max: 1 },
  { name: 'R_load', label: 'Load resistance R_L', kind: 'value', default: '10 Ω', unit: 'ohm', min: 0.001, max: 1e8 },
  { name: 'switch', label: 'High-side switch symbol', kind: 'choice', default: 'switch', choices: ['switch', 'nmos', 'igbt'] },
];

export const buckConverter: Archetype = {
  id: 'buck_converter',
  title: 'Buck (step-down) converter',
  aliases: ['buck', 'step down converter', 'step-down converter', 'dc dc buck', 'buck regulator'],
  summary: 'V_in, high-side switch S_1 (PWM), freewheeling diode D_1 (anode to ground), L_1, C_1, load R_L, V_out.',
  params: BUCK_PARAMS,
  build(p) {
    const k = new Kit();
    const yTop = 2, yBot = 10;
    const sw = String(p.switch);
    k.part('VIN', 'vsource', [4, yTop], { value: String(p.Vin), rot: 90, tex: 'V_{\\text{in}}', label: 'left' });
    if (sw === 'switch') {
      k.part('S1', 'switch', [8, yTop], { attrs: { control: 'PWM' } });
    } else {
      // rot 270: drain and source on the rail (y = 2), gate lead hanging below the body
      k.part('Q1', sw === 'nmos' ? 'nmos' : 'igbt', [10, yTop + 2], { rot: 270, tex: 'S_1', label: 'above' });
      k.part('PWM', 'port', [10, yTop + 4], { value: 'PWM', label: 'right' });
      k.wire(k.t('Q1', 'G'), k.t('PWM', 'P'));
    }
    const swIn = sw === 'switch' ? k.t('S1', '1') : k.t('Q1', sw === 'nmos' ? 'D' : 'C');
    const swOut = sw === 'switch' ? k.t('S1', '2') : k.t('Q1', sw === 'nmos' ? 'S' : 'E');
    k.wire(k.t('VIN', '+'), swIn);

    k.part('D1', 'diode', [14, 6], { rot: 270, label: 'right' });
    k.part('L1', 'inductor', [16, yTop], { value: String(p.L) });
    k.part('C1', 'polarized_capacitor', [24, 4], { value: String(p.C), rot: 90, label: 'right' });
    k.part('RL', 'resistor', [32, 4], { value: String(p.R_load), rot: 90, tex: 'R_L', label: 'right' });
    k.part('GND', 'ground', [14, yBot]);

    k.wire(swOut, [14, yTop], k.t('L1', '1'));
    k.wire([14, 3], [14, yTop]);
    const XO = 40;
    k.wire(k.t('L1', '2'), [24, yTop], [32, yTop], [XO, yTop]);
    k.wire([24, yTop], k.t('C1', '+'));
    k.wire([32, yTop], k.t('RL', '1'));

    k.wire(k.t('VIN', '-'), [4, yBot]);
    k.wire([4, yBot], [14, yBot]);
    k.wire(k.t('D1', 'A'), [14, yBot]);
    k.wire([14, yBot], [24, yBot], [32, yBot], [XO, yBot]);
    k.wire(k.t('C1', '-'), [24, yBot]);
    k.wire(k.t('RL', '2'), [32, yBot]);

    k.part('OUTP', 'port', [XO, yTop], { value: '+', label: 'above' });
    k.part('OUTN', 'port', [XO, yBot], { value: '−', label: 'below' });
    k.text('V_{\\text{out}}', [XO + 1, (yTop + yBot) / 2], 'start');
    return k.build(this.title);
  },
};

export const ARCHETYPE_LIST: readonly Archetype[] = [buckConverter];
