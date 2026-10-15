import { AI_HISTORY_WINDOW, splitTrailingMarkers, stripLegacySchematicTag, type AiStreamEvent, type ChatDocument, type ChatMessage, type LabContext, type ThinkingEffort } from "@shared/aiTypes";

import { stripSvgFences } from "./svgFence";

export type ChatErrorKind =
  | "rate_limit"
  | "cooling_down"
  | "daily_limit"
  | "not_configured"
  | "forbidden"
  | "bad_request"
  | "upstream"
  | "network"
  | "interrupted"
  | "empty";

/** A failure with a stable kind, so the UI shows localized copy instead of whatever the server said. */
export class ChatStreamError extends Error {
  constructor(readonly kind: ChatErrorKind) {
    super(kind);
    this.name = "ChatStreamError";
  }
}

export interface SseParser {
  /** Feed a decoded text chunk; complete events are emitted synchronously. */
  push(chunk: string): void;
  /** Stream ended: emit a trailing event that was not terminated by a blank line. */
  flush(): void;
}

function toStreamEvent(raw: unknown): AiStreamEvent | null {
  if (typeof raw !== "object" || raw === null) return null;
  const event = raw as { type?: unknown; text?: unknown; message?: unknown };
  if (event.type === "delta" && typeof event.text === "string") return { type: "delta", text: event.text };
  if (event.type === "done") return { type: "done" };
  if (event.type === "error") return { type: "error", message: typeof event.message === "string" ? event.message : "" };
  return null;
}

/**
 * Incremental Server-Sent Events parser. Chunk boundaries may fall anywhere (mid-line, mid-event, between the
 * `\r` and `\n` of a CRLF), so input is buffered and events are only cut on a blank line. Comments, unknown
 * fields and events whose data is not a valid AiStreamEvent are ignored.
 */
export function createSseParser(onEvent: (event: AiStreamEvent) => void): SseParser {
  let buffer = "";
  let heldCr = false;

  const dispatch = (block: string) => {
    const data: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("data:")) data.push(line.slice(line.charAt(5) === " " ? 6 : 5));
    }
    if (data.length === 0) return;
    try {
      const event = toStreamEvent(JSON.parse(data.join("\n")));
      if (event) onEvent(event);
    } catch {
      /* malformed event: skip it, keep the stream alive */
    }
  };

  const drain = () => {
    let cut = buffer.indexOf("\n\n");
    while (cut !== -1) {
      dispatch(buffer.slice(0, cut));
      buffer = buffer.slice(cut + 2);
      cut = buffer.indexOf("\n\n");
    }
  };

  return {
    push(chunk) {
      let text = (heldCr ? "\r" : "") + chunk;
      // A trailing CR may be the first half of a CRLF split across chunks.
      heldCr = text.endsWith("\r");
      if (heldCr) text = text.slice(0, -1);
      buffer += text.replace(/\r\n?/g, "\n");
      drain();
    },
    flush() {
      if (heldCr) buffer += "\n";
      heldCr = false;
      drain();
      if (buffer.trim()) dispatch(buffer);
      buffer = "";
    },
  };
}

/**
 * The slice of history the server will actually read: the last AI_HISTORY_WINDOW messages, unanswered or
 * empty turns folded away (a failed reply leaves two user turns in a row, which Gemini rejects), and only
 * the newest image kept (the server drops older ones anyway, so don't upload them again). The trailing
 * `[[SIM:<lab>]]` marker of earlier answers is UI plumbing, so it is stripped before it can reach the model.
 * The ACTIVE document (the newest message in the whole thread whose bytes are in memory) rides on the last user message,
 * so follow-ups keep it in context after the message that first carried it has left the window; every other message
 * carries document metadata only. When the bytes are gone (after a reload) nothing is attached.
 */
export function buildRequestMessages(messages: readonly ChatMessage[]): ChatMessage[] {
  const merged: ChatMessage[] = [];
  for (const original of messages.slice(-AI_HISTORY_WINDOW)) {
    // The simulator marker and a legacy schematic tag are UI plumbing, and legacy SVG diagrams are large: none of it goes back to the model. ```schematic specs stay (the model edits its own previous spec).
    const message = original.role === "model" ? { ...original, content: stripSvgFences(stripLegacySchematicTag(splitTrailingMarkers(stripLegacySchematicTag(original.content)).text)) } : original;
    if (message.role === "model" && !message.content.trim()) continue;
    const previous = merged[merged.length - 1];
    if (previous && previous.role === message.role) {
      merged[merged.length - 1] = {
        ...message,
        content: [previous.content, message.content].filter(Boolean).join("\n\n"),
        imageUrl: message.imageUrl ?? previous.imageUrl,
        ...(message.document ?? previous.document ? { document: message.document ?? previous.document } : {}),
      };
    } else {
      merged.push({ ...message });
    }
  }
  while (merged.length > 0 && merged[0].role !== "user") merged.shift();
  let newestImage = -1;
  merged.forEach((message, index) => {
    if (message.imageUrl) newestImage = index;
  });
  let activeDocument: ChatDocument | undefined;
  for (let i = messages.length - 1; i >= 0; i--) {
    const candidate = messages[i].document;
    if (candidate?.dataUrl) {
      activeDocument = candidate;
      break;
    }
  }
  let lastUser = -1;
  merged.forEach((message, index) => {
    if (message.role === "user") lastUser = index;
  });
  return merged.map((message, index) => {
    let out: ChatMessage = message;
    if (index !== newestImage && message.imageUrl) {
      const { imageUrl: _dropped, ...rest } = message;
      out = rest;
    }
    if (index === lastUser && activeDocument) return { ...out, document: activeDocument };
    if (out.document?.dataUrl) {
      const { dataUrl: _bytes, ...meta } = out.document;
      return { ...out, document: meta };
    }
    return out;
  });
}

function kindForStatus(status: number, reason: string | null): ChatErrorKind {
  if (status === 429) return reason === "model_cooldown" ? "cooling_down" : reason === "model_daily" ? "daily_limit" : "rate_limit";
  if (status === 503) return "not_configured";
  if (status === 403) return "forbidden";
  if (status === 400 || status === 413) return "bad_request";
  return "upstream";
}

export interface StreamChatOptions {
  messages: readonly ChatMessage[];
  lab: LabContext;
  /** Step-by-step guidance; sent as `stepMode: true` only when on, so the body is unchanged otherwise. */
  stepMode?: boolean;
  /** Reasoning depth; always sent when given so the server never has to guess. */
  thinkingEffort?: ThinkingEffort;
  signal: AbortSignal;
  onDelta: (text: string) => void;
  /** Called once the stream is accepted; `mock` is the dev-only demo stream (no GEMINI_API_KEY on the server). */
  onMode?: (mode: "live" | "mock") => void;
  fetchImpl?: typeof fetch;
}

/**
 * POSTs the conversation and feeds answer text to `onDelta` until the server's `done` event. Resolves on
 * completion; rejects with ChatStreamError on any failure and with the native AbortError when `signal` aborts.
 * Error bodies are never surfaced (they may be HTML or leak internals).
 */
export async function streamChat({ messages, lab, stepMode, thinkingEffort, signal, onDelta, onMode, fetchImpl = fetch }: StreamChatOptions): Promise<void> {
  let response: Response;
  try {
    response = await fetchImpl("/api/ai/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: buildRequestMessages(messages), lab, ...(stepMode ? { stepMode: true } : {}), ...(thinkingEffort ? { thinkingEffort } : {}) }),
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new ChatStreamError("network");
  }

  if (!response.ok) {
    // Release the connection without reading the (untrusted) body.
    void response.body?.cancel().catch(() => undefined);
    throw new ChatStreamError(kindForStatus(response.status, response.headers.get("x-mae-ai-reason")));
  }
  if (!response.body) throw new ChatStreamError("upstream");
  onMode?.(response.headers.get("X-MAE-AI-Mode") === "mock" ? "mock" : "live");

  let finished = false;
  let streamError = false;
  const parser = createSseParser((event) => {
    if (finished || streamError) return;
    if (event.type === "delta") onDelta(event.text);
    else if (event.type === "done") finished = true;
    else streamError = true;
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parser.push(decoder.decode(value, { stream: true }));
      if (finished || streamError) break;
    }
    parser.push(decoder.decode());
    parser.flush();
  } catch (error) {
    if (signal.aborted) throw error;
    throw new ChatStreamError("interrupted");
  } finally {
    void reader.cancel().catch(() => undefined);
  }

  if (streamError) throw new ChatStreamError("upstream");
  if (!finished) throw new ChatStreamError("interrupted");
}
