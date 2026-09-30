import type { LadderProgram } from '@/features/plc-simulator/domain/ast';
import type { Diagnostic } from '@/features/plc-simulator/engine/types';

/** Protocol v2 (see shared/plcWire.ts and api/plc/schema.ts). */
export interface EvaluateBody {
  v: 2;
  /** Hash of a program the server already holds; omitted when `program` is sent instead. */
  h?: string;
  program?: LadderProgram;
  /** Carried state: memory (zero-run packed, base64), the server's opaque runtime state, scan counter. */
  st: { m: string; r: unknown; c: number };
  /** Input image, sampled once for the whole batch. */
  in: string;
  /** Scans in the batch and simulated ms per scan. */
  n: number;
  dt: number;
  tr?: boolean;
}

export interface EvaluateResponse {
  v: 2;
  ok: boolean;
  /** Hash to send instead of the program from now on. */
  h?: string;
  /** Changed memory cells, as a diff against the memory the request carried. */
  m?: string;
  r?: unknown;
  c?: number;
  /** Area Q after the last scan. */
  o?: string;
  tr?: { nodes: number; bits: string };
  /** Sparse per-scan results: `f` = one flag byte per scan, `g` = [scanIndex, diagnostics][]. */
  sc?: { f?: string; g?: [number, Diagnostic[]][] };
  /** Compile diagnostics: warnings on registration, errors when `ok` is false. */
  cd?: Diagnostic[];
  /** Server time spent on the request. */
  ms?: number;
}

export type PlcTransport = (body: EvaluateBody, signal?: AbortSignal) => Promise<EvaluateResponse>;

export type PlcErrorCode = 'need_program' | 'version';

export class PlcEngineError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    /** From a 429's Retry-After header. */
    readonly retryAfterMs?: number,
    readonly code?: PlcErrorCode,
  ) {
    super(message);
  }
  /** Worth retrying: network failure, throttling or a transient server error. */
  get retryable(): boolean {
    return this.code === undefined && (this.status === undefined || this.status === 429 || this.status >= 500);
  }
}

const ENDPOINT = '/api/plc/evaluate';

/** POSTs one batch to the serverless engine. */
export const evaluateRemote: PlcTransport = async (body, signal) => {
  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if ((error as { name?: string }).name === 'AbortError') throw error;
    throw new PlcEngineError('Cannot reach the simulation engine');
  }
  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
    if (response.status === 409 && detail?.error === 'need_program') {
      throw new PlcEngineError('The engine needs the program', 409, undefined, 'need_program');
    }
    if (response.status === 400 && detail?.error === 'version_mismatch') {
      throw new PlcEngineError(detail.message ?? 'The simulator was updated; reload the page.', 400, undefined, 'version');
    }
    const retryAfter = Number(response.headers.get('retry-after'));
    throw new PlcEngineError(
      response.status === 429
        ? 'Simulation rate limit reached'
        : response.status === 403
          ? 'The simulation engine refused this request'
          : `Simulation engine error (${response.status})`,
      response.status,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined,
    );
  }
  return (await response.json()) as EvaluateResponse;
};
