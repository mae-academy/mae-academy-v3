import type { ChatMessage } from "@shared/aiTypes";

/** Versioned so a future message shape can migrate or discard old data instead of crashing on it. */
export const CHAT_STORAGE_KEY = "mae-ai:chat:v1";
export const MINIMIZED_STORAGE_KEY = "mae-ai:mascot-minimized:v1";
export const MAX_STORED_MESSAGES = 50;

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

/** Restores the saved conversation; corrupt or foreign data yields an empty chat rather than an error. */
export function loadChat(storage: StorageLike | null = defaultStorage()): ChatMessage[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(CHAT_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    const list = typeof parsed === "object" && parsed !== null ? (parsed as { messages?: unknown }).messages : undefined;
    if (!Array.isArray(list)) return [];
    return list
      .filter(isMessage)
      // An empty model turn is an interrupted placeholder, not a reply.
      .filter((m) => m.role === "user" || m.content.trim() !== "")
      .slice(-MAX_STORED_MESSAGES)
      .map(({ id, role, content, imageUrl, timestamp }) => (imageUrl ? { id, role, content, imageUrl, timestamp } : { id, role, content, timestamp }));
  } catch {
    return [];
  }
}

function withoutImages(messages: ChatMessage[], keepLatest: boolean): ChatMessage[] {
  let latest = -1;
  if (keepLatest) messages.forEach((m, i) => { if (m.imageUrl) latest = i; });
  return messages.map((m, i) => {
    if (!m.imageUrl || i === latest) return m;
    const { imageUrl: _dropped, ...rest } = m;
    return rest;
  });
}

export type SaveResult = "saved" | "trimmed" | "failed";

/**
 * Persists the conversation (last MAX_STORED_MESSAGES). Base64 images can exceed the ~5MB quota, so on failure it
 * retries with only the newest image, then with no images, then with a short text-only tail.
 */
export function saveChat(messages: readonly ChatMessage[], storage: StorageLike | null = defaultStorage()): SaveResult {
  if (!storage) return "failed";
  const capped = messages.filter((m) => m.role === "user" || m.content.trim() !== "").slice(-MAX_STORED_MESSAGES);
  if (capped.length === 0) {
    try { storage.removeItem(CHAT_STORAGE_KEY); } catch { /* nothing to clean */ }
    return "saved";
  }
  const attempts = [
    () => capped,
    () => withoutImages(capped, true),
    () => withoutImages(capped, false),
    () => withoutImages(capped.slice(-10), false),
  ];
  for (let i = 0; i < attempts.length; i++) {
    try {
      storage.setItem(CHAT_STORAGE_KEY, JSON.stringify({ v: 1, messages: attempts[i]() }));
      return i === 0 ? "saved" : "trimmed";
    } catch {
      /* quota exceeded or storage disabled: try a smaller payload */
    }
  }
  return "failed";
}

export function clearChat(storage: StorageLike | null = defaultStorage()): void {
  try { storage?.removeItem(CHAT_STORAGE_KEY); } catch { /* ignore */ }
}

export function loadMinimized(storage: StorageLike | null = defaultStorage()): boolean {
  try { return storage?.getItem(MINIMIZED_STORAGE_KEY) === "1"; } catch { return false; }
}

export function saveMinimized(value: boolean, storage: StorageLike | null = defaultStorage()): void {
  try { storage?.setItem(MINIMIZED_STORAGE_KEY, value ? "1" : "0"); } catch { /* ignore */ }
}
