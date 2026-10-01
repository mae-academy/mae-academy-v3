import { evaluateLogoRemote, type LogoTransport } from '@/services/logoClient';
import { INITIAL_BLOCK_STATE, type BlockState } from '@shared/logo/state';
import { ADDRESS_SPACE, STARTUP_FLAG, type Bit } from '@shared/logo/types';
import type { CheckedProgram } from '@shared/logo/validate';
import { EMPTY_WIRE_STATE, LOGO_PROTOCOL_VERSION, type CpuMode, type LogoOp, type LogoWireState } from '@shared/logo/wire';
import { paramViews, type ParamView } from './model/params';

export interface LogoRemoteOptions {
  readonly transport?: LogoTransport;
  /** Minimum time between two scan requests; scans arriving sooner ride in the next batch. */
  readonly batchMs?: number;
  readonly clock: () => number;
  /** Called after every applied response. */
  readonly onUpdate: () => void;
  readonly onError: (message: string) => void;
}

const MAX_OPS = 16; // matches LOGO_LIMITS.maxOps on the server
const MAX_SCANS = 64; // matches LOGO_LIMITS.maxScansPerOp
const zero = (length: number): string => '0'.repeat(length);
const bitAt = (text: string, index: number): Bit => (text[index] === '1' ? 1 : 0);

/**
 * Client end of the serverless LOGO! engine. The engine is stateless, so this object is the system
 * of record: it carries the state each response returned and sends it back with the next batch of
 * operations. The scan algorithms never run here; the only local work is an optimistic mirror of
 * mode and outputs (relays open on STOP) so the panel answers a key press before the reply lands.
 */
export class LogoRemoteCpu {
  private readonly transport: LogoTransport;
  private readonly batchMs: number;
  private checked: CheckedProgram;
  /** What the engine last returned: the state every request builds on. */
  private carried: LogoWireState = EMPTY_WIRE_STATE;
  /** What the UI reads: `carried`, plus the optimistic effect of operations not yet answered. */
  private view: LogoWireState = EMPTY_WIRE_STATE;
  private blocks = new Map<number, BlockState>();
  private queue: LogoOp[] = [];
  private inFlight = false;
  private lastFlushAt = Number.NEGATIVE_INFINITY;
  private waiters: (() => void)[] = [];
  private roundTripMs = 0;

  constructor(
    checked: CheckedProgram,
    private readonly options: LogoRemoteOptions,
  ) {
    this.checked = checked;
    this.transport = options.transport ?? evaluateLogoRemote;
    this.batchMs = options.batchMs ?? 100;
  }

  // ---- read model --------------------------------------------------------------------------

  get mode(): CpuMode {
    return this.view.run === 1 ? 'RUN' : 'STOP';
  }
  get cycle(): number {
    return this.view.c;
  }
  /** Simulated time between the last two scans, ms. */
  get cycleTimeMs(): number {
    return this.view.dt;
  }
  /** Engine time per scan of the last batch, ms (server time plus network). */
  get workMs(): number {
    return this.roundTripMs;
  }
  readInputs(): readonly Bit[] {
    return Array.from({ length: ADDRESS_SPACE.I }, (_, i) => bitAt(this.view.i, i));
  }
  readOutputs(): readonly Bit[] {
    return Array.from({ length: ADDRESS_SPACE.Q }, (_, i) => bitAt(this.view.q, i));
  }
  readFlags(): readonly Bit[] {
    return Array.from({ length: ADDRESS_SPACE.M }, (_, i) => bitAt(this.view.m, i));
  }
  blockOutput(id: number): Bit {
    return this.blocks.get(id)?.q ?? 0;
  }
  blockState(id: number): BlockState {
    return this.blocks.get(id) ?? INITIAL_BLOCK_STATE;
  }
  params(): ParamView[] {
    return paramViews(this.checked.program, (id) => this.blockState(id));
  }

  /** Resolves once every queued operation has been answered. */
  idle(): Promise<void> {
    return this.queue.length === 0 && !this.inFlight ? Promise.resolve() : new Promise((resolve) => this.waiters.push(resolve));
  }

  // ---- commands ----------------------------------------------------------------------------

  /** Swaps the program. Parameter edits keep every surviving block's state; `keepState: false` clears it. */
  load(checked: CheckedProgram, keepState: boolean): void {
    this.checked = checked;
    if (keepState) {
      const live = new Set(checked.program.blocks.map((block) => block.id));
      this.show({ b: this.view.b.filter(([id]) => live.has(id)) });
      return;
    }
    this.show({ b: [] });
    this.enqueue({ t: 'load', keep: false });
  }

  start(): void {
    const m = zero(ADDRESS_SPACE.M).split('');
    m[STARTUP_FLAG - 1] = '1';
    this.show({ b: this.retained(), q: zero(ADDRESS_SPACE.Q), m: m.join(''), c: 0, t: null, dt: 0, run: 1 });
    this.enqueue({ t: 'start' });
  }

  stop(): void {
    this.show({ q: zero(ADDRESS_SPACE.Q), t: null, run: 0 });
    this.enqueue({ t: 'stop' });
  }

  resync(): void {
    this.show({ t: null });
    this.enqueue({ t: 'resync' });
  }

  powerLoss(): void {
    this.show({ b: this.retained(), q: zero(ADDRESS_SPACE.Q), m: zero(ADDRESS_SPACE.M), i: zero(ADDRESS_SPACE.I), t: null });
    this.enqueue({ t: 'powerLoss' });
  }

  clearAll(): void {
    this.show({ b: [], q: zero(ADDRESS_SPACE.Q), m: zero(ADDRESS_SPACE.M), i: zero(ADDRESS_SPACE.I), c: 0, t: null, dt: 0 });
    this.enqueue({ t: 'clearAll' });
  }

  /** Queues one scan at simulated time `nowMs`. Returns false outside RUN or for a rejected program. */
  scan(nowMs: number, physicalInputs: readonly Bit[]): boolean {
    if (this.view.run !== 1 || !this.checked.ok) return false;
    const inputs = Array.from({ length: ADDRESS_SPACE.I }, (_, i) => (physicalInputs[i] === 1 ? '1' : '0')).join('');
    const last = this.queue[this.queue.length - 1];
    if (last?.t === 'scan' && last.at.length < MAX_SCANS) {
      last.at.push(nowMs);
      last.inputs = inputs;
    } else {
      this.queue.push({ t: 'scan', at: [nowMs], inputs });
    }
    this.show({ i: inputs });
    if (this.options.clock() - this.lastFlushAt >= this.batchMs) void this.flush();
    return true;
  }

  // ---- internals ---------------------------------------------------------------------------

  private retained(): LogoWireState['b'] {
    const keep = new Set(this.checked.program.blocks.filter((block) => block.retentive).map((block) => block.id));
    return this.view.b.filter(([id]) => keep.has(id));
  }

  private show(patch: Partial<LogoWireState>): void {
    this.view = { ...this.view, ...patch };
    if (patch.b) this.syncBlocks();
  }

  private syncBlocks(): void {
    this.blocks = new Map(this.view.b.map(([id, q, ta, phase, cnt, prev]) => [id, { q: q === 1 ? 1 : 0, ta, phase, cnt, prev }] as const));
  }

  private enqueue(op: LogoOp): void {
    this.queue.push(op);
    void this.flush();
  }

  /** Sends everything queued now, without waiting for the batch interval (step, mode changes). */
  async flush(): Promise<void> {
    if (this.inFlight || this.queue.length === 0) return;
    this.inFlight = true;
    this.lastFlushAt = this.options.clock();
    const ops = this.queue.splice(0, MAX_OPS);
    const scans = ops.reduce((sum, op) => sum + (op.t === 'scan' ? op.at.length : 0), 0);
    try {
      const response = await this.transport({ v: LOGO_PROTOCOL_VERSION, program: this.checked.program, st: this.carried, ops });
      if (!response.ok || !response.st) {
        const reason = response.cd?.find((d) => d.severity === 'error')?.message ?? 'Program rejected';
        this.queue = [];
        this.view = { ...this.view, run: 0 };
        this.options.onError(reason);
      } else {
        this.carried = response.st;
        this.roundTripMs = scans > 0 ? (response.ms ?? 0) / scans : 0;
        if (this.queue.length === 0) {
          this.view = response.st;
          this.syncBlocks();
        }
      }
    } catch (error) {
      this.queue = [];
      this.view = { ...this.view, run: 0, q: zero(ADDRESS_SPACE.Q) };
      this.options.onError(error instanceof Error ? error.message : 'Simulation engine error');
    }
    this.inFlight = false;
    if (this.queue.length > 0) await this.flush();
    else this.waiters.splice(0).forEach((resolve) => resolve());
    this.options.onUpdate();
  }
}
