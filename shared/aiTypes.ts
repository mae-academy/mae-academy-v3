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
 * request), 429 (rate limited or too many open streams), 503 (MAE AI not configured) or 502 (upstream unavailable).
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

export const LAB_CONTEXTS: readonly LabContext[] = ['general', 'circuits', 'power', 'logic', 'control', 'code', 'arduino', 'signals', 'fluid', 'plc'];
