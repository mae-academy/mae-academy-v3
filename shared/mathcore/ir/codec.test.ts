import { compressToEncodedURIComponent } from "lz-string";
import { describe, expect, it } from "vitest";
import { MAX_LINK_CHARS } from "../constants";
import { decodeGraph, encodeGraph, exportJson, importJson } from "./codec";
import { emptyGraph } from "./types";

describe("link codec (STEPS.md §5.2)", () => {
  it("round-trips a document through ?g=", () => {
    const g = { ...emptyGraph(), items: [{ id: "f1", latex: "y=\\sin(x)" }] };
    const e = encodeGraph(g);
    expect(e.ok).toBe(true);
    if (e.ok) {
      expect(e.encoded).toMatch(/^[A-Za-z0-9+\-$]+$/);
      const d = decodeGraph(e.encoded);
      expect(d).toEqual({ ok: true, graph: g });
    }
  });

  it("refuses links above ~8 KB instead of truncating", () => {
    // Random-looking LaTeX compresses poorly, so 100 items of it exceed the limit.
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    const items = Array.from({ length: 100 }, (_, i) => ({
      id: `i${i}`,
      latex: Array.from({ length: 120 }, () => "abcdefghijklmnopqrstuvwxyz0123456789+-"[Math.floor(rnd() * 38)]).join(""),
    }));
    const r = encodeGraph({ ...emptyGraph(), items });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("too-large");
      expect(r.length).toBeGreaterThan(MAX_LINK_CHARS);
    }
    // JSON export still works for the same document.
    expect(importJson(exportJson({ ...emptyGraph(), items })).ok).toBe(true);
  });

  it("rejects corrupt and invalid links", () => {
    expect(decodeGraph("not-a-link").ok).toBe(false);
    const bad = compressToEncodedURIComponent(JSON.stringify({ version: "9", viewport: {}, items: [] }));
    const r = decodeGraph(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("invalid");
    expect(importJson("{").ok).toBe(false);
  });
});
