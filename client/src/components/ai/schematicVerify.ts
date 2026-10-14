import { extractJsonText, renderSpec, validateSchematic, type Issue, type RenderResult, type ValidationResult } from "@shared/schematic";

/**
 * Orchestration behind the schematic card: validate locally, and when the spec fails, ask the server to repair it
 * (at most MAX_REPAIR_ATTEMPTS rounds), re-validating every answer here. The server's own verdict is never trusted.
 * Pure of React; results are cached per spec text for the page's lifetime and identical requests share one run.
 */

export const MAX_REPAIR_ATTEMPTS = 2;
const MAX_ERRORS_SENT = 30;
const MAX_ERROR_CHARS = 300;
const MAX_SPEC_CHARS = 20_000;
const TOTAL_TIMEOUT_MS = 150_000;

export type VerifyStatus = "verified" | "unverified" | "unparseable";

export interface SchematicOutcome {
  status: VerifyStatus;
  /** The spec text that is displayed: the original, or a repaired JSON document. */
  specText: string;
  /** True when `specText` came out of a repair round instead of the message. */
  repaired: boolean;
  /** Repair rounds spent. */
  attempts: number;
  /** Set when the repair route could not be used (offline, 429, 503...), so the result is only locally checked. */
  repairError?: "unavailable";
  validation: ValidationResult;
  /** Null only when the spec could not be turned into a drawing at all. */
  render: RenderResult | null;
}

export interface VerifyProgress {
  phase: "verifying" | "fixing";
  attempt: number;
  issues: number;
}

/** Sends one repair request; resolves the corrected spec object (or null when none came back), rejects when the route is unusable. */
export type RepairFn = (spec: string, errors: string[], signal?: AbortSignal) => Promise<unknown>;

export class RepairUnavailableError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`schematic repair unavailable (${status})`);
    this.name = "RepairUnavailableError";
    this.status = status;
  }
}

export const requestRepair: RepairFn = async (spec, errors, signal) => {
  let response: Response;
  try {
    response = await fetch("/api/ai/schematic-repair", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spec, errors }),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new RepairUnavailableError(0);
  }
  if (!response.ok) throw new RepairUnavailableError(response.status);
  const data: unknown = await response.json().catch(() => null);
  const reply = typeof data === "object" && data !== null ? (data as { spec?: unknown }).spec : null;
  return typeof reply === "object" && reply !== null && !Array.isArray(reply) ? reply : null;
};

/** The messages sent to the repairer: one line each, capped like the route requires. */
export function issueMessages(issues: readonly Issue[]): string[] {
  const lines = issues.map((issue) => issue.message.replace(/\s+/g, " ").trim().slice(0, MAX_ERROR_CHARS)).filter(Boolean);
  return (lines.length ? lines : ["The spec failed validation."]).slice(0, MAX_ERRORS_SENT);
}

const analysisCache = new Map<string, SchematicOutcome>();

/** Local, synchronous check: parse, run the 10 gates, draw whatever can be drawn. Never throws. Memoized per text. */
export function analyzeSchematic(specText: string): SchematicOutcome {
  const hit = analysisCache.get(specText);
  if (hit) return hit;
  const validation = validateSchematic(specText);
  let render: RenderResult | null = null;
  if (validation.spec) {
    try {
      render = renderSpec(validation.spec);
    } catch {
      render = null;
    }
  }
  const status: VerifyStatus = !render ? "unparseable" : validation.ok ? "verified" : "unverified";
  const outcome: SchematicOutcome = { status, specText, repaired: false, attempts: 0, validation, render };
  if (analysisCache.size >= 64) analysisCache.delete(analysisCache.keys().next().value as string);
  analysisCache.set(specText, outcome);
  return outcome;
}

const RANK: Record<VerifyStatus, number> = { unparseable: 0, unverified: 1, verified: 2 };

/** Strictly better: more verified, then fewer errors. */
function isBetter(candidate: SchematicOutcome, than: SchematicOutcome): boolean {
  if (RANK[candidate.status] !== RANK[than.status]) return RANK[candidate.status] > RANK[than.status];
  return candidate.status === "unverified" && candidate.validation.errors.length < than.validation.errors.length;
}

export interface RepairLoopOptions {
  repair: RepairFn;
  maxAttempts?: number;
  signal?: AbortSignal;
  onProgress?: (progress: VerifyProgress) => void;
}

/**
 * Validate `original`; if it fails, up to `maxAttempts` repair rounds, each re-validated locally. Resolves the first
 * verified result, otherwise the best candidate seen (never claiming `verified` for a spec that did not pass).
 */
export async function verifyWithRepair(original: string, options: RepairLoopOptions): Promise<SchematicOutcome> {
  const { repair, maxAttempts = MAX_REPAIR_ATTEMPTS, signal, onProgress } = options;
  const first = analyzeSchematic(original);
  if (first.status === "verified") return first;

  let best = first;
  let current = first;
  let attempts = 0;
  let repairError: SchematicOutcome["repairError"];
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal?.aborted) break;
    const body = (extractJsonText(current.specText) ?? current.specText).trim();
    if (!body || body.length > MAX_SPEC_CHARS) break;
    onProgress?.({ phase: "fixing", attempt, issues: current.validation.errors.length });
    let reply: unknown;
    try {
      reply = await repair(body, issueMessages(current.validation.errors), signal);
    } catch (error) {
      if (signal?.aborted) throw error;
      repairError = "unavailable";
      break;
    }
    attempts = attempt;
    if (typeof reply !== "object" || reply === null) continue; // nothing usable came back: try again from the same spec
    const next: SchematicOutcome = { ...analyzeSchematic(JSON.stringify(reply)), repaired: true };
    if (next.status === "verified") return { ...next, attempts };
    if (isBetter(next, best)) best = next;
    current = next.status === "unparseable" ? current : next;
  }
  return { ...best, attempts, repairError };
}

export interface VerifyRun {
  promise: Promise<SchematicOutcome>;
  /** Current progress; listeners are called on every change. Returns the unsubscribe function. */
  progress: () => VerifyProgress;
  subscribe: (listener: (progress: VerifyProgress) => void) => () => void;
}

const finished = new Map<string, SchematicOutcome>();
const running = new Map<string, VerifyRun>();

/** The cached result of a completed repair run for this exact text, if any. */
export function cachedVerification(specText: string): SchematicOutcome | undefined {
  return finished.get(specText);
}

/** Test hook: forget every cached analysis and run. */
export function resetSchematicVerifyCache(): void {
  analysisCache.clear();
  finished.clear();
  running.clear();
}

/** Starts (or joins) the verify-and-repair run for a spec text. A run that could not reach the repair route is not cached, so a later click can retry. */
export function startVerification(specText: string, repair: RepairFn = requestRepair): VerifyRun {
  const existing = running.get(specText);
  if (existing) return existing;
  const done = finished.get(specText);
  if (done) return { promise: Promise.resolve(done), progress: () => ({ phase: "verifying", attempt: 0, issues: 0 }), subscribe: () => () => undefined };

  let state: VerifyProgress = { phase: "verifying", attempt: 0, issues: analyzeSchematic(specText).validation.errors.length };
  const listeners = new Set<(progress: VerifyProgress) => void>();
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TOTAL_TIMEOUT_MS);
  const promise = verifyWithRepair(specText, {
    repair,
    signal: abort.signal,
    onProgress: (progress) => {
      state = progress;
      listeners.forEach((listener) => listener(progress));
    },
  })
    .catch((): SchematicOutcome => ({ ...analyzeSchematic(specText), repairError: "unavailable" }))
    .then((outcome) => {
      clearTimeout(timer);
      running.delete(specText);
      if (!outcome.repairError) finished.set(specText, outcome);
      return outcome;
    });
  const run: VerifyRun = {
    promise,
    progress: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  running.set(specText, run);
  return run;
}
