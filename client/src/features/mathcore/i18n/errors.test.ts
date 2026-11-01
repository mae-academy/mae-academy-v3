import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import i18next from "i18next";
import { ERROR_KEYS } from "@shared/mathcore/errors";
import ar from "./ar.json";
import en from "./en.json";
import es from "./es.json";
import { errorText } from "../ui/errorText";

const dictionaries = { en, ar, es } as const;
const placeholders = (s: string) => Array.from(new Set(Array.from(s.matchAll(/\{\{\s*(\w+)\s*\}\}/g), (m) => m[1]))).sort();

/** Every .ts file under shared/mathcore (the engine's sources), to find where each key is used. */
function engineSources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return engineSources(p);
    return f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "errors.ts" ? [readFileSync(p, "utf8")] : [];
  });
}

describe("mathcore error catalog", () => {
  it("has no duplicate keys", () => {
    expect(new Set(ERROR_KEYS).size).toBe(ERROR_KEYS.length);
  });

  it("every error key has a non-empty text in English, Arabic and Spanish", () => {
    for (const key of ERROR_KEYS) {
      for (const [lang, dict] of Object.entries(dictionaries)) {
        const text = (dict.errors as Record<string, string | undefined>)[key];
        expect(typeof text === "string" && text.trim().length > 0, `${lang}.errors.${key}`).toBe(true);
      }
    }
  });

  it("the dictionaries have no keys that the engine does not raise", () => {
    for (const [lang, dict] of Object.entries(dictionaries)) {
      expect(Object.keys(dict.errors).sort(), lang).toEqual([...ERROR_KEYS].sort());
    }
  });

  it("each translation uses the same placeholders as the English text", () => {
    for (const key of ERROR_KEYS) {
      const want = placeholders(en.errors[key]);
      for (const [lang, dict] of Object.entries(dictionaries)) {
        expect(placeholders((dict.errors as Record<string, string>)[key]), `${lang}.${key}`).toEqual(want);
      }
    }
  });

  it("every key is raised by the engine (its source names the key in quotes)", () => {
    const source = engineSources(join(__dirname, "../../../../../shared/mathcore")).join("\n");
    for (const key of ERROR_KEYS) expect(source.includes(`"${key}"`), key).toBe(true);
  });

  it("an error with a key is shown in the reader's language; one without keeps its English text", async () => {
    const inst = i18next.createInstance();
    await inst.init({ lng: "ar", resources: { ar: { mathcore: ar }, en: { mathcore: en } }, ns: ["mathcore"], defaultNS: "mathcore", interpolation: { escapeValue: false } });
    const t = inst.getFixedT("ar", "mathcore");
    const text = errorText(t, { message: "Undefined function: foo", key: "undefinedFunction", params: { name: "foo" } });
    expect(text).toBe("دالة غير معرّفة: foo");
    expect(errorText(t, { message: "Some Compute Engine message" })).toBe("Some Compute Engine message");
  });
});
