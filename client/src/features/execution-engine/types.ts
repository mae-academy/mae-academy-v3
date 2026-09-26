import type { VideoState } from "@/features/emulator/videoMemory";

/** Unified trace contract every language adapter (Python, C/C++, MASM) must emit. */

export type SupportedLanguage = "python" | "cpp" | "c" | "masm8086";

export interface TraceVariable {
  value: unknown;
  type: string;
  address?: string;
}

export interface TraceStep {
  stepIndex: number;
  line: number;
  callStack: string[];
  variables: Record<string, TraceVariable>;
  /** MASM only: AX, BX, CX, DX, etc. */
  registers?: Record<string, string>;
  /** MASM only: ZF, CF, SF, OF, etc. */
  flags?: Record<string, number>;
  /** MASM only: a bounded byte window (e.g. around SP) captured at this step. */
  memory?: Array<{ address: number; value: number }>;
  /** Optional instruction text executed at this step (e.g. MASM disasm or source line). */
  instruction?: string;
  stdout?: string;
  /** MASM only: 80x25 text-mode VRAM snapshot after this step (rows shared between steps). */
  video?: VideoState;
}

export interface ExecutionResult {
  success: boolean;
  error?: string;
  steps: TraceStep[];
  totalSteps: number;
  /** MASM only: execution is paused on a blocking keyboard INT with an empty stdin queue. */
  awaitingInput?: boolean;
}

export interface ExecutionOptions {
  /** Fed to the program in source order as it reads stdin. */
  stdin?: string;
  /** Hard ceiling on trace steps; the only guard against an infinite loop in user code. */
  maxSteps?: number;
  /**
   * When true, Python uses RUN_FAST (stdout-only, no sys.settrace) for instant
   * terminal dumps.  When false/absent, Python uses full per-line tracing so the
   * speed-aware playback animation loop has real steps to step through.
   */
  instant?: boolean;
}

export interface LanguageEngine {
  readonly language: SupportedLanguage;
  run(code: string, options?: ExecutionOptions): Promise<ExecutionResult>;
}
