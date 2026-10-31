import { describe, expect, it } from "vitest";
import i18next from "i18next";
import ar from "./ar.json";
import en from "./en.json";
import es from "./es.json";
import { errorMath } from "../ui/errorText";
import { CATEGORIES } from "../ui/categories";
import { CURVE_PALETTE } from "../ui/curvePalette";

type Tree = { [k: string]: string | Tree };
/** Arabic has more plural forms (CLDR zero, two, few, many) than English; those suffixes are not compared. */
const EXTRA_PLURALS = /_(zero|two|few|many)$/;
const leaves = (o: Tree, prefix = ""): string[] =>
  Object.entries(o).flatMap(([k, v]) => (typeof v === "string" ? (EXTRA_PLURALS.test(k) ? [] : [prefix + k]) : leaves(v, `${prefix}${k}.`)));
const placeholders = (s: string) => Array.from(new Set(Array.from(s.matchAll(/\{\{\s*(\w+)\s*\}\}/g), (m) => m[1]))).sort();
const get = (o: Tree, path: string): string => path.split(".").reduce<string | Tree>((a, k) => (a as Tree)[k], o) as string;

describe("mathcore dictionaries", () => {
  it("English, Arabic and Spanish have exactly the same keys and placeholders", () => {
    const keys = leaves(en as Tree).sort();
    expect(leaves(ar as Tree).sort()).toEqual(keys);
    expect(leaves(es as Tree).sort()).toEqual(keys);
    for (const k of keys) {
      expect(placeholders(get(ar as Tree, k)), k).toEqual(placeholders(get(en as Tree, k)));
      expect(placeholders(get(es as Tree, k)), k).toEqual(placeholders(get(en as Tree, k)));
    }
  });

  it("every category, sample, unsupported note and palette color has a text", () => {
    for (const c of CATEGORIES) {
      expect(get(en as Tree, `categories.${c.id}.title`)).toBeTruthy();
      for (const s of c.samples) expect(get(en as Tree, `samples.${s.id}.explain`)).toBeTruthy();
      for (const u of c.unsupported) expect(get(en as Tree, `categories.unsupported.${u}`)).toBeTruthy();
    }
    for (const p of CURVE_PALETTE) expect(get(en as Tree, `palette.${p.name}`)).toBeTruthy();
  });
});

describe("errors as math (Part D)", () => {
  it("names inside the sentence are wrapped for KaTeX; keyless messages are left alone", async () => {
    const t = i18next.createInstance();
    await t.init({ lng: "en", resources: { en: { mathcore: en } }, defaultNS: "mathcore", interpolation: { escapeValue: false } });
    const f = t.t.bind(t);
    expect(errorMath(f, { message: "x", key: "undefinedSymbol", params: { name: "x_0" } })).toBe("Undefined symbol: $x_{0}$");
    expect(errorMath(f, { message: "unexpected operator" })).toBe("unexpected operator");
    expect(errorMath(f, { message: "x", key: "strayUnknown", params: { count: 2, unknowns: "x, y", stray: "z" } })).toContain("$x,\\,y$");
  });
});
