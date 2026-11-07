import { describe, expect, it } from "vitest";
import katex from "katex";
import { rawDocs, rawEquations } from "./registry";
import type { ToolDoc } from "./types";

/** Tool ids every studio MUST document (agents may add more for extra internal modes). */
const REQUIRED: Record<string, string[]> = {
  control: ["root-locus", "pid", "frequency-response", "state-space"],
  powerElectronics: ["rectifier", "inverter", "acvc", "chopper"],
  plc: ["ladder-s7-200", "logo"],
  signals: ["signal-operations-and-properties", "system-classification", "convolution-engine", "fourier-analysis", "laplace-s-plane"],
  fluid: ["pneumatics", "hydraulics"],
};
const SINGLE = ["circuits", "logic", "arduino", "codeStudio"];

const docs = rawDocs();
const equations = rawEquations();

function strings(doc: ToolDoc): string[] {
  return [
    doc.title, doc.intro, doc.purpose,
    ...doc.model.flatMap((m) => [m.heading, m.body]),
    ...doc.equations,
    ...doc.mapping.flatMap((m) => [m.term, m.body]),
    doc.example.title, doc.example.problem, ...doc.example.steps.map((s) => s.text), doc.example.result,
    ...doc.applications.flatMap((a) => [a.field, a.body]),
  ];
}

const MATH = /\$\$[\s\S]+?\$\$|\$[^$]+?\$/g;
const words = (doc: ToolDoc) => strings(doc).join(" ").replace(MATH, " M ").split(/\s+/).filter(Boolean).length;
const mathOf = (doc: ToolDoc) => [
  ...strings(doc).flatMap((s) => [...s.matchAll(MATH)].map((m) => m[0].replace(/^\${1,2}|\${1,2}$/g, ""))),
  ...doc.example.steps.flatMap((s) => (s.tex ? [s.tex] : [])),
];
const prose = (s: string) => s.replace(MATH, " ");

const entries = Object.entries(docs.en ?? {}).flatMap(([topic, file]) => Object.entries(file ?? {}).map(([tool, doc]) => [topic, tool, doc] as const));

describe("per-tool documentation coverage", () => {
  it("documents every required tool in English and Arabic", () => {
    for (const [topic, ids] of Object.entries(REQUIRED)) {
      for (const lng of ["en", "ar"]) expect(Object.keys(docs[lng]?.[topic] ?? {}), `${lng}/${topic}`).toEqual(expect.arrayContaining(ids));
    }
    for (const topic of SINGLE) for (const lng of ["en", "ar"]) expect(Object.keys(docs[lng]?.[topic] ?? {}).length, `${lng}/${topic}`).toBeGreaterThan(0);
  });

  it("has Arabic ids identical to English ids", () => {
    for (const [topic, file] of Object.entries(docs.en ?? {})) expect(Object.keys(docs.ar?.[topic] ?? {}).sort()).toEqual(Object.keys(file ?? {}).sort());
  });
});

describe.each(entries)("%s / %s", (topic, tool, en) => {
  const ar = docs.ar?.[topic]?.[tool];
  const eqs = equations[topic]?.[tool] ?? [];

  it("has at least 350 words of English prose", () => expect(words(en)).toBeGreaterThanOrEqual(350));
  it("has at least 300 words of Arabic prose", () => ar && expect(words(ar)).toBeGreaterThanOrEqual(300));
  it("has an equation for every caption, in both languages", () => {
    expect(eqs.length).toBeGreaterThanOrEqual(4);
    expect(en.equations).toHaveLength(eqs.length);
    expect(ar?.equations).toHaveLength(eqs.length);
  });
  it("keeps Arabic structurally identical to English", () => {
    expect(ar?.model).toHaveLength(en.model.length);
    expect(ar?.mapping).toHaveLength(en.mapping.length);
    expect(ar?.example.steps).toHaveLength(en.example.steps.length);
    expect(ar?.applications).toHaveLength(en.applications.length);
  });
  it("has no empty strings", () => {
    for (const doc of [en, ar!]) expect(strings(doc).filter((s) => !s.trim())).toEqual([]);
  });
  it("has at least 3 worked-example steps with display math", () => {
    expect(en.example.steps.length).toBeGreaterThanOrEqual(3);
    expect(en.example.steps.filter((s) => s.tex).length).toBeGreaterThanOrEqual(2);
  });

  it.each(["en", "ar"] as const)("renders every %s LaTeX fragment with KaTeX and no plain-text math", (lng) => {
    const doc = lng === "en" ? en : ar!;
    for (const tex of [...mathOf(doc), ...eqs]) {
      expect(() => katex.renderToString(tex, { throwOnError: true, displayMode: true }), tex).not.toThrow();
    }
    for (const s of strings(doc)) {
      expect((s.match(/\$/g) ?? []).length % 2, `unbalanced $ in: ${s}`).toBe(0);
      const text = prose(s);
      expect(text, `plain-text math (^ _ * = \\ or number+unit) in: ${s}`).not.toMatch(/[\^_*=\\]|\d\s?(?:V|mV|kV|A|mA|Hz|kHz|MHz|rad\/s|ms|us|µs|ns|bar|kPa|Pa|W|kW|Ω|ohm|dB|deg|°|%)(?![A-Za-z])/);
    }
  });
});

describe("locale fallback", () => {
  it("does not show English tool docs on a Spanish page (Spanish has none yet)", async () => {
    const { getToolDoc } = await import("./registry");
    expect(getToolDoc("control", "pid", "es")).toBeNull();
    expect(getToolDoc("control", "pid", "en")).not.toBeNull();
    expect(getToolDoc("control", "pid", "ar")).not.toBeNull();
  });
});
