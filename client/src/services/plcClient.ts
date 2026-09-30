import type { LadderProgram } from '@/features/plc-simulator/domain/ast';
import type { MemorySnapshot } from '@/features/plc-simulator/domain/memory';
import type { EvaluateResponse } from '../../../api/_lib/plc/evaluate';
import type { EvaluateRequest, WireState } from '../../../api/plc/schema';

export type { EvaluateResponse, WireState };

/** Request body as the client builds it; the server re-validates everything with Zod. */
export type EvaluateBody = Omit<EvaluateRequest, 'program' | 'state' | 'scans'> & {
  program: LadderProgram;
  state: WireState;
  scans: { deltaMs: number; inputs: string }[];
};

export type PlcTransport = (body: EvaluateBody, signal?: AbortSignal) => Promise<EvaluateResponse>;

export class PlcEngineError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    /** From a 429's Retry-After header. */
    readonly retryAfterMs?: number,
  ) {
    super(message);
  }
  /** Worth retrying: network failure, throttling or a transient server error. */
  get retryable(): boolean {
    return this.status === undefined || this.status === 429 || this.status >= 500;
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
    const retryAfter = Number(response.headers.get('retry-after'));
    throw new PlcEngineError(
      response.status === 429 ? 'Simulation rate limit reached' : `Simulation engine error (${response.status})`,
      response.status,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined,
    );
  }
  return (await response.json()) as EvaluateResponse;
};

// ---- wire codec ---------------------------------------------------------------------------------

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

export function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

const BYTE_AREAS = ['I', 'Q', 'M', 'V'] as const;
const INDEXED_AREAS = ['T', 'C'] as const;

export function encodeMemory(snapshot: MemorySnapshot): WireState['memory'] {
  const bytes: Record<string, string> = {};
  for (const area of BYTE_AREAS) {
    const b = snapshot.bytes[area];
    if (b) bytes[area] = toBase64(b);
  }
  const indexed: Record<string, { current: number[]; preset: number[]; status: string }> = {};
  for (const area of INDEXED_AREAS) {
    const s = snapshot.indexed[area];
    if (s) indexed[area] = { current: Array.from(s.current), preset: Array.from(s.preset), status: toBase64(s.status) };
  }
  return { profileId: snapshot.profileId, bytes, indexed };
}

export function decodeMemory(wire: WireState['memory']): MemorySnapshot {
  const bytes: MemorySnapshot['bytes'] = {};
  for (const area of BYTE_AREAS) {
    const text = wire.bytes[area];
    if (text !== undefined) bytes[area] = fromBase64(text);
  }
  const indexed: MemorySnapshot['indexed'] = {};
  for (const area of INDEXED_AREAS) {
    const s = wire.indexed[area];
    if (s) indexed[area] = { current: Uint16Array.from(s.current), preset: Uint16Array.from(s.preset), status: fromBase64(s.status) };
  }
  return { profileId: wire.profileId, bytes, indexed };
}
