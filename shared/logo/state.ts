import type { Bit } from './types';

/** Dynamic state of one function block, as the scan engine carries it between cycles. */
export interface BlockState {
  readonly q: Bit;
  /** Elapsed time of the running timer, ms. */
  readonly ta: number;
  /** Block-specific internal phase (0 = idle). */
  readonly phase: number;
  /** Counter value. */
  readonly cnt: number;
  /** Previous-cycle pin levels: bit i = pin i. Drives every edge detector. */
  readonly prev: number;
}

export const INITIAL_BLOCK_STATE: BlockState = { q: 0, ta: 0, phase: 0, cnt: 0, prev: 0 };
