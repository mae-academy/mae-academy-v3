import { beforeEach, describe, expect, it } from "vitest";
import type { ChatMessage } from "@shared/aiTypes";
import {
  ACTIVE_THREAD_KEY,
  LEGACY_CHAT_KEY,
  SIDEBAR_STORAGE_KEY,
  THREADS_STORAGE_KEY,
  clearAllThreads,
  loadSidebarOpen,
  loadThreads,
  saveActiveThreadId,
  saveSidebarOpen,
  saveThreads,
} from "./chatStorage";
import { MAX_THREADS, MAX_THREAD_MESSAGES, type ChatThread } from "./chatThreads";

/** In-memory Storage with an optional per-value size quota, like a real browser's. */
class FakeStorage {
  private data = new Map<string, string>();
  constructor(public quota = Infinity) {}
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) {
    if (value.length > this.quota) throw new DOMException("quota", "QuotaExceededError");
    this.data.set(key, value);
  }
  removeItem(key: string) { this.data.delete(key); }
  has(key: string) { return this.data.has(key); }
}

const m = (i: number, role: ChatMessage["role"] = i % 2 ? "model" : "user", imageUrl?: string): ChatMessage => ({ id: `id${i}`, role, content: `msg ${i}`, timestamp: 1000 + i, ...(imageUrl ? { imageUrl } : {}) });
const IMG = (n: number) => `data:image/jpeg;base64,${"A".repeat(n)}`;
const thread = (id: string, updatedAt: number, messages: ChatMessage[] = [m(0)], extra: Partial<ChatThread> = {}): ChatThread => ({ id, createdAt: updatedAt - 10, updatedAt, messages, ...extra });
const persisted = (storage: FakeStorage) => JSON.parse(storage.getItem(THREADS_STORAGE_KEY) ?? "null") as { threads: ChatThread[] };

let storage: FakeStorage;
beforeEach(() => { storage = new FakeStorage(); });

describe("loadThreads / saveThreads", () => {
  it("round-trips threads, newest first, with custom titles", () => {
    const a = thread("a", 100, [m(0), m(1)]);
    const b = thread("b", 200, [m(2, "user", IMG(10))], { title: "My circuit" });
    expect(saveThreads([a, b], storage)).toBe("saved");
    saveActiveThreadId("a", storage);
    const loaded = loadThreads(storage);
    expect(loaded.threads).toEqual([b, a]);
    expect(loaded.activeId).toBe("a");
  });

  it("returns nothing for missing, corrupt or wrongly shaped data, and never throws", () => {
    expect(loadThreads(storage)).toEqual({ threads: [], activeId: null });
    for (const bad of ["{not json", "null", "42", "\"str\"", "{}", "{\"threads\":5}", "[]", "{\"threads\":[null,1,{}]}"]) {
      storage.setItem(THREADS_STORAGE_KEY, bad);
      expect(loadThreads(storage).threads).toEqual([]);
    }
    expect(loadThreads(null)).toEqual({ threads: [], activeId: null });
    const throwing = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); }, removeItem: () => { throw new Error("denied"); } };
    expect(loadThreads(throwing)).toEqual({ threads: [], activeId: null });
    expect(() => clearAllThreads(throwing)).not.toThrow();
  });

  it("drops invalid messages, empty and duplicate threads, and strips unknown fields", () => {
    storage.setItem(THREADS_STORAGE_KEY, JSON.stringify({ v: 2, threads: [
      { id: "a", createdAt: 1, updatedAt: 5, evil: "<script>", messages: [
        { ...m(0), extra: "<script>" },
        { id: "x", role: "system", content: "hi", timestamp: 1 },
        { id: "y", role: "user", content: 5, timestamp: 1 },
        { id: "w", role: "user", content: "hi", timestamp: 1, imageUrl: "https://evil.example/x.png" },
        { id: "e", role: "model", content: "  ", timestamp: 1 },
        null,
        m(1),
      ] },
      { id: "a", updatedAt: 9, messages: [m(2)] },
      { id: "empty", updatedAt: 9, messages: [] },
      { id: "junk", messages: "nope" },
      { id: "", messages: [m(3)] },
      null,
    ] }));
    const { threads } = loadThreads(storage);
    expect(threads).toHaveLength(1);
    expect(threads[0].messages.map((x) => x.id)).toEqual(["id0", "id1"]);
    expect(threads[0]).not.toHaveProperty("evil");
    expect(threads[0].messages[0]).not.toHaveProperty("extra");
  });

  it("repairs missing timestamps from the messages", () => {
    storage.setItem(THREADS_STORAGE_KEY, JSON.stringify({ v: 2, threads: [{ id: "a", messages: [m(0), m(1)] }] }));
    expect(loadThreads(storage).threads[0]).toMatchObject({ createdAt: 1000, updatedAt: 1001 });
  });

  it("ignores a stale active id", () => {
    saveThreads([thread("a", 1)], storage);
    saveActiveThreadId("gone", storage);
    // The caller decides what an unknown id means; storage reports it verbatim and the threads intact.
    expect(loadThreads(storage).threads.map((t) => t.id)).toEqual(["a"]);
    storage.removeItem(THREADS_STORAGE_KEY);
    expect(loadThreads(storage).activeId).toBeNull();
  });

  it("caps messages per thread and the number of threads (dropping the oldest)", () => {
    const long = thread("long", 5000, Array.from({ length: MAX_THREAD_MESSAGES + 20 }, (_, i) => m(i)));
    const many = Array.from({ length: MAX_THREADS + 5 }, (_, i) => thread(`t${i}`, 100 + i));
    saveThreads([long, ...many], storage);
    const loaded = loadThreads(storage).threads;
    expect(loaded).toHaveLength(MAX_THREADS);
    expect(loaded[0].id).toBe("long");
    expect(loaded[0].messages).toHaveLength(MAX_THREAD_MESSAGES);
    expect(loaded[0].messages[loaded[0].messages.length - 1].id).toBe(`id${MAX_THREAD_MESSAGES + 19}`);
    expect(loaded.some((t) => t.id === "t0")).toBe(false);
  });

  it("does not persist empty threads and removes the key when nothing is left", () => {
    saveThreads([thread("a", 1), thread("blank", 2, [])], storage);
    expect(persisted(storage).threads.map((t) => t.id)).toEqual(["a"]);
    expect(saveThreads([thread("blank", 2, [])], storage)).toBe("saved");
    expect(storage.has(THREADS_STORAGE_KEY)).toBe(false);
  });

  it("filters interrupted (empty) model turns when saving", () => {
    saveThreads([thread("a", 1, [m(0), { id: "e", role: "model", content: "", timestamp: 3 }])], storage);
    expect(persisted(storage).threads[0].messages).toHaveLength(1);
  });
});

describe("quota fallback across threads", () => {
  const withImages = () => [
    thread("new", 300, [m(0, "user", IMG(3000)), m(1), m(2, "user", IMG(3000)), m(3)]),
    thread("mid", 200, [m(4, "user", IMG(3000)), m(5)]),
    thread("old", 100, [m(6, "user", IMG(3000)), m(7)]),
  ];
  const imageIds = (threads: ChatThread[]) => threads.flatMap((t) => t.messages.filter((x) => x.imageUrl).map((x) => x.id));

  it("evicts the oldest threads' images first and keeps the newest image of the newest thread", () => {
    // Full payload is ~15k; with both older threads stripped it is ~6.5k and still carries two images.
    storage = new FakeStorage(7000);
    expect(saveThreads(withImages(), storage)).toBe("trimmed");
    const threads = loadThreads(storage).threads;
    expect(threads.map((t) => t.id)).toEqual(["new", "mid", "old"]);
    expect(imageIds(threads)).toEqual(["id0", "id2"]);

    // Tighter: the newest thread keeps only its latest image.
    storage = new FakeStorage(4800);
    expect(saveThreads(withImages(), storage)).toBe("trimmed");
    expect(imageIds(loadThreads(storage).threads)).toEqual(["id2"]);
  });

  it("then drops every image, then the oldest threads", () => {
    storage = new FakeStorage(1500);
    expect(saveThreads(withImages(), storage)).toBe("trimmed");
    let threads = loadThreads(storage).threads;
    expect(imageIds(threads)).toEqual([]);
    expect(threads).toHaveLength(3);

    storage = new FakeStorage(JSON.stringify({ v: 2, threads: [thread("new", 300, [m(0), m(1), m(2), m(3)])] }).length + 5);
    expect(saveThreads(withImages(), storage)).toBe("trimmed");
    threads = loadThreads(storage).threads;
    expect(threads.map((t) => t.id)).toEqual(["new"]);
  });

  it("finally keeps a short text tail of the only thread", () => {
    const long = thread("only", 1, Array.from({ length: 40 }, (_, i) => m(i)));
    storage = new FakeStorage(JSON.stringify({ v: 2, threads: [{ ...long, messages: long.messages.slice(-10) }] }).length);
    expect(saveThreads([long], storage)).toBe("trimmed");
    expect(loadThreads(storage).threads[0].messages).toHaveLength(10);
  });

  it("reports failure instead of throwing when nothing can be stored", () => {
    expect(saveThreads([thread("a", 1)], new FakeStorage(5))).toBe("failed");
    expect(saveThreads([thread("a", 1)], null)).toBe("failed");
    const throwing = { getItem: () => null, setItem: () => { throw new Error("denied"); }, removeItem: () => { throw new Error("denied"); } };
    expect(saveThreads([thread("a", 1)], throwing)).toBe("failed");
  });
});

describe("migration from the single-conversation key", () => {
  const legacy = (messages: unknown) => JSON.stringify({ v: 1, messages });

  it("turns the old chat into the first thread, writes it, and retires the old key", () => {
    storage.setItem(LEGACY_CHAT_KEY, legacy([m(0), m(1), { id: "bad", role: "x" }]));
    const { threads, activeId } = loadThreads(storage);
    expect(threads).toHaveLength(1);
    expect(threads[0].messages.map((x) => x.id)).toEqual(["id0", "id1"]);
    expect(threads[0]).toMatchObject({ createdAt: 1000, updatedAt: 1001 });
    expect(activeId).toBe(threads[0].id);
    expect(storage.has(LEGACY_CHAT_KEY)).toBe(false);
    expect(persisted(storage).threads[0].id).toBe(threads[0].id);
    // A second load sees the same thread, not a duplicate migration.
    expect(loadThreads(storage).threads.map((t) => t.id)).toEqual([threads[0].id]);
  });

  it("keeps the old key when the new one cannot be written, so the next load retries", () => {
    storage.setItem(LEGACY_CHAT_KEY, legacy([m(0)]));
    storage.quota = 10;
    expect(loadThreads(storage).threads).toHaveLength(1);
    expect(storage.has(LEGACY_CHAT_KEY)).toBe(true);
  });

  it("ignores empty or corrupt old data", () => {
    for (const bad of [legacy([]), "{oops", "null", legacy("x")]) {
      storage.setItem(LEGACY_CHAT_KEY, bad);
      expect(loadThreads(storage).threads).toEqual([]);
    }
  });

  it("prefers the new key and drops a leftover old one", () => {
    saveThreads([thread("a", 5)], storage);
    storage.setItem(LEGACY_CHAT_KEY, legacy([m(9)]));
    expect(loadThreads(storage).threads.map((t) => t.id)).toEqual(["a"]);
    expect(storage.has(LEGACY_CHAT_KEY)).toBe(false);
  });

  it("still migrates when the new key holds garbage", () => {
    storage.setItem(THREADS_STORAGE_KEY, "{broken");
    storage.setItem(LEGACY_CHAT_KEY, legacy([m(0)]));
    expect(loadThreads(storage).threads).toHaveLength(1);
  });
});

describe("clearAllThreads and sidebar flag", () => {
  it("removes every chat key", () => {
    saveThreads([thread("a", 1)], storage);
    saveActiveThreadId("a", storage);
    storage.setItem(LEGACY_CHAT_KEY, "{}");
    clearAllThreads(storage);
    for (const key of [THREADS_STORAGE_KEY, ACTIVE_THREAD_KEY, LEGACY_CHAT_KEY]) expect(storage.has(key)).toBe(false);
  });

  it("remembers the sidebar under its own key, open by default", () => {
    expect(loadSidebarOpen(storage)).toBe(true);
    saveSidebarOpen(false, storage);
    expect(loadSidebarOpen(storage)).toBe(false);
    saveSidebarOpen(true, storage);
    expect(loadSidebarOpen(storage)).toBe(true);
    expect(storage.has(THREADS_STORAGE_KEY)).toBe(false);
    expect(storage.getItem(SIDEBAR_STORAGE_KEY)).toBe("open");
  });
});
