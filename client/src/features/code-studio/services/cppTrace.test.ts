import { describe, expect, it } from "vitest";

import { buildCppTrace, toTraceSteps } from "./cppTrace";

const code = `#include <iostream>
// comment
int main() {
    std::cout << "A" << std::endl;

    /* block
       comment */
    int x = 2;
    std::cout << "B"
              << x << std::endl;
    printf("C\\n");
    return 0;
}`;
const outcome = { stdout: "A\nB2\nC\n", stderr: "", exitCode: 0 };

describe("cppTrace", () => {
  it("emits one frame per main() statement, skipping comments and directives", () => {
    const frames = buildCppTrace(code, outcome);
    expect(frames.map(frame => frame.lineNumber)).toEqual([4, 8, 9, 11, 12]);
    expect(frames.map(frame => frame.outputChunk)).toEqual(["A\n", undefined, "B2\n", "C\n", undefined]);
    expect(frames.at(-1)?.isTerminated).toBe(true);
  });

  it("streams output cumulatively and closes with the exit line", () => {
    const steps = toTraceSteps(code, outcome);
    expect(steps[0].stdout).toBe("A\n");
    expect(steps[1].stdout).toBe("A\n");
    expect(steps[3].stdout).toBe("A\nB2\nC\n");
    expect(steps.at(-1)?.stdout).toBe("A\nB2\nC\n[Process exited with code 0]");
  });

  it("falls back to a single frame when main() is not found", () => {
    expect(buildCppTrace("void f(){}", outcome)).toHaveLength(1);
  });
});
