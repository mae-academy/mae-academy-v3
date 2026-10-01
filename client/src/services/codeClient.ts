import type { CompiledSketch, Diagnostic, PinUsage } from '@shared/code/arduinoTypes';
import type { RemoteOutcome, TraceStep } from '@shared/code/traceTypes';

const ENDPOINT = '/api/code/process';

/** Wire format of one request: `{ domain, request: { op, ... } }`, validated server-side by api/code/schema.ts. */
export interface CodeRequestBody { domain: 'arduino' | 'cpp-trace' | 'preprocess'; request: { op: string; [key: string]: unknown } }
export type CodeResponseBody = { v?: number; ok?: boolean; error?: string; ms?: number; [key: string]: unknown };
export type CodeTransport = (body: CodeRequestBody, signal?: AbortSignal) => Promise<CodeResponseBody>;

export class CodeEngineError extends Error {
  constructor(message: string, readonly status?: number) { super(message); }
}

/** POSTs one request to the serverless engine. */
export const evaluateCodeRemote: CodeTransport = async (body, signal) => {
  let response: Response;
  try {
    response = await fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal });
  } catch (error) {
    if ((error as { name?: string }).name === 'AbortError') throw error;
    throw new CodeEngineError('Cannot reach the code service');
  }
  if (!response.ok) {
    throw new CodeEngineError(
      response.status === 429 ? 'Code service rate limit reached; try again in a moment' : response.status === 403 ? 'The code service refused this request' : response.status === 400 ? 'The program is too large for the code service (limit 64 KB)' : `Code service error (${response.status})`,
      response.status,
    );
  }
  return (await response.json()) as CodeResponseBody;
};

let transport: CodeTransport = evaluateCodeRemote;
/** Test seam: route requests through an in-process handler. Pass `null` to restore the network. */
export const setCodeTransport = (next: CodeTransport | null): void => { transport = next ?? evaluateCodeRemote; };

const call = (request: CodeRequestBody, signal?: AbortSignal): Promise<CodeResponseBody> => transport(request, signal);

/**
 * Turns the JavaScript the service generated into a runnable sketch. The Edge function cannot evaluate dynamic code,
 * so it returns the generator source and this browser-side step instantiates it for the pin-bank runtime.
 */
export function instantiateSketch(js: string): CompiledSketch {
  const factory = new Function('$rt', '$h', js) as (rt: unknown, helpers: unknown) => ReturnType<CompiledSketch['instantiate']>;
  return { js, instantiate: (rt, helpers) => factory(rt, helpers) };
}

export type CompileSketchAnswer = { ok: true; sketch: CompiledSketch; pinUsage: PinUsage | null } | { ok: false; error: Diagnostic };

/** Sketch → generator program plus the static pin layout, from the serverless compiler. */
export async function compileSketchRemote(source: string, signal?: AbortSignal): Promise<CompileSketchAnswer> {
  const response = await call({ domain: 'arduino', request: { op: 'compile-sketch', source } }, signal);
  if (response.ok === false) return { ok: false, error: (response.diagnostic as Diagnostic | undefined) ?? { line: 1, message: String(response.error ?? 'Compilation failed') } };
  try {
    return { ok: true, sketch: instantiateSketch(String(response.js)), pinUsage: (response.pinUsage as PinUsage | null) ?? null };
  } catch (error) {
    return { ok: false, error: { line: 1, message: error instanceof Error ? error.message : 'The compiled sketch could not be loaded' } };
  }
}

/** Pin layout of a sketch (null while it does not parse); the generated program is not transferred. */
export async function analyzeSketchRemote(source: string, signal?: AbortSignal): Promise<PinUsage | null> {
  const response = await call({ domain: 'arduino', request: { op: 'compile-sketch', source, emit: false } }, signal);
  return response.ok === false ? null : ((response.pinUsage as PinUsage | null) ?? null);
}

/** Replays a finished C/C++ run as a per-statement trace of main() (cumulative stdout per frame). */
export async function traceCppRemote(language: 'c' | 'cpp', code: string, outcome: RemoteOutcome, signal?: AbortSignal): Promise<TraceStep[]> {
  const response = await call({ domain: 'cpp-trace', request: { op: 'trace-execution', language, code, outcome } }, signal);
  if (response.ok === false) throw new CodeEngineError(String(response.error ?? 'Trace failed'));
  return response.steps as TraceStep[];
}

/** Rewrites modern C++ (range-for, STL containers) into the dialect the teaching interpreter parses. */
export async function prepareStlRemote(code: string, signal?: AbortSignal): Promise<{ code: string; headers: string[] }> {
  const response = await call({ domain: 'preprocess', request: { op: 'prepare-stl', code } }, signal);
  if (response.ok === false) throw new CodeEngineError(String(response.error ?? 'Preprocessing failed'));
  return { code: String(response.code), headers: response.headers as string[] };
}
