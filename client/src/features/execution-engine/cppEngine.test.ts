import { describe, expect, it } from "vitest";

import { run } from "@/features/execution-engine/cppEngine";

describe("cppEngine.run", () => {
  it("traces a C++ program with a function call and captures stdout", async () => {
    const result = await run(`
#include <iostream>
using namespace std;
int add(int a, int b) {
  int result = a + b;
  return result;
}
int main() {
  int x = 3;
  int y = 4;
  int z = add(x, y);
  cout << z << endl;
  return 0;
}
`);
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.steps.length).toBeGreaterThan(0);
    expect(result.steps.at(-1)?.stdout).toBe("7\n");
    const callStep = result.steps.find(step =>
      step.callStack.includes("function add")
    );
    expect(callStep).toBeDefined();
    const zStep = result.steps.find(step => step.variables.z?.value === "7");
    expect(zStep).toBeDefined();
  });

  it("reports a parse error as a failed result instead of throwing", async () => {
    const result = await run("int main( { return 0; }");
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    expect(result.steps).toHaveLength(0);
  });

  it("halts a genuine infinite loop instead of hanging the test", async () => {
    const result = await run(
      `
int main() {
  int i = 0;
  while (1) { i = i + 1; }
  return 0;
}
`,
      { maxSteps: 500 }
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/possible infinite loop/i);
    // JSCPP's debugger burns its first internal step priming the initial state (no source line
    // yet), so exactly maxSteps trace entries is not guaranteed — only that it stopped at the cap.
    expect(result.steps.length).toBeLessThanOrEqual(500);
    expect(result.steps.length).toBeGreaterThan(450);
  });

  it("does not surface function bindings (e.g. main/add) as traced variables", async () => {
    const result = await run(`
#include <iostream>
using namespace std;
int add(int a, int b) { return a + b; }
int main() {
  int z = add(1, 2);
  cout << z << endl;
  return 0;
}
`);
    const lastStep = result.steps.at(-1);
    expect(lastStep?.variables.add).toBeUndefined();
    expect(lastStep?.variables.main).toBeUndefined();
  });
});
