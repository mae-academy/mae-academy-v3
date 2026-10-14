import { beforeEach, describe, expect, it } from "vitest";
import type { ChatMessage } from "@shared/aiTypes";
import { CHAT_STORAGE_KEY, MAX_STORED_MESSAGES, clearChat, loadChat, loadMinimized, saveChat, saveMinimized } from "./chatStorage";

/** In-memory Storage with an optional byte quota, like a real browser's. */
class FakeStorage {
  private data = new Map<string, string>();
  constructor(private quota = Infinity) {}
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) {
    if (value.length > this.quota) throw new DOMException("quota", "QuotaExceededError");
    this.data.set(key, value);
  }
  removeItem(key: string) { this.data.delete(key); }
}

const m = (i: number, role: ChatMessage["role"] = i % 2 ? "model" : "user", imageUrl?: string): ChatMessage => ({ id: `id${i}`, role, content: `msg ${i}`, timestamp: 1000 + i, ...(imageUrl ? { imageUrl } : {}) });
const IMG = (n: number) => `data:image/jpeg;base64,${"A".repeat(n)}`;

let storage: FakeStorage;
beforeEach(() => { storage = new FakeStorage(); });

describe("loadChat / saveChat", () => {
  it("round-trips a conversation", () => {
    const chat = [m(0), m(1), m(2, "user", IMG(10))];
    expect(saveChat(chat, storage)).toBe("saved");
    expect(loadChat(storage)).toEqual(chat);
  });

  it("returns an empty chat for missing, corrupt or wrongly shaped data", () => {
    expect(loadChat(storage)).toEqual([]);
    for (const bad of ["{not json", "null", "42", "\"str\"", "{}", "{\"messages\":5}", "[]"]) {
      storage.setItem(CHAT_STORAGE_KEY, bad);
      expect(loadChat(storage)).toEqual([]);
    }
    expect(loadChat(null)).toEqual([]);
  });

  it("drops invalid entries but keeps valid ones", () => {
    storage.setItem(CHAT_STORAGE_KEY, JSON.stringify({ v: 1, messages: [
      m(0),
      { id: "x", role: "system", content: "hi", timestamp: 1 },
      { id: "y", role: "user", content: 5, timestamp: 1 },
      { id: "z", role: "user", content: "hi", timestamp: "now" },
      { id: "w", role: "user", content: "hi", timestamp: 1, imageUrl: "https://evil.example/x.png" },
      { id: "e", role: "model", content: "  ", timestamp: 1 },
      null,
      m(1),
    ] }));
    expect(loadChat(storage).map((x) => x.id)).toEqual(["id0", "id1"]);
  });

  it("strips unknown fields from stored messages", () => {
    storage.setItem(CHAT_STORAGE_KEY, JSON.stringify({ messages: [{ ...m(0), extra: "<script>" }] }));
    expect(loadChat(storage)[0]).not.toHaveProperty("extra");
  });

  it("caps the stored history to the most recent messages", () => {
    const chat = Array.from({ length: MAX_STORED_MESSAGES + 20 }, (_, i) => m(i));
    saveChat(chat, storage);
    const loaded = loadChat(storage);
    expect(loaded).toHaveLength(MAX_STORED_MESSAGES);
    expect(loaded[loaded.length - 1].id).toBe(`id${MAX_STORED_MESSAGES + 19}`);
  });

  it("on quota errors keeps only the newest image, then none, then a short text tail", () => {
    const chat = [m(0, "user", IMG(3000)), m(1), m(2, "user", IMG(3000)), m(3)];
    // Fits only once a single image is dropped.
    storage = new FakeStorage(4000);
    expect(saveChat(chat, storage)).toBe("trimmed");
    const afterOne = loadChat(storage);
    expect(afterOne.map((x) => Boolean(x.imageUrl))).toEqual([false, false, true, false]);

    // Fits only without any image.
    storage = new FakeStorage(1000);
    expect(saveChat(chat, storage)).toBe("trimmed");
    expect(loadChat(storage).some((x) => x.imageUrl)).toBe(false);
    expect(loadChat(storage)).toHaveLength(4);

    // Fits only the last ten messages.
    const long = Array.from({ length: 40 }, (_, i) => m(i));
    storage = new FakeStorage(JSON.stringify({ v: 1, messages: long.slice(-10) }).length);
    expect(saveChat(long, storage)).toBe("trimmed");
    expect(loadChat(storage)).toHaveLength(10);
  });

  it("reports failure instead of throwing when nothing can be stored", () => {
    expect(saveChat([m(0)], new FakeStorage(5))).toBe("failed");
    expect(saveChat([m(0)], null)).toBe("failed");
    const throwing = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); }, removeItem: () => { throw new Error("denied"); } };
    expect(saveChat([m(0)], throwing)).toBe("failed");
    expect(loadChat(throwing)).toEqual([]);
    expect(() => clearChat(throwing)).not.toThrow();
  });

  it("clears the key when the conversation is empty", () => {
    saveChat([m(0)], storage);
    expect(saveChat([], storage)).toBe("saved");
    expect(storage.getItem(CHAT_STORAGE_KEY)).toBeNull();
    saveChat([m(0)], storage);
    clearChat(storage);
    expect(loadChat(storage)).toEqual([]);
  });
});

describe("minimized flag", () => {
  it("persists under its own key and defaults to false", () => {
    expect(loadMinimized(storage)).toBe(false);
    saveMinimized(true, storage);
    expect(loadMinimized(storage)).toBe(true);
    saveMinimized(false, storage);
    expect(loadMinimized(storage)).toBe(false);
    expect(storage.getItem(CHAT_STORAGE_KEY)).toBeNull();
  });
});
