/** Timeout budget for Wandbox remote compilation requests. */
const WANDBOX_TIMEOUT_MS = 8000;

export interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  success: boolean;
  error?: string;
}

function parseWandboxResponse(data: Record<string, unknown>): ExecutionResult {
  const stdout = (data.program_output as string) || "";
  const stderr = (
    ((data.compiler_error as string) || "") +
    ((data.program_error as string) || "")
  ).trim();
  const exitCode =
    parseInt(data.status as string, 10) ||
    (data.compiler_error ? 1 : 0);

  return {
    stdout,
    stderr,
    exitCode,
    success: exitCode === 0 && !data.compiler_error,
  };
}

function makeOfflineResult(message: string): ExecutionResult {
  return {
    stdout: "",
    stderr: message || "Execution backend unreachable",
    exitCode: 1,
    success: false,
    error: message,
  };
}

export async function executeRemoteCpp(
  code: string,
  stdin: string = ""
): Promise<ExecutionResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WANDBOX_TIMEOUT_MS);

  try {
    const res = await fetch("https://wandbox.org/api/compile.json", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        compiler: "gcc-head",
        code: code,
        stdin: stdin,
        "compiler-option-raw": "-std=c++17\n-O0",
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Wandbox HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    return parseWandboxResponse(data);
  } catch (err: unknown) {
    const message =
      err instanceof DOMException && err.name === "AbortError"
        ? `Compilation timed out after ${WANDBOX_TIMEOUT_MS / 1000}s — the server may be overloaded. Try again.`
        : err instanceof Error
          ? err.message
          : "Execution backend unreachable";
    return makeOfflineResult(message);
  } finally {
    clearTimeout(timer);
  }
}

export async function executeRemoteC(
  code: string,
  stdin: string = ""
): Promise<ExecutionResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WANDBOX_TIMEOUT_MS);

  try {
    const res = await fetch("https://wandbox.org/api/compile.json", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        compiler: "gcc-head-c",
        code: code,
        stdin: stdin,
        "compiler-option-raw": "-std=c11\n-O0",
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Wandbox HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    return parseWandboxResponse(data);
  } catch (err: unknown) {
    const message =
      err instanceof DOMException && err.name === "AbortError"
        ? `Compilation timed out after ${WANDBOX_TIMEOUT_MS / 1000}s — the server may be overloaded. Try again.`
        : err instanceof Error
          ? err.message
          : "Execution backend unreachable";
    return makeOfflineResult(message);
  } finally {
    clearTimeout(timer);
  }
}
