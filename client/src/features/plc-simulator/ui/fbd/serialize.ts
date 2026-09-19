import { KINDS, type FbdBlock, type FbdGraph, type FbdKind, type FbdLink } from './model';

export const FBD_FILE_FORMAT = 'mae-logo-fbd';
export const FBD_FILE_VERSION = 1;

export const serializeFbd = (graph: FbdGraph): string =>
  `${JSON.stringify({ format: FBD_FILE_FORMAT, version: FBD_FILE_VERSION, graph }, null, 2)}\n`;

export type ParseResult = { readonly ok: true; readonly graph: FbdGraph } | { readonly ok: false; readonly reason: string };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isKind = (value: unknown): value is FbdKind => typeof value === 'string' && value in KINDS;
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Reads a saved diagram, rejecting anything that could not have come from `serializeFbd`. */
export function parseFbd(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'The file is not valid JSON' };
  }
  if (!isRecord(raw) || raw.format !== FBD_FILE_FORMAT) return { ok: false, reason: 'Not a LOGO! function block diagram file' };
  if (raw.version !== FBD_FILE_VERSION) return { ok: false, reason: `Unsupported file version ${String(raw.version)}` };
  const graph = raw.graph;
  if (!isRecord(graph) || !Array.isArray(graph.blocks) || !Array.isArray(graph.links)) return { ok: false, reason: 'The diagram is missing its blocks or links' };

  const blocks: FbdBlock[] = [];
  for (const entry of graph.blocks as unknown[]) {
    if (!isRecord(entry) || typeof entry.id !== 'string' || !isKind(entry.kind) || !isNumber(entry.x) || !isNumber(entry.y)) {
      return { ok: false, reason: 'A block in the file is malformed' };
    }
    blocks.push({
      id: entry.id,
      kind: entry.kind,
      x: entry.x,
      y: entry.y,
      ...(isNumber(entry.index) ? { index: entry.index } : {}),
      ...(isNumber(entry.preset) ? { preset: entry.preset } : {}),
    });
  }

  const ids = new Map(blocks.map((block) => [block.id, block]));
  if (ids.size !== blocks.length) return { ok: false, reason: 'The file contains duplicate block ids' };

  const links: FbdLink[] = [];
  for (const entry of graph.links as unknown[]) {
    if (!isRecord(entry) || typeof entry.id !== 'string' || typeof entry.from !== 'string' || typeof entry.to !== 'string' || !isNumber(entry.pin)) {
      return { ok: false, reason: 'A link in the file is malformed' };
    }
    const target = ids.get(entry.to);
    if (!ids.has(entry.from) || !target || entry.pin < 0 || entry.pin >= KINDS[target.kind].pins.length) {
      return { ok: false, reason: 'A link in the file points at a missing block or pin' };
    }
    links.push({ id: entry.id, from: entry.from, to: entry.to, pin: entry.pin });
  }
  return { ok: true, graph: { blocks, links } };
}
