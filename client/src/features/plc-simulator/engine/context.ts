import type { NetworkId, NodeId } from '../domain/ast';
import type { MemoryMap } from '../domain/memory';
import type { PlcAddress } from '../domain/types';
import type { FlowTrace } from './flow-trace';
import type { RuntimeState } from './runtime-state';
import type { Diagnostic, DiagnosticCode, DiagnosticSeverity, StatusFlags } from './types';

/** S7-200 allows eight nested MCR zones. */
export const MAX_MCR_DEPTH = 8;

/**
 * Per-scan execution context handed to every instruction handler.
 * Mutable by design: the evaluator advances the MCR zone stack as it walks the rungs.
 */
export class ExecContext {
  /** Network currently being evaluated; stamped onto diagnostics. */
  networkId: NetworkId = '';
  /** 1-based scan counter, mirrored from the executor. */
  scan = 0;
  /** Milliseconds of simulated time elapsed since the previous executed scan. */
  deltaMs = 0;
  /** When set, the evaluator records the power flow of every tree node it visits. */
  trace: FlowTrace | null = null;

  private readonly mcrStack: boolean[] = [];
  private mcrEnergised = true;
  private readonly collected: Diagnostic[] = [];

  constructor(
    readonly memory: MemoryMap,
    readonly state: RuntimeState,
    readonly flags: StatusFlags,
  ) {}

  /**
   * False inside a de-energised master-control zone. Output instructions must then leave
   * retentive data untouched and drive non-retentive outputs to their de-energised state.
   */
  get energised(): boolean {
    return this.mcrEnergised;
  }

  get mcrDepth(): number {
    return this.mcrStack.length;
  }

  /** Opens a master-control zone; the zone conducts only if every enclosing zone does. */
  pushMcr(power: boolean, nodeId: NodeId): void {
    if (this.mcrStack.length >= MAX_MCR_DEPTH) {
      this.report('MCR_DEPTH_EXCEEDED', 'error', `Master control nesting exceeds ${MAX_MCR_DEPTH}`, { nodeId });
      return;
    }
    this.mcrStack.push(power && this.mcrEnergised);
    this.mcrEnergised = this.mcrStack[this.mcrStack.length - 1] ?? true;
  }

  /** Closes the innermost master-control zone. */
  popMcr(nodeId: NodeId): void {
    if (this.mcrStack.length === 0) {
      this.report('MCR_UNBALANCED', 'error', 'MCR end without a matching MCR begin', { nodeId });
      return;
    }
    this.mcrStack.pop();
    this.mcrEnergised = this.mcrStack.length === 0 ? true : (this.mcrStack[this.mcrStack.length - 1] ?? true);
  }

  /** Resets the zone stack between scans and reports a program that left a zone open. */
  endScan(): void {
    if (this.mcrStack.length > 0) {
      this.report('MCR_UNBALANCED', 'error', `${this.mcrStack.length} master control zone(s) left open at end of scan`);
      this.mcrStack.length = 0;
    }
    this.mcrEnergised = true;
  }

  report(
    code: DiagnosticCode,
    severity: DiagnosticSeverity,
    message: string,
    ref: { nodeId?: NodeId; address?: PlcAddress } = {},
  ): void {
    // One entry per code+node per scan keeps a faulting rung from flooding the UI at 50 Hz.
    for (const existing of this.collected) {
      if (existing.code === code && existing.nodeId === ref.nodeId && existing.networkId === this.networkId) return;
    }
    this.collected.push({ code, severity, message, networkId: this.networkId || undefined, ...ref });
  }

  /** Drains the diagnostics gathered during the scan. */
  takeDiagnostics(): readonly Diagnostic[] {
    if (this.collected.length === 0) return EMPTY_DIAGNOSTICS;
    const out = this.collected.slice();
    this.collected.length = 0;
    return out;
  }
}

const EMPTY_DIAGNOSTICS: readonly Diagnostic[] = [];
