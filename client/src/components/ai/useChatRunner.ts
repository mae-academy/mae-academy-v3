import { useCallback, useEffect, useRef, useState } from "react";
import { markSessionMessage } from "./sessionMessages";
import type { ChatMessage, LabContext, ThinkingEffort } from "@shared/aiTypes";
import { newId, regenerateHistory } from "./chatThreads";
import { ChatStreamError, streamChat, type ChatErrorKind } from "./streamChat";
import type { MascotStateApi } from "./useMascotState";

/** The slice of the mascot hook the chat reports to; the mascot derives its own state from these events. */
export type ChatMascot = Pick<MascotStateApi, "onInputActivity" | "onSend" | "onToken" | "onStreamEnd" | "onError" | "reset">;

export type ChatError = ChatErrorKind | "stopped" | "generic";
/** `waiting` = request sent, no token yet; `streaming` = text is arriving. */
export type RunPhase = "idle" | "waiting" | "streaming";

export interface ActiveRun {
  threadId: string;
  replyId: string;
  phase: Exclude<RunPhase, "idle">;
}

export interface ScopedError {
  threadId: string;
  kind: ChatError;
}

export type UpdateMessages = (threadId: string, update: (messages: ChatMessage[]) => ChatMessage[]) => void;

export interface ChatRunnerOptions {
  mascot: ChatMascot;
  /** Read at send time, so a changed `?lab=` applies to the next request without re-creating callbacks. */
  getLab: () => LabContext;
  /** Read at send time: step-by-step guidance on/off. */
  getStepMode?: () => boolean;
  /** Read at send time: reasoning depth (low / medium / high). */
  getThinkingEffort?: () => ThinkingEffort;
  updateMessages: UpdateMessages;
}

export interface ChatRunner {
  active: ActiveRun | null;
  error: ScopedError | null;
  /** Set by the first accepted response; `mock` is the server's dev-only demo stream. */
  mode: "live" | "mock" | null;
  /** Streams a reply to `history` (which ends with the user's message) into thread `threadId`. */
  send: (threadId: string, history: ChatMessage[]) => void;
  /**
   * Replaces assistant message `assistantId` (the final message of `messages`) with a fresh reply to the same user message,
   * without adding a user message. Aborts any running stream first. Returns false when there is nothing to regenerate.
   */
  regenerate: (threadId: string, messages: ChatMessage[], assistantId: string) => boolean;
  /** Aborts the in-flight request, keeping whatever text already arrived. Safe to call when idle. */
  stop: () => void;
  clearError: () => void;
}

/**
 * Owns one streaming request at a time. Message updates are addressed by thread id, so a stream that finishes
 * (or is aborted) after the user switched threads still lands in the thread it belongs to.
 */
export function useChatRunner({ mascot, getLab, getStepMode, getThinkingEffort, updateMessages }: ChatRunnerOptions): ChatRunner {
  const { onSend, onToken, onStreamEnd, onError } = mascot;
  const [active, setActive] = useState<ActiveRun | null>(null);
  const [error, setError] = useState<ScopedError | null>(null);
  const [mode, setMode] = useState<"live" | "mock" | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const runIdRef = useRef(0);
  const pendingRef = useRef("");
  const frameRef = useRef<number | null>(null);
  /** Applies buffered text right now; replaced by each run so `stop()` can flush the current one. */
  const flushRef = useRef<() => void>(() => {});
  const getLabRef = useRef(getLab);
  getLabRef.current = getLab;
  const getStepModeRef = useRef(getStepMode);
  getStepModeRef.current = getStepMode;
  const getThinkingEffortRef = useRef(getThinkingEffort);
  getThinkingEffortRef.current = getThinkingEffort;

  const stop = useCallback(() => {
    flushRef.current();
    abortRef.current?.abort();
  }, []);

  // Leaving the page cancels any in-flight request so the server stops generating.
  useEffect(() => () => {
    runIdRef.current += 1;
    abortRef.current?.abort();
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
  }, []);

  const send = useCallback((threadId: string, history: ChatMessage[]) => {
    const runId = ++runIdRef.current;
    const stale = () => runIdRef.current !== runId;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    pendingRef.current = "";

    const reply: ChatMessage = { id: newId(), role: "model", content: "", timestamp: Date.now() };
    markSessionMessage(reply.id); // its schematic (if any) may auto-verify and auto-repair without a click
    updateMessages(threadId, () => [...history, reply]);
    setActive({ threadId, replyId: reply.id, phase: "waiting" });
    setError(null);
    onSend();

    // Deltas are batched to one state update per frame; re-parsing markdown per network chunk would be wasteful.
    const flush = () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      const chunk = pendingRef.current;
      if (!chunk) return;
      pendingRef.current = "";
      updateMessages(threadId, (prev) => prev.map((m) => (m.id === reply.id ? { ...m, content: m.content + chunk } : m)));
    };
    flushRef.current = flush;

    let received = false;
    void (async () => {
      try {
        await streamChat({
          messages: history,
          lab: getLabRef.current(),
          stepMode: getStepModeRef.current?.() ?? false,
          thinkingEffort: getThinkingEffortRef.current?.(),
          signal: controller.signal,
          onMode: (next) => { if (!stale()) setMode(next); },
          onDelta: (text) => {
            if (stale()) return;
            if (!received) {
              received = true;
              setActive((current) => (current && current.replyId === reply.id ? { ...current, phase: "streaming" } : current));
            }
            onToken();
            pendingRef.current += text;
            if (frameRef.current === null) frameRef.current = requestAnimationFrame(flush);
          },
        });
        if (!stale()) flush();
        if (stale()) return;
        if (received) {
          onStreamEnd();
        } else {
          onError();
          setError({ threadId, kind: "empty" });
        }
      } catch (caught) {
        if (!stale()) flush();
        if (stale()) return;
        onError();
        if (controller.signal.aborted) {
          // Keep whatever arrived; with nothing to keep, say the response was stopped.
          if (!received) setError({ threadId, kind: "stopped" });
        } else {
          setError({ threadId, kind: caught instanceof ChatStreamError ? caught.kind : "generic" });
        }
      } finally {
        // A reply that never produced text leaves no empty placeholder behind, even if a newer run took over.
        updateMessages(threadId, (prev) => (prev.some((m) => m.id === reply.id && m.content.trim() === "") ? prev.filter((m) => m.id !== reply.id) : prev));
        if (!stale()) {
          abortRef.current = null;
          setActive(null);
        }
      }
    })();
  }, [onError, onSend, onStreamEnd, onToken, updateMessages]);

  const regenerate = useCallback((threadId: string, messages: ChatMessage[], assistantId: string) => {
    const history = regenerateHistory(messages, assistantId);
    if (!history) return false;
    send(threadId, history);
    return true;
  }, [send]);

  const clearError = useCallback(() => setError(null), []);

  return { active, error, mode, send, regenerate, stop, clearError };
}
