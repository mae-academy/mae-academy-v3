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
  stdout?: string;
}

export interface ExecutionResult {
  success: boolean;
  error?: string;
  steps: TraceStep[];
  totalSteps: number;
}

export interface ExecutionOptions {
  /** Fed to the program in source order as it reads stdin. */
  stdin?: string;
  /** Hard ceiling on trace steps; the only guard against an infinite loop in user code. */
  maxSteps?: number;
}

export interface LanguageEngine {
  readonly language: SupportedLanguage;
  run(code: string, options?: ExecutionOptions): Promise<ExecutionResult>;
}
