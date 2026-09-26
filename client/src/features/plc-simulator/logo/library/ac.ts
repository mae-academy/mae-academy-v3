import type { LogoScenario } from '../scenarios';
import { block, dev, gate, inputs8, load, loads4, not, on, ref, sec, toM, toQ, X } from './dsl';

/**
 * 230 V AC building-automation suite (LOGO! 230RC). Relay outputs switch 230 V loads through their
 * dry contacts; limit switches, STOP buttons and floats that must fail safe are break contacts (NC).
 */

const { I, Q, B } = ref;

export const STAIRWAY_PREWARN: LogoScenario = {
  id: 'stairway',
  group: 'ac',
  device: '230RC',
  title: 'Stairway lighting with pre-warning blink',
  chapter: 'AC 01',
  summary: 'Stairway switch (T = 30 s) blinks Q1 off for 1 s, 5 s before cut-off; pulse-relay corridor light on Q2; off-delay landing lamp on Q3.',
  program: {
    name: 'STAIRWAY',
    blocks: [
      block(1, 'STAIRWAY', { Trg: on(I(1)) }, { T: sec(30), 'T!': sec(5), 'T!L': sec(1) }),
      block(2, 'PULSE_RELAY', { Trg: on(I(2)), S: X, R: on(I(3)) }, { Par: 'RS' }),
      block(3, 'OFF_DELAY', { Trg: on(I(4)), R: on(I(3)) }, { T: sec(10) }),
    ],
    sinks: [toQ(1, B(1)), toQ(2, B(2)), toQ(3, B(3))],
  },
  inputs: inputs8([
    dev('pushbutton', 'NO', 'S1', 'Stair buttons'),
    dev('pushbutton', 'NO', 'S2', 'Corridor button'),
    dev('pushbutton', 'NO', 'S3', 'Central OFF'),
    dev('pushbutton', 'NO', 'S4', 'Landing button'),
  ]),
  loads: loads4([load('lamp', 'H1', 'Stair lights'), load('lamp', 'H2', 'Corridor lights'), load('lamp', 'H3', 'Landing lamp')]),
};

const HALLWAY_IMPULSE: LogoScenario = {
  id: 'hallway-impulse',
  group: 'ac',
  device: '230RC',
  title: 'Dual-station hallway impulse switching',
  chapter: 'AC 02',
  summary: 'Either momentary station toggles the hallway light through a pulse relay; central OFF resets it (RS priority).',
  program: {
    name: 'HALLWAY',
    blocks: [gate(1, 'OR', [on(I(1)), on(I(2))]), block(2, 'PULSE_RELAY', { Trg: on(B(1)), S: X, R: on(I(3)) }, { Par: 'RS' })],
    sinks: [toQ(1, B(2))],
  },
  inputs: inputs8([dev('pushbutton', 'NO', 'S1', 'Station A'), dev('pushbutton', 'NO', 'S2', 'Station B'), dev('pushbutton', 'NO', 'S3', 'Central OFF')]),
  loads: loads4([load('lamp', 'H1', 'Hallway lights')]),
};

/*
 * Each direction latches on its button and drops on STOP (NC), its end limit (NC) or the opposite
 * command. An off-delay on each Q is the anti-reversal deadband: the opposite direction can only latch
 * once the motor has been off for 1.5 s. The Qs are also interlocked through NOT read-backs.
 */
const ROLLER_SHUTTER: LogoScenario = {
  id: 'roller-shutter',
  group: 'ac',
  device: '230RC',
  title: 'Industrial roller shutter / garage door',
  chapter: 'AC 03',
  summary: 'UP/DOWN latches with limit-switch cut-off, STOP, K1/K2 interlock and a 1.5 s anti-reversal deadband.',
  program: {
    name: 'SHUTTER',
    blocks: [
      block(1, 'OFF_DELAY', { Trg: on(Q(1)), R: X }, { T: sec(1.5) }),
      block(2, 'OFF_DELAY', { Trg: on(Q(2)), R: X }, { T: sec(1.5) }),
      gate(5, 'AND', [on(I(1)), not(B(2))]),
      gate(6, 'OR', [not(I(3)), not(I(4)), on(I(2))]),
      block(3, 'LATCHING_RELAY', { S: on(B(5)), R: on(B(6)) }),
      gate(7, 'AND', [on(I(2)), not(B(1))]),
      gate(8, 'OR', [not(I(3)), not(I(5)), on(I(1))]),
      block(4, 'LATCHING_RELAY', { S: on(B(7)), R: on(B(8)) }),
      gate(9, 'AND', [on(B(3)), not(Q(2))]),
      gate(10, 'AND', [on(B(4)), not(Q(1))]),
    ],
    sinks: [toQ(1, B(9)), toQ(2, B(10))],
  },
  inputs: inputs8([
    dev('pushbutton', 'NO', 'S1', 'UP'),
    dev('pushbutton', 'NO', 'S2', 'DOWN'),
    dev('pushbutton', 'NC', 'S0', 'STOP'),
    dev('limit', 'NC', 'S3', 'Top limit'),
    dev('limit', 'NC', 'S4', 'Bottom limit', true),
  ]),
  loads: loads4([load('contactor', 'K1', 'Shutter UP'), load('contactor', 'K2', 'Shutter DOWN')]),
};

const BATH_FAN: LogoScenario = {
  id: 'bath-fan',
  group: 'ac',
  device: '230RC',
  title: 'Bathroom ventilation with run-on',
  chapter: 'AC 04',
  summary: 'The light switch runs light and fan together; an off-delay keeps the fan running 60 s after switch-off.',
  program: {
    name: 'BATHFAN',
    blocks: [gate(1, 'OR', [on(I(1))]), block(2, 'OFF_DELAY', { Trg: on(I(1)), R: X }, { T: sec(60) })],
    sinks: [toQ(1, B(1)), toQ(2, B(2))],
  },
  inputs: inputs8([dev('switch', 'NO', 'S1', 'Light switch')]),
  loads: loads4([load('lamp', 'H1', 'Bathroom light'), load('motor', 'M1', 'Extract fan')]),
};

/*
 * The high float starts a pumping cycle and the low float ends it. A pulse relay toggles on every
 * cycle end (inverted trigger = falling edge), alternating duty between the pumps. The flood float
 * runs both pumps and raises the alarm regardless of the duty state.
 */
const SUMP_DUPLEX: LogoScenario = {
  id: 'sump-duplex',
  group: 'ac',
  device: '230RC',
  title: 'Duplex sump pump with overflow alarm',
  chapter: 'AC 05',
  summary: 'High float starts, low float stops; duty alternates between P1/P2 each cycle; flood float runs both and sounds the alarm.',
  program: {
    name: 'SUMP',
    blocks: [
      block(1, 'LATCHING_RELAY', { S: on(I(2)), R: not(I(1)) }),
      block(2, 'PULSE_RELAY', { Trg: not(B(1)), S: X, R: X }, { Par: 'RS' }),
      gate(4, 'AND', [on(B(1)), not(B(2))]),
      gate(5, 'OR', [on(B(4)), on(I(3))]),
      gate(6, 'AND', [on(B(1)), on(B(2))]),
      gate(7, 'OR', [on(B(6)), on(I(3))]),
    ],
    sinks: [toQ(1, B(5)), toQ(2, B(7)), toQ(3, I(3))],
  },
  inputs: inputs8([dev('switch', 'NO', 'B1', 'Low float (wet)'), dev('switch', 'NO', 'B2', 'High float'), dev('switch', 'NO', 'B3', 'Flood float')]),
  loads: loads4([load('motor', 'M1', 'Pump P1'), load('motor', 'M2', 'Pump P2'), load('beacon', 'H1', 'Flood alarm')]),
};

/*
 * No RTC-based weekly timer is modelled, so the day is compressed: 1 s of simulation = 1 h. A pulse
 * generator is the sun (10 h day / 14 h night); the display window lights for the first 6 h of the
 * night (wiping relay), the security floods for the whole night.
 */
const SHOPFRONT_CLOCK: LogoScenario = {
  id: 'shopfront-clock',
  group: 'ac',
  device: '230RC',
  title: 'Shopfront illumination time schedule',
  chapter: 'AC 06',
  summary: 'Compressed day (1 s ≙ 1 h): display lights 6 h after dusk, floodlights all night, manual display override.',
  program: {
    name: 'SHOPFRNT',
    blocks: [
      block(1, 'PULSE_GENERATOR', { En: on(I(1)), Inv: X }, { TH: sec(10), TL: sec(14) }),
      gate(2, 'AND', [on(I(1)), not(B(1))]),
      block(3, 'WIPING_RELAY', { Trg: on(B(2)) }, { T: sec(6) }),
      gate(4, 'OR', [on(B(3)), on(I(2))]),
    ],
    sinks: [toQ(1, B(4)), toQ(2, B(2)), toQ(3, B(1))],
  },
  inputs: inputs8([dev('switch', 'NO', 'S1', 'Automatic mode'), dev('switch', 'NO', 'S2', 'Display override')]),
  loads: loads4([load('lamp', 'H1', 'Window display'), load('lamp', 'H2', 'Security floods'), load('lamp', 'H3', 'Daylight (sim.)')]),
};

const TWO_STAGE_HEATING: LogoScenario = {
  id: 'two-stage-heating',
  group: 'ac',
  device: '230RC',
  title: 'Two-stage electric heating',
  chapter: 'AC 07',
  summary: 'Thermostat demand starts stage 1 at once; stage 2 cuts in only if the deficit persists 30 s.',
  program: {
    name: 'HEATING',
    blocks: [gate(1, 'AND', [on(I(1)), on(I(2))]), block(2, 'ON_DELAY', { Trg: on(B(1)) }, { T: sec(30) })],
    sinks: [toQ(1, B(1)), toQ(2, B(2)), toQ(3, B(2))],
  },
  inputs: inputs8([dev('switch', 'NO', 'B1', 'Thermostat: below SP'), dev('switch', 'NO', 'S1', 'Heating enable')]),
  loads: loads4([load('contactor', 'K1', 'Stage 1 heater'), load('contactor', 'K2', 'Stage 2 heater'), load('lamp', 'H1', 'Stage 2 active')]),
};

const SECURITY_MOTION: LogoScenario = {
  id: 'security-motion',
  group: 'ac',
  device: '230RC',
  title: 'Exterior security light with override',
  chapter: 'AC 08',
  summary: 'PIR motion AND dusk sensor start a 20 s off-delay floodlight; a maintained bypass switch forces it on.',
  program: {
    name: 'SECURITY',
    blocks: [gate(1, 'AND', [on(I(1)), on(I(2))]), block(2, 'OFF_DELAY', { Trg: on(B(1)), R: X }, { T: sec(20) }), gate(3, 'OR', [on(B(2)), on(I(3))])],
    sinks: [toQ(1, B(3)), toQ(2, I(3))],
  },
  inputs: inputs8([dev('sensor', 'NO', 'B1', 'PIR detector'), dev('switch', 'NO', 'B2', 'Dusk sensor (dark)'), dev('switch', 'NO', 'S1', 'Manual bypass')]),
  loads: loads4([load('lamp', 'H1', 'Floodlight'), load('lamp', 'H2', 'Bypass active')]),
};

const EXHAUST_DAMPER: LogoScenario = {
  id: 'exhaust-damper',
  group: 'ac',
  device: '230RC',
  title: 'Exhaust damper purge cycling',
  chapter: 'AC 09',
  summary: 'Enabled: the fan runs and an asynchronous pulse generator opens the damper 8 s every 20 s.',
  program: {
    name: 'DAMPER',
    blocks: [block(1, 'PULSE_GENERATOR', { En: on(I(1)), Inv: X }, { TH: sec(8), TL: sec(12) })],
    sinks: [toQ(1, B(1)), toQ(2, I(1)), toQ(3, B(1))],
  },
  inputs: inputs8([dev('switch', 'NO', 'S1', 'Ventilation enable')]),
  loads: loads4([load('contactor', 'K1', 'Damper actuator'), load('motor', 'M1', 'Exhaust fan'), load('lamp', 'H1', 'Purge active')]),
};

/*
 * A latched alarm enables a slow burst generator (2 s on / 1 s off) which in turn enables a fast
 * tone generator (0.3 s / 0.2 s): the horn sounds in interrupted bursts until acknowledged.
 */
const SIREN_PATTERN: LogoScenario = {
  id: 'siren-pattern',
  group: 'ac',
  device: '230RC',
  title: 'Siren / bell alarm pattern generator',
  chapter: 'AC 10',
  summary: 'Alarm latches; two cascaded pulse generators give an interrupted horn pattern until acknowledged.',
  program: {
    name: 'SIREN',
    blocks: [
      block(1, 'LATCHING_RELAY', { S: on(I(1)), R: on(I(2)) }),
      block(2, 'PULSE_GENERATOR', { En: on(B(1)), Inv: X }, { TH: sec(2), TL: sec(1) }),
      block(3, 'PULSE_GENERATOR', { En: on(B(2)), Inv: X }, { TH: sec(0.3), TL: sec(0.2) }),
    ],
    sinks: [toQ(1, B(3)), toQ(2, B(1)), toM(1, B(2))],
  },
  inputs: inputs8([dev('pushbutton', 'NO', 'S1', 'Alarm trigger'), dev('pushbutton', 'NO', 'S2', 'Acknowledge')]),
  loads: loads4([load('beacon', 'H1', 'Horn / bell'), load('lamp', 'H2', 'Alarm latched')]),
};

export const AC_SUITE: readonly LogoScenario[] = [
  STAIRWAY_PREWARN,
  HALLWAY_IMPULSE,
  ROLLER_SHUTTER,
  BATH_FAN,
  SUMP_DUPLEX,
  SHOPFRONT_CLOCK,
  TWO_STAGE_HEATING,
  SECURITY_MOTION,
  EXHAUST_DAMPER,
  SIREN_PATTERN,
];
