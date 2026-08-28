import { describe, expect, it } from "vitest";
import { defaultPlcAst, initialPlcMemory, numberValue, scanCycle, setWatchValue, type PlcAst } from "./plcEngine";

describe("independent PLC scan core", () => {
  it("keeps V bit, byte, word, and double-word views coherent", () => {
    let memory = initialPlcMemory();
    memory = setWatchValue(memory, "V100.3", true);
    expect(numberValue(memory, "VB100")).toBe(8);
    expect(numberValue(memory, "VW100")).toBe(2048);

    memory = setWatchValue(memory, "VW100", 0xabcd);
    expect(numberValue(memory, "VB100")).toBe(0xab);
    expect(numberValue(memory, "VB101")).toBe(0xcd);
    expect(numberValue(memory, "VD100")).toBe(0xabcd0000);
  });

  it("samples physical inputs, produces node power, and commits output image at scan end", () => {
    const memory = setWatchValue(initialPlcMemory(), "I0.0", true);
    const result = scanCycle(memory, defaultPlcAst(), 100);
    expect(result.power["rung-1"]).toBe(true);
    expect(result.nodePower["rung-1:main:contact-0"]).toBe(true);
    expect(result.memory.outputs["Q0.0"]).toBe(true);
    expect(result.memory.physicalOutputs["Q0.0"]).toBe(true);
  });

  it("rejects divide-by-zero without writing a destination", () => {
    const program: PlcAst = { rungs: [{ id: "divide", contacts: [{ address: "I0.0" }], output: { kind: "math", op: "DIV-W", args: ["10", "0", "VW0"] } }] };
    const result = scanCycle(setWatchValue(initialPlcMemory(), "I0.0", true), program, 100);
    expect(numberValue(result.memory, "VW0")).toBe(0);
    expect(result.diagnostics).toEqual([{ code: "DIVIDE_BY_ZERO", rungId: "divide", detail: "10 ÷ 0" }]);
  });
});
