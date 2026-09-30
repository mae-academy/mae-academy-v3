import type { EvalTree } from './compiler';

/** Power flow entering and leaving one node of an {@link EvalTree} during the last scan. */
export interface FlowSample {
  in: boolean;
  out: boolean;
}

/**
 * Optional per-scan record of rung power flow, keyed by tree-node identity.
 *
 * Compiled trees are immutable and live as long as the program does, so identity is a stable key and
 * samples are updated in place: recording allocates only the first time a node is seen. A WeakMap
 * lets samples of a replaced program be collected without explicit cleanup.
 */
export class FlowTrace {
  private samples = new WeakMap<EvalTree, FlowSample>();

  record(tree: EvalTree, powerIn: boolean, powerOut: boolean): void {
    const sample = this.samples.get(tree);
    if (sample) {
      sample.in = powerIn;
      sample.out = powerOut;
    } else {
      this.samples.set(tree, { in: powerIn, out: powerOut });
    }
  }

  get(tree: EvalTree): Readonly<FlowSample> | undefined {
    return this.samples.get(tree);
  }

  read(tree: EvalTree, side: 'in' | 'out'): boolean {
    return this.samples.get(tree)?.[side] ?? false;
  }

  /** Drops every sample; used when the controller stops so no wire stays energised. */
  clear(): void {
    this.samples = new WeakMap<EvalTree, FlowSample>();
  }
}
