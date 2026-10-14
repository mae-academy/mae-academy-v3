import { AI_HISTORY_WINDOW, type AiStreamEvent, type ChatMessage, type LabContext } from "@shared/aiTypes";

export type ChatErrorKind =
  | "rate_limit"
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
 * the newest image kept (the server drops older ones anyway, so don't upload them again).
 */
export function buildRequestMessages(messages: readonly ChatMessage[]): ChatMessage[] {
  const merged: ChatMessage[] = [];
  for (const message of messages.slice(-AI_HISTORY_WINDOW)) {
    if (message.role === "model" && !message.content.trim()) continue;
    const previous = merged[merged.length - 1];
    if (previous && previous.role === message.role) {
      merged[merged.length - 1] = {
        ...message,
        content: [previous.content, message.content].filter(Boolean).join("\n\n"),
        imageUrl: message.imageUrl ?? previous.imageUrl,
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
  return merged.map((message, index) => {
    if (index === newestImage || !message.imageUrl) return message;
    const { imageUrl: _dropped, ...rest } = message;
    return rest;
  });
}

function kindForStatus(status: number): ChatErrorKind {
  if (status === 429) return "rate_limit";
  if (status === 503) return "not_configured";
  if (status === 403) return "forbidden";
  if (status === 400 || status === 413) return "bad_request";
  return "upstream";
}

export interface StreamChatOptions {
  messages: readonly ChatMessage[];
  lab: LabContext;
  signal: AbortSignal;
  onDelta: (text: string) => void;
  fetchImpl?: typeof fetch;
}

/**
 * POSTs the conversation and feeds answer text to `onDelta` until the server's `done` event. Resolves on
 * completion; rejects with ChatStreamError on any failure and with the native AbortError when `signal` aborts.
 * Error bodies are never surfaced (they may be HTML or leak internals).
 */
export async function streamChat({ messages, lab, signal, onDelta, fetchImpl = fetch }: StreamChatOptions): Promise<void> {
  let response: Response;
  try {
    response = await fetchImpl("/api/ai/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: buildRequestMessages(messages), lab }),
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new ChatStreamError("network");
  }

  if (!response.ok) {
    // Release the connection without reading the (untrusted) body.
    void response.body?.cancel().catch(() => undefined);
    throw new ChatStreamError(kindForStatus(response.status));
  }
  if (!response.body) throw new ChatStreamError("upstream");

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
