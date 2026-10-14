import { describe, expect, it, vi } from "vitest";
import type { AiStreamEvent, ChatMessage } from "@shared/aiTypes";
import { buildRequestMessages, ChatStreamError, createSseParser, streamChat } from "./streamChat";

const delta = (text: string) => `data: ${JSON.stringify({ type: "delta", text })}\n\n`;
const DONE = `data: {"type":"done"}\n\n`;

function parseAll(chunks: string[]): AiStreamEvent[] {
  const events: AiStreamEvent[] = [];
  const parser = createSseParser((e) => events.push(e));
  chunks.forEach((c) => parser.push(c));
  parser.flush();
  return events;
}

describe("createSseParser", () => {
  it("parses whole events", () => {
    expect(parseAll([delta("Hi") + delta(" there") + DONE])).toEqual([
      { type: "delta", text: "Hi" },
      { type: "delta", text: " there" },
      { type: "done" },
    ]);
  });

  it("reassembles events split at every possible byte boundary", () => {
    const stream = delta("a\nb") + delta("é✓") + `data: {"type":"error","message":"x"}\n\n`;
    const expected = parseAll([stream]);
    expect(expected).toHaveLength(3);
    for (let i = 1; i < stream.length; i++) {
      expect(parseAll([stream.slice(0, i), stream.slice(i)])).toEqual(expected);
    }
    expect(parseAll(stream.split(""))).toEqual(expected);
  });

  it("handles CRLF and a CR/LF pair split across chunks", () => {
    const crlf = delta("x").replace(/\n/g, "\r\n") + DONE.replace(/\n/g, "\r\n");
    expect(parseAll([crlf])).toEqual([{ type: "delta", text: "x" }, { type: "done" }]);
    expect(parseAll(crlf.split(""))).toEqual([{ type: "delta", text: "x" }, { type: "done" }]);
    expect(parseAll(["data: {\"type\":\"done\"}\r", "\n\r", "\n"])).toEqual([{ type: "done" }]);
  });

  it("ignores malformed JSON, unknown shapes, comments and non-data fields", () => {
    const events = parseAll([
      "data: {not json\n\n",
      ": keep-alive\n\n",
      "event: ping\nid: 7\n\n",
      `data: {"type":"delta"}\n\n`,
      `data: {"type":"delta","text":5}\n\n`,
      `data: {"type":"mystery"}\n\n`,
      "data: null\n\n",
      "data: [1]\n\n",
      delta("ok"),
    ]);
    expect(events).toEqual([{ type: "delta", text: "ok" }]);
  });

  it("accepts data without the optional space and multi-line data", () => {
    expect(parseAll([`data:{"type":"done"}\n\n`])).toEqual([{ type: "done" }]);
    expect(parseAll([`data: {"type":\ndata: "done"}\n\n`])).toEqual([{ type: "done" }]);
  });

  it("emits a final event that lacks the terminating blank line only on flush", () => {
    const events: AiStreamEvent[] = [];
    const parser = createSseParser((e) => events.push(e));
    parser.push(`data: {"type":"done"}\n`);
    expect(events).toEqual([]);
    parser.flush();
    expect(events).toEqual([{ type: "done" }]);
  });

  it("keeps an error event's message", () => {
    expect(parseAll([`data: {"type":"error","message":"boom"}\n\n`])).toEqual([{ type: "error", message: "boom" }]);
  });
});

const msg = (id: string, role: ChatMessage["role"], content: string, imageUrl?: string): ChatMessage => ({ id, role, content, imageUrl, timestamp: 1 });

describe("buildRequestMessages", () => {
  it("keeps only the last 6 messages and starts on a user turn", () => {
    const history = [msg("0", "user", "u0"), msg("1", "model", "m1"), msg("2", "user", "u2"), msg("3", "model", "m3"), msg("4", "user", "u4"), msg("5", "model", "m5"), msg("6", "user", "u6")];
    expect(buildRequestMessages(history).map((m) => m.id)).toEqual(["2", "3", "4", "5", "6"]);
  });

  it("drops empty model turns and merges the user turns that result", () => {
    const out = buildRequestMessages([msg("1", "user", "first"), msg("2", "model", ""), msg("3", "user", "second")]);
    expect(out).toHaveLength(1);
    expect(out[0].content).toBe("first\n\nsecond");
  });

  it("keeps only the newest image", () => {
    const out = buildRequestMessages([msg("1", "user", "a", "data:image/jpeg;base64,AAAA"), msg("2", "model", "ok"), msg("3", "user", "b", "data:image/jpeg;base64,BBBB")]);
    expect(out[0]).not.toHaveProperty("imageUrl");
    expect(out[2].imageUrl).toBe("data:image/jpeg;base64,BBBB");
  });

  it("strips the simulator marker (complete or partial) from earlier answers, not from user text", () => {
    const out = buildRequestMessages([
      msg("1", "user", "kvl?"),
      msg("2", "model", "Use KVL.\n[[SIM:circuits]]"),
      msg("3", "user", "and [[SIM:power]] literally"),
      msg("4", "model", "Half way [[SIM:con"),
      msg("5", "user", "go on"),
    ]);
    expect(out.map((m) => m.content)).toEqual(["kvl?", "Use KVL.", "and [[SIM:power]] literally", "Half way", "go on"]);
    expect(JSON.stringify(out)).not.toContain("[[SIM:circuits]]");
  });

  it("replaces diagrams in earlier model answers with a short literal, leaving user text alone", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500">${"<rect width='1' height='1'/>".repeat(500)}</svg>`;
    const out = buildRequestMessages([
      msg("1", "user", "draw a divider"),
      msg("2", "model", `Here you go.\n\n\`\`\`xml:svg\n${svg}\n\`\`\`\n\nR1 and R2 split 12 V.\n[[SIM:circuits]]`),
      msg("3", "user", "```xml:svg\nI typed this myself\n```"),
    ]);
    expect(out[1].content).toBe("Here you go.\n\n[diagram omitted]\n\nR1 and R2 split 12 V.");
    expect(out[2].content).toBe("```xml:svg\nI typed this myself\n```");
    expect(JSON.stringify(out).length).toBeLessThan(400);
  });

  it("strips the schematic tag from earlier model answers but keeps a user's literal text", () => {
    const out = buildRequestMessages([
      msg("1", "user", "draw a buck"),
      msg("2", "model", "Netlist: ...\n\n[GENERATE_SCHEMATIC: A buck converter, white background]\n[[SIM:power]]"),
      msg("3", "user", "type [GENERATE_SCHEMATIC: x] literally"),
    ]);
    expect(out[1].content).toBe("Netlist: ...");
    expect(out[2].content).toBe("type [GENERATE_SCHEMATIC: x] literally");
    expect(JSON.stringify(out.slice(0, 2))).not.toContain("GENERATE_SCHEMATIC");
  });

  it("drops a model turn that was only a marker", () => {
    const out = buildRequestMessages([msg("1", "user", "a"), msg("2", "model", "[[SIM:logic]]"), msg("3", "user", "b")]);
    expect(out).toHaveLength(1);
    expect(out[0].content).toBe("a\n\nb");
  });
});

function sseResponse(chunks: string[], init: ResponseInit = { status: 200 }): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((c) => controller.enqueue(encoder.encode(c)));
      controller.close();
    },
  });
  return new Response(body, { ...init, headers: { "content-type": "text/event-stream" } });
}

describe("streamChat", () => {
  const base = { messages: [msg("1", "user", "hi")], lab: "control" as const };

  it("streams deltas, posts the lab and resolves on done", async () => {
    const fetchImpl = vi.fn(async () => sseResponse([delta("Hel"), delta("lo"), DONE]));
    const seen: string[] = [];
    await streamChat({ ...base, signal: new AbortController().signal, onDelta: (t) => seen.push(t), fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(seen).toEqual(["Hel", "lo"]);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/ai/chat");
    expect(JSON.parse(init.body as string)).toMatchObject({ lab: "control", messages: [{ role: "user", content: "hi" }] });
  });

  it("sends the request body without the marker and reports the demo mode header", async () => {
    const messages = [msg("1", "user", "hi"), msg("2", "model", "Answer\n[[SIM:control]]"), msg("3", "user", "more")];
    const fetchImpl = vi.fn(async () => new Response(new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new TextEncoder().encode(DONE)); c.close(); } }), { status: 200, headers: { "X-MAE-AI-Mode": "mock" } }));
    const modes: string[] = [];
    await streamChat({ messages, lab: "general", signal: new AbortController().signal, onDelta: () => {}, onMode: (m) => modes.push(m), fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(modes).toEqual(["mock"]);
    const body = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string;
    expect(body).not.toContain("[[SIM");
    expect(JSON.parse(body).messages[1].content).toBe("Answer");
    const live = vi.fn(async () => sseResponse([DONE]));
    await streamChat({ messages, lab: "general", signal: new AbortController().signal, onDelta: () => {}, onMode: (m) => modes.push(m), fetchImpl: live as unknown as typeof fetch });
    expect(modes).toEqual(["mock", "live"]);
  });

  it.each([
    [429, "rate_limit"],
    [503, "not_configured"],
    [403, "forbidden"],
    [400, "bad_request"],
    [502, "upstream"],
    [500, "upstream"],
  ])("maps HTTP %i to %s without reading the body", async (status, kind) => {
    const fetchImpl = async () => new Response("<html>secret</html>", { status });
    await expect(streamChat({ ...base, signal: new AbortController().signal, onDelta: () => {}, fetchImpl: fetchImpl as unknown as typeof fetch })).rejects.toMatchObject({ kind });
  });

  it("maps a network failure and a stream ending without done", async () => {
    const down = async () => { throw new TypeError("Failed to fetch"); };
    await expect(streamChat({ ...base, signal: new AbortController().signal, onDelta: () => {}, fetchImpl: down as unknown as typeof fetch })).rejects.toBeInstanceOf(ChatStreamError);
    const cut = async () => sseResponse([delta("partial")]);
    const seen: string[] = [];
    await expect(streamChat({ ...base, signal: new AbortController().signal, onDelta: (t) => seen.push(t), fetchImpl: cut as unknown as typeof fetch })).rejects.toMatchObject({ kind: "interrupted" });
    expect(seen).toEqual(["partial"]);
  });

  it("maps an in-stream error event to upstream", async () => {
    const fetchImpl = async () => sseResponse([delta("x"), `data: {"type":"error","message":"nope"}\n\n`]);
    await expect(streamChat({ ...base, signal: new AbortController().signal, onDelta: () => {}, fetchImpl: fetchImpl as unknown as typeof fetch })).rejects.toMatchObject({ kind: "upstream" });
  });

  it("rethrows the abort instead of wrapping it", async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn(async () => {
      controller.abort();
      throw new DOMException("aborted", "AbortError");
    });
    await expect(streamChat({ ...base, signal: controller.signal, onDelta: () => {}, fetchImpl: fetchImpl as unknown as typeof fetch })).rejects.toMatchObject({ name: "AbortError" });
  });
});
