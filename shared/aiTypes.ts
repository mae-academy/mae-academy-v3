// Wire contract for MAE AI chat, shared by the client and server/aiService.ts. Dependency-free on purpose.

export type LabContext = 'general' | 'circuits' | 'power' | 'logic' | 'control' | 'code' | 'arduino' | 'signals' | 'fluid' | 'plc';
export type MascotState = 'idle' | 'listening' | 'thinking' | 'eureka' | 'talking';

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  /** `data:image/(jpeg|png|webp);base64,...`; the client downsizes to 1200px / JPEG 80% before sending. */
  imageUrl?: string;
  timestamp: number;
}

/** Body of `POST /api/ai/chat`. The server only reads the last `AI_HISTORY_WINDOW` messages, and the last one must be a user message. */
export interface AiChatRequest {
  messages: ChatMessage[];
  lab?: LabContext;
}

/**
 * The response is a Server-Sent Events stream (`text/event-stream`); each event is one line
 * `data: <JSON of AiStreamEvent>` followed by a blank line.
 *   data: {"type":"delta","text":"..."}      incremental answer text (append in order)
 *   data: {"type":"done"}                    the answer is complete; no further events
 *   data: {"type":"error","message":"..."}   the stream failed after it started; no further events
 * Failures before the stream starts are plain JSON `{ "error": string }` with status 400 (invalid
 * request), 422 (the model declined or the request was blocked by safety filters), 429 (rate limited or too many
 * open streams), 503 (MAE AI not configured) or 502 (upstream unavailable).
 */
export type AiStreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

/** Non-streamed error body. */
export interface AiErrorBody {
  error: string;
}

export const AI_HISTORY_WINDOW = 6;
/** Decoded image size cap; images arrive pre-shrunk, so this is generous. */
export const AI_MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;
export const AI_MAX_MESSAGE_CHARS = 4000;
/** Cap for resent `model` turns (after diagrams are stripped); longer ones are truncated, never rejected. */
export const AI_MAX_MODEL_MESSAGE_CHARS = 16000;

export const LAB_CONTEXTS: readonly LabContext[] = ['general', 'circuits', 'power', 'logic', 'control', 'code', 'arduino', 'signals', 'fluid', 'plc'];

/** Labs an answer can be opened in; `general` is only a request hint, never a marker target. */
export type SimLab = Exclude<LabContext, 'general'>;

/**
 * When an answer analyzes something that can be opened in an interactive simulator, the model ends it with
 * one final line `[[SIM:<lab>]]`. The UI strips it with `splitSimMarker` and shows an "Open in simulator" button.
 */
export const SIM_MARKER_REGEX = /\n?\[\[SIM:(circuits|power|logic|control|code|arduino|signals|fluid|plc)\]\]\s*$/;

const SIM_LABS: readonly SimLab[] = ['circuits', 'power', 'logic', 'control', 'code', 'arduino', 'signals', 'fluid', 'plc'];
const SIM_MARKERS = SIM_LABS.map((lab) => `[[SIM:${lab}]]`);
const SIM_MARKER_MAX = Math.max(...SIM_MARKERS.map((marker) => marker.length));

/**
 * Splits a trailing simulator marker off streamed or final text. A complete marker yields its lab; a trailing
 * partial marker (`[[SI`, `[[SIM:con`) is dropped too, so a streaming UI never flashes half a marker.
 */
export function splitSimMarker(text: string): { text: string; lab: SimLab | null } {
  const match = SIM_MARKER_REGEX.exec(text);
  if (match) return { text: text.slice(0, match.index).trimEnd(), lab: match[1] as SimLab };

  for (let length = Math.min(text.length, SIM_MARKER_MAX - 1); length >= 1; length--) {
    const tail = text.slice(-length);
    if (!tail.startsWith('[') || !SIM_MARKERS.some((marker) => marker.startsWith(tail))) continue;
    const before = text.slice(0, text.length - length);
    // Only at the start of the text or after whitespace, so `a[` or `x[[` in prose is never touched.
    if (before === '' || /\s$/.test(before)) return { text: before.trimEnd(), lab: null };
  }
  return { text, lab: null };
}

const LEGACY_TAG_OPEN = '[GENERATE_SCHEMATIC:';

/**
 * Chats stored before schematics became a validated JSON spec may end with a text-to-image tag
 * `[GENERATE_SCHEMATIC: ...]`. It is dead text now: this strips it (complete, or still unclosed to the end of the
 * text) so old messages never show it. Only at the start of the text or after whitespace. Pure and idempotent.
 */
export function stripLegacySchematicTag(text: string): string {
  if (!text.includes('[')) return text;
  let out = text;
  let from = 0;
  for (;;) {
    const start = out.indexOf(LEGACY_TAG_OPEN, from);
    if (start === -1) break;
    if (start > 0 && !/\s/.test(out[start - 1])) {
      from = start + 1;
      continue;
    }
    const lineEnd = out.indexOf('\n', start);
    const line = out.slice(start, lineEnd === -1 ? out.length : lineEnd);
    const close = line.lastIndexOf(']');
    if (close === -1) {
      out = out.slice(0, start).trimEnd();
      break;
    }
    const end = start + close + 1;
    out = (out.slice(0, start).trimEnd() + (out.slice(end).trim() ? '\n\n' + out.slice(end).trimStart() : '')).trimEnd();
    from = 0;
  }
  for (let length = Math.min(out.length, LEGACY_TAG_OPEN.length - 1); length >= 1; length--) {
    const tail = out.slice(-length);
    if (!tail.startsWith('[') || !LEGACY_TAG_OPEN.startsWith(tail)) continue;
    const before = out.slice(0, out.length - length);
    if (before === '' || /\s$/.test(before)) return before.trimEnd();
  }
  return out;
}

/** Longest illustration prompt the tag may carry and the image route accepts. */
export const MAX_IMAGE_PROMPT_CHARS = 1000;

const IMAGE_TAG_OPEN = '[GENERATE_IMAGE:';

/** A complete, well-formed tag: single line, no brackets inside. Looser tags are still hidden by `splitImageTag`. */
export const IMAGE_TAG_REGEX = /\[GENERATE_IMAGE:\s*([^[\]\r\n]{1,1000}?)\s*\]/;

/**
 * When an answer is best served by an illustration (machine taxonomies, cutaways, concept maps) the model ends it
 * with one `[GENERATE_IMAGE: <english prompt>]` line (before the optional `[[SIM:..]]` line). The UI hides it with
 * `splitImageTag` and renders an illustration card. Call `splitSimMarker` first. A complete tag yields its prompt
 * (tolerating CRLF and stray brackets inside, clamped to MAX_IMAGE_PROMPT_CHARS); an unclosed trailing tag or a
 * trailing partial prefix (`[GENER`) is dropped with no prompt, so a streaming UI never flashes half a tag. Only at
 * the start of the text or after whitespace. Further tags are removed too; the first one wins.
 */
export function splitImageTag(text: string): { text: string; prompt: string | null } {
  if (!text.includes('[')) return { text, prompt: null };
  let out = text;
  let prompt: string | null = null;
  let from = 0;
  for (;;) {
    const start = out.indexOf(IMAGE_TAG_OPEN, from);
    if (start === -1) break;
    if (start > 0 && !/\s/.test(out[start - 1])) {
      from = start + 1;
      continue;
    }
    const lineEnd = out.indexOf('\n', start);
    const line = out.slice(start, lineEnd === -1 ? out.length : lineEnd).replace(/\r$/, '');
    const close = line.lastIndexOf(']');
    if (close === -1) {
      out = out.slice(0, start).trimEnd();
      break;
    }
    if (prompt === null) {
      const inner = line.slice(IMAGE_TAG_OPEN.length, close).replace(/[[\]]/g, ' ').replace(/\s+/g, ' ').trim();
      if (inner) prompt = inner.slice(0, MAX_IMAGE_PROMPT_CHARS);
    }
    const end = start + close + 1;
    out = (out.slice(0, start).trimEnd() + (out.slice(end).trim() ? '\n\n' + out.slice(end).trimStart() : '')).trimEnd();
    from = 0;
  }
  for (let length = Math.min(out.length, IMAGE_TAG_OPEN.length - 1); length >= 1; length--) {
    const tail = out.slice(-length);
    if (!tail.startsWith('[') || !IMAGE_TAG_OPEN.startsWith(tail)) continue;
    const before = out.slice(0, out.length - length);
    if (before === '' || /\s$/.test(before)) return { text: before.trimEnd(), prompt };
  }
  return { text: out, prompt };
}

/** What a vector diagram is replaced with when a model turn is resent as history. */
export const DIAGRAM_OMITTED = '[diagram omitted]';

/**
 * Replaces every SVG diagram in a model reply with `[diagram omitted]`: any fenced block (```xml:svg, ```svg, or any
 * info string) whose info line or body contains `<svg`, including an unterminated trailing one, plus a bare
 * `<svg ...>...</svg>` outside fences. Other code fences are left untouched. Pure and idempotent.
 */
export function stripSvgDiagrams(text: string): string {
  const fenced = text.replace(/```([^\n`]*)(?:\n([\s\S]*?))?(?:```|$)/g, (whole, info: string, body: string | undefined) =>
    /^\s*(?:xml:)?svg\b/i.test(info) || /<svg[\s>]/i.test(info + (body ?? '')) ? DIAGRAM_OMITTED : whole,
  );
  return fenced.replace(/<svg[\s>][\s\S]*?(?:<\/svg>|$)/gi, DIAGRAM_OMITTED);
}
