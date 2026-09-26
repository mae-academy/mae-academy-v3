import type { LogoScenario } from '../scenarios';
import { block, dev, gate, inputs8, load, loads4, not, on, ref, sec, toM, toQ, X } from './dsl';

/**
 * 24 V DC machine-automation suite (LOGO! 12/24RC). STOP buttons and thermal-overload contacts are break
 * contacts (NC) so a broken wire stops the machine. Same-cycle feedback is always broken through a Q
 * or M read-back, which carries the previous cycle's value (spec §3.3).
 */

const { I, Q, M, B } = ref;

const DOL_STARTER: LogoScenario = {
  id: 'dol-starter',
  group: 'dc',
  device: '12/24RC',
  title: 'DOL motor starter with thermal trip',
  chapter: 'DC 11',
  summary: 'Three-wire START/STOP seal-in through the Q1 read-back; the NC overload contact drops the motor and lights the trip lamp.',
  program: {
    name: 'DOL',
    blocks: [gate(1, 'OR', [on(I(1)), on(Q(1))]), gate(2, 'AND', [on(B(1)), on(I(2)), on(I(3))]), block(3, 'NOT', { '1': on(I(3)) })],
    sinks: [toQ(1, B(2)), toQ(2, B(3)), toQ(3, B(2))],
  },
  inputs: inputs8([dev('pushbutton', 'NO', 'S1', 'START'), dev('pushbutton', 'NC', 'S0', 'STOP'), dev('switch', 'NC', 'F1', 'Overload 95-96')]),
  loads: loads4([load('motor', 'M1', 'Motor (K1)'), load('lamp', 'H1', 'Overload trip'), load('lamp', 'H2', 'Running')]),
};

/*
 * RUN is sealed in on flag M1. Star (Q1) and main (Q3) pull in together; after the 5 s acceleration
 * on-delay the star drops, and a second 50 ms on-delay (transit interlock) must expire before delta
 * (Q2) may pull in. Star and delta are additionally interlocked through NOT read-backs.
 */
const STAR_DELTA: LogoScenario = {
  id: 'star-delta',
  group: 'dc',
  device: '12/24RC',
  title: 'Star-delta (Y-Δ) reduced-voltage starter',
  chapter: 'DC 12',
  summary: 'Main + star for 5 s, star drops, 50 ms transit interlock, then delta. Seal-in on M1, NC STOP and overload.',
  program: {
    name: 'STARDLTA',
    blocks: [
      gate(1, 'OR', [on(I(1)), on(M(1))]),
      gate(2, 'AND', [on(B(1)), on(I(2)), on(I(3))]),
      block(3, 'ON_DELAY', { Trg: on(B(2)) }, { T: sec(5) }),
      block(4, 'ON_DELAY', { Trg: on(B(3)) }, { T: sec(0.05) }),
      gate(5, 'AND', [on(B(4)), not(Q(1))]),
      gate(6, 'AND', [on(B(2)), not(B(3)), not(Q(2))]),
    ],
    sinks: [toM(1, B(2)), toQ(1, B(6)), toQ(2, B(5)), toQ(3, B(2))],
  },
  inputs: inputs8([dev('pushbutton', 'NO', 'S1', 'START'), dev('pushbutton', 'NC', 'S0', 'STOP'), dev('switch', 'NC', 'F1', 'Overload 95-96')]),
  loads: loads4([load('contactor', 'K2', 'Star contactor'), load('contactor', 'K3', 'Delta contactor'), load('motor', 'M1', 'Main (K1)')]),
};

/*
 * Same latch/deadband structure as the roller shutter: an off-delay on each direction is the braking
 * pause (3 s) that must expire before the opposite direction can latch. Q3 shows the pause.
 */
const FWD_REV_BRAKE: LogoScenario = {
  id: 'fwd-rev-brake',
  group: 'dc',
  device: '12/24RC',
  title: 'Forward / reverse with braking pause',
  chapter: 'DC 13',
  summary: 'FWD/REV latches, NC STOP, K1/K2 interlock and a mandatory 3 s deadband before reversing; Q3 lights during the pause.',
  program: {
    name: 'FWDREV',
    blocks: [
      block(1, 'OFF_DELAY', { Trg: on(Q(1)), R: X }, { T: sec(3) }),
      block(2, 'OFF_DELAY', { Trg: on(Q(2)), R: X }, { T: sec(3) }),
      gate(5, 'AND', [on(I(1)), not(B(2))]),
      gate(6, 'OR', [not(I(3)), on(I(2))]),
      block(3, 'LATCHING_RELAY', { S: on(B(5)), R: on(B(6)) }),
      gate(7, 'AND', [on(I(2)), not(B(1))]),
      gate(8, 'OR', [not(I(3)), on(I(1))]),
      block(4, 'LATCHING_RELAY', { S: on(B(7)), R: on(B(8)) }),
      gate(9, 'AND', [on(B(3)), not(Q(2))]),
      gate(10, 'AND', [on(B(4)), not(Q(1))]),
      gate(11, 'AND', [on(B(1)), not(Q(1))]),
      gate(12, 'AND', [on(B(2)), not(Q(2))]),
      gate(13, 'OR', [on(B(11)), on(B(12))]),
    ],
    sinks: [toQ(1, B(9)), toQ(2, B(10)), toQ(3, B(13))],
  },
  inputs: inputs8([dev('pushbutton', 'NO', 'S1', 'FORWARD'), dev('pushbutton', 'NO', 'S2', 'REVERSE'), dev('pushbutton', 'NC', 'S0', 'STOP')]),
  loads: loads4([load('contactor', 'K1', 'Forward'), load('contactor', 'K2', 'Reverse'), load('lamp', 'H1', 'Braking pause')]),
};

/*
 * Watchdog: every part edge restarts an 8 s off-delay; a 0.1 s pulse at motor start seeds it. Running
 * (Q1 read-back) with the watchdog expired latches the jam fault, which drops the run latch.
 */
const CONVEYOR_JAM: LogoScenario = {
  id: 'conveyor-jam',
  group: 'dc',
  device: '12/24RC',
  title: 'Conveyor jam / stoppage monitor',
  chapter: 'DC 14',
  summary: 'Each part pulse re-arms an 8 s watchdog; no part within 8 s while running latches a jam fault and stops the belt.',
  program: {
    name: 'CONVEYOR',
    blocks: [
      block(7, 'WIPING_RELAY', { Trg: on(Q(1)) }, { T: sec(0.1) }),
      gate(8, 'OR', [on(I(3)), on(B(7))]),
      block(2, 'OFF_DELAY', { Trg: on(B(8)), R: X }, { T: sec(8) }),
      gate(6, 'AND', [on(Q(1)), not(B(2))]),
      block(5, 'LATCHING_RELAY', { S: on(B(6)), R: on(I(4)) }),
      gate(9, 'OR', [not(I(2)), on(B(5))]),
      block(1, 'LATCHING_RELAY', { S: on(I(1)), R: on(B(9)) }),
    ],
    sinks: [toQ(1, B(1)), toQ(2, B(5))],
  },
  inputs: inputs8([
    dev('pushbutton', 'NO', 'S1', 'START'),
    dev('pushbutton', 'NC', 'S0', 'STOP'),
    dev('pushbutton', 'NO', 'B1', 'Part photo-eye'),
    dev('pushbutton', 'NO', 'S2', 'Fault reset'),
  ]),
  loads: loads4([load('motor', 'M1', 'Conveyor drive'), load('beacon', 'H1', 'Jam fault')]),
};

/*
 * Auto latch on START, dropped by STOP or batch completion. Extend (Y1) while retracted, retract (Y2)
 * on the front reed switch: the bistable 5/2 valve reciprocates. The up-counter counts strokes and
 * stops the cycle after 5.
 */
const PNEUMATIC_RECIPRO: LogoScenario = {
  id: 'pneumatic-recipro',
  group: 'dc',
  device: '12/24RC',
  title: 'Pneumatic cylinder auto-reciprocation (A+/A−)',
  chapter: 'DC 15',
  summary: 'Reed switches drive a 5/2 bistable valve back and forth; an up-counter stops the batch after 5 strokes.',
  program: {
    name: 'PNEUMAT',
    blocks: [
      block(5, 'UP_DOWN_COUNTER', { R: on(I(1)), Cnt: on(I(3)), Dir: X }, { On: 5, Off: 0 }),
      gate(2, 'OR', [not(I(2)), on(B(5))]),
      block(1, 'LATCHING_RELAY', { S: on(I(1)), R: on(B(2)) }),
      gate(3, 'AND', [on(B(1)), on(I(4))]),
      gate(4, 'AND', [on(I(3))]),
    ],
    sinks: [toQ(1, B(3)), toQ(2, B(4)), toQ(3, B(5))],
  },
  inputs: inputs8([
    dev('pushbutton', 'NO', 'S1', 'START batch'),
    dev('pushbutton', 'NC', 'S0', 'STOP'),
    dev('limit', 'NO', 'B1', 'Reed A+ (front)'),
    dev('limit', 'NO', 'B0', 'Reed A− (rear)', true),
  ]),
  loads: loads4([load('contactor', 'Y1', 'Valve A+ extend'), load('contactor', 'Y2', 'Valve A− retract'), load('lamp', 'H1', 'Batch done')]),
};

/*
 * Up-counter on the bottle pulses; at 6 the off-delay opens the divert gate for 2 s. The counter is
 * reset through the Q1 read-back (a direct reset from the gate block would be a same-cycle loop).
 */
const BOTTLING_COUNTER: LogoScenario = {
  id: 'bottling-counter',
  group: 'dc',
  device: '12/24RC',
  title: 'Bottling line batch counter & gate sorter',
  chapter: 'DC 16',
  summary: 'Counts bottles; every 6th opens the divert gate for 2 s and restarts the count. Q2 runs the line.',
  program: {
    name: 'BOTTLING',
    blocks: [
      gate(3, 'OR', [on(I(2)), on(Q(1))]),
      block(1, 'UP_DOWN_COUNTER', { R: on(B(3)), Cnt: on(I(1)), Dir: X }, { On: 6, Off: 0 }),
      block(2, 'OFF_DELAY', { Trg: on(B(1)), R: X }, { T: sec(2) }),
    ],
    sinks: [toQ(1, B(2)), toQ(2, I(3)), toQ(3, B(2))],
  },
  inputs: inputs8([dev('pushbutton', 'NO', 'B1', 'Bottle sensor'), dev('pushbutton', 'NO', 'S1', 'Reset batch'), dev('switch', 'NO', 'S2', 'Line run')]),
  loads: loads4([load('contactor', 'Y1', 'Divert gate'), load('motor', 'M1', 'Line conveyor'), load('lamp', 'H1', 'Batch complete')]),
};

/*
 * Each button starts a 0.5 s wiping pulse: both pulses overlapping = both pressed within 500 ms. That
 * coincidence sets the stroke latch; releasing either button (NAND) resets it, so the press only runs
 * while both are held and the guard is closed. The "armed" latch (EN 574) is set only when both hands
 * are off (NOR) and cleared by the stroke itself (M1 read-back): one hand cannot re-trigger alone.
 */
const TWO_HAND: LogoScenario = {
  id: 'two-hand',
  group: 'dc',
  device: '12/24RC',
  title: 'Two-hand safety control station',
  chapter: 'DC 17',
  summary: 'Both buttons within 500 ms, both held, guard closed; both hands must be released before the next stroke.',
  program: {
    name: 'TWOHAND',
    blocks: [
      block(1, 'WIPING_RELAY', { Trg: on(I(1)) }, { T: sec(0.5) }),
      block(2, 'WIPING_RELAY', { Trg: on(I(2)) }, { T: sec(0.5) }),
      gate(8, 'NOR', [on(I(1)), on(I(2))]),
      block(7, 'LATCHING_RELAY', { S: on(B(8)), R: on(M(1)) }),
      gate(3, 'AND', [on(B(1)), on(B(2)), on(B(7))]),
      gate(5, 'NAND', [on(I(1)), on(I(2))]),
      block(4, 'LATCHING_RELAY', { S: on(B(3)), R: on(B(5)) }),
      gate(6, 'AND', [on(B(4)), on(I(3))]),
    ],
    sinks: [toM(1, B(4)), toQ(1, B(6)), toQ(2, B(7))],
  },
  inputs: inputs8([dev('pushbutton', 'NO', 'S1', 'Left hand'), dev('pushbutton', 'NO', 'S2', 'Right hand'), dev('limit', 'NO', 'S3', 'Guard closed', true)]),
  loads: loads4([load('contactor', 'Y1', 'Press valve'), load('lamp', 'H1', 'Armed (both released)')]),
};

/*
 * P1 (lead demand) and P2 (lag demand, 3 s start delay) pressure switches. A pulse relay toggles on the
 * end of each lead cycle, swapping which physical pump is lead.
 */
const BOOSTER_LEAD_LAG: LogoScenario = {
  id: 'booster-lead-lag',
  group: 'dc',
  device: '12/24RC',
  title: 'Two-pump booster with lead-lag cycling',
  chapter: 'DC 18',
  summary: 'Low pressure starts the lead pump, low-low adds the lag pump after 3 s; lead duty alternates every cycle.',
  program: {
    name: 'BOOSTER',
    blocks: [
      gate(1, 'AND', [on(I(3)), on(I(1))]),
      gate(2, 'AND', [on(I(3)), on(I(2))]),
      block(3, 'PULSE_RELAY', { Trg: not(B(1)), S: X, R: X }, { Par: 'RS' }),
      block(4, 'ON_DELAY', { Trg: on(B(2)) }, { T: sec(3) }),
      gate(5, 'AND', [on(B(1)), not(B(3))]),
      gate(6, 'AND', [on(B(4)), on(B(3))]),
      gate(7, 'OR', [on(B(5)), on(B(6))]),
      gate(8, 'AND', [on(B(1)), on(B(3))]),
      gate(9, 'AND', [on(B(4)), not(B(3))]),
      gate(10, 'OR', [on(B(8)), on(B(9))]),
    ],
    sinks: [toQ(1, B(7)), toQ(2, B(10)), toQ(3, B(4))],
  },
  inputs: inputs8([dev('switch', 'NO', 'B1', 'P1 low pressure'), dev('switch', 'NO', 'B2', 'P2 low-low'), dev('switch', 'NO', 'S1', 'System enable')]),
  loads: loads4([load('motor', 'M1', 'Pump A'), load('motor', 'M2', 'Pump B'), load('lamp', 'H1', 'Lag running')]),
};

const HOPPER_FEEDER: LogoScenario = {
  id: 'hopper-feeder',
  group: 'dc',
  device: '12/24RC',
  title: 'Vibratory hopper parts feeder',
  chapter: 'DC 19',
  summary: 'Enabled and chute not full: the vibrator pulses 2 s on / 3 s off; the chute photo-eye inhibits feeding.',
  program: {
    name: 'FEEDER',
    blocks: [gate(1, 'AND', [on(I(1)), not(I(2))]), block(2, 'PULSE_GENERATOR', { En: on(B(1)), Inv: X }, { TH: sec(2), TL: sec(3) })],
    sinks: [toQ(1, B(2)), toQ(2, I(2))],
  },
  inputs: inputs8([dev('switch', 'NO', 'S1', 'Feeder enable'), dev('sensor', 'NO', 'B1', 'Chute full (eye)')]),
  loads: loads4([load('motor', 'M1', 'Vibratory drive'), load('lamp', 'H1', 'Chute full')]),
};

/*
 * START latches the machine request and runs the lube pump. The main contactor may only pull in once
 * the pump has run 5 s AND the lube pressure switch confirms pressure; pressure missing after 5 s is
 * a lubrication fault.
 */
const PRE_LUBE: LogoScenario = {
  id: 'pre-lube',
  group: 'dc',
  device: '12/24RC',
  title: 'Pre-lubrication interlock',
  chapter: 'DC 20',
  summary: 'Main contactor Q2 is blocked until the lube pump Q1 has run 5 s and the pressure switch confirms; else Q3 fault.',
  program: {
    name: 'PRELUBE',
    blocks: [
      block(1, 'LATCHING_RELAY', { S: on(I(1)), R: not(I(2)) }),
      block(2, 'ON_DELAY', { Trg: on(B(1)) }, { T: sec(5) }),
      gate(3, 'AND', [on(B(2)), on(I(3)), on(B(1))]),
      gate(4, 'AND', [on(B(2)), not(I(3))]),
    ],
    sinks: [toQ(1, B(1)), toQ(2, B(3)), toQ(3, B(4))],
  },
  inputs: inputs8([dev('pushbutton', 'NO', 'S1', 'START'), dev('pushbutton', 'NC', 'S0', 'STOP'), dev('switch', 'NO', 'B1', 'Lube pressure OK')]),
  loads: loads4([load('motor', 'M1', 'Lube pump'), load('motor', 'M2', 'Main drive (K2)'), load('beacon', 'H1', 'Lube fault')]),
};

export const DC_SUITE: readonly LogoScenario[] = [
  DOL_STARTER,
  STAR_DELTA,
  FWD_REV_BRAKE,
  CONVEYOR_JAM,
  PNEUMATIC_RECIPRO,
  BOTTLING_COUNTER,
  TWO_HAND,
  BOOSTER_LEAD_LAG,
  HOPPER_FEEDER,
  PRE_LUBE,
];
