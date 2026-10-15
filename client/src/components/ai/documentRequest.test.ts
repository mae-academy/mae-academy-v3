import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@shared/aiTypes";
import { regenerateHistory } from "./chatThreads";
import { buildRequestMessages } from "./streamChat";

const PDF = { name: "notes.pdf", mimeType: "application/pdf" as const, size: 1234, dataUrl: "data:application/pdf;base64,JVBERi0=" };
const user = (id: string, content: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({ id, role: "user", content, timestamp: 1, ...extra });
const model = (id: string, content: string): ChatMessage => ({ id, role: "model", content, timestamp: 1 });

describe("buildRequestMessages with documents", () => {
  it("puts the document on the last user message only; earlier messages carry metadata without bytes", () => {
    const out = buildRequestMessages([user("u1", "summarise", { document: PDF }), model("m1", "ok"), user("u2", "and page 2?")]);
    expect(out[0].document).toEqual({ name: "notes.pdf", mimeType: "application/pdf", size: 1234 });
    expect(out[0].document).not.toHaveProperty("dataUrl");
    expect(out[2].document).toEqual(PDF);
  });

  it("keeps the document attached after the message that carried it left the 6-message window", () => {
    const history: ChatMessage[] = [user("u1", "q1", { document: PDF })];
    for (let i = 0; i < 4; i++) history.push(model(`m${i}`, "a"), user(`u${i + 2}`, `q${i + 2}`));
    const out = buildRequestMessages(history);
    expect(out.some((m) => m.content === "q1")).toBe(false);
    expect(out.filter((m) => m.document)).toHaveLength(1);
    expect(out[out.length - 1]).toMatchObject({ role: "user", content: "q5", document: PDF });
  });

  it("uses the newest document in memory", () => {
    const second = { ...PDF, name: "other.pdf", dataUrl: "data:application/pdf;base64,JVBERnQ=" };
    const out = buildRequestMessages([user("u1", "a", { document: PDF }), model("m1", "x"), user("u2", "b", { document: second })]);
    expect(out[2].document).toEqual(second);
    expect(out[0].document).toEqual({ name: "notes.pdf", mimeType: "application/pdf", size: 1234 });
  });

  it("sends no bytes when they were dropped (restored chat) and keeps only metadata", () => {
    const { dataUrl: _bytes, ...meta } = PDF;
    const out = buildRequestMessages([user("u1", "summarise", { document: meta }), model("m1", "ok"), user("u2", "more?")]);
    expect(out.some((m) => m.document?.dataUrl)).toBe(false);
    expect(out[2].document).toBeUndefined();
    expect(JSON.stringify(out)).not.toContain("JVBER");
  });

  it("resends the document when regenerating a reply to a document question", () => {
    const history = regenerateHistory([user("u1", "summarise", { document: PDF }), model("m1", "old answer")], "m1");
    expect(history).not.toBeNull();
    const out = buildRequestMessages(history ?? []);
    expect(out).toHaveLength(1);
    expect(out[0].document).toEqual(PDF);
  });

  it("does not mutate the thread's messages", () => {
    const messages = [user("u1", "summarise", { document: PDF }), model("m1", "ok"), user("u2", "more?")];
    buildRequestMessages(messages);
    expect(messages[0].document?.dataUrl).toBe(PDF.dataUrl);
    expect(messages[2].document).toBeUndefined();
  });
});
