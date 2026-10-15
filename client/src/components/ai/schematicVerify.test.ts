import { beforeEach, describe, expect, it, vi } from "vitest";
import { BUCK_CONVERTER, VOLTAGE_DIVIDER } from "@shared/schematic/fixtures";
import { MAX_REPAIR_ATTEMPTS, RepairUnavailableError, analyzeSchematic, cachedVerification, isArchetypeSpecText, issueMessages, requestRepair, resetSchematicVerifyCache, startVerification, verifyWithRepair } from "./schematicVerify";

const good = JSON.stringify(BUCK_CONVERTER);
const noGround = JSON.stringify({ ...BUCK_CONVERTER, parts: BUCK_CONVERTER.parts.filter((p) => p.type !== "ground") });
const noValue = JSON.stringify({ ...VOLTAGE_DIVIDER, parts: VOLTAGE_DIVIDER.parts.map((p) => (p.id === "R1" ? { ...p, value: undefined } : p)) });

beforeEach(() => {
  resetSchematicVerifyCache();
  vi.restoreAllMocks();
});

describe("analyzeSchematic", () => {
  it("verifies a good spec and draws it", () => {
    const outcome = analyzeSchematic(good);
    expect(outcome.status).toBe("verified");
    expect(outcome.validation.errors).toEqual([]);
    expect(outcome.render?.svg.startsWith("<!--")).toBe(true);
    expect(outcome.repaired).toBe(false);
  });

  it("marks a spec with gate errors unverified but still draws it", () => {
    const outcome = analyzeSchematic(noGround);
    expect(outcome.status).toBe("unverified");
    expect(outcome.validation.errors.length).toBeGreaterThan(0);
    expect(outcome.render).not.toBeNull();
  });

  it("reports unreadable JSON as unparseable with no drawing", () => {
    for (const text of ["", "{not json", '{"parts": 5}', "just words"]) {
      const outcome = analyzeSchematic(text);
      expect(outcome.status, text).toBe("unparseable");
      expect(outcome.render).toBeNull();
      expect(outcome.validation.errors.length).toBeGreaterThan(0);
    }
  });

  it("never lets hostile strings reach the drawing as markup", () => {
    const hostile = JSON.stringify({ ...VOLTAGE_DIVIDER, title: '<script>window.__pwned=1</script>"><svg onload=alert(1)>', labels: [{ text: "<foreignObject>", at: [12, 2], anchor: "start" }] });
    const svg = analyzeSchematic(hostile).render!.svg;
    expect(svg).not.toMatch(/<(?:script|foreignObject)\b/i);
    expect(svg).not.toMatch(/<svg[^>]*\sonload/i);
    expect((svg.match(/<svg\b/g) ?? []).length).toBe(1);
    expect(svg).toContain("&lt;script&gt;");
  });
});

describe("archetype requests", () => {
  const request = JSON.stringify({ archetype: "three_phase_full_wave_rectifier", params: { load: "RL" } });

  it("are built and verified locally and drawn", () => {
    const outcome = analyzeSchematic(request);
    expect(outcome.status).toBe("verified");
    expect(outcome.validation.errors).toEqual([]);
    expect(outcome.validation.warnings).toEqual([]);
    expect(outcome.render?.svg).toContain("<tspan");
    expect(isArchetypeSpecText("Here:\n```schematic\n" + request + "\n```")).toBe(true);
    expect(isArchetypeSpecText(good)).toBe(false);
    expect(isArchetypeSpecText("not json")).toBe(false);
  });

  it("never call the repairer, even when the request is bad", async () => {
    const repair = vi.fn();
    expect((await verifyWithRepair(request, { repair })).status).toBe("verified");
    const bad = await verifyWithRepair(JSON.stringify({ archetype: "three_phase_full_wave_rectifier", params: { load: "XYZ" } }), { repair });
    expect(bad.status).not.toBe("verified");
    expect(bad.render).toBeNull();
    expect(bad.validation.errors[0].message).toContain("load");
    expect(repair).not.toHaveBeenCalled();
  });
});

describe("issueMessages", () => {
  it("caps count and length and never returns an empty list", () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ code: "X", message: `${i} ${"y".repeat(500)}` }));
    const out = issueMessages(many);
    expect(out).toHaveLength(30);
    expect(out.every((m) => m.length <= 300)).toBe(true);
    expect(issueMessages([])).toEqual(["The spec failed validation."]);
  });
});

describe("verifyWithRepair", () => {
  it("does not call the repairer for a spec that already passes", async () => {
    const repair = vi.fn();
    const outcome = await verifyWithRepair(good, { repair });
    expect(outcome.status).toBe("verified");
    expect(repair).not.toHaveBeenCalled();
  });

  it("repairs on the first attempt and re-validates the answer itself", async () => {
    const repair = vi.fn().mockResolvedValue(JSON.parse(good));
    const progress: Array<[string, number, number]> = [];
    const outcome = await verifyWithRepair(noGround, { repair, onProgress: (p) => progress.push([p.phase, p.attempt, p.issues]) });
    expect(outcome).toMatchObject({ status: "verified", repaired: true, attempts: 1 });
    expect(JSON.parse(outcome.specText)).toEqual(BUCK_CONVERTER);
    expect(repair).toHaveBeenCalledTimes(1);
    expect(repair.mock.calls[0][0]).toBe(noGround);
    expect(repair.mock.calls[0][1].length).toBeGreaterThan(0);
    expect(progress).toEqual([["fixing", 1, analyzeSchematic(noGround).validation.errors.length]]);
  });

  it("makes a second attempt from the first attempt's output, then stops at the cap", async () => {
    const stillBad = JSON.parse(noGround);
    const repair = vi.fn().mockResolvedValue(stillBad);
    const outcome = await verifyWithRepair(noGround, { repair });
    expect(repair).toHaveBeenCalledTimes(MAX_REPAIR_ATTEMPTS);
    expect(outcome.status).toBe("unverified");
    expect(outcome.attempts).toBe(MAX_REPAIR_ATTEMPTS);
    expect(outcome.repairError).toBeUndefined();
  });

  it("succeeds on the second attempt", async () => {
    const repair = vi.fn().mockResolvedValueOnce(JSON.parse(noGround)).mockResolvedValueOnce(JSON.parse(good));
    const outcome = await verifyWithRepair(noGround, { repair });
    expect(outcome).toMatchObject({ status: "verified", attempts: 2, repaired: true });
  });

  it("never claims verified when the server says ok but the local gates disagree", async () => {
    const repair = vi.fn().mockResolvedValue({ ...JSON.parse(noGround), ok: true });
    const outcome = await verifyWithRepair(noGround, { repair });
    expect(outcome.status).toBe("unverified");
  });

  it("keeps the best candidate, not the last one", async () => {
    const worse = JSON.stringify({ ...BUCK_CONVERTER, parts: BUCK_CONVERTER.parts.filter((p) => p.type !== "ground" && p.id !== "R1") });
    const repair = vi.fn().mockResolvedValueOnce(JSON.parse(worse)).mockResolvedValueOnce(JSON.parse(worse));
    const original = analyzeSchematic(noGround);
    const outcome = await verifyWithRepair(noGround, { repair });
    expect(outcome.validation.errors.length).toBeLessThanOrEqual(original.validation.errors.length);
  });

  it("falls back to the unrepaired diagram, flagged, when the route is unavailable", async () => {
    const repair = vi.fn().mockRejectedValue(new RepairUnavailableError(503));
    const outcome = await verifyWithRepair(noGround, { repair });
    expect(outcome).toMatchObject({ status: "unverified", repaired: false, attempts: 0, repairError: "unavailable" });
    expect(repair).toHaveBeenCalledTimes(1);
  });

  it("retries when the repairer returns nothing usable", async () => {
    const repair = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(JSON.parse(good));
    expect((await verifyWithRepair(noGround, { repair })).status).toBe("verified");
  });

  it("can repair a spec that is not even valid JSON", async () => {
    const repair = vi.fn().mockResolvedValue(JSON.parse(good));
    const outcome = await verifyWithRepair(good.slice(0, -1), { repair });
    expect(outcome).toMatchObject({ status: "verified", repaired: true });
  });

  it("stays unparseable (no drawing) when nothing can be repaired", async () => {
    const repair = vi.fn().mockResolvedValue(null);
    const outcome = await verifyWithRepair("{oops", { repair });
    expect(outcome.status).toBe("unparseable");
    expect(outcome.render).toBeNull();
  });

  it("skips repair for a spec over the route's size cap", async () => {
    const repair = vi.fn();
    const outcome = await verifyWithRepair(JSON.stringify({ ...JSON.parse(noGround), title: "x".repeat(25_000) }), { repair });
    expect(repair).not.toHaveBeenCalled();
    expect(outcome.status).not.toBe("verified");
  });

  it("rethrows an abort", async () => {
    const controller = new AbortController();
    const repair = vi.fn().mockImplementation(async () => {
      controller.abort();
      throw new DOMException("aborted", "AbortError");
    });
    await expect(verifyWithRepair(noGround, { repair, signal: controller.signal })).rejects.toThrow();
  });
});

describe("startVerification", () => {
  it("shares one in-flight run per spec text and caches the finished result", async () => {
    const repair = vi.fn().mockResolvedValue(JSON.parse(good));
    const a = startVerification(noGround, repair);
    const b = startVerification(noGround, repair);
    expect(a).toBe(b);
    const seen: number[] = [];
    expect(a.progress()).toMatchObject({ phase: "fixing", attempt: 1 }); // the first round starts synchronously
    a.subscribe((p) => seen.push(p.attempt));
    const [one, two] = await Promise.all([a.promise, b.promise]);
    expect(one).toBe(two);
    expect(repair).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([]);
    expect(cachedVerification(noGround)?.status).toBe("verified");
    expect((await startVerification(noGround, repair).promise).status).toBe("verified");
    expect(repair).toHaveBeenCalledTimes(1);
  });

  it("does not cache an outcome that could not reach the route, so a later run can retry", async () => {
    const repair = vi.fn().mockRejectedValueOnce(new RepairUnavailableError(0)).mockResolvedValueOnce(JSON.parse(good));
    expect((await startVerification(noGround, repair).promise).repairError).toBe("unavailable");
    expect(cachedVerification(noGround)).toBeUndefined();
    expect((await startVerification(noGround, repair).promise).status).toBe("verified");
  });
});

describe("requestRepair", () => {
  it("posts the spec and errors to the repair route and returns the spec object", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ spec: { title: "t" }, ok: true, errors: [], warnings: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await requestRepair("{}", ["e"])).toEqual({ title: "t" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/ai/schematic-repair");
    expect(JSON.parse(init.body)).toEqual({ spec: "{}", errors: ["e"] });
    vi.unstubAllGlobals();
  });

  it("maps non-2xx, network failure and a null spec", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 503 })));
    await expect(requestRepair("{}", ["e"])).rejects.toBeInstanceOf(RepairUnavailableError);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    await expect(requestRepair("{}", ["e"])).rejects.toBeInstanceOf(RepairUnavailableError);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ spec: null }), { status: 200 })));
    expect(await requestRepair("{}", ["e"])).toBeNull();
    vi.unstubAllGlobals();
  });
});

describe("noValue fixture", () => {
  it("is a failing spec (guards the test data)", () => {
    expect(analyzeSchematic(noValue).status).not.toBe("verified");
  });
});
