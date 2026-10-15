import { AI_DOCUMENT_MIME_TYPES, type ChatDocument, type ChatMessage } from "@shared/aiTypes";
import { MAX_THREADS, MAX_THREAD_MESSAGES, newId, type ChatThread } from "./chatThreads";

/** Versioned so a future shape can migrate or discard old data instead of crashing on it. */
export const THREADS_STORAGE_KEY = "mae-ai:threads:v2";
export const ACTIVE_THREAD_KEY = "mae-ai:active-thread:v2";
/** The single-conversation key of the first release; migrated into a thread on first load, then removed. */
export const LEGACY_CHAT_KEY = "mae-ai:chat:v1";
export const SIDEBAR_STORAGE_KEY = "mae-ai:sidebar:v1";
/** Serialized size budget for all threads (localStorage allows ~5M UTF-16 units; leave room for other keys). */
export const MAX_TOTAL_CHARS = 3_000_000;
/** Last-resort tails (newest messages) tried in turn when even one thread does not fit. */
const EMERGENCY_TAILS = [10, 4, 2, 1];

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function defaultStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null; // blocked (privacy mode / sandboxed iframe)
  }
}

function isMessage(value: unknown): value is ChatMessage {
  if (typeof value !== "object" || value === null) return false;
  const m = value as Record<string, unknown>;
  if (typeof m.id !== "string" || !m.id) return false;
  if (m.role !== "user" && m.role !== "model") return false;
  if (typeof m.content !== "string") return false;
  if (typeof m.timestamp !== "number" || !Number.isFinite(m.timestamp)) return false;
  if (m.imageUrl !== undefined && (typeof m.imageUrl !== "string" || !m.imageUrl.startsWith("data:image/"))) return false;
  return true;
}

/** Stored documents keep only their metadata: the bytes (`dataUrl`) are never persisted. Invalid metadata is dropped, not the message. */
function cleanDocument(value: unknown): ChatDocument | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const d = value as Record<string, unknown>;
  if (typeof d.name !== "string" || !d.name) return undefined;
  if (!(AI_DOCUMENT_MIME_TYPES as readonly unknown[]).includes(d.mimeType)) return undefined;
  if (typeof d.size !== "number" || !Number.isFinite(d.size) || d.size < 0) return undefined;
  return { name: d.name, mimeType: d.mimeType as ChatDocument["mimeType"], size: d.size };
}

function withoutBytes(message: ChatMessage): ChatMessage {
  if (!message.document?.dataUrl) return message;
  const { dataUrl: _bytes, ...document } = message.document;
  return { ...message, document };
}

/** Valid messages only, without interrupted (empty) model turns, capped to the newest MAX_THREAD_MESSAGES. */
function cleanMessages(list: unknown): ChatMessage[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter(isMessage)
    .filter((m) => m.role === "user" || m.content.trim() !== "")
    .slice(-MAX_THREAD_MESSAGES)
    .map(({ id, role, content, imageUrl, document, timestamp }) => {
      const doc = cleanDocument(document);
      return { id, role, content, ...(imageUrl ? { imageUrl } : {}), ...(doc ? { document: doc } : {}), timestamp };
    });
}

function readJson(storage: StorageLike, key: string): unknown {
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function readThreads(parsed: unknown): ChatThread[] {
  const list = typeof parsed === "object" && parsed !== null ? (parsed as { threads?: unknown }).threads : undefined;
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const threads: ChatThread[] = [];
  for (const entry of list) {
    if (typeof entry !== "object" || entry === null) continue;
    const t = entry as Record<string, unknown>;
    if (typeof t.id !== "string" || !t.id || seen.has(t.id)) continue;
    const messages = cleanMessages(t.messages);
    if (messages.length === 0) continue;
    seen.add(t.id);
    const last = messages[messages.length - 1].timestamp;
    const first = messages[0].timestamp;
    const createdAt = typeof t.createdAt === "number" && Number.isFinite(t.createdAt) ? t.createdAt : first;
    const updatedAt = typeof t.updatedAt === "number" && Number.isFinite(t.updatedAt) ? t.updatedAt : last;
    const title = typeof t.title === "string" && t.title.trim() ? t.title.trim() : undefined;
    threads.push({ id: t.id, ...(title ? { title } : {}), createdAt, updatedAt, messages });
  }
  return threads.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_THREADS);
}

/** The first release stored one conversation as `{ v: 1, messages }`. */
function readLegacyThread(storage: StorageLike): ChatThread | null {
  const parsed = readJson(storage, LEGACY_CHAT_KEY);
  const list = typeof parsed === "object" && parsed !== null ? (parsed as { messages?: unknown }).messages : undefined;
  const messages = cleanMessages(list);
  if (messages.length === 0) return null;
  return { id: newId(), createdAt: messages[0].timestamp, updatedAt: messages[messages.length - 1].timestamp, messages };
}

export interface LoadedThreads {
  threads: ChatThread[];
  activeId: string | null;
}

/**
 * Restores the saved chats (newest first). Corrupt or foreign data yields an empty list rather than an error.
 * When nothing is saved under the current key but the old single-conversation key holds a chat, that chat becomes
 * the first (and active) thread; the old key is removed once the new one is safely written.
 */
export function loadThreads(storage: StorageLike | null = defaultStorage()): LoadedThreads {
  if (!storage) return { threads: [], activeId: null };
  try {
    let threads = readThreads(readJson(storage, THREADS_STORAGE_KEY));
    let migratedId: string | null = null;
    if (threads.length === 0) {
      const legacy = readLegacyThread(storage);
      if (legacy) {
        threads = [legacy];
        migratedId = legacy.id; // the user was in this conversation, so reopen it
        if (saveThreads(threads, storage) !== "failed") {
          try { storage.removeItem(LEGACY_CHAT_KEY); } catch { /* retried on the next load */ }
        }
      }
    } else {
      // The new key is authoritative; a leftover old key would only confuse a later migration.
      try { storage.removeItem(LEGACY_CHAT_KEY); } catch { /* ignore */ }
    }
    let activeId: string | null = null;
    try { activeId = storage.getItem(ACTIVE_THREAD_KEY); } catch { /* ignore */ }
    if (migratedId) activeId = migratedId;
    if (threads.length === 0) activeId = null;
    return { threads, activeId };
  } catch {
    return { threads: [], activeId: null };
  }
}

function stripImages(thread: ChatThread, keepLatest: boolean): ChatThread {
  let latest = -1;
  if (keepLatest) thread.messages.forEach((m, i) => { if (m.imageUrl) latest = i; });
  let changed = false;
  const messages = thread.messages.map((m, i) => {
    if (!m.imageUrl || i === latest) return m;
    changed = true;
    const { imageUrl: _dropped, ...rest } = m;
    return rest;
  });
  return changed ? { ...thread, messages } : thread;
}

export type SaveResult = "saved" | "trimmed" | "failed";

/**
 * Persists the non-empty chats (newest MAX_THREADS, newest MAX_THREAD_MESSAGES each). Base64 images can exceed the
 * ~5MB quota, so when the payload is over budget or the write throws it degrades step by step: images are dropped
 * from the oldest chats first (the newest chat keeps its latest image longest), then all images, then the oldest
 * chats themselves, and finally the last chat is cut to a short text-only tail.
 */
export function saveThreads(source: readonly ChatThread[], storage: StorageLike | null = defaultStorage()): SaveResult {
  if (!storage) return "failed";
  const prepared = source
    .map((thread) => ({ ...thread, messages: thread.messages.filter((m) => m.role === "user" || m.content.trim() !== "").slice(-MAX_THREAD_MESSAGES).map(withoutBytes) }))
    .filter((thread) => thread.messages.length > 0)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_THREADS);
  if (prepared.length === 0) {
    try { storage.removeItem(THREADS_STORAGE_KEY); } catch { /* nothing to clean */ }
    return "saved";
  }

  const attempt = (threads: ChatThread[]): boolean => {
    try {
      const json = JSON.stringify({ v: 2, threads });
      if (json.length > MAX_TOTAL_CHARS) return false;
      storage.setItem(THREADS_STORAGE_KEY, json);
      return true;
    } catch {
      return false; // quota exceeded or storage disabled: try a smaller payload
    }
  };

  let working = prepared;
  if (attempt(working)) return "saved";

  // Oldest chats lose their images first; the newest chat keeps its latest image until every other one is gone.
  for (let i = working.length - 1; i >= 0; i--) {
    const stripped = stripImages(working[i], i === 0);
    if (stripped === working[i]) continue;
    working = working.map((thread, index) => (index === i ? stripped : thread));
    if (attempt(working)) return "trimmed";
  }
  const newest = stripImages(working[0], false);
  if (newest !== working[0]) {
    working = [newest, ...working.slice(1)];
    if (attempt(working)) return "trimmed";
  }
  while (working.length > 1) {
    working = working.slice(0, -1);
    if (attempt(working)) return "trimmed";
  }
  // A single chat can still be too big (long answers, legacy 20-30 KB SVG diagrams): keep ever shorter tails.
  for (const tail of EMERGENCY_TAILS) {
    if (attempt([{ ...working[0], messages: working[0].messages.slice(-tail) }])) return "trimmed";
  }
  return "failed";
}

export function saveActiveThreadId(id: string, storage: StorageLike | null = defaultStorage()): void {
  try { storage?.setItem(ACTIVE_THREAD_KEY, id); } catch { /* ignore */ }
}

/** Removes every saved chat (including a not-yet-migrated old one). */
export function clearAllThreads(storage: StorageLike | null = defaultStorage()): void {
  for (const key of [THREADS_STORAGE_KEY, ACTIVE_THREAD_KEY, LEGACY_CHAT_KEY]) {
    try { storage?.removeItem(key); } catch { /* ignore */ }
  }
}

/** The sidebar defaults to open on desktop; only an explicit "closed" is remembered as collapsed. */
export function loadSidebarOpen(storage: StorageLike | null = defaultStorage()): boolean {
  try { return storage?.getItem(SIDEBAR_STORAGE_KEY) !== "closed"; } catch { return true; }
}

export function saveSidebarOpen(open: boolean, storage: StorageLike | null = defaultStorage()): void {
  try { storage?.setItem(SIDEBAR_STORAGE_KEY, open ? "open" : "closed"); } catch { /* ignore */ }
}

const STEP_MODE_KEY = "mae-ai:step-mode:v1";

/** Step-by-step guidance is opt-in: only an explicit "on" is remembered. */
export function loadStepMode(storage: StorageLike | null = defaultStorage()): boolean {
  try { return storage?.getItem(STEP_MODE_KEY) === "on"; } catch { return false; }
}

export function saveStepMode(on: boolean, storage: StorageLike | null = defaultStorage()): void {
  try { storage?.setItem(STEP_MODE_KEY, on ? "on" : "off"); } catch { /* ignore */ }
}
