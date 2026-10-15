// Reference specs (also used as test fixtures and as the worked example in the LLM prompt).

export const VOLTAGE_DIVIDER = {
  title: 'Voltage divider',
  parts: [
    { id: 'V1', type: 'vsource', value: '10 V', at: [4, 2], rot: 90 },
    { id: 'R1', type: 'resistor', value: '10 kΩ', at: [6, 2] },
    { id: 'R2', type: 'resistor', value: '10 kΩ', at: [12, 2], rot: 90 },
    { id: 'GND1', type: 'ground', at: [8, 8] },
  ],
  wires: [
    { pts: [[4, 2], [6, 2]] },
    { pts: [[10, 2], [12, 2]] },
    { pts: [[4, 6], [4, 8], [8, 8]] },
    { pts: [[12, 6], [12, 8], [8, 8]] },
  ],
  labels: [{ text: 'Vout', at: [12, 2], anchor: 'start' }],
};

export const BUCK_CONVERTER = {
  title: '5 V buck converter',
  parts: [
    { id: 'V1', type: 'vsource', value: '12 V', at: [4, 2], rot: 90 },
    { id: 'S1', type: 'switch', at: [8, 2], attrs: { control: 'PWM' } },
    { id: 'D1', type: 'diode', at: [14, 6], rot: 270 },
    { id: 'L1', type: 'inductor', value: '50 uH', at: [16, 2] },
    { id: 'C1', type: 'capacitor', value: '47 uF', at: [24, 2], rot: 90 },
    { id: 'R1', type: 'resistor', value: '2.5 Ω', at: [30, 2], rot: 90 },
    { id: 'GND1', type: 'ground', at: [14, 8] },
  ],
  wires: [
    { pts: [[4, 2], [8, 2]] },
    { pts: [[12, 2], [16, 2]] },
    { pts: [[14, 3], [14, 2]] },
    { pts: [[20, 2], [24, 2]] },
    { pts: [[24, 2], [30, 2]] },
    { pts: [[4, 6], [4, 8], [14, 8]] },
    { pts: [[14, 6], [14, 8]] },
    { pts: [[14, 8], [30, 8]] },
    { pts: [[24, 5], [24, 8]] },
    { pts: [[30, 6], [30, 8]] },
  ],
  labels: [{ text: 'Vout', at: [27, 2], anchor: 'middle' }, { text: 'SW', at: [13, 2], anchor: 'middle' }],
};

export const INVERTING_OPAMP = {
  title: 'Inverting amplifier',
  parts: [
    { id: 'VIN', type: 'port', value: 'Vin', at: [2, 4] },
    { id: 'R1', type: 'resistor', value: '10 kΩ', at: [6, 4] },
    { id: 'R2', type: 'resistor', value: '100 kΩ', at: [12, 0] },
    { id: 'U1', type: 'opamp', at: [14, 4] },
    { id: 'GND1', type: 'ground', at: [12, 8] },
    { id: 'VOUT', type: 'port', value: 'Vout', at: [24, 5] },
  ],
  wires: [
    { pts: [[2, 4], [6, 4]] },
    { pts: [[10, 4], [14, 4]] },
    { pts: [[12, 4], [12, 0]] },
    { pts: [[16, 0], [22, 0], [22, 5]] },
    { pts: [[14, 6], [12, 6], [12, 8]] },
    { pts: [[20, 5], [24, 5]] },
  ],
  labels: [],
};

export const RC_LOWPASS = {
  title: 'RC low-pass filter',
  parts: [
    { id: 'VIN', type: 'port', value: 'Vin', at: [2, 4] },
    { id: 'R1', type: 'resistor', value: '1.6 kΩ', at: [4, 4] },
    { id: 'C1', type: 'capacitor', value: '100 nF', at: [12, 4], rot: 90 },
    { id: 'GND1', type: 'ground', at: [12, 9] },
    { id: 'VOUT', type: 'port', value: 'Vout', at: [16, 4] },
  ],
  wires: [
    { pts: [[2, 4], [4, 4]] },
    { pts: [[8, 4], [12, 4]] },
    { pts: [[12, 4], [16, 4]] },
    { pts: [[12, 7], [12, 9]] },
  ],
  labels: [],
};

export const PID_LOOP = {
  title: 'Unity-feedback PID loop',
  parts: [
    { id: 'IN', type: 'port', value: 'r(t)', at: [2, 6] },
    { id: 'SUM1', type: 'sum', at: [5, 6], attrs: { signs: { W: '+', S: '-' } } },
    { id: 'C', type: 'block', value: 'C(s) = PID', at: [10, 6], attrs: { w: 6, h: 2 } },
    { id: 'G', type: 'block', value: 'G(s)', at: [20, 6], attrs: { w: 6, h: 2 } },
    { id: 'OUT', type: 'port', value: 'y(t)', at: [34, 6] },
  ],
  wires: [
    { pts: [[2, 6], [5, 6]], arrow: true },
    { pts: [[7, 6], [10, 6]], arrow: true },
    { pts: [[16, 6], [20, 6]], arrow: true },
    { pts: [[26, 6], [34, 6]] },
    { pts: [[30, 6], [30, 11], [6, 11], [6, 7]], arrow: true },
  ],
  labels: [{ text: 'e(t)', at: [8, 6], anchor: 'middle' }, { text: 'u(t)', at: [18, 6], anchor: 'middle' }],
};

export const BJT_CE_STAGE = {
  title: 'BJT common-emitter stage',
  parts: [
    { id: 'VCC1', type: 'rail', value: '+12 V', at: [12, -1] },
    { id: 'VCC2', type: 'rail', value: '+12 V', at: [6, -1] },
    { id: 'RC', type: 'resistor', value: '4.7 kΩ', at: [12, 0], rot: 90 },
    { id: 'R1', type: 'resistor', value: '47 kΩ', at: [6, 0], rot: 90 },
    { id: 'R2', type: 'resistor', value: '10 kΩ', at: [6, 6], rot: 90 },
    { id: 'Q1', type: 'npn', at: [10, 6] },
    { id: 'RE', type: 'resistor', value: '1 kΩ', at: [12, 8], rot: 90 },
    { id: 'C1', type: 'capacitor', value: '10 uF', at: [1, 6] },
    { id: 'VIN', type: 'port', value: 'Vin', at: [-1, 6] },
    { id: 'VOUT', type: 'port', value: 'Vout', at: [16, 4] },
    { id: 'GND1', type: 'ground', at: [6, 10] },
    { id: 'GND2', type: 'ground', at: [12, 12] },
  ],
  wires: [
    { pts: [[-1, 6], [1, 6]] },
    { pts: [[4, 6], [6, 6]] },
    { pts: [[12, -1], [12, 0]] },
    { pts: [[6, -1], [6, 0]] },
    { pts: [[6, 4], [6, 6]] },
    { pts: [[6, 6], [10, 6]] },
    { pts: [[12, 4], [16, 4]] },
  ],
  labels: [],
};

export const REFERENCE_SPECS = { VOLTAGE_DIVIDER, BUCK_CONVERTER, INVERTING_OPAMP, RC_LOWPASS, PID_LOOP, BJT_CE_STAGE } as const;
