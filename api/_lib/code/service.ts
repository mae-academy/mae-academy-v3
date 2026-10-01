import { z } from 'zod';
import { CODE_LIMITS, CodeRequestSchema, type CodeRequest } from '../../code/schema';
import { analyzeSketch, compileSketchToJs } from './arduino/arduinoCompiler';
import { toTraceSteps } from './cpp/cppTrace';
import { preprocessCpp } from './cpp/preprocess';

export const CODE_PROTOCOL_VERSION = 1;

export interface ServeResult {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

type Req<D extends CodeRequest['domain']> = Extract<CodeRequest, { domain: D }>['request'];

function runArduino(request: Req<'arduino'>): Record<string, unknown> {
  const compiled = compileSketchToJs(request.source);
  if (!compiled.ok) return { ok: false, diagnostic: compiled.error };
  return { ok: true, ...(request.emit ? { js: compiled.js } : {}), pinUsage: analyzeSketch(request.source) };
}

/** Frames beyond the cap are dropped from the middle: the opening statements and the terminating frame (final output) stay. */
function capSteps<T extends { stepIndex: number }>(steps: T[], limit: number): T[] {
  if (steps.length <= limit) return steps;
  const kept = [...steps.slice(0, limit - 1), steps[steps.length - 1]];
  return kept.map((step, index) => ({ ...step, stepIndex: index }));
}

function runCppTrace(request: Req<'cpp-trace'>): Record<string, unknown> {
  const steps = capSteps(toTraceSteps(request.code, request.outcome), Math.min(request.maxSteps, CODE_LIMITS.maxTraceSteps));
  return { ok: true, steps, totalSteps: steps.length };
}

function runPreprocess(request: Req<'preprocess'>): Record<string, unknown> {
  return { ok: true, code: preprocessCpp(request.code), headers: Array.from(new Set(Array.from(request.code.matchAll(/^\s*#\s*include\s*<([\w./]+)>/gm), (m) => m[1]))) };
}

/** Transport-free request handler: easy to test, and shared by the Vercel function and Express. */
export function serveCode(payload: unknown): ServeResult {
  const parsed = CodeRequestSchema.safeParse(payload);
  if (!parsed.success) return { status: 400, body: { error: 'Invalid request', issues: z.treeifyError(parsed.error) } };
  try {
    const request = parsed.data;
    const result = request.domain === 'arduino' ? runArduino(request.request) : request.domain === 'cpp-trace' ? runCppTrace(request.request) : runPreprocess(request.request);
    return { status: 200, body: { v: CODE_PROTOCOL_VERSION, ...result } };
  } catch (error) {
    // Source the preprocessor cannot digest: the caller's input, reported as a diagnostic.
    return { status: 200, body: { v: CODE_PROTOCOL_VERSION, ok: false, error: error instanceof Error ? error.message : 'Processing failed' } };
  }
}
