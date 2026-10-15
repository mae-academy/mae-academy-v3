/**
 * Source validation for ```mermaid fences, run BEFORE the library sees anything. Mermaid itself runs with
 * securityLevel "strict"; this is the second, independent layer: a small allow-list of diagram types and a deny-list
 * of everything that could change security settings, run callbacks, link out or inject markup.
 */

export const MERMAID_MAX_BYTES = 8 * 1024;
export const MERMAID_MAX_LINE = 200;
export const MERMAID_MAX_LINES = 200;

export type MermaidReason = "empty" | "size" | "lineLength" | "type" | "directive" | "click" | "html" | "url" | "frontmatter";

export type MermaidCheck = { ok: true; source: string; kind: "flowchart" | "state" | "sequence" } | { ok: false; reason: MermaidReason };

const TYPE_LINE = /^(?:(flowchart|graph)(?:\s+(?:TB|TD|BT|RL|LR))?|(stateDiagram(?:-v2)?)|(sequenceDiagram))\s*;?$/;

export function validateMermaid(raw: string): MermaidCheck {
  const source = raw.replace(/\r\n?/g, "\n").replace(/^\n+|\s+$/g, "");
  if (!source.trim()) return { ok: false, reason: "empty" };
  if (new TextEncoder().encode(source).length > MERMAID_MAX_BYTES) return { ok: false, reason: "size" };
  const lines = source.split("\n");
  if (lines.length > MERMAID_MAX_LINES || lines.some((line) => line.length > MERMAID_MAX_LINE)) return { ok: false, reason: "lineLength" };

  // Frontmatter (`---` + YAML config) and directives (`%%{init: ...}%%`) can set securityLevel, themes, callbacks.
  if (/^\s*---/m.test(source)) return { ok: false, reason: "frontmatter" };
  if (/%%\s*\{/.test(source)) return { ok: false, reason: "directive" };

  const first = lines.find((line) => line.trim() && !/^\s*%%/.test(line));
  const head = first?.trim().match(TYPE_LINE);
  if (!head) return { ok: false, reason: "type" };

  // Interaction: click handlers, callbacks, links, tooltips.
  if (/^\s*(?:click|callback|link|links)\b/im.test(source) || /\b(?:href|onclick)\b/i.test(source)) return { ok: false, reason: "click" };

  if (/(?:javascript|vbscript)\s*:/i.test(source) || /\bdata:(?:[\w+.-]+\/|;|,)/i.test(source) || /\burl\s*\(/i.test(source) || /\bhttps?:\/\//i.test(source) || /\/\/[a-z0-9.-]+\.[a-z]{2,}/i.test(source)) return { ok: false, reason: "url" };

  // Any HTML-ish tag (`<b>`, `<br/>`, `<img ...>`, `<script>`, `<!--`) is refused; state diagrams' <<choice>> / <<fork>> / <<join>> are not tags.
  const withoutStereotypes = source.replace(/<<\s*(?:choice|fork|join|start|end)\s*>>/gi, "");
  if (/<\s*[a-z!/?]/i.test(withoutStereotypes) || /&lt;|&#x?0*(?:60|3c);/i.test(source)) return { ok: false, reason: "html" };

  return { ok: true, source, kind: head[1] ? "flowchart" : head[2] ? "state" : "sequence" };
}
