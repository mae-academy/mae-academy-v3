import { describe, expect, it, vi } from "vitest";
import { SCHEMATIC_GATES_SUMMARY, SCHEMATIC_SPEC_DOC } from "../shared/schematic";
import { BUCK_CONVERTER } from "../shared/schematic/fixtures";
import { AiRequestError } from "./aiService";
import { REPAIR_LIMITS, buildRepairInstruction, buildRepairUserText, extractSpecFromReply, parseRepairRequest, repairSchematic } from "./aiSchematic";

const good = JSON.stringify(BUCK_CONVERTER);
const bad = JSON.stringify({ ...BUCK_CONVERTER, parts: BUCK_CONVERTER.parts.filter((p) => p.type !== "ground") });
const noSleep = () => Promise.resolve();

describe("parseRepairRequest", () => {
  it("accepts a spec with error messages and trims them", () => {
    expect(parseRepairRequest({ spec: good, errors: ["  R1 has no\nvalue ", ""] })).toEqual({ spec: good, errors: ["R1 has no value"] });
  });

  it("rejects malformed bodies with a client-safe AiRequestError", () => {
    const bodies: unknown[] = [
      null, undefined, "x", [], {}, { spec: 5, errors: ["e"] }, { spec: "  ", errors: ["e"] }, { spec: good }, { spec: good, errors: [] },
      { spec: good, errors: "e" }, { spec: good, errors: [1] }, { spec: "x".repeat(REPAIR_LIMITS.specChars + 1), errors: ["e"] },
      { spec: good, errors: Array.from({ length: REPAIR_LIMITS.errors + 1 }, () => "e") },
      { spec: good, errors: ["x".repeat(REPAIR_LIMITS.errorChars + 1)] },
    ];
    for (const body of bodies) expect(() => parseRepairRequest(body), JSON.stringify(body)?.slice(0, 60)).toThrow(AiRequestError);
  });

  it("accepts the exact caps", () => {
    const body = { spec: "x".repeat(REPAIR_LIMITS.specChars), errors: Array.from({ length: REPAIR_LIMITS.errors }, () => "y".repeat(REPAIR_LIMITS.errorChars)) };
    expect(parseRepairRequest(body).errors).toHaveLength(REPAIR_LIMITS.errors);
  });
});

describe("repair prompt", () => {
  it("carries the brief, the spec reference and the gates, and lists the errors", () => {
    const instruction = buildRepairInstruction();
    expect(instruction).toMatch(/Fix ONLY the listed validation errors/);
    expect(instruction).toMatch(/Keep every id, value/);
    expect(instruction).toContain(SCHEMATIC_SPEC_DOC);
    for (const gate of SCHEMATIC_GATES_SUMMARY) expect(instruction).toContain(gate);
    const user = buildRepairUserText({ spec: "{}", errors: ["a", "b"] });
    expect(user).toContain("- a\n- b");
    expect(user.endsWith("{}")).toBe(true);
  });
});

describe("extractSpecFromReply", () => {
  it("reads bare JSON, fenced JSON and JSON with prose around it", () => {
    expect(extractSpecFromReply('{"title":"x"}')).toEqual({ title: "x" });
    expect(extractSpecFromReply('```json\n{"title":"x"}\n```')).toEqual({ title: "x" });
    expect(extractSpecFromReply('Here you go: {"title":"x","parts":[]} done')).toEqual({ title: "x", parts: [] });
  });

  it("returns null for empty, non-JSON and array replies", () => {
    for (const reply of [undefined, "", "sorry, I cannot", "{not json}", '{"a":1,}', "[1,2]"]) expect(extractSpecFromReply(reply), String(reply)).toBeNull();
  });
});

describe("repairSchematic", () => {
  it("returns the corrected spec with the server's own verdict", async () => {
    const generate = vi.fn().mockResolvedValue(good);
    const result = await repairSchematic({ spec: bad, errors: ["no ground"] }, { generate, models: ["m1"] });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.spec).toEqual(JSON.parse(good));
    expect(generate).toHaveBeenCalledTimes(1);
    const [model, input] = generate.mock.calls[0];
    expect(model).toBe("m1");
    expect(input.userText).toContain("- no ground");
    expect(input.systemInstruction).toContain("Fix ONLY");
  });

  it("does not trust the model: a reply that still fails comes back ok=false with the validator's errors", async () => {
    const result = await repairSchematic({ spec: bad, errors: ["no ground"] }, { generate: async () => bad, models: ["m1"] });
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.spec).not.toBeNull();
  });

  it("reports an unparseable reply as spec=null without leaking the upstream text", async () => {
    const result = await repairSchematic({ spec: bad, errors: ["x"] }, { generate: async () => "I am sorry, here is some prose SECRET", models: ["m1"] });
    expect(result).toMatchObject({ spec: null, ok: false });
    expect(JSON.stringify(result)).not.toContain("SECRET");
  });

  it("falls back to the next model on 429 and retries a transient 503", async () => {
    const calls: string[] = [];
    const generate = vi.fn(async (model: string) => {
      calls.push(model);
      if (model === "a") throw Object.assign(new Error("quota"), { status: 429 });
      if (calls.length === 2) throw Object.assign(new Error("busy"), { status: 503 });
      return good;
    });
    const result = await repairSchematic({ spec: bad, errors: ["x"] }, { generate, models: ["a", "a", "b", "b"], sleep: noSleep });
    expect(result.ok).toBe(true);
    expect(calls).toEqual(["a", "b", "b"]);
  });

  it("propagates a hard upstream error so the route can answer 502", async () => {
    const generate = async () => {
      throw Object.assign(new Error("forbidden"), { status: 403 });
    };
    await expect(repairSchematic({ spec: bad, errors: ["x"] }, { generate, models: ["m"] })).rejects.toMatchObject({ status: 403 });
  });
});
