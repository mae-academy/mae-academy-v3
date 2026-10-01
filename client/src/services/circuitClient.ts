import {
  CIRCUIT_PROTOCOL_VERSION,
  type AnalysisRequest,
  type AnalysisResponse,
  type CircuitDescription,
  type DcRequest,
  type DcResponse,
  type SolveRequest,
  type SolveResponse,
  type TransientRequest,
  type TransientResponse,
} from '@shared/circuit/protocol';

/**
 * Bridge between schematic interactions and POST /api/circuit/solve. The solver itself runs on the server; this module only
 * serialises the electrical topology, carries the opaque engine state and retries what is safe to retry.
 */
export type CircuitErrorCode = 'need_circuit' | 'version';

export class CircuitEngineError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    /** From a 429's Retry-After header. */
    readonly retryAfterMs?: number,
    readonly code?: CircuitErrorCode,
  ) {
    super(message);
  }
  /** Worth retrying: network failure, throttling or a transient server error. */
  get retryable(): boolean {
    return this.code === undefined && (this.status === undefined || this.status === 429 || this.status >= 500);
  }
}

export type CircuitTransport = (body: SolveRequest & { v: number }, signal?: AbortSignal) => Promise<SolveResponse>;

const ENDPOINT = '/api/circuit/solve';

/** POSTs one request to the serverless solver. */
export const solveRemote: CircuitTransport = async (body, signal) => {
  let response: Response;
  try {
    response = await fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal });
  } catch (error) {
    if ((error as { name?: string }).name === 'AbortError') throw error;
    throw new CircuitEngineError('Cannot reach the simulation engine');
  }
  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
    if (response.status === 409 && detail?.error === 'need_circuit') throw new CircuitEngineError('The engine needs the circuit', 409, undefined, 'need_circuit');
    if (response.status === 400 && detail?.error === 'version_mismatch') throw new CircuitEngineError(detail.message ?? 'The simulator was updated; reload the page.', 400, undefined, 'version');
    const retryAfter = Number(response.headers.get('retry-after'));
    throw new CircuitEngineError(detail?.error ?? `Simulation engine error (${response.status})`, response.status, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined);
  }
  return (await response.json()) as SolveResponse;
};

type Payload<T extends SolveRequest> = Omit<T, 'v' | 'h' | 'circuit'>;

/**
 * One registered circuit. The first request carries the whole description; the server answers with its hash and every later
 * request sends only the hash (plus parameters / state). If the server no longer holds the circuit (another instance, an
 * eviction) it answers 409 and the description is sent again, transparently.
 */
export class CircuitSession {
  private hash: string | undefined;

  constructor(
    private readonly circuit: CircuitDescription,
    private readonly transport: CircuitTransport = solveRemote,
  ) {}

  send(request: Payload<DcRequest>, signal?: AbortSignal): Promise<DcResponse>;
  send(request: Payload<TransientRequest>, signal?: AbortSignal): Promise<TransientResponse>;
  send(request: Payload<AnalysisRequest>, signal?: AbortSignal): Promise<AnalysisResponse>;
  async send(request: Payload<SolveRequest>, signal?: AbortSignal): Promise<SolveResponse> {
    const body = { v: CIRCUIT_PROTOCOL_VERSION, ...request, ...(this.hash ? { h: this.hash } : { circuit: this.circuit }) } as SolveRequest & { v: number };
    try {
      const response = await this.transport(body, signal);
      this.hash = response.h ?? this.hash;
      return response;
    } catch (error) {
      if (error instanceof CircuitEngineError && error.code === 'need_circuit' && this.hash) {
        this.hash = undefined;
        return this.send(request as Payload<DcRequest>, signal);
      }
      throw error;
    }
  }
}
