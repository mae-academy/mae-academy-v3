import type { DeviceClass, InputDevice, OutputLoad } from './hardware/devices';
import type { LogoProgram } from '@shared/logo/types';
import { AC_SUITE } from './library/ac';
import { DC_SUITE } from './library/dc';
import { TUTORIAL_SUITE } from './library/tutorial';

/**
 * Preloaded benchmark applications. Loading one writes its circuit program into LOGO! memory,
 * selects its voltage class and re-dresses the bench: every input gets its field device, every relay
 * its load. Beginners tutorials appear first, followed by 10 × 230 V AC building automation and
 * 10 × 24 V DC machine automation.
 */

export type ScenarioId =
  | 'seal-in-gates'
  | 'seal-in-rs'
  | 'traffic-light'
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
  | 'pre-lube';

export type ScenarioGroup = 'tutorial' | 'ac' | 'dc';

export const SCENARIO_GROUPS: readonly { readonly id: ScenarioGroup; readonly label: string }[] = [
  { id: 'tutorial', label: 'Tutorials / Fundamentals' },
  { id: 'ac', label: '230 V AC · building automation' },
  { id: 'dc', label: '24 V DC · machine automation' },
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

export const SCENARIO_LIST: readonly LogoScenario[] = [...TUTORIAL_SUITE, ...AC_SUITE, ...DC_SUITE];

export const SCENARIOS: Readonly<Record<ScenarioId, LogoScenario>> = Object.fromEntries(SCENARIO_LIST.map((scenario) => [scenario.id, scenario])) as Record<ScenarioId, LogoScenario>;

export const isScenarioId = (value: string): value is ScenarioId => Object.hasOwn(SCENARIOS, value);

