import { splitSimMarker, stripLegacySchematicTag } from "@shared/aiTypes";

/**
 * A text-to-image tag the model may still emit (complete, or unclosed at the end of a stopped answer). It is dead text for
 * the reader, so it is removed from copies and speech; matched tolerantly and only at a line start or after whitespace.
 */
const IMAGE_TAG = /(^|\s)\[GENERATE_IMAGE:[^\]]*\]?/g;

/**
 * The Markdown + LaTeX source of an assistant answer as the reader sees it: no trailing `[[SIM:..]]` marker and no
 * leftover generation tags. ```schematic fences stay as JSON text.
 */
export function cleanMessageSource(content: string): string {
  const withoutTag = content.replace(IMAGE_TAG, "$1");
  const { text } = splitSimMarker(withoutTag);
  return stripLegacySchematicTag(text.replace(IMAGE_TAG, "$1")).replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
