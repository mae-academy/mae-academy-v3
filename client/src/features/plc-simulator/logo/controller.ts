import { defaultClock, defaultScheduler, type MonotonicClock, type ScanMetrics, type Scheduler } from '../engine/types';
import type { LogoTransport } from '@/services/logoClient';
import type { BlockState } from '@shared/logo/state';
import { ADDRESS_SPACE, EMPTY_PROGRAM, type Bit, type ConnectorRef, type LogoProgram } from '@shared/logo/types';
import { checkProgram, type CheckedProgram, type LogoDiagnostic } from '@shared/logo/validate';
import { placeBlock, rewire, setInvert, withParam } from './model/edit';
import { LogoRemoteCpu } from './remote';
import { initialPanel, panelReduce, renderPanel, type PanelEffect, type PanelFrame, type PanelKey, type PanelScreen, type PanelSnapshot, type RtcReading } from './firmware/panel';
import {
  BASIC_INPUTS,
  BASIC_OUTPUTS,
  classifyInput,
  contactClosed,
  DEVICES,
  loadOf,
  type DeviceClass,
  type DeviceSpec,
  type ActuatorKind,
  type ContactType,
  type InputDevice,
  LAMP_COLOR_MAP,
  LAMP_COLORS,
  type LampColor,
  type LoadKind,
  type OutputLoad,
} from './hardware/devices';
import { SCENARIOS, type BenchInput, type ScenarioId } from './scenarios';

export type HostMode = 'RUN' | 'STOP' | 'PAUSE';

const MAX_DELTA_MS = 1000;

export interface LogoControllerOptions {
  readonly scheduler?: Scheduler;
  /** Monotonic clock that times the scan cycle. */
  readonly clock?: MonotonicClock;
  /** Epoch milliseconds feeding the real-time clock. */
  readonly wallClock?: () => number;
  readonly scanMs?: number;
  /** Sends batches to the engine; defaults to `fetch('/api/plc/logo/evaluate')`. */
  readonly transport?: LogoTransport;
  /** Minimum time between two scan requests (ms of `clock`). */
  readonly batchMs?: number;
  readonly scenario?: ScenarioId;
  readonly device?: DeviceClass;
}

export interface BenchInputState extends BenchInput {
  /** Terminal voltage and the level the input stage reads from it. */
  readonly volts: number;
  readonly level: Bit;
}

/**
 * The interactive bench: one LOGO! Basic unit, its supply, eight field devices on I1..I8 and four loads
 * across the Q1..Q4 relay contacts. Owns the CPU, the firmware display state, the program-module
 * card and the scan loop; the UI reads it through `subscribe` / `getVersion`.
 */
export class LogoBenchController {
  private readonly scheduler: Scheduler;
  private readonly clock: MonotonicClock;
  private readonly wallClock: () => number;
  private readonly listeners = new Set<() => void>();
  private readonly changeListeners = new Set<() => void>();
  private version = 0;
  private changeVersion = 0;

  private deviceClass: DeviceClass;
  private scenarioId: ScenarioId;
  private programValue: LogoProgram;
  private compiledValue: CheckedProgram;
  private readonly cpu: LogoRemoteCpu;
  private inputs: BenchInputState[] = [];
  private loadsValue: readonly OutputLoad[] = [];
  private poweredValue = true;
  private hostMode: HostMode = 'STOP';
  private screen: PanelScreen;
  private card: { program: LogoProgram | null; protect: boolean } = { program: null, protect: false };
  private rtcOffsetMs = 0;
  private swTime = false;
  private sync = true;
  private noticeValue: string | null = null;

  private scanMsValue: number;
  private handle: number | null = null;
  private simNow = 0;
  private lastClock: number | null = null;
  private lastScanWorkMs = 0;
  private bootTimer: ReturnType<typeof setTimeout> | null = null;

  private clearBootTimer(): void {
    if (this.bootTimer !== null) {
      clearTimeout(this.bootTimer);
      this.bootTimer = null;
    }
  }

  finishBoot(): void {
    this.clearBootTimer();
    if (this.screen.kind === 'boot') {
      this.screen = initialPanel(this.snapshot());
      this.emit();
    }
  }

  constructor(options: LogoControllerOptions = {}) {
    this.scheduler = options.scheduler ?? defaultScheduler;
    this.clock = options.clock ?? defaultClock;
    this.wallClock = options.wallClock ?? (() => Date.now());
    this.scanMsValue = options.scanMs ?? 20;
    this.scenarioId = options.scenario ?? 'seal-in-gates';
    const scenario = SCENARIOS[this.scenarioId];
    this.deviceClass = options.device ?? scenario.device;
    this.programValue = scenario.program;
    this.compiledValue = checkProgram(scenario.program);
    this.cpu = new LogoRemoteCpu(this.compiledValue, {
      transport: options.transport,
      batchMs: options.batchMs,
      clock: this.clock,
      onUpdate: () => this.emit('scan'),
      onError: (message) => this.engineFailed(message),
    });
    this.dressBench(scenario.inputs, scenario.loads);
    this.screen = initialPanel(this.snapshot());
  }

  // ---- subscription ------------------------------------------------------------------------

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getVersion = (): number => this.version;

  /** Operator / host changes only (no scans): lets the UI answer a click without waiting a frame. */
  readonly subscribeChanges = (listener: () => void): (() => void) => {
    this.changeListeners.add(listener);
    return () => {
      this.changeListeners.delete(listener);
    };
  };

  readonly getChangeVersion = (): number => this.changeVersion;

  private emit(kind: 'scan' | 'change' = 'change'): void {
    this.version += 1;
    this.listeners.forEach((listener) => listener());
    if (kind === 'scan') return;
    this.changeVersion += 1;
    this.changeListeners.forEach((listener) => listener());
  }

  // ---- read model --------------------------------------------------------------------------

  get mode(): HostMode {
    return this.hostMode;
  }
  get powered(): boolean {
    return this.poweredValue;
  }
  get device(): DeviceSpec {
    return DEVICES[this.deviceClass];
  }
  get scenario(): ScenarioId {
    return this.scenarioId;
  }
  get program(): LogoProgram {
    return this.programValue;
  }
  get diagnostics(): readonly LogoDiagnostic[] {
    return this.compiledValue.diagnostics;
  }
  get notice(): string | null {
    return this.noticeValue;
  }
  get scanMs(): number {
    return this.scanMsValue;
  }
  get benchInputs(): readonly BenchInputState[] {
    return this.inputs;
  }
  get loads(): readonly OutputLoad[] {
    return this.loadsValue;
  }
  get cardHasProgram(): boolean {
    return this.card.program !== null;
  }

  /** Relay contact of Qn (1-based) is closed: supply present, CPU running, output bit set. */
  relayClosed(index: number): boolean {
    return this.poweredValue && this.cpu.mode === 'RUN' && this.cpu.readOutputs()[index - 1] === 1;
  }

  /** RUN/STOP LED colour, or null when the unit is unpowered. */
  get runLed(): 'green' | 'red' | null {
    if (!this.poweredValue) return null;
    return this.cpu.mode === 'RUN' ? 'green' : 'red';
  }

  /** Live level of any connector as the program sees it (FBD viewer). Q / M are the committed values. */
  level(ref: ConnectorRef): Bit {
    switch (ref.kind) {
      case 'hi':
        return 1;
      case 'lo':
      case 'x':
        return 0;
      case 'digital-input':
        return this.cpu.readInputs()[ref.index - 1] ?? 0;
      case 'digital-output':
        return this.cpu.readOutputs()[ref.index - 1] ?? 0;
      case 'digital-flag':
        return this.cpu.readFlags()[ref.index - 1] ?? 0;
      case 'block-output':
        return this.cpu.blockOutput(ref.blockId);
      default: {
        const exhaustive: never = ref;
        return exhaustive;
      }
    }
  }

  /** Internal state of one block (elapsed timer, counter value) for live annotation. */
  blockState(id: number): BlockState {
    return this.cpu.blockState(id);
  }

  get running(): boolean {
    return this.poweredValue && this.cpu.mode === 'RUN';
  }

  frame(): PanelFrame {
    return renderPanel(this.screen, this.snapshot());
  }

  readMetrics = (): ScanMetrics | null => {
    if (this.cpu.cycle === 0) return null;
    const dt = this.cpu.cycleTimeMs;
    return {
      cycle: this.cpu.cycle,
      startedAt: this.simNow,
      scanTimeMs: this.lastScanWorkMs,
      deltaMs: dt,
      minScanMs: this.lastScanWorkMs,
      maxScanMs: this.lastScanWorkMs,
      avgScanMs: this.lastScanWorkMs,
      cycleTimeMs: dt,
    };
  };

  snapshot(): PanelSnapshot {
    return {
      powered: this.poweredValue,
      mode: this.cpu.mode,
      program: this.programValue,
      usage: this.compiledValue.usage,
      inputs: this.cpu.readInputs(),
      outputs: this.cpu.readOutputs(),
      flags: this.cpu.readFlags(),
      params: this.cpu.params(),
      clock: this.rtc(),
      card: this.card,
      swTime: this.swTime,
      sync: this.sync,
    };
  }

  // ---- execution ---------------------------------------------------------------------------

  run(): boolean {
    if (!this.poweredValue) return this.refuse('The unit is unpowered: close the mains breaker first.');
    if (this.hostMode === 'RUN') return true;
    if (this.hostMode === 'PAUSE') {
      this.hostMode = 'RUN';
      this.lastClock = null;
      this.schedule();
      this.emit();
      return true;
    }
    if (!this.startCpu()) {
      this.syncPanel();
      this.emit();
      return false;
    }
    this.hostMode = 'RUN';
    this.schedule();
    this.syncPanel();
    this.emit();
    return true;
  }

  pause(): void {
    if (this.hostMode !== 'RUN') return;
    this.cancel();
    this.hostMode = 'PAUSE';
    this.emit();
  }

  stop(): void {
    this.cancel();
    this.cpu.stop();
    this.hostMode = 'STOP';
    this.syncPanel();
    this.emit();
  }

  /** Executes exactly one scan of simulated `scanMs` and holds the controller paused. */
  step(): void {
    if (!this.poweredValue) {
      this.refuse('The unit is unpowered: close the mains breaker first.');
      return;
    }
    if (this.hostMode === 'STOP' && !this.startCpu()) {
      this.syncPanel();
      this.emit();
      return;
    }
    this.cancel();
    this.hostMode = 'PAUSE';
    this.simNow += this.cpu.cycle === 0 ? 0 : this.scanMsValue;
    this.lastClock = null;
    this.scanOnce();
    void this.cpu.flush();
    this.syncPanel();
    this.emit();
  }

  /** STOP plus a full memory reset, retentive data included. */
  reset(): void {
    this.cancel();
    this.cpu.stop();
    this.cpu.clearAll();
    this.hostMode = 'STOP';
    this.screen = initialPanel(this.snapshot());
    this.emit();
  }

  setScanMs(ms: number): void {
    this.scanMsValue = Math.max(5, Math.min(500, Math.round(ms)));
    this.emit();
  }

  /** Halts the scan loop (unmount). Subscribers detach themselves. */
  dispose(): void {
    this.cancel();
    if (this.hostMode === 'RUN') this.hostMode = 'PAUSE';
  }

  // ---- supply ------------------------------------------------------------------------------

  /**
   * Mains breaker. Power-off drops every relay, cuts terminal/bus power, and clears non-retentive data.
   * Power-on boots the controller safely in STOP mode at the root system menu.
   */
  setPower(on: boolean): void {
    if (on === this.poweredValue) return;
    if (!on) {
      this.cancel();
      this.clearBootTimer();
      this.cpu.powerLoss();
      this.cpu.stop();
      this.hostMode = 'STOP';
      this.poweredValue = false;
      this.physicalInputs(); // terminals go dead
      this.screen = initialPanel(this.snapshot());
      this.emit();
      return;
    }
    this.poweredValue = true;
    this.hostMode = 'STOP';
    this.cpu.stop();
    this.physicalInputs();
    if (this.card.program && JSON.stringify(this.card.program) !== JSON.stringify(this.programValue)) {
      this.install(this.card.program, false);
    }
    this.screen = { kind: 'boot' };
    this.emit();
    this.clearBootTimer();
    this.bootTimer = setTimeout(() => {
      this.finishBoot();
    }, 1000);
  }

  // ---- bench configuration -----------------------------------------------------------------

  setDevice(device: DeviceClass): void {
    if (device === this.deviceClass) return;
    this.cancel();
    this.cpu.stop();
    this.cpu.clearAll();
    this.hostMode = 'STOP';
    this.deviceClass = device;
    this.inputs = this.inputs.map((input) => this.measure(input.device, input.actuated, 0));
    this.screen = initialPanel(this.snapshot());
    this.emit();
  }

  loadScenario(id: ScenarioId): void {
    const scenario = SCENARIOS[id];
    this.cancel();
    this.cpu.stop();
    this.hostMode = 'STOP';
    this.scenarioId = id;
    this.deviceClass = scenario.device;
    this.install(scenario.program, false);
    this.cpu.clearAll();
    this.dressBench(scenario.inputs, scenario.loads);
    this.noticeValue = null;
    this.screen = initialPanel(this.snapshot());
    this.emit();
  }

  /** Loads an externally supplied program (import). Rejected programs never reach LOGO! memory. */
  importProgram(program: LogoProgram): readonly LogoDiagnostic[] {
    const compiled = checkProgram(program);
    if (!compiled.ok) return compiled.diagnostics;
    this.cancel();
    this.cpu.stop();
    this.hostMode = 'STOP';
    this.install(program, false);
    this.cpu.clearAll();
    this.screen = initialPanel(this.snapshot());
    this.emit();
    return compiled.diagnostics;
  }

  /** Pushbutton pressed / released, switch thrown, limit reached. */
  actuate(index: number, actuated: boolean): void {
    const input = this.inputs[index];
    if (!input || input.device.kind === 'spare' || input.actuated === actuated) return;
    this.inputs[index] = this.measure(input.device, actuated, input.level);
    this.emit();
  }

  toggle(index: number): void {
    const input = this.inputs[index];
    if (input && input.device.kind !== 'spare') this.actuate(index, !input.actuated);
  }

  /** Swaps the field device on an input; the actuator returns to rest and the schematic symbol follows. */
  setInputDevice(index: number, kind: ActuatorKind, contact: ContactType): void {
    const input = this.inputs[index];
    if (!input || (input.device.kind === kind && input.device.contact === contact)) return;
    this.inputs[index] = this.measure({ ...input.device, kind, contact }, false, input.level);
    this.emit();
  }

  /** Swaps the load across a relay contact (lamp, contactor coil, beacon, or nothing). */
  setLoadKind(index: number, kind: LoadKind, color?: LampColor): void {
    const current = this.loadsValue[index];
    if (!current || (current.kind === kind && (!color || current.color === color))) return;
    this.loadsValue = this.loadsValue.map((load, i) => (i === index ? loadOf(kind, index + 1, color ?? (kind === 'lamp' ? 'red' : undefined)) : load));
    this.emit();
  }

  /** Sets the indicator color for a pilot lamp on channel index. */
  setLampColor(index: number, color: LampColor): void {
    const current = this.loadsValue[index];
    if (!current || current.kind !== 'lamp') return;
    const colorLabel = LAMP_COLOR_MAP[color]?.label ?? 'Pilot';
    this.loadsValue = this.loadsValue.map((load, i) =>
      i === index ? { ...load, color, tag: `${colorLabel} lamp` } : load
    );
    this.emit();
  }

  dismissNotice(): void {
    this.noticeValue = null;
    this.emit();
  }

  // ---- front panel -------------------------------------------------------------------------

  press(key: PanelKey): void {
    if (!this.poweredValue) return;
    this.clearBootTimer();
    const step = panelReduce(this.screen, { type: 'key', key }, this.snapshot());
    this.screen = step.screen;
    step.effects.forEach((effect) => this.perform(effect));
    this.syncPanel();
    this.emit();
  }

  private perform(effect: PanelEffect): void {
    switch (effect.type) {
      case 'run':
        if (this.startCpu()) {
          this.hostMode = 'RUN';
          this.schedule();
        }
        return;
      case 'stop':
        this.cancel();
        this.cpu.stop();
        this.hostMode = 'STOP';
        return;
      case 'setParam':
        this.edit(withParam(this.programValue, effect.blockId, effect.key, effect.value), 'Parameter rejected');
        return;
      case 'rewire':
        this.edit(rewire(this.programValue, effect.target, effect.ref), 'Connection rejected');
        return;
      case 'setInvert':
        this.edit(setInvert(this.programValue, effect.target, effect.invert), 'Invert rejected');
        return;
      case 'placeBlock':
        this.edit(placeBlock(this.programValue, effect.target, effect.blockType), 'Block rejected');
        return;
      case 'clearProgram':
        this.install({ ...EMPTY_PROGRAM }, false);
        this.cpu.clearAll();
        return;
      case 'toCard':
        this.card = { ...this.card, program: this.programValue };
        return;
      case 'fromCard':
        if (this.card.program) {
          this.install(this.card.program, false);
          this.cpu.clearAll();
        }
        return;
      case 'toggleCopyProtect':
        this.card = { ...this.card, protect: !this.card.protect };
        return;
      case 'setClock': {
        const now = this.rtc();
        const seconds = new Date(this.wallClock() + this.rtcOffsetMs).getSeconds();
        const dayShift = effect.weekday - now.weekday;
        const minuteShift = effect.hour * 60 + effect.minute - (now.hour * 60 + now.minute);
        this.rtcOffsetMs += (dayShift * 1440 + minuteShift) * 60_000 - seconds * 1000;
        return;
      }
      case 'setSwTime':
        this.swTime = effect.on;
        return;
      case 'setSync':
        this.sync = effect.on;
        return;
      default: {
        const exhaustive: never = effect;
        return exhaustive;
      }
    }
  }

  // ---- internals ---------------------------------------------------------------------------

  private refuse(message: string): false {
    this.noticeValue = message;
    this.emit();
    return false;
  }

  /** The engine could not be reached (or refused the program): halt like a CPU fault, keep the reason on screen. */
  private engineFailed(message: string): void {
    this.cancel();
    if (this.hostMode === 'RUN') this.hostMode = 'PAUSE';
    this.noticeValue = message;
    this.syncPanel();
    this.emit();
  }

  /** Resolves once every operation sent to the engine has been answered and applied. */
  idle(): Promise<void> {
    return this.cpu.idle();
  }

  private startCpu(): boolean {
    if (this.programValue.sinks.length === 0) {
      this.noticeValue = 'No program in LOGO! memory.';
      return false;
    }
    if (!this.compiledValue.ok) {
      this.noticeValue = this.compiledValue.diagnostics.find((d) => d.severity === 'error')?.message ?? 'Program rejected';
      return false;
    }
    this.cpu.start();
    this.lastClock = null;
    this.noticeValue = null;
    return true;
  }

  private install(program: LogoProgram, keepState: boolean): void {
    this.programValue = program;
    this.compiledValue = checkProgram(program);
    this.cpu.load(this.compiledValue, keepState);
  }

  /** Applies a firmware edit only if the result is still a complete, loop-free program. */
  private edit(candidate: LogoProgram, label: string): void {
    const compiled = checkProgram(candidate);
    if (!compiled.ok) {
      this.noticeValue = `${label}: ${compiled.diagnostics.find((d) => d.severity === 'error')?.message ?? 'invalid'}`;
      return;
    }
    this.programValue = candidate;
    this.compiledValue = compiled;
    this.cpu.load(compiled, true);
  }

  private dressBench(inputs: readonly BenchInput[], loads: readonly OutputLoad[]): void {
    this.inputs = Array.from({ length: BASIC_INPUTS }, (_, index) => {
      const input = inputs[index] ?? { device: { kind: 'spare', contact: 'NO', symbol: `X${index + 1}`, tag: 'Spare' }, actuated: false };
      return this.measure(input.device, input.actuated, 0);
    });
    this.loadsValue = Array.from({ length: BASIC_OUTPUTS }, (_, index) => loads[index] ?? loadOf('none', index + 1));
  }

  /** Terminal voltage from the contact state and the supply, then the input stage's reading of it. */
  private measure(device: InputDevice, actuated: boolean, previous: Bit): BenchInputState {
    const spec = DEVICES[this.deviceClass];
    const volts = this.poweredValue && contactClosed(device, actuated) ? spec.supply.volts : 0;
    return { device, actuated, volts, level: classifyInput(volts, spec, previous) };
  }

  private physicalInputs(): Bit[] {
    this.inputs = this.inputs.map((input) => this.measure(input.device, input.actuated, input.level));
    return Array.from({ length: ADDRESS_SPACE.I }, (_, index) => this.inputs[index]?.level ?? 0);
  }

  private syncPanel(): void {
    this.screen = panelReduce(this.screen, { type: 'mode', mode: this.cpu.mode }, this.snapshot()).screen;
  }

  private rtc(): RtcReading {
    const date = new Date(this.wallClock() + this.rtcOffsetMs);
    return {
      weekday: (date.getDay() + 6) % 7,
      hour: date.getHours(),
      minute: date.getMinutes(),
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
    };
  }

  private scanOnce(): void {
    this.cpu.scan(this.simNow, this.physicalInputs());
    this.lastScanWorkMs = this.cpu.workMs;
  }

  private readonly loop = (): void => {
    this.handle = null;
    if (this.hostMode !== 'RUN' || !this.poweredValue) return;
    const now = this.clock();
    // A throttled background tab must not jump every timer forward in one scan.
    this.simNow += this.lastClock === null ? 0 : Math.min(MAX_DELTA_MS, Math.max(0, now - this.lastClock));
    this.lastClock = now;
    this.scanOnce();
    this.schedule();
    this.emit('scan');
  };

  private schedule(): void {
    if (this.handle !== null) return;
    this.handle = this.scheduler.schedule(this.loop, this.scanMsValue);
  }

  private cancel(): void {
    if (this.handle !== null) this.scheduler.cancel(this.handle);
    this.handle = null;
  }
}
