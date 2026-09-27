import type { LogoScenario } from '../scenarios';
import { block, dev, gate, inputs8, load, loads4, not, on, ref, sec, toQ, X } from './dsl';

/** Programs used by the tutorials in the beginner's manual. */

const { I, Q, B } = ref;

/*
 * Tutorial A, gate version: Q1 = (I1 OR Q1) AND I2. The Q1 read-back is the "memory": it carries the
 * previous cycle's value, so once START has set Q1 the OR keeps itself true until the NC STOP button
 * opens I2 and the AND drops it.
 */
export const SEAL_IN_GATES: LogoScenario = {
  id: 'seal-in-gates',
  group: 'tutorial',
  device: '230RC',
  title: 'Seal-in circuit (OR + AND)',
  chapter: 'Tutorial A',
  summary: 'Q1 = (I1 ∨ Q1) ∧ I2: START seals itself in through the Q1 read-back; the NC STOP button drops it.',
  program: {
    name: 'SEALIN',
    blocks: [gate(1, 'OR', [on(I(1)), on(Q(1))]), gate(2, 'AND', [on(B(1)), on(I(2))])],
    sinks: [toQ(1, B(2))],
  },
  inputs: inputs8([dev('pushbutton', 'NO', 'S1', 'START'), dev('pushbutton', 'NC', 'S2', 'STOP')]),
  loads: loads4([load('motor', 'M1', 'Pump')]),
};

/** Tutorial A, latching-relay version: S = I1, R = ¬I2 (R wins when both are 1). */
export const SEAL_IN_RS: LogoScenario = {
  id: 'seal-in-rs',
  group: 'tutorial',
  device: '230RC',
  title: 'Seal-in circuit (RS relay)',
  chapter: 'Tutorial A',
  summary: 'The same function with the built-in latching relay: I1 on S, inverted I2 on R.',
  program: {
    name: 'SEALINRS',
    blocks: [block(1, 'LATCHING_RELAY', { S: on(I(1)), R: not(I(2)) })],
    sinks: [toQ(1, B(1))],
  },
  inputs: inputs8([dev('pushbutton', 'NO', 'S1', 'START'), dev('pushbutton', 'NC', 'S2', 'STOP')]),
  loads: loads4([load('motor', 'M1', 'Pump')]),
};

/*
 * Tutorial B. B1 (off-delay, 12 s) keeps the enable up for 12 s after the switch opens, so the lights keep sequencing briefly instead of blanking mid-phase, then go dark. B2, an
 * asynchronous pulse generator (5 s high / 7 s low), is the master clock: its high phase is GREEN.
 * B3 = B1 AND NOT B2 is the low phase; B4 (on-delay 2 s) starts with it, so the first 2 s are YELLOW
 * (B3 AND NOT B4) and the remaining 5 s are RED (B4). Every lamp derives from B2/B4, so exactly one
 * output is 1 at any time.
 */
export const TRAFFIC_LIGHT: LogoScenario = {
  id: 'traffic-light',
  group: 'tutorial',
  device: '230RC',
  title: 'Traffic light sequence',
  chapter: 'Tutorial B',
  summary: 'Green 5 s → yellow 2 s → red 5 s, repeating while I1 is on; after switch-off the sequence runs on for 12 s, then goes dark.',
  program: {
    name: 'TRAFFIC',
    blocks: [
      block(1, 'OFF_DELAY', { Trg: on(I(1)), R: X }, { T: sec(12) }),
      block(2, 'PULSE_GENERATOR', { En: on(B(1)), Inv: X }, { TH: sec(5), TL: sec(7) }),
      gate(3, 'AND', [on(B(1)), not(B(2))]),
      block(4, 'ON_DELAY', { Trg: on(B(3)) }, { T: sec(2) }),
      gate(5, 'AND', [on(B(3)), not(B(4))]),
    ],
    sinks: [toQ(1, B(4)), toQ(2, B(5)), toQ(3, B(2))],
  },
  inputs: inputs8([dev('switch', 'NO', 'S1', 'Cycle enable')]),
  loads: loads4([load('lamp', 'H1', 'Red lamp', 'red'), load('lamp', 'H2', 'Yellow lamp', 'yellow'), load('lamp', 'H3', 'Green lamp', 'green')]),
};

export const TUTORIAL_SUITE: readonly LogoScenario[] = [SEAL_IN_GATES, SEAL_IN_RS, TRAFFIC_LIGHT];
