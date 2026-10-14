import { describe, expect, it } from "vitest";
import { AI_HISTORY_WINDOW, AI_MAX_IMAGE_BYTES, AI_MAX_MESSAGE_CHARS, type ChatMessage } from "../shared/aiTypes";
import { AiRequestError, buildContents, buildSystemInstruction, sanitizeChatRequest, windowMessages } from "./aiService";

const PNG = "data:image/png;base64,iVBORw0KGgo=";
const msg = (n: number, role: "user" | "model", extra: Partial<ChatMessage> = {}): ChatMessage => ({ id: String(n), role, content: `m${n}`, timestamp: n, ...extra });
/** Alternating conversation u0 m1 u2 m3 ... of `count` messages. */
const convo = (count: number) => Array.from({ length: count }, (_, i) => msg(i, i % 2 === 0 ? "user" : "model"));
const refused = (body: unknown) => {
  try {
    sanitizeChatRequest(body);
  } catch (error) {
    expect(error).toBeInstanceOf(AiRequestError);
    return (error as Error).message;
  }
  throw new Error("expected sanitizeChatRequest to throw");
};

describe("history window", () => {
  it("keeps only the last AI_HISTORY_WINDOW messages", () => {
    const { messages } = sanitizeChatRequest({ messages: convo(11) }); // ends on a user turn (index 10)
    expect(messages.length).toBeLessThanOrEqual(AI_HISTORY_WINDOW);
    expect(messages[messages.length - 1].id).toBe("10");
    expect(messages.map((m) => m.id)).toEqual(["5", "6", "7", "8", "9", "10"].slice(-messages.length));
  });

  it("drops leading model turns after windowing", () => {
    // last 6 of an 11-message conversation start with index 5 (model)
    const windowed = windowMessages(convo(11));
    expect(windowed[0].role).toBe("user");
    expect(windowed.map((m) => m.id)).toEqual(["6", "7", "8", "9", "10"]);
  });

  it("rejects a conversation whose last turn is not the user's", () => {
    expect(refused({ messages: convo(4) })).toMatch(/last message/i);
  });

  it("keeps only the most recent image", () => {
    const messages = [msg(0, "user", { imageUrl: PNG }), msg(1, "model"), msg(2, "user", { imageUrl: PNG }), msg(3, "model"), msg(4, "user")];
    const contents = buildContents(sanitizeChatRequest({ messages }).messages);
    const withImage = contents.map((c, i) => (c.parts.some((p) => p.inlineData) ? i : -1)).filter((i) => i >= 0);
    expect(withImage).toEqual([2]);
    expect(contents[2].parts[0].inlineData).toEqual({ mimeType: "image/png", data: "iVBORw0KGgo=" });
  });

  it("never emits an empty part list for an old image-only message", () => {
    const messages = [msg(0, "user", { imageUrl: PNG, content: "" }), msg(1, "model"), msg(2, "user", { imageUrl: PNG })];
    for (const c of buildContents(sanitizeChatRequest({ messages }).messages)) expect(c.parts.length).toBeGreaterThan(0);
  });

  it("maps roles to Gemini roles and starts and ends on a user turn", () => {
    const contents = buildContents(sanitizeChatRequest({ messages: convo(5) }).messages);
    expect(contents.map((c) => c.role)).toEqual(["user", "model", "user", "model", "user"]);
  });
});

describe("validation", () => {
  it("rejects non-object bodies and empty message lists", () => {
    refused(null);
    refused("hi");
    refused({});
    refused({ messages: [] });
  });

  it("rejects an unknown role", () => {
    refused({ messages: [{ ...msg(0, "user"), role: "system" }] });
  });

  it("rejects overlong content", () => {
    refused({ messages: [msg(0, "user", { content: "x".repeat(AI_MAX_MESSAGE_CHARS + 1) })] });
  });

  it("rejects non-image or unsupported data URLs", () => {
    refused({ messages: [msg(0, "user", { imageUrl: "data:image/gif;base64,R0lGOD==" })] });
    refused({ messages: [msg(0, "user", { imageUrl: "data:text/html;base64,PGI+" })] });
    refused({ messages: [msg(0, "user", { imageUrl: "https://example.com/a.png" })] });
  });

  it("rejects an image over the decoded size cap and accepts one at the cap", () => {
    const big = `data:image/jpeg;base64,${"A".repeat(Math.ceil((AI_MAX_IMAGE_BYTES * 4) / 3) + 8)}`;
    expect(refused({ messages: [msg(0, "user", { imageUrl: big })] })).toMatch(/too large/i);
    const ok = `data:image/jpeg;base64,${"A".repeat(Math.floor(AI_MAX_IMAGE_BYTES / 3) * 4)}`;
    expect(sanitizeChatRequest({ messages: [msg(0, "user", { imageUrl: ok })] }).messages).toHaveLength(1);
  });

  it("falls back to the general lab for unknown or missing lab values", () => {
    expect(sanitizeChatRequest({ messages: [msg(0, "user")], lab: "bogus" }).lab).toBe("general");
    expect(sanitizeChatRequest({ messages: [msg(0, "user")] }).lab).toBe("general");
    expect(sanitizeChatRequest({ messages: [msg(0, "user")], lab: "fluid" }).lab).toBe("fluid");
  });
});

describe("system instruction", () => {
  const prompt = buildSystemInstruction("general");

  it("demands dollar-delimited LaTeX and forbids the bracket forms", () => {
    expect(prompt).toContain("$...$");
    expect(prompt).toContain("$$...$$");
    expect(prompt).toMatch(/Never use \\\( \\\) or \\\[ \\\]/);
  });

  it("tells the model to label nodes read from a schematic and admit unreadable parts", () => {
    expect(prompt).toMatch(/label the nodes/i);
    expect(prompt).toMatch(/unreadable/i);
  });

  it("refuses off-topic questions and answers in the user's language", () => {
    expect(prompt).toMatch(/decline/i);
    expect(prompt).toMatch(/language the student writes in/i);
  });

  it("appends a lab-specific hint", () => {
    expect(buildSystemInstruction("fluid")).toMatch(/pneumatics and hydraulics/);
    expect(buildSystemInstruction("arduino")).toMatch(/arduino/);
  });
});
