import { ComputeEngine } from "@cortex-js/compute-engine";
import { describe, expect, it } from "vitest";
import { GraphEngine } from "./engine/graphEngine";
import { emptyGraph } from "./ir/types";
import { ERROR_KEYS } from "./errors";
import { parseLatex } from "./parse/parse";

const ce = new ComputeEngine();
const parser = (latex: string): unknown => ce.parse(latex, { form: "raw" }).json;
const engine = (latex: string[]) =>
  new GraphEngine(parser, { ...emptyGraph(), items: latex.map((l, i) => ({ id: `i${i}`, latex: l })) });
const errorsOf = (e: GraphEngine, id: string) => e.item(id)?.errors ?? [];

describe("engine errors carry their catalog key and params (translated by the page)", () => {
  it("a circular definition, a duplicate definition and an unknown function", () => {
    const e = engine(["a=b", "b=a", "f(x)=g(x)", "c=1", "c=2"]);
    const circular = errorsOf(e, "i0")[0];
    expect(circular.key).toBe("circularDefinition");
    expect(circular.params?.cycle).toMatch(/i0/);
    expect(errorsOf(e, "i3")[0]).toMatchObject({ key: "definedTwice", params: { name: "c" } });
  });

  it("an inference reason (a line that cannot be drawn) carries its key", () => {
    const e = engine(["z=x+y"]);
    expect(errorsOf(e, "i0")[0]).toMatchObject({ key: "surfaceNeeds3D", message: expect.stringMatching(/D3/) as unknown as string });
  });

  it("a parse error from the normalizer carries its key", () => {
    const r = parseLatex("\\int x\\,dx", parser);
    if (r.ok) throw new Error("expected a parse error");
    expect(r.errors[0]).toMatchObject({ key: "integralLimits", params: { name: "Integrate" } });
    expect(ERROR_KEYS).toContain(r.errors[0].key);
  });

  it("an empty expression and an over-long expression carry keys with their numbers", () => {
    expect(parseLatex("   ", parser)).toMatchObject({ ok: false, errors: [{ key: "emptyExpression" }] });
    const long = "x".repeat(10_000);
    expect(parseLatex(long, parser)).toMatchObject({ ok: false, errors: [{ key: "tooLong", params: { max: expect.any(Number) as unknown as number } }] });
  });

});
