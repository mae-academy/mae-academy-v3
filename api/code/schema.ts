import { z } from 'zod';

/** Hard request limits: every string and number is bounded so a payload cannot exhaust CPU or memory. */
export const CODE_LIMITS = {
  /** Source text, in UTF-16 code units (64 KB of ASCII). */
  maxSourceChars: 64 * 1024,
  maxStdoutChars: 256 * 1024,
  maxStderrChars: 64 * 1024,
  /** Trace frames returned for one run. */
  maxTraceSteps: 2000,
} as const;

const source = z.string().min(1).max(CODE_LIMITS.maxSourceChars);

const arduino = z.discriminatedUnion('op', [
  /** Sketch → JavaScript generator source, plus the static pin-usage layout for the board. */
  z.object({
    op: z.literal('compile-sketch'),
    source,
    /** false: return only the diagnostic and pin layout (the editor's debounced board-layout refresh), not the generated program. */
    emit: z.boolean().default(true),
  }),
]);

const cppTrace = z.discriminatedUnion('op', [
  /** Replays a finished C/C++ run (real GCC output) as a per-statement trace of main(). */
  z.object({
    op: z.literal('trace-execution'),
    language: z.enum(['c', 'cpp']),
    code: source,
    outcome: z.object({
      stdout: z.string().max(CODE_LIMITS.maxStdoutChars),
      stderr: z.string().max(CODE_LIMITS.maxStderrChars),
      exitCode: z.number().int().min(-1000).max(1000),
    }),
    maxSteps: z.number().int().min(1).max(CODE_LIMITS.maxTraceSteps).default(CODE_LIMITS.maxTraceSteps),
  }),
]);

const preprocess = z.discriminatedUnion('op', [
  /** Rewrites modern C++ (range-for, monomorphised STL containers) into the dialect the teaching interpreter parses. */
  z.object({ op: z.literal('prepare-stl'), code: source }),
]);

/** Domain discriminator: `arduino`, `cpp-trace` or `preprocess`; each names one operation of it. */
export const CodeRequestSchema = z.discriminatedUnion('domain', [
  z.object({ domain: z.literal('arduino'), request: arduino }),
  z.object({ domain: z.literal('cpp-trace'), request: cppTrace }),
  z.object({ domain: z.literal('preprocess'), request: preprocess }),
]);
export type CodeRequest = z.infer<typeof CodeRequestSchema>;
