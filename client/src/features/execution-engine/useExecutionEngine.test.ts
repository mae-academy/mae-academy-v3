/** @vitest-environment jsdom */
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { useExecutionEngine } from "./useExecutionEngine";
import * as remoteCppEngine from "./remoteCppEngine";

describe("useExecutionEngine Integration for C/C++", () => {
  it("routes cpp code through executeRemoteCpp and pipes output to terminal steps", async () => {
    const spy = vi.spyOn(remoteCppEngine, "executeRemoteCpp").mockResolvedValueOnce({
      stdout: "Hello C++ 20\n",
      stderr: "",
      exitCode: 0,
      success: true,
    });

    const { result } = renderHook(() => useExecutionEngine());

    expect(result.current.isRunning).toBe(false);
    expect(result.current.result).toBeNull();

    await act(async () => {
      await result.current.runCode(
        "cpp",
        "#include <iostream>\nint main() { std::cout << \"Hello C++ 20\\n\"; return 0; }",
        { stdin: "sample_input" }
      );
    });

    expect(spy).toHaveBeenCalledWith(
      "#include <iostream>\nint main() { std::cout << \"Hello C++ 20\\n\"; return 0; }",
      "sample_input"
    );

    expect(result.current.isRunning).toBe(false);
    expect(result.current.result).not.toBeNull();
    expect(result.current.result?.success).toBe(true);
    expect(result.current.result?.error).toBeUndefined();
    expect(result.current.result?.steps.length).toBe(1);
    expect(result.current.result?.steps.at(-1)?.stdout).toBe(
      "Hello C++ 20\n[Process exited with code 0]"
    );

    spy.mockRestore();
  });

  it("routes c code through executeRemoteC and handles compiler errors", async () => {
    const spy = vi.spyOn(remoteCppEngine, "executeRemoteC").mockResolvedValueOnce({
      stdout: "",
      stderr: "error: expected ';' before 'return'",
      exitCode: 1,
      success: false,
    });

    const { result } = renderHook(() => useExecutionEngine());

    await act(async () => {
      await result.current.runCode("c", "int main() { return 0 }");
    });

    expect(spy).toHaveBeenCalled();
    expect(result.current.isRunning).toBe(false);
    expect(result.current.result?.success).toBe(false);
    expect(result.current.result?.error).toBe("error: expected ';' before 'return'");

    spy.mockRestore();
  });
});
