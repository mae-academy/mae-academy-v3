import { splitTrailingMarkers, stripLegacySchematicTag } from "@shared/aiTypes";

/**
 * The Markdown + LaTeX source of an assistant answer as the reader sees it: no trailing `[[STEP:n/N]]` / `[[SIM:..]]` markers and no
 * leftover legacy generation tags (hidden through the shared stripLegacySchematicTag). ```schematic fences stay as JSON text.
 */
export function cleanMessageSource(content: string): string {
  const { text } = splitTrailingMarkers(stripLegacySchematicTag(content));
  return stripLegacySchematicTag(text).replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
