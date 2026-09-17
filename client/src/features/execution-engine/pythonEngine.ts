/** Pyodide-backed adapter for Python. Meant to run inside executionWorker.ts, off the main thread. */
import type {
  PyodideInterface,
  loadPyodide as LoadPyodideSignature,
} from "pyodide";

import type { ExecutionOptions, ExecutionResult } from "./types";

const PYODIDE_VERSION = "0.27.8";
const PYODIDE_CDN_BASE = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
const DEFAULT_MAX_STEPS = 20000;

/**
 * A frame's `sys.settrace` line callback fires even inside `while True: pass`, so counting
 * steps there is the only way to interrupt a runaway loop without losing the partial trace.
 *
 * `sourceLiteral` is a `JSON.stringify` of the user's code: every escape JSON produces
 * (`\\n`, `\\"`, `\\uXXXX`, ...) is also valid inside a Python double-quoted string, so it can be
 * spliced in directly without touching `pyodide.globals` (typed too narrowly for `.set`/`.delete`).
 */
function buildHarness(sourceLiteral: string, maxSteps: number): string {
  return `
import sys, json, io, contextlib, traceback

__mae_user_source__ = ${sourceLiteral}
__mae_max_steps__ = ${maxSteps}

class __MaeTraceLimit(Exception):
    pass

def __mae_default(value):
    try:
        return repr(value)
    except Exception:
        return "<unrepresentable>"

def __mae_serialize_locals(local_vars):
    # Excludes dunders too: the top-level exec() namespace carries __name__/__builtins__,
    # and the latter's repr alone is the entire builtins module.
    return {
        name: {"value": value, "type": type(value).__name__}
        for name, value in local_vars.items()
        if not name.startswith("__")
    }

__mae_steps = []
__mae_stdout = io.StringIO()
__mae_step_count = 0
__mae_call_stack = []  # the top-level exec() frame's own "call" event seeds this with "<module>"

def __mae_tracer(frame, event, arg):
    global __mae_step_count
    if frame.f_code.co_filename != "<mae_user_code>":
        return __mae_tracer
    if event == "call":
        __mae_call_stack.append(frame.f_code.co_name)
    elif event == "return":
        if len(__mae_call_stack) > 1:
            __mae_call_stack.pop()
    elif event == "line":
        __mae_step_count += 1
        if __mae_step_count > __mae_max_steps__:
            raise __MaeTraceLimit(
                f"Execution halted after {__mae_max_steps__} steps (possible infinite loop)."
            )
        __mae_steps.append({
            "stepIndex": __mae_step_count - 1,
            "line": frame.f_lineno,
            "callStack": list(__mae_call_stack),
            "variables": __mae_serialize_locals(frame.f_locals),
            "stdout": __mae_stdout.getvalue(),
        })
    return __mae_tracer

__mae_namespace = {"__name__": "__main__"}
__mae_error = None
sys.settrace(__mae_tracer)
try:
    with contextlib.redirect_stdout(__mae_stdout):
        exec(compile(__mae_user_source__, "<mae_user_code>", "exec"), __mae_namespace)
except __MaeTraceLimit as limit_error:
    __mae_error = str(limit_error)
except BaseException as run_error:
    __mae_error = "".join(traceback.format_exception_only(type(run_error), run_error)).strip()
finally:
    sys.settrace(None)

# A 'line' event fires *before* that line runs, so the last captured step never reflected its own
# line's effect (a trailing print()'s output, or a trailing assignment's variable, went missing).
# Patch it with the definitive post-execution state now that the real namespace is available.
if __mae_steps:
    __mae_steps[-1]["variables"] = __mae_serialize_locals(__mae_namespace)
    __mae_steps[-1]["stdout"] = __mae_stdout.getvalue()

json.dumps({"steps": __mae_steps, "error": __mae_error}, default=__mae_default)
`;
}

interface HarnessOutput {
  steps: Array<{
    stepIndex: number;
    line: number;
    callStack: string[];
    variables: Record<string, { value: unknown; type: string }>;
    stdout: string;
  }>;
  error: string | null;
}

let pyodidePromise: Promise<PyodideInterface> | null = null;

async function getPyodide(): Promise<PyodideInterface> {
  if (!pyodidePromise) {
    pyodidePromise = (async () => {
      const pyodideModule = (await import(
        /* @vite-ignore */ `${PYODIDE_CDN_BASE}pyodide.mjs`
      )) as { loadPyodide: typeof LoadPyodideSignature };
      return pyodideModule.loadPyodide({ indexURL: PYODIDE_CDN_BASE });
    })();
  }
  return pyodidePromise;
}

function describeError(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export async function run(
  code: string,
  options: ExecutionOptions = {}
): Promise<ExecutionResult> {
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;

  let pyodide: PyodideInterface;
  try {
    pyodide = await getPyodide();
  } catch (cause) {
    return {
      success: false,
      error: `Unable to load the Python runtime: ${describeError(cause)}`,
      steps: [],
      totalSteps: 0,
    };
  }

  const stdinLines = (options.stdin ?? "").split("\n");
  let stdinCursor = 0;
  pyodide.setStdin({
    stdin: () =>
      stdinCursor < stdinLines.length ? stdinLines[stdinCursor++] : null,
  });

  try {
    const harness = buildHarness(JSON.stringify(code), maxSteps);
    const resultJson = await pyodide.runPythonAsync(harness);
    const output = JSON.parse(String(resultJson)) as HarnessOutput;
    const steps = output.steps.map(step => ({
      stepIndex: step.stepIndex,
      line: step.line,
      callStack: step.callStack,
      variables: step.variables,
      stdout: step.stdout,
    }));
    return {
      success: output.error === null,
      error: output.error ?? undefined,
      steps,
      totalSteps: steps.length,
    };
  } catch (cause) {
    return {
      success: false,
      error: describeError(cause),
      steps: [],
      totalSteps: 0,
    };
  }
}
