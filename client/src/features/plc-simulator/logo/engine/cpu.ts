import { INITIAL_BLOCK_STATE, stepBlock, type BlockState } from './blocks';
import type { CompiledProgram } from './compile';
import { msToUnits } from './time';
import {
  ADDRESS_SPACE,
  BLOCK_SPECS,
  STARTUP_FLAG,
  type Bit,
  type ConnectorRef,
  type NumericParamKey,
  type TimeBase,
  type WireIn,
} from './types';

export type CpuMode = 'RUN' | 'STOP';

/** One editable parameter as parameter-assignment mode lists it. */
export interface ParamView {
  readonly blockId: number;
  readonly key: NumericParamKey;
  readonly kind: 'time' | 'count';
  /** Time params: timebase units; count params: the threshold. */
  readonly value: number;
  readonly base: TimeBase | null;
  /** Live actual value: `Ta` in timebase units, or `Cnt`. */
  readonly actual: number;
}

const zeros = (length: number): Bit[] => Array<Bit>(length).fill(0);

/**
 * LOGO! 0BA4 scan-cycle engine (spec §3.3): READ latches the inputs once, EVAL runs every block once
 * in dependency order, WRITE commits Q and M atomically, and timers advance by the measured wall
 * time between two scans. Q read-backs and flags are double-buffered, so any read inside cycle k
 * returns the value committed at the end of cycle k-1.
 */
export class LogoCpu {
  private compiled: CompiledProgram;
  private states = new Map<number, BlockState>();
  private inputs: Bit[] = zeros(ADDRESS_SPACE.I);
  private q: Bit[] = zeros(ADDRESS_SPACE.Q);
  private m: Bit[] = zeros(ADDRESS_SPACE.M);
  private lastScanAt: number | null = null;
  private cycleCount = 0;
  private lastDtMs = 0;
  private modeValue: CpuMode = 'STOP';

  constructor(compiled: CompiledProgram) {
    this.compiled = compiled;
  }

  get mode(): CpuMode {
    return this.modeValue;
  }

  get cycle(): number {
    return this.cycleCount;
  }

  /** Wall time between the last two scans, ms. */
  get cycleTimeMs(): number {
    return this.lastDtMs;
  }

  get program(): CompiledProgram {
    return this.compiled;
  }

  /**
   * Swaps the program. Parameter edits keep the live state of every surviving block (a running
   * timer keeps counting); blocks that no longer exist are dropped.
   */
  load(compiled: CompiledProgram, keepState: boolean): void {
    this.compiled = compiled;
    if (!keepState) {
      this.states.clear();
      return;
    }
    const live = new Set(compiled.program.blocks.map((block) => block.id));
    for (const id of Array.from(this.states.keys())) if (!live.has(id)) this.states.delete(id);
  }

  /** STOP -> RUN: outputs and flags cleared, non-retentive blocks reset, M8 armed for cycle 1. */
  start(): void {
    this.dropVolatile();
    this.q = zeros(ADDRESS_SPACE.Q);
    this.m = zeros(ADDRESS_SPACE.M);
    this.m[STARTUP_FLAG - 1] = 1;
    this.cycleCount = 0;
    this.lastScanAt = null;
    this.lastDtMs = 0;
    this.modeValue = 'RUN';
  }

  /** RUN -> STOP: the program halts and every output is forced off (relay contacts open). */
  stop(): void {
    this.modeValue = 'STOP';
    this.q = zeros(ADDRESS_SPACE.Q);
    this.lastScanAt = null;
  }

  /** Continue after a host-side pause without a cold start; the paused interval is not timed. */
  resync(): void {
    this.lastScanAt = null;
  }

  /** Supply lost: only retentive blocks keep their values (spec §1.4 rule 4). The mode survives. */
  powerLoss(): void {
    this.dropVolatile();
    this.q = zeros(ADDRESS_SPACE.Q);
    this.m = zeros(ADDRESS_SPACE.M);
    this.inputs = zeros(ADDRESS_SPACE.I);
    this.lastScanAt = null;
  }

  /** Full memory reset, retentive data included. */
  clearAll(): void {
    this.states.clear();
    this.q = zeros(ADDRESS_SPACE.Q);
    this.m = zeros(ADDRESS_SPACE.M);
    this.inputs = zeros(ADDRESS_SPACE.I);
    this.cycleCount = 0;
    this.lastScanAt = null;
    this.lastDtMs = 0;
  }

  /** One complete scan. Returns false (and does nothing) outside RUN or for a rejected program. */
  scan(nowMs: number, physicalInputs: readonly Bit[]): boolean {
    if (this.modeValue !== 'RUN' || !this.compiled.ok) return false;
    const dt = this.lastScanAt === null ? 0 : Math.max(0, nowMs - this.lastScanAt);
    this.lastScanAt = nowMs;
    this.lastDtMs = dt;

    // 1. READ: a single snapshot per cycle; nothing samples the terminals mid-cycle.
    this.inputs = Array.from({ length: ADDRESS_SPACE.I }, (_, index) => physicalInputs[index] ?? 0);

    // 2. EVAL
    for (const block of this.compiled.order) {
      const spec = BLOCK_SPECS[block.type];
      const pins = spec.pins.map((pin) => this.readWire(block.inputs[pin], spec.xDefault));
      this.states.set(block.id, stepBlock(block, pins, this.states.get(block.id) ?? INITIAL_BLOCK_STATE, dt));
    }

    // 3. WRITE: commit atomically; undriven Q/M (M8 included from cycle 2 on) fall to 0.
    const q = zeros(ADDRESS_SPACE.Q);
    const m = zeros(ADDRESS_SPACE.M);
    for (const sink of this.compiled.program.sinks) {
      const value = this.read(sink.source, 0);
      if (sink.target.kind === 'digital-output') q[sink.target.index - 1] = value;
      else m[sink.target.index - 1] = value;
    }
    this.q = q;
    this.m = m;
    this.cycleCount += 1;
    return true;
  }

  // ---- read access -------------------------------------------------------------------------

  readInputs(): readonly Bit[] {
    return this.inputs;
  }

  readOutputs(): readonly Bit[] {
    return this.q;
  }

  readFlags(): readonly Bit[] {
    return this.m;
  }

  blockOutput(id: number): Bit {
    return this.states.get(id)?.q ?? 0;
  }

  blockState(id: number): BlockState {
    return this.states.get(id) ?? INITIAL_BLOCK_STATE;
  }

  /** Every parameter visible in parameter-assignment mode (`+` protection), in block order. */
  params(): ParamView[] {
    const views: ParamView[] = [];
    for (const block of [...this.compiled.program.blocks].sort((a, b) => a.id - b.id)) {
      if (block.protected) continue;
      const spec = BLOCK_SPECS[block.type];
      const state = this.blockState(block.id);
      for (const key of spec.timeParams) {
        const time = block.params[key];
        if (!time) continue;
        views.push({ blockId: block.id, key, kind: 'time', value: time.value, base: time.base, actual: msToUnits(state.ta, time.base) });
      }
      for (const key of spec.countParams) {
        views.push({ blockId: block.id, key, kind: 'count', value: block.params[key] ?? 0, base: null, actual: state.cnt });
      }
    }
    return views;
  }

  // ---- internals ---------------------------------------------------------------------------

  private dropVolatile(): void {
    const retentive = new Set(this.compiled.program.blocks.filter((block) => block.retentive).map((block) => block.id));
    for (const id of Array.from(this.states.keys())) if (!retentive.has(id)) this.states.delete(id);
  }

  private readWire(wire: WireIn | undefined, xDefault: Bit): Bit {
    if (!wire) return xDefault;
    const level = this.read(wire.ref, xDefault);
    return wire.invert ? (level === 1 ? 0 : 1) : level;
  }

  private read(ref: ConnectorRef, xDefault: Bit): Bit {
    switch (ref.kind) {
      case 'hi':
        return 1;
      case 'lo':
        return 0;
      case 'x':
        return xDefault;
      case 'digital-input':
        return this.inputs[ref.index - 1] ?? 0;
      case 'digital-output':
        return this.q[ref.index - 1] ?? 0;
      case 'digital-flag':
        return this.m[ref.index - 1] ?? 0;
      case 'block-output':
        return this.blockOutput(ref.blockId);
      default: {
        const exhaustive: never = ref;
        return exhaustive;
      }
    }
  }
}
