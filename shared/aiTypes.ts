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
