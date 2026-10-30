/**
 * Link codec (STEPS.md §5.2, ADR-9): JSON → lz-string `compressToEncodedURIComponent` → `?g=`.
 * Above the limit nothing is truncated: the caller shows "too large to share as a link" and offers JSON export.
 */
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";
import { MAX_LINK_CHARS } from "../constants";
import { validateGraph } from "./schema";
import type { IssueDetail } from "./schema";
import type { GraphIR } from "./types";

export const LINK_PARAM = "g";

export type EncodeResult = { ok: true; encoded: string } | { ok: false; reason: "too-large"; length: number };

export function encodeGraph(graph: GraphIR): EncodeResult {
  const encoded = compressToEncodedURIComponent(JSON.stringify(graph));
  if (encoded.length > MAX_LINK_CHARS) return { ok: false, reason: "too-large", length: encoded.length };
  return { ok: true, encoded };
}

export type DecodeResult = { ok: true; graph: GraphIR } | { ok: false; reason: "corrupt" | "too-large" | "invalid"; issues?: IssueDetail[] };

export function decodeGraph(encoded: string): DecodeResult {
  if (encoded.length > MAX_LINK_CHARS) return { ok: false, reason: "too-large" };
  let text: string | null;
  try {
    text = decompressFromEncodedURIComponent(encoded);
  } catch {
    return { ok: false, reason: "corrupt" };
  }
  if (!text) return { ok: false, reason: "corrupt" };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, reason: "corrupt" };
  }
  const v = validateGraph(json);
  return v.ok ? { ok: true, graph: v.graph } : { ok: false, reason: "invalid", issues: v.issues };
}

/** JSON export (always available, including when the link is too large). */
export function exportJson(graph: GraphIR): string {
  return JSON.stringify(graph, null, 2);
}

export function importJson(text: string): DecodeResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, reason: "corrupt" };
  }
  const v = validateGraph(json);
  return v.ok ? { ok: true, graph: v.graph } : { ok: false, reason: "invalid", issues: v.issues };
}
