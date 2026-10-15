import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@shared/aiTypes";
import { THREADS_STORAGE_KEY, loadThreads, saveThreads } from "./chatStorage";
import type { ChatThread } from "./chatThreads";

class FakeStorage {
  private data = new Map<string, string>();
  constructor(public quota = Infinity) {}
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) {
    if (value.length > this.quota) throw new DOMException("quota", "QuotaExceededError");
    this.data.set(key, value);
  }
  removeItem(key: string) { this.data.delete(key); }
}

const doc = { name: "notes.pdf", mimeType: "application/pdf" as const, size: 5000, dataUrl: `data:application/pdf;base64,JVBER${"A".repeat(1000)}` };
const msg = (i: number, extra: Partial<ChatMessage> = {}): ChatMessage => ({ id: `id${i}`, role: i % 2 ? "model" : "user", content: `msg ${i}`, timestamp: 1000 + i, ...extra });
const thread = (id: string, updatedAt: number, messages: ChatMessage[]): ChatThread => ({ id, createdAt: updatedAt - 10, updatedAt, messages });
const saved = (storage: FakeStorage) => JSON.parse(storage.getItem(THREADS_STORAGE_KEY) ?? "null") as { threads: ChatThread[] };

describe("documents are never persisted", () => {
  it("strips the bytes on save but keeps name, type and size, without mutating memory", () => {
    const storage = new FakeStorage();
    const source = [thread("a", 100, [msg(0, { document: doc }), msg(1)])];
    expect(saveThreads(source, storage)).toBe("saved");
    expect(storage.getItem(THREADS_STORAGE_KEY)).not.toContain("JVBER");
    expect(saved(storage).threads[0].messages[0].document).toEqual({ name: "notes.pdf", mimeType: "application/pdf", size: 5000 });
    expect(source[0].messages[0].document?.dataUrl).toBe(doc.dataUrl);
  });

  it("drops bytes found in stored data on load and discards malformed document metadata", () => {
    const storage = new FakeStorage();
    const bad = { ...msg(2), document: { name: 1 } } as unknown as ChatMessage;
    storage.setItem(THREADS_STORAGE_KEY, JSON.stringify({ v: 2, threads: [thread("a", 100, [msg(0, { document: doc }), bad])] }));
    const loaded = loadThreads(storage).threads[0].messages;
    expect(loaded[0].document).toEqual({ name: "notes.pdf", mimeType: "application/pdf", size: 5000 });
    expect(loaded[1].document).toBeUndefined();
    expect(loaded[1].content).toBe("msg 2");
  });

  it("still degrades through the quota ladder with documents present", () => {
    const small = new FakeStorage(3000);
    const image = `data:image/jpeg;base64,${"A".repeat(3000)}`;
    const threads = [thread("a", 300, [msg(0, { document: doc }), msg(1)]), thread("b", 200, [msg(0, { imageUrl: image })])];
    expect(saveThreads(threads, small)).toBe("trimmed");
    const result = saved(small);
    expect(result.threads[0].messages[0].document?.name).toBe("notes.pdf");
    expect(JSON.stringify(result)).not.toContain("JVBER");
  });
});
