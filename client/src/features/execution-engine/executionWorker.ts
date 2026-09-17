/// Web Worker hosting the Pyodide and JSCPP interpreters, keeping user-code execution off the main thread.
import * as cppEngine from "./cppEngine";
import * as pythonEngine from "./pythonEngine";
import type { ExecutionOptions, ExecutionResult, SupportedLanguage } from "./types";

export interface ExecutionRequest {
  type: "RUN";
  payload: { language: Exclude<SupportedLanguage, "masm8086">; code: string; options?: ExecutionOptions };
  id?: string;
}

export interface ExecutionResponse {
  type: "RESULT" | "ERROR";
  payload: ExecutionResult;
  id?: string;
}

// `lib` is dom-only in this project (see spiceWorker.ts), so worker globals are cast rather than
// pulling in `lib.webworker`, which collides with `lib.dom` in the same program.
const ctx = globalThis as unknown as {
  postMessage(message: ExecutionResponse): void;
  addEventListener(type: "message", listener: (event: MessageEvent<ExecutionRequest>) => void): void;
};

function describeError(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

async function execute(request: ExecutionRequest): Promise<ExecutionResult> {
  const { language, code, options } = request.payload;
  if (language === "python") return pythonEngine.run(code, options);
  if (language === "cpp" || language === "c") return cppEngine.run(code, options);
  throw new Error(`Unsupported language for the execution worker: ${String(language)}`);
}

ctx.addEventListener("message", (event) => {
  const request = event.data;
  execute(request)
    .then((result) => {
      ctx.postMessage({ type: "RESULT", payload: result, id: request.id });
    })
    .catch((cause: unknown) => {
      const failure: ExecutionResult = { success: false, error: describeError(cause), steps: [], totalSteps: 0 };
      ctx.postMessage({ type: "ERROR", payload: failure, id: request.id });
    });
});
