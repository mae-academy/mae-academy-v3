import { describe, expect, it } from "vitest";
import { LAB_CONTEXTS } from "@shared/aiTypes";
import { aiPathForLab, labForSimulationSlug, parseLabParam, simulatorPathForLab } from "./aiLab";

describe("labForSimulationSlug", () => {
  it.each([
    ["control-systems", "control"],
    ["power-electronics", "power"],
    ["signals-and-systems", "signals"],
    ["circuit-lab", "circuits"],
    ["circuitlab-1", "circuits"],
    ["circuitlab-3", "circuits"],
    ["digital-logic-design", "logic"],
    ["code", "code"],
    ["arduino-studio", "arduino"],
    ["plc", "plc"],
    ["pneumatics-and-hydraulics", "fluid"],
  ])("%s -> %s", (slug, lab) => expect(labForSimulationSlug(slug)).toBe(lab));

  it("returns undefined for unknown, empty and prototype-ish slugs", () => {
    expect(labForSimulationSlug("nope")).toBeUndefined();
    expect(labForSimulationSlug("")).toBeUndefined();
    expect(labForSimulationSlug(undefined)).toBeUndefined();
    expect(labForSimulationSlug("constructor")).toBeUndefined();
    expect(labForSimulationSlug("__proto__")).toBeUndefined();
  });
});

describe("parseLabParam", () => {
  it("accepts every known lab", () => {
    for (const lab of LAB_CONTEXTS) expect(parseLabParam(lab)).toBe(lab);
  });
  it("falls back to general for invalid values", () => {
    for (const bad of [null, undefined, "", "CONTROL", "control ", "<script>", "toString", "../x"]) expect(parseLabParam(bad)).toBe("general");
  });
});

describe("lab routes", () => {
  it("builds the chat URL and a simulator path for every lab", () => {
    expect(aiPathForLab("general")).toBe("/ai");
    expect(aiPathForLab("control")).toBe("/ai?lab=control");
    for (const lab of LAB_CONTEXTS) expect(simulatorPathForLab(lab)).toMatch(/^\/simulations/);
  });
});
