import { describe, expect, it } from "vitest";
import en from "@/locales/en/simulationDocs.json";
import ar from "@/locales/ar/simulationDocs.json";
import es from "@/locales/es/simulationDocs.json";
import { simulationRouteMeta } from "@/data/platform";
import { EQUATIONS, docsTopicForSlug, type SimulationDocsTopic } from "./SimulationDocumentation";

type Topic = (typeof en.topics)[keyof typeof en.topics];
const TOPICS = Object.keys(EQUATIONS) as SimulationDocsTopic[];

/** Words a visitor reads in one topic: title, intro, every item, and the equation captions. */
function visibleWords(topic: Topic): number {
  const text = [
    topic.title,
    topic.intro,
    ...topic.principles.flatMap((p) => [p.heading, p.body]),
    ...topic.parameters.flatMap((p) => [p.term, p.body]),
    ...topic.experiments.flatMap((p) => [p.title, p.body]),
    ...topic.applications.flatMap((p) => [p.field, p.body]),
    ...topic.equations,
  ].join(" ");
  return text.split(/\s+/).filter(Boolean).length;
}

describe("simulation documentation content", () => {
  it("gives every topic at least 450 words of English prose", () => {
    const short = TOPICS.filter((topic) => visibleWords(en.topics[topic]) < 450);
    expect(short).toEqual([]);
  });

  it("has an equation caption for every governing equation", () => {
    for (const topic of TOPICS) {
      expect(en.topics[topic].equations).toHaveLength(EQUATIONS[topic].length);
      expect(ar.topics[topic].equations).toHaveLength(EQUATIONS[topic].length);
      expect(es.topics[topic].equations).toHaveLength(EQUATIONS[topic].length);
    }
  });

  it.each([
    ["Arabic", ar],
    ["Spanish", es],
  ])("keeps the %s translation structurally identical to English", (_name, locale) => {
    expect(Object.keys(locale.sections)).toEqual(Object.keys(en.sections));
    expect(Object.keys(locale.topics).sort()).toEqual(Object.keys(en.topics).sort());
    for (const topic of TOPICS) {
      const source = en.topics[topic];
      const target = locale.topics[topic];
      expect(Object.keys(target).sort()).toEqual(Object.keys(source).sort());
      for (const key of ["principles", "parameters", "experiments", "applications"] as const) {
        expect(target[key]).toHaveLength(source[key].length);
      }
    }
  });

  it("does not leave any translated string empty", () => {
    for (const locale of [en, ar, es]) {
      for (const topic of TOPICS) {
        const t = locale.topics[topic];
        const strings = [t.title, t.intro, ...t.equations, ...t.principles.flatMap((p) => [p.heading, p.body]), ...t.parameters.flatMap((p) => [p.term, p.body]), ...t.experiments.flatMap((p) => [p.title, p.body]), ...t.applications.flatMap((p) => [p.field, p.body])];
        expect(strings.filter((s) => !s.trim())).toEqual([]);
      }
    }
  });
});

describe("docsTopicForSlug", () => {
  it("maps every studio route to a topic, so no studio is left without a theory section", () => {
    const unmapped = simulationRouteMeta.map((entry) => entry.slug).filter((slug) => docsTopicForSlug(slug) === null);
    expect(unmapped).toEqual([]);
  });

  it("maps each studio route to its own topic", () => {
    expect(docsTopicForSlug("circuit-lab")).toBe("circuits");
    expect(docsTopicForSlug("signals-and-systems")).toBe("signals");
    expect(docsTopicForSlug("control-systems")).toBe("control");
    expect(docsTopicForSlug("digital-logic-design")).toBe("logic");
    expect(docsTopicForSlug("power-electronics")).toBe("powerElectronics");
    expect(docsTopicForSlug("code")).toBe("codeStudio");
  });

  it("returns null for routes without a studio", () => {
    expect(docsTopicForSlug("not-a-studio")).toBeNull();
    expect(docsTopicForSlug(undefined)).toBeNull();
  });
});
