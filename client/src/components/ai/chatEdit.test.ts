import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@shared/aiTypes";
import { editAndResend, regenerateHistory, threadTitle } from "./chatThreads";
import { buildRequestMessages } from "./streamChat";

const msg = (i: number, role: ChatMessage["role"] = "user", content = `m${i}`): ChatMessage => ({ id: `m${i}`, role, content, timestamp: i });
const PDF = { name: "n.pdf", mimeType: "application/pdf" as const, size: 5, dataUrl: "data:application/pdf;base64,JVBERi0=" };
const convo = (): ChatMessage[] => [msg(1, "user", "q1"), msg(2, "model", "a1"), msg(3, "user", "q2"), msg(4, "model", "a2"), msg(5, "user", "q3"), msg(6, "model", "a3")];

describe("editAndResend", () => {
  it("edits the first, a middle and the last user message, truncating everything after it", () => {
    expect(editAndResend(convo(), "m1", { content: " Q1b " })!.map((m) => m.content)).toEqual(["Q1b"]);
    expect(editAndResend(convo(), "m3", { content: "Q2b" })!.map((m) => [m.id, m.content])).toEqual([["m1", "q1"], ["m2", "a1"], ["m3", "Q2b"]]);
    const last = editAndResend(convo(), "m5", { content: "Q3b" })!;
    expect(last.map((m) => m.id)).toEqual(["m1", "m2", "m3", "m4", "m5"]);
    expect(last.at(-1)!.role).toBe("user");
  });

  it("never mutates the input and keeps id, role and timestamp", () => {
    const input = convo();
    const snapshot = JSON.stringify(input);
    const out = editAndResend(input, "m3", { content: "Q2b" })!;
    expect(JSON.stringify(input)).toBe(snapshot);
    expect(out[2]).toEqual({ id: "m3", role: "user", content: "Q2b", timestamp: 3 });
  });

  it("rejects empty text, unknown ids and model messages", () => {
    expect(editAndResend(convo(), "m3", { content: "   " })).toBeNull();
    expect(editAndResend(convo(), "nope", { content: "x" })).toBeNull();
    expect(editAndResend(convo(), "m2", { content: "x" })).toBeNull();
  });

  it("replaces, keeps or removes the image and document", () => {
    const base = [{ ...msg(1, "user", "see"), imageUrl: "data:image/png;base64,AAA" }, msg(2, "model", "ok")];
    expect(editAndResend(base, "m1", { content: "new" })![0].imageUrl).toBe("data:image/png;base64,AAA");
    expect(editAndResend(base, "m1", { content: "new", imageUrl: "data:image/png;base64,BBB" })![0].imageUrl).toBe("data:image/png;base64,BBB");
    expect("imageUrl" in editAndResend(base, "m1", { content: "new", imageUrl: null })![0]).toBe(false);
    const withDoc = [{ ...msg(1, "user", "doc"), document: PDF }, msg(2, "model", "ok")];
    expect("document" in editAndResend(withDoc, "m1", { content: "no doc", document: null })![0]).toBe(false);
    expect(editAndResend([msg(1, "user", "plain"), msg(2, "model", "ok")], "m1", { content: "x", document: PDF })![0].document).toEqual(PDF);
  });

  it("picks the right active document afterwards: an edited-away document is no longer active", () => {
    const history = [{ ...msg(1, "user", "doc"), document: PDF }, msg(2, "model", "a"), msg(3, "user", "follow-up")];
    const kept = buildRequestMessages(editAndResend(history, "m3", { content: "follow-up 2" })!);
    expect(kept[0].document?.dataUrl).toBeUndefined(); // older message: metadata only
    expect(kept.at(-1)!.document?.dataUrl).toBe(PDF.dataUrl); // the active document rides on the last user turn
    const dropped = buildRequestMessages(editAndResend(history, "m1", { content: "no doc now", document: null })!);
    expect(dropped).toHaveLength(1);
    expect(dropped[0].document).toBeUndefined();
    const second = [msg(1, "user", "plain"), msg(2, "model", "a"), { ...msg(3, "user", "with doc"), document: PDF }, msg(4, "model", "b")];
    expect(buildRequestMessages(editAndResend(second, "m3", { content: "doc removed", document: null })!).some((m) => m.document)).toBe(false);
  });

  it("feeds the title and regenerate correctly", () => {
    const edited = editAndResend(convo(), "m1", { content: "Brand new first question" })!;
    expect(threadTitle({ messages: edited })).toBe("Brand new first question");
    expect(regenerateHistory([...edited, msg(9, "model", "fresh")], "m9")!.map((m) => m.id)).toEqual(["m1"]);
  });
});
