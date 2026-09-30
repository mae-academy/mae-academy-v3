import { z } from 'zod';
import { getProfile, type HardwareProfile } from './domain/hardware';
import type { LadderProgram } from './domain/ast';
import { MemoryMap } from './domain/memory';
import { compileProgram, type CompiledProgram } from './engine/compiler';
import type { StatusFlags } from './engine/types';
import { runBatch, type ScanResult } from './evaluate';
import { packRuntime, unpackRuntime } from './runtime-pack';
import { EvaluateRequestSchema, LIMITS } from '../../plc/schema';
import { PROTOCOL_VERSION, WireError, applyDiff, canonicalJson, encodeDiff, flattenSnapshot, fromBase64, imageSize, toBase64, unflattenSnapshot } from '../../../shared/plcWire';

interface CachedProgram {
  readonly profile: HardwareProfile;
  readonly compiled: CompiledProgram;
}

/**
 * Bounded least-recently-used cache of validated, compiled programs, one per isolate. It is keyed
 * by a hash the server computes itself from the program it validated, so the key always matches
 * the content and a client cannot plant a program under someone else's hash. A miss is harmless:
 * the client answers the 409 by sending the program again.
 */
export class ProgramCache {
  private readonly entries = new Map<string, CachedProgram>();
  constructor(private readonly max = 32) {}

  get(hash: string): CachedProgram | undefined {
    const entry = this.entries.get(hash);
    if (entry) {
      this.entries.delete(hash); // refresh recency
      this.entries.set(hash, entry);
    }
    return entry;
  }

  set(hash: string, entry: CachedProgram): void {
    this.entries.delete(hash);
    this.entries.set(hash, entry);
    while (this.entries.size > this.max) this.entries.delete(this.entries.keys().next().value as string);
  }

  get size(): number {
    return this.entries.size;
  }
}

export const defaultProgramCache = new ProgramCache();

export interface ServeResult {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

/** 128-bit content hash of a validated program. */
export async function programHash(program: unknown): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(program)));
  return Array.from(new Uint8Array(digest).subarray(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
}

const flagsByte = (f: Readonly<StatusFlags>): number => (f.zero ? 1 : 0) | (f.overflow ? 2 : 0) | (f.negative ? 4 : 0) | (f.divideByZero ? 8 : 0);

/** Per-scan results, sparse: flag bytes only if any scan raised one, diagnostics only for scans that have them. */
function packScans(scans: readonly ScanResult[]): Record<string, unknown> | undefined {
  const flags = Uint8Array.from(scans, (s) => flagsByte(s.statusFlags));
  const diagnostics = scans.flatMap((s, i) => (s.diagnostics.length > 0 ? [[i, s.diagnostics]] : []));
  if (!flags.some((f) => f !== 0) && diagnostics.length === 0) return undefined;
  return { ...(flags.some((f) => f !== 0) ? { f: toBase64(flags) } : {}), ...(diagnostics.length > 0 ? { g: diagnostics } : {}) };
}

/** Transport-free request handler: easy to test, and shared by the Vercel function and Express. */
export async function serveEvaluate(payload: unknown, cache: ProgramCache = defaultProgramCache): Promise<ServeResult> {
  const version = (payload as { v?: unknown } | null)?.v;
  if (version !== PROTOCOL_VERSION) {
    return { status: 400, body: { error: 'version_mismatch', expected: PROTOCOL_VERSION, message: 'The simulator was updated; reload the page.' } };
  }
  const parsed = EvaluateRequestSchema.safeParse(payload);
  if (!parsed.success) return { status: 400, body: { error: 'Invalid request', issues: z.treeifyError(parsed.error) } };
  const request = parsed.data;

  let hash: string;
  let entry: CachedProgram | undefined;
  let compileDiagnostics: unknown;
  if (request.program) {
    const program = request.program as unknown as LadderProgram;
    const profile = getProfile(program.profileId);
    if (!profile) return { status: 400, body: { error: `Unknown hardware profile "${program.profileId}"` } };
    const compiled = compileProgram(program, profile);
    if (!compiled.ok) return { status: 200, body: { v: PROTOCOL_VERSION, ok: false, cd: compiled.diagnostics } };
    hash = await programHash(request.program);
    entry = { profile, compiled };
    cache.set(hash, entry);
    if (compiled.diagnostics.length > 0) compileDiagnostics = compiled.diagnostics;
  } else {
    hash = request.h!;
    entry = cache.get(hash);
    if (!entry) return { status: 409, body: { v: PROTOCOL_VERSION, error: 'need_program' } };
  }

  try {
    const template = new MemoryMap(entry.profile).snapshot();
    const base = applyDiff(new Uint8Array(imageSize(template)), fromBase64(request.st.m));
    const inputs = fromBase64(request.in);
    if (inputs.length > 256) throw new WireError('input image too large');

    const result = runBatch({
      compiled: entry.compiled,
      profile: entry.profile,
      memory: unflattenSnapshot(template, base) as ReturnType<MemoryMap['snapshot']>,
      runtime: unpackRuntime(request.st.r),
      cycle: request.st.c,
      inputs,
      scans: request.n,
      deltaMs: request.dt,
      trace: request.tr === true,
    });

    const scans = packScans(result.scans);
    return {
      status: 200,
      body: {
        v: PROTOCOL_VERSION,
        ok: true,
        h: hash,
        m: toBase64(encodeDiff(base, flattenSnapshot(result.memory))), // only the cells this batch changed
        r: packRuntime(result.runtime),
        c: result.cycle,
        ...(result.outputs ? { o: toBase64(result.outputs) } : {}),
        ...(result.trace ? { tr: result.trace } : {}),
        ...(scans ? { sc: scans } : {}),
        ...(compileDiagnostics ? { cd: compileDiagnostics } : {}),
      },
    };
  } catch (error) {
    // Bad snapshot sizes, malformed diffs and unreadable addresses are the caller's fault, not ours.
    if (error instanceof WireError || (error instanceof Error && /Snapshot|not allocated|address|base64|atob/i.test(error.message))) {
      return { status: 400, body: { error: error.message } };
    }
    throw error;
  }
}

export { LIMITS };
