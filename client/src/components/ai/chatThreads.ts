import type { ChatMessage } from "@shared/aiTypes";

/** One saved conversation. `title` is only set once the user renames it; otherwise the title is derived from the first message. */
export interface ChatThread {
  id: string;
  title?: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

export interface ThreadsState {
  threads: ChatThread[];
  activeId: string;
}

export const MAX_THREADS = 30;
export const MAX_THREAD_MESSAGES = 50;
export const TITLE_MAX_CHARS = 48;
export const RENAME_MAX_CHARS = 80;

export const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export function createThread(id: string = newId(), now: number = Date.now()): ChatThread {
  return { id, createdAt: now, updatedAt: now, messages: [] };
}

/** The sidebar label: a custom title, else the first user message (whitespace collapsed, truncated). Null means "show the New chat placeholder". */
export function threadTitle(thread: Pick<ChatThread, "title" | "messages">): string | null {
  const custom = thread.title?.trim();
  if (custom) return custom;
  const first = thread.messages.find((message) => message.role === "user" && message.content.trim() !== "");
  if (!first) return null;
  const flat = first.content.replace(/\s+/g, " ").trim();
  return flat.length > TITLE_MAX_CHARS ? `${flat.slice(0, TITLE_MAX_CHARS - 1).trimEnd()}…` : flat;
}

export type ThreadsAction =
  | { type: "new"; id: string; now: number }
  | { type: "select"; id: string }
  | { type: "delete"; id: string; freshId: string; now: number }
  | { type: "rename"; id: string; title: string }
  | { type: "clearAll"; freshId: string; now: number }
  | { type: "setMessages"; id: string; update: (messages: ChatMessage[]) => ChatMessage[]; now: number };

export function initialThreadsState(freshId: string = newId(), now: number = Date.now()): ThreadsState {
  return { threads: [createThread(freshId, now)], activeId: freshId };
}

/** Builds the state from persisted threads; an unknown or missing active id yields a fresh empty chat on top. */
export function hydrateThreads(threads: ChatThread[], activeId: string | null, freshId: string = newId(), now: number = Date.now()): ThreadsState {
  if (activeId && threads.some((thread) => thread.id === activeId)) return { threads, activeId };
  return { threads: [createThread(freshId, now), ...threads], activeId: freshId };
}

/** Empty chats never linger (only the active one may be empty), and the list is capped, always sparing the active chat. */
function normalize(state: ThreadsState): ThreadsState {
  let threads = state.threads.filter((thread) => thread.id === state.activeId || thread.messages.length > 0);
  while (threads.length > MAX_THREADS) {
    const oldest = threads.filter((thread) => thread.id !== state.activeId).sort((a, b) => a.updatedAt - b.updatedAt)[0];
    threads = threads.filter((thread) => thread !== oldest);
  }
  return threads.length === state.threads.length ? state : { ...state, threads };
}

export function threadsReducer(state: ThreadsState, action: ThreadsAction): ThreadsState {
  switch (action.type) {
    case "new": {
      const active = state.threads.find((thread) => thread.id === state.activeId);
      // Already on a blank chat: there is nothing new to open.
      if (active && active.messages.length === 0) return state;
      return normalize({ threads: [createThread(action.id, action.now), ...state.threads], activeId: action.id });
    }
    case "select": {
      if (action.id === state.activeId || !state.threads.some((thread) => thread.id === action.id)) return state;
      return normalize({ ...state, activeId: action.id });
    }
    case "delete": {
      if (!state.threads.some((thread) => thread.id === action.id)) return state;
      const rest = state.threads.filter((thread) => thread.id !== action.id);
      if (action.id !== state.activeId) return { ...state, threads: rest };
      const next = [...rest].filter((thread) => thread.messages.length > 0).sort((a, b) => b.updatedAt - a.updatedAt)[0];
      if (next) return normalize({ threads: rest, activeId: next.id });
      return { threads: [createThread(action.freshId, action.now)], activeId: action.freshId };
    }
    case "rename": {
      const title = action.title.trim().slice(0, RENAME_MAX_CHARS);
      return {
        ...state,
        threads: state.threads.map((thread) => {
          if (thread.id !== action.id) return thread;
          const { title: _old, ...rest } = thread;
          return title ? { ...rest, title } : rest;
        }),
      };
    }
    case "clearAll":
      return initialThreadsState(action.freshId, action.now);
    case "setMessages": {
      const index = state.threads.findIndex((thread) => thread.id === action.id);
      if (index === -1) return state;
      const thread = state.threads[index];
      const messages = action.update(thread.messages);
      if (messages === thread.messages) return state;
      const threads = state.threads.slice();
      threads[index] = { ...thread, messages, updatedAt: action.now };
      return normalize({ ...state, threads });
    }
  }
}

export type ThreadGroupKey = "today" | "week" | "older";

export interface ThreadGroup {
  key: ThreadGroupKey;
  threads: ChatThread[];
}

/** Non-empty chats, newest first, bucketed like the sidebar shows them: today, the 7 days before it, and older. */
export function groupThreads(threads: readonly ChatThread[], now: number = Date.now()): ThreadGroup[] {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const todayStart = startOfToday.getTime();
  const weekStart = todayStart - 7 * 24 * 60 * 60 * 1000;
  const buckets: Record<ThreadGroupKey, ChatThread[]> = { today: [], week: [], older: [] };
  [...threads]
    .filter((thread) => thread.messages.length > 0)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .forEach((thread) => {
      const key: ThreadGroupKey = thread.updatedAt >= todayStart ? "today" : thread.updatedAt >= weekStart ? "week" : "older";
      buckets[key].push(thread);
    });
  return (["today", "week", "older"] as const).filter((key) => buckets[key].length > 0).map((key) => ({ key, threads: buckets[key] }));
}
