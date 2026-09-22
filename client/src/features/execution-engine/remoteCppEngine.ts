export interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  success: boolean;
  error?: string;
}

export async function executeRemoteCpp(
  code: string,
  stdin: string = ""
): Promise<ExecutionResult> {
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
    });

    if (!res.ok) {
      throw new Error(`Wandbox HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    const stdout = data.program_output || "";
    const stderr = (data.compiler_error || "") + (data.program_error || "");
    const exitCode = parseInt(data.status, 10) || (data.compiler_error ? 1 : 0);

    return {
      stdout,
      stderr: stderr.trim(),
      exitCode,
      success: exitCode === 0 && !data.compiler_error,
    };
  } catch (err: any) {
    return {
      stdout: "",
      stderr: err.message || "Execution backend unreachable",
      exitCode: 1,
      success: false,
      error: err.message,
    };
  }
}

export async function executeRemoteC(
  code: string,
  stdin: string = ""
): Promise<ExecutionResult> {
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
    });

    if (!res.ok) {
      throw new Error(`Wandbox HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    const stdout = data.program_output || "";
    const stderr = (data.compiler_error || "") + (data.program_error || "");
    const exitCode = parseInt(data.status, 10) || (data.compiler_error ? 1 : 0);

    return {
      stdout,
      stderr: stderr.trim(),
      exitCode,
      success: exitCode === 0 && !data.compiler_error,
    };
  } catch (err: any) {
    return {
      stdout: "",
      stderr: err.message || "Execution backend unreachable",
      exitCode: 1,
      success: false,
      error: err.message,
    };
  }
}
