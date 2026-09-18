/** JSCPP-backed adapter for C/C++. Meant to run inside executionWorker.ts, off the main thread. */
import JSCPP from "JSCPP";
import type { JscppDebugger } from "JSCPP";

import algorithmInclude from "./cppStl/algorithmInclude";
import { wrapIostreamForContainerPrinting } from "./cppStl/iostreamPatch";
import { preprocessCpp } from "./cppStl/preprocess";
import queueInclude from "./cppStl/queueInclude";
import setInclude from "./cppStl/setInclude";
import stackInclude from "./cppStl/stackInclude";
import vectorInclude from "./cppStl/vectorInclude";
import type { ExecutionOptions, ExecutionResult, TraceStep, TraceVariable } from "./types";

JSCPP.includes.vector = vectorInclude;
JSCPP.includes.algorithm = algorithmInclude;
JSCPP.includes.stack = stackInclude;
JSCPP.includes.queue = queueInclude;
JSCPP.includes.set = setInclude;
// Must wrap (not replace) the real iostream — `cout` itself is only created by its own load().
JSCPP.includes.iostream = wrapIostreamForContainerPrinting(JSCPP.includes.iostream);

const DEFAULT_MAX_STEPS = 20000;

function describeError(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function collectVariables(mydebugger: JscppDebugger): Record<string, TraceVariable> {
  const variables: Record<string, TraceVariable> = {};
  try {
    for (const entry of mydebugger.variable()) {
      // Function bindings (e.g. the global `add`/`main` entries) carry no type/value; skip them.
      if (entry.type === undefined) continue;
      variables[entry.name] = { value: entry.value, type: entry.type };
    }
  } catch {
    // Guard against upstream JSCPP debugger makeValueString crashes on complex types
  }
  return variables;
}

export async function run(code: string, options: ExecutionOptions = {}): Promise<ExecutionResult> {
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
  let stdoutBuffer = "";

  let mydebugger: JscppDebugger;
  try {
    mydebugger = JSCPP.run(preprocessCpp(code), options.stdin ?? "", {
      debug: true,
      unsigned_overflow: "error",
      stdio: {
        write: (text) => {
          stdoutBuffer += text;
        },
      },
    });
  } catch (cause) {
    return { success: false, error: describeError(cause), steps: [], totalSteps: 0 };
  }

  const steps: TraceStep[] = [];
  let runtimeError: string | undefined;

  try {
    let stepIndex = 0;
    while (!mydebugger.done && stepIndex < maxSteps) {
      const node = mydebugger.nextNode();
      const done = mydebugger.next();
      if (node && node.sLine > 0) {
        steps.push({
          stepIndex,
          line: node.sLine,
          callStack: mydebugger.rt.scope.map((scope) => scope.$name),
          variables: collectVariables(mydebugger),
          stdout: stdoutBuffer,
        });
      }
      stepIndex += 1;
      if (done !== false) break;
    }
    if (!mydebugger.done && stepIndex >= maxSteps) {
      runtimeError = `Execution halted after ${maxSteps} steps (possible infinite loop).`;
    }
  } catch (cause) {
    runtimeError = describeError(cause);
  }

  return { success: !runtimeError, error: runtimeError, steps, totalSteps: steps.length };
}
