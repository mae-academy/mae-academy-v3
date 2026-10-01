import type { LogoDiagnostic } from './validate';
import type { LogoProgram } from './types';

/** Protocol v1 of the LOGO! engine (see api/plc/logo/schema.ts). */
export const LOGO_PROTOCOL_VERSION = 1;

export type CpuMode = 'RUN' | 'STOP';

/**
 * Everything the stateless engine needs to continue a run. The browser is the system of record: it
 * sends back exactly what the previous response carried.
 *   b: per-block dynamic state [id, q, ta, phase, cnt, prev]
 *   i / q / m: input image, output relays and flags as strings of '0' / '1'
 *   c: completed scan cycles, t: simulated time of the last scan (null = none), dt: last scan period
 */
export interface LogoWireState {
  b: [number, number, number, number, number, number][];
  i: string;
  q: string;
  m: string;
  c: number;
  t: number | null;
  dt: number;
  run: 0 | 1;
}

/** One engine operation; a request applies its list in order, then returns the resulting state. */
export type LogoOp =
  | { t: 'start' }
  | { t: 'stop' }
  | { t: 'resync' }
  | { t: 'powerLoss' }
  | { t: 'clearAll' }
  /** `keep: false` discards every block's dynamic state (a program replaced wholesale). */
  | { t: 'load'; keep: boolean }
  /** One scan per entry of `at` (simulated ms), all against the same 24-character input image. */
  | { t: 'scan'; at: number[]; inputs: string };

export interface LogoEvaluateBody {
  v: 1;
  program: LogoProgram;
  st: LogoWireState;
  ops: LogoOp[];
}

export interface LogoEvaluateResponse {
  v: 1;
  ok: boolean;
  st?: LogoWireState;
  /** Errors that made the engine refuse the program (when `ok` is false). */
  cd?: LogoDiagnostic[];
  /** Server time spent on the request. */
  ms?: number;
}

export const EMPTY_WIRE_STATE: LogoWireState = { b: [], i: '0'.repeat(24), q: '0'.repeat(16), m: '0'.repeat(24), c: 0, t: null, dt: 0, run: 0 };
