import type { DeviceClass, InputDevice, OutputLoad } from './hardware/devices';
import type { LogoProgram } from './engine/types';
import { AC_SUITE } from './library/ac';
import { DC_SUITE } from './library/dc';
import { TUTORIAL_SUITE } from './library/tutorial';
import { block, gate, not, on, ref, sec, spare, spareLoad, toM, toQ, X } from './library/dsl';

/**
 * Preloaded benchmark applications. Loading one writes its circuit program into LOGO! memory,
 * selects its voltage class and re-dresses the bench: every input gets its field device, every relay
 * its load. 10 × 230 V AC building automation, 10 × 24 V DC machine automation, plus the two
 * reference applications of manual Ch. 8 (spec §4.9).
 */

export type ScenarioId =
  | 'stairway'
  | 'hallway-impulse'
  | 'roller-shutter'
  | 'bath-fan'
  | 'sump-duplex'
  | 'shopfront-clock'
  | 'two-stage-heating'
  | 'security-motion'
  | 'exhaust-damper'
  | 'siren-pattern'
  | 'dol-starter'
  | 'star-delta'
  | 'fwd-rev-brake'
  | 'conveyor-jam'
  | 'pneumatic-recipro'
  | 'bottling-counter'
  | 'two-hand'
  | 'booster-lead-lag'
  | 'hopper-feeder'
  | 'pre-lube'
  | 'sliding-door'
  | 'factory-gate'
  | 'seal-in-gates'
  | 'seal-in-rs'
  | 'traffic-light';

export type ScenarioGroup = 'ac' | 'dc' | 'manual' | 'tutorial';

export const SCENARIO_GROUPS: readonly { readonly id: ScenarioGroup; readonly label: string }[] = [
  { id: 'ac', label: '230 V AC · building automation' },
  { id: 'dc', label: '24 V DC · machine automation' },
  { id: 'manual', label: 'Manual Ch. 8 references' },
  { id: 'tutorial', label: 'Beginner tutorials' },
];

export interface BenchInput {
  readonly device: InputDevice;
  /** Actuator position when the scenario is loaded (e.g. a door that starts closed). */
  readonly actuated: boolean;
}

export interface LogoScenario {
  readonly id: ScenarioId;
  readonly group: ScenarioGroup;
  /** Basic unit the program is written for; loading the scenario switches the bench to it. */
  readonly device: DeviceClass;
  readonly title: string;
  readonly chapter: string;
  readonly summary: string;
  readonly program: LogoProgram;
  /** I1..I8. */
  readonly inputs: readonly BenchInput[];
  /** Q1..Q4. */
  readonly loads: readonly OutputLoad[];
}

const { I, Q, B } = ref;

// ---- Ch. 8.2: automatic sliding door ------------------------------------------------------------

/*
 * Limit switches S1/S2 are break contacts (wire-break safe): an actuated limit opens its contact, so
 * "door not yet fully closed" is I3 = 1 and "not yet fully open" is I4 = 1. Each drive contactor is
 * interlocked against the other through a NOT read-back of its Q.
 */
const SLIDING_DOOR: LogoScenario = {
  id: 'sliding-door',
  group: 'manual',
  device: '230RC',
  title: 'Automatic sliding door',
  chapter: 'Ch. 8.2',
  summary: 'Motion sensors open the door; a 10 s off-delay holds it, then it closes. K1/K2 are mutually interlocked.',
  program: {
    name: 'DOOR',
    blocks: [
      gate(1, 'OR', [on(I(1)), on(I(2))]),
      block(2, 'OFF_DELAY', { Trg: on(B(1)), R: X }, { T: sec(10) }),
      gate(3, 'AND', [on(B(2)), on(I(4)), not(Q(2))]),
      gate(4, 'AND', [not(B(2)), on(I(3)), not(Q(1))]),
    ],
    sinks: [toM(1, B(1)), toQ(1, B(3)), toQ(2, B(4))],
  },
  inputs: [
    { device: { kind: 'sensor', contact: 'NO', symbol: 'B1', tag: 'Motion outside' }, actuated: false },
    { device: { kind: 'sensor', contact: 'NO', symbol: 'B2', tag: 'Motion inside' }, actuated: false },
    { device: { kind: 'limit', contact: 'NC', symbol: 'S1', tag: 'Door closed' }, actuated: true },
    { device: { kind: 'limit', contact: 'NC', symbol: 'S2', tag: 'Door open' }, actuated: false },
    spare(5),
    spare(6),
    spare(7),
    spare(8),
  ],
  loads: [
    { kind: 'contactor', symbol: 'K1', tag: 'Open drive' },
    { kind: 'contactor', symbol: 'K2', tag: 'Close drive' },
    spareLoad(3),
    spareLoad(4),
  ],
};

// ---- Ch. 8.4: factory gate ----------------------------------------------------------------------

/*
 * Open / Close latch via latching relays, reset by STOP (break contact), the end-position limit or the
 * opposite command. Striking the safety edge while closing drops the close latch and re-opens the
 * gate. A 1 Hz pulse generator flashes the beacon whenever either motor contactor is energised.
 */
const FACTORY_GATE: LogoScenario = {
  id: 'factory-gate',
  group: 'manual',
  device: '230RC',
  title: 'Factory gate',
  chapter: 'Ch. 8.4',
  summary: 'Open/Close pushbuttons with STOP, end limits and a safety edge that reverses closing; beacon flashes while moving.',
  program: {
    name: 'GATE',
    blocks: [
      gate(1, 'AND', [not(I(6)), on(Q(2))]),
      gate(2, 'OR', [on(I(1)), on(B(1))]),
      gate(3, 'OR', [not(I(3)), not(I(4)), on(I(2))]),
      block(4, 'LATCHING_RELAY', { S: on(B(2)), R: on(B(3)) }),
      gate(5, 'AND', [on(B(4)), not(Q(2))]),
      gate(6, 'OR', [not(I(3)), not(I(5)), not(I(6)), on(I(1))]),
      block(7, 'LATCHING_RELAY', { S: on(I(2)), R: on(B(6)) }),
      gate(8, 'AND', [on(B(7)), not(Q(1))]),
      gate(9, 'OR', [on(Q(1)), on(Q(2))]),
      block(10, 'PULSE_GENERATOR', { En: on(B(9)), Inv: X }, { TH: sec(0.5), TL: sec(0.5) }),
    ],
    sinks: [toQ(1, B(5)), toQ(2, B(8)), toQ(3, B(10))],
  },
  inputs: [
    { device: { kind: 'pushbutton', contact: 'NO', symbol: 'S1', tag: 'OPEN' }, actuated: false },
    { device: { kind: 'pushbutton', contact: 'NO', symbol: 'S2', tag: 'CLOSE' }, actuated: false },
    { device: { kind: 'pushbutton', contact: 'NC', symbol: 'S0', tag: 'STOP' }, actuated: false },
    { device: { kind: 'limit', contact: 'NC', symbol: 'S3', tag: 'Gate open' }, actuated: false },
    { device: { kind: 'limit', contact: 'NC', symbol: 'S4', tag: 'Gate closed' }, actuated: true },
    { device: { kind: 'pushbutton', contact: 'NC', symbol: 'S5', tag: 'Safety edge' }, actuated: false },
    spare(7),
    spare(8),
  ],
  loads: [
    { kind: 'contactor', symbol: 'K1', tag: 'Motor OPEN' },
    { kind: 'contactor', symbol: 'K2', tag: 'Motor CLOSE' },
    { kind: 'beacon', symbol: 'H1', tag: 'Warning light' },
    spareLoad(4),
  ],
};

export const SCENARIO_LIST: readonly LogoScenario[] = [...AC_SUITE, ...DC_SUITE, SLIDING_DOOR, FACTORY_GATE, ...TUTORIAL_SUITE];

export const SCENARIOS: Readonly<Record<ScenarioId, LogoScenario>> = Object.fromEntries(SCENARIO_LIST.map((scenario) => [scenario.id, scenario])) as Record<ScenarioId, LogoScenario>;

export const isScenarioId = (value: string): value is ScenarioId => Object.hasOwn(SCENARIOS, value);
