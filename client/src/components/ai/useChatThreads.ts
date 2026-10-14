import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type { ChatMessage } from "@shared/aiTypes";
import { clearAllThreads, loadThreads, saveActiveThreadId, saveThreads } from "./chatStorage";
import { hydrateThreads, newId, threadsReducer, type ChatThread, type ThreadsState } from "./chatThreads";

const SAVE_DEBOUNCE_MS = 600;

function init(): ThreadsState {
  const { threads, activeId } = loadThreads();
  return hydrateThreads(threads, activeId);
}

export interface ChatThreadsApi {
  threads: ChatThread[];
  activeId: string;
  active: ChatThread;
  newChat: () => string;
  select: (id: string) => void;
  remove: (id: string) => void;
  rename: (id: string, title: string) => void;
  clearAll: () => void;
  /** Applies `update` to one thread's messages (addressed by id, so late stream chunks land in the right chat). */
  updateMessages: (threadId: string, update: (messages: ChatMessage[]) => ChatMessage[]) => void;
}

/** Multi-chat state (see chatThreads.ts) persisted to localStorage: debounced, and flushed when the page hides or unmounts. */
export function useChatThreads(): ChatThreadsApi {
  const [state, dispatch] = useReducer(threadsReducer, undefined, init);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const timer = window.setTimeout(() => saveThreads(state.threads), SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [state.threads]);

  useEffect(() => {
    saveActiveThreadId(state.activeId);
  }, [state.activeId]);

  useEffect(() => {
    const flush = () => saveThreads(stateRef.current.threads);
    const onVisibility = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
      flush();
    };
  }, []);

  const newChat = useCallback(() => {
    const id = newId();
    dispatch({ type: "new", id, now: Date.now() });
    return id;
  }, []);
  const select = useCallback((id: string) => dispatch({ type: "select", id }), []);
  const remove = useCallback((id: string) => dispatch({ type: "delete", id, freshId: newId(), now: Date.now() }), []);
  const rename = useCallback((id: string, title: string) => dispatch({ type: "rename", id, title }), []);
  const clearAll = useCallback(() => {
    dispatch({ type: "clearAll", freshId: newId(), now: Date.now() });
    clearAllThreads();
  }, []);
  const updateMessages = useCallback(
    (threadId: string, update: (messages: ChatMessage[]) => ChatMessage[]) => dispatch({ type: "setMessages", id: threadId, update, now: Date.now() }),
    [],
  );

  const active = state.threads.find((thread) => thread.id === state.activeId) ?? state.threads[0];

  return useMemo(
    () => ({ threads: state.threads, activeId: state.activeId, active, newChat, select, remove, rename, clearAll, updateMessages }),
    [state.threads, state.activeId, active, newChat, select, remove, rename, clearAll, updateMessages],
  );
}
