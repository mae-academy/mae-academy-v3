import type { SimulationDocsTopic, ToolDoc, ToolDocsFile, ToolEquationsFile } from "./types";

const equationModules = import.meta.glob<{ default: ToolEquationsFile }>("./equations/*.ts", { eager: true });
const docModules = import.meta.glob<{ default: ToolDocsFile }>("../../../locales/*/toolDocs/*.json", { eager: true });

const equationsByTopic: Partial<Record<string, ToolEquationsFile>> = {};
for (const [path, mod] of Object.entries(equationModules)) {
  const topic = path.match(/equations\/([^/]+)\.ts$/)?.[1];
  if (topic) equationsByTopic[topic] = mod.default;
}

const docsByLocale: Record<string, Partial<Record<string, ToolDocsFile>>> = {};
for (const [path, mod] of Object.entries(docModules)) {
  const m = path.match(/locales\/([^/]+)\/toolDocs\/([^/]+)\.json$/);
  if (m) (docsByLocale[m[1]] ??= {})[m[2]] = mod.default;
}

/** Tool ids that have documentation for a topic, in English-file order (the first is the default tool). */
export function toolIdsFor(topic: SimulationDocsTopic): string[] {
  return Object.keys(docsByLocale.en?.[topic] ?? {});
}

export function toolEquations(topic: SimulationDocsTopic, tool: string): string[] {
  return equationsByTopic[topic]?.[tool] ?? [];
}

export function resolveToolId(topic: SimulationDocsTopic, tool: string | undefined): string | null {
  const ids = toolIdsFor(topic);
  if (ids.length === 0) return null;
  return tool && ids.includes(tool) ? tool : ids[0];
}

/**
 * The tool's doc in `locale`. Spanish has no per-tool docs yet, so it returns null and the page shows the
 * Spanish topic overview instead of English text inside a Spanish page. Other locales fall back to English.
 */
export function getToolDoc(topic: SimulationDocsTopic, tool: string | undefined, locale: string): ToolDoc | null {
  const id = resolveToolId(topic, tool);
  if (!id) return null;
  const localized = docsByLocale[locale]?.[topic]?.[id];
  if (localized) return localized;
  if (locale === "es") return null;
  return docsByLocale.en?.[topic]?.[id] ?? null;
}

/** Raw tables, for tests. */
export const rawDocs = () => docsByLocale;
export const rawEquations = () => equationsByTopic;
