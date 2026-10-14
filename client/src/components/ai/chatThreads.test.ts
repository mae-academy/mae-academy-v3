import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@shared/aiTypes";
import {
  MAX_THREADS,
  TITLE_MAX_CHARS,
  createThread,
  groupThreads,
  hydrateThreads,
  initialThreadsState,
  threadTitle,
  threadsReducer,
  type ChatThread,
  type ThreadsState,
} from "./chatThreads";

const msg = (i: number, role: ChatMessage["role"] = "user", content = `m${i}`): ChatMessage => ({ id: `m${i}`, role, content, timestamp: i });
const withMessages = (id: string, updatedAt: number, messages: ChatMessage[] = [msg(1)]): ChatThread => ({ id, createdAt: updatedAt, updatedAt, messages });
const state = (threads: ChatThread[], activeId: string): ThreadsState => ({ threads, activeId });

describe("threadTitle", () => {
  it("uses the first user message, collapsed and truncated", () => {
    expect(threadTitle({ messages: [msg(1, "user", "  Analyze\n this   circuit ")] })).toBe("Analyze this circuit");
    const long = "x".repeat(TITLE_MAX_CHARS + 20);
    const title = threadTitle({ messages: [msg(1, "user", long)] })!;
    expect(title.length).toBe(TITLE_MAX_CHARS);
    expect(title.endsWith("…")).toBe(true);
  });
  it("prefers a custom title, and is null for chats with no text yet", () => {
    expect(threadTitle({ title: " Mine ", messages: [msg(1)] })).toBe("Mine");
    expect(threadTitle({ messages: [] })).toBeNull();
    expect(threadTitle({ messages: [msg(1, "user", "  "), msg(2, "model", "hello")] })).toBeNull();
  });
});

describe("threadsReducer", () => {
  it("starts with one empty active chat", () => {
    const s = initialThreadsState("a", 1);
    expect(s.threads).toEqual([createThread("a", 1)]);
    expect(s.activeId).toBe("a");
  });

  it("new chat prepends an empty active thread, but is a no-op when already on a blank chat", () => {
    const s0 = state([withMessages("a", 1)], "a");
    const s1 = threadsReducer(s0, { type: "new", id: "b", now: 5 });
    expect(s1.activeId).toBe("b");
    expect(s1.threads.map((t) => t.id)).toEqual(["b", "a"]);
    expect(threadsReducer(s1, { type: "new", id: "c", now: 6 })).toBe(s1);
  });

  it("selecting another chat discards a blank one, ignores unknown ids", () => {
    const s0 = state([createThread("blank", 9), withMessages("a", 1)], "blank");
    const s1 = threadsReducer(s0, { type: "select", id: "a" });
    expect(s1.activeId).toBe("a");
    expect(s1.threads.map((t) => t.id)).toEqual(["a"]);
    expect(threadsReducer(s1, { type: "select", id: "nope" })).toBe(s1);
    expect(threadsReducer(s1, { type: "select", id: "a" })).toBe(s1);
  });

  it("deleting the active chat activates the most recent remaining one, or a fresh blank", () => {
    const s0 = state([withMessages("a", 1), withMessages("b", 5), withMessages("c", 3)], "b");
    const s1 = threadsReducer(s0, { type: "delete", id: "b", freshId: "f", now: 9 });
    expect(s1.activeId).toBe("c");
    expect(s1.threads.map((t) => t.id)).toEqual(["a", "c"]);
    const s2 = threadsReducer(state([withMessages("a", 1)], "a"), { type: "delete", id: "a", freshId: "f", now: 9 });
    expect(s2.activeId).toBe("f");
    expect(s2.threads).toHaveLength(1);
    expect(s2.threads[0].messages).toEqual([]);
  });

  it("deleting an inactive chat keeps the active one", () => {
    const s0 = state([withMessages("a", 1), withMessages("b", 5)], "b");
    const s1 = threadsReducer(s0, { type: "delete", id: "a", freshId: "f", now: 9 });
    expect(s1.activeId).toBe("b");
    expect(s1.threads.map((t) => t.id)).toEqual(["b"]);
    expect(threadsReducer(s1, { type: "delete", id: "zzz", freshId: "f", now: 9 })).toBe(s1);
  });

  it("renames, trims, and clears the custom title with blank input", () => {
    const s0 = state([withMessages("a", 1)], "a");
    const s1 = threadsReducer(s0, { type: "rename", id: "a", title: "  Op-amp  " });
    expect(s1.threads[0].title).toBe("Op-amp");
    const s2 = threadsReducer(s1, { type: "rename", id: "a", title: "   " });
    expect(s2.threads[0]).not.toHaveProperty("title");
  });

  it("clearAll leaves a single blank chat", () => {
    const s = threadsReducer(state([withMessages("a", 1), withMessages("b", 2)], "a"), { type: "clearAll", freshId: "f", now: 3 });
    expect(s).toEqual(initialThreadsState("f", 3));
  });

  it("setMessages updates one thread by id (also when it is not active), touching updatedAt", () => {
    const s0 = state([withMessages("a", 1), withMessages("b", 2)], "b");
    const s1 = threadsReducer(s0, { type: "setMessages", id: "a", update: (list) => [...list, msg(2, "model", "hi")], now: 50 });
    expect(s1.threads[0].messages).toHaveLength(2);
    expect(s1.threads[0].updatedAt).toBe(50);
    expect(s1.threads[1]).toBe(s0.threads[1]);
    expect(s1.activeId).toBe("b");
    expect(threadsReducer(s0, { type: "setMessages", id: "gone", update: () => [], now: 1 })).toBe(s0);
    expect(threadsReducer(s0, { type: "setMessages", id: "a", update: (l) => l, now: 1 })).toBe(s0);
  });

  it("caps the number of chats, dropping the oldest and never the active one", () => {
    let s = state(Array.from({ length: MAX_THREADS }, (_, i) => withMessages(`t${i}`, 100 + i)), "t5");
    s = threadsReducer(s, { type: "new", id: "extra", now: 999 }); // t5 is not blank, so a new chat is opened
    expect(s.activeId).toBe("extra");
    expect(s.threads).toHaveLength(MAX_THREADS); // the blank new chat counts, so the oldest (t0) goes
    expect(s.threads.some((t) => t.id === "t0")).toBe(false);
    expect(s.threads.some((t) => t.id === "t5")).toBe(true);

  });
});

describe("hydrateThreads", () => {
  it("keeps a known active chat and otherwise opens a blank one on top", () => {
    const saved = [withMessages("a", 1), withMessages("b", 2)];
    expect(hydrateThreads(saved, "a", "f", 9).activeId).toBe("a");
    const s = hydrateThreads(saved, "missing", "f", 9);
    expect(s.activeId).toBe("f");
    expect(s.threads.map((t) => t.id)).toEqual(["f", "a", "b"]);
    expect(hydrateThreads([], null, "f", 9)).toEqual(initialThreadsState("f", 9));
  });
});

describe("groupThreads", () => {
  const now = new Date(2026, 5, 15, 14, 0, 0).getTime();
  const day = 24 * 60 * 60 * 1000;
  it("buckets into today, previous 7 days and older, newest first, skipping blanks", () => {
    const threads = [
      withMessages("old", now - 20 * day),
      withMessages("yesterday", now - day),
      withMessages("today-early", new Date(2026, 5, 15, 0, 1).getTime()),
      withMessages("today-late", now - 1000),
      withMessages("week", now - 6 * day),
      createThread("blank", now),
    ];
    const groups = groupThreads(threads, now);
    expect(groups.map((g) => g.key)).toEqual(["today", "week", "older"]);
    expect(groups[0].threads.map((t) => t.id)).toEqual(["today-late", "today-early"]);
    expect(groups[1].threads.map((t) => t.id)).toEqual(["yesterday", "week"]);
    expect(groups[2].threads.map((t) => t.id)).toEqual(["old"]);
  });
  it("omits empty groups", () => {
    expect(groupThreads([withMessages("a", now)], now).map((g) => g.key)).toEqual(["today"]);
    expect(groupThreads([], now)).toEqual([]);
  });
});
