/** The language-neutral part of the Code Studio trace contract (the client's TraceStep adds MASM-only fields on top). */
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
  /** Optional instruction text executed at this step (the source line). */
  instruction?: string;
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

/** What the remote compiler (real GCC) reported for a run. */
export interface RemoteOutcome {
  stdout: string;
  stderr: string;
  exitCode: number;
}
