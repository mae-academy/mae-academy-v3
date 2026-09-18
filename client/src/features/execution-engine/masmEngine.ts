/**
 * MASM 8086 adapter — bridges the pure-TypeScript Cpu8086 interpreter (client/src/features/
 * emulator/Cpu8086.ts) and the MAE COM compiler (assembler.ts) to the unified TraceStep
 * contract. Deliberately does not use EmulatorCore/v86: no WASM, no network asset (the
 * "/manus-storage/..." proxy this project's v86 build depended on), everything runs
 * synchronously in-process. EmulatorCore.ts itself is left in place, just unused here.
 */
import { assembleMasmSubset } from "@/features/emulator/assembler";
import { Cpu8086, type StepResult } from "@/features/emulator/Cpu8086";

import type { ExecutionOptions, ExecutionResult, TraceStep } from "./types";

const DEFAULT_MAX_STEPS = 5000;
const YIELD_EVERY = 200;
const STACK_WINDOW_RADIUS = 64;

const hex = (value: number) =>
  (value & 0xffff).toString(16).toUpperCase().padStart(4, "0");
const bit = (flag: boolean) => (flag ? 1 : 0);
const wait = (ms: number) =>
  new Promise<void>(resolve => setTimeout(resolve, ms));

function formatRegisters(cpu: Cpu8086): Record<string, string> {
  return {
    AX: hex(cpu.reg.ax),
    BX: hex(cpu.reg.bx),
    CX: hex(cpu.reg.cx),
    DX: hex(cpu.reg.dx),
    SI: hex(cpu.reg.si),
    DI: hex(cpu.reg.di),
    BP: hex(cpu.reg.bp),
    SP: hex(cpu.reg.sp),
    IP: hex(cpu.ip),
    CS: hex(cpu.seg.cs),
    DS: hex(cpu.seg.ds),
    ES: hex(cpu.seg.es),
    SS: hex(cpu.seg.ss),
  };
}

function formatFlags(cpu: Cpu8086): Record<string, number> {
  return {
    ZF: bit(cpu.flags.zf),
    CF: bit(cpu.flags.cf),
    SF: bit(cpu.flags.sf),
    OF: bit(cpu.flags.of),
    PF: bit(cpu.flags.pf),
    DF: bit(cpu.flags.df),
  };
}

function captureStackWindow(
  cpu: Cpu8086
): Array<{ address: number; value: number }> {
  const start = Math.max(0, cpu.reg.sp - STACK_WINDOW_RADIUS);
  const bytes = cpu.readMemory(start, STACK_WINDOW_RADIUS * 2);
  return Array.from(bytes, (value, index) => ({
    address: start + index,
    value,
  }));
}

function describeError(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/** Kept only so the last run's memory can be inspected by the studio's "Main memory" panel. */
let lastCpu: Cpu8086 | null = null;

/** No-op, kept for API compatibility: the pure-TS engine has nothing to boot ahead of time. */
export async function preload(): Promise<void> {}

/** No-op, kept for API compatibility: the pure-TS engine holds no external resources to free. */
export async function dispose(): Promise<void> {
  lastCpu = null;
}

/** Reflects the machine state left behind by the last run() call (not the scrubbed trace step). */
export function peekMemory(address: number, length: number): Uint8Array {
  return lastCpu?.readMemory(address, length) ?? new Uint8Array(length);
}

export async function run(
  code: string,
  options: ExecutionOptions = {}
): Promise<ExecutionResult> {
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
  const program = assembleMasmSubset(code);
  if (program.diagnostics.length) {
    return {
      success: false,
      error: program.diagnostics
        .map(diagnostic => `L${diagnostic.line}: ${diagnostic.message}`)
        .join("\n"),
      steps: [],
      totalSteps: 0,
    };
  }

  let stdoutBuffer = "";
  const cpu = new Cpu8086(program, {
    onOutput: text => {
      stdoutBuffer += text;
    },
  });
  if (options.stdin) cpu.queueInput(options.stdin);
  lastCpu = cpu;

  const steps: TraceStep[] = [];
  let runtimeError: string | undefined;
  try {
    while (steps.length < maxSteps) {
      const result: StepResult | null = cpu.step();
      if (result === null) break;
      steps.push({
        stepIndex: steps.length,
        line: result.line ?? 0,
        instruction: result.instruction,
        callStack: [...cpu.callStack],
        variables: {},
        registers: formatRegisters(cpu),
        flags: formatFlags(cpu),
        memory: captureStackWindow(cpu),
        stdout: stdoutBuffer,
      });
      if (steps.length % YIELD_EVERY === 0) await wait(0);
    }
    if (cpu.error) {
      runtimeError = cpu.error;
    } else if (steps.length >= maxSteps && !cpu.halted) {
      runtimeError = `Execution halted after ${maxSteps} steps (possible infinite loop).`;
    }
  } catch (cause) {
    runtimeError = describeError(cause);
  }

  return {
    success: !runtimeError,
    error: runtimeError,
    steps,
    totalSteps: steps.length,
  };
}
