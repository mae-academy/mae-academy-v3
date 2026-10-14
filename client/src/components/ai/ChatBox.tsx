import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type FormEvent, type KeyboardEvent } from "react";
import { useReducedMotion } from "framer-motion";
import { AlertCircle, ArrowDown, ImagePlus, Paperclip, RotateCcw, SendHorizontal, Sparkles, Square, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AI_MAX_MESSAGE_CHARS, type ChatMessage, type LabContext } from "@shared/aiTypes";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import AiMarkdown from "./AiMarkdown";
import { clearChat, loadChat, saveChat } from "./chatStorage";
import { ACCEPTED_IMAGE_TYPES, ImageError, isAcceptedImageType, prepareImageForChat } from "./imageUtils";
import { ChatStreamError, streamChat, type ChatErrorKind } from "./streamChat";
import type { MascotStateApi } from "./useMascotState";

export type ChatMascot = Pick<MascotStateApi, "onInputActivity" | "onSend" | "onToken" | "onStreamEnd" | "onError" | "reset">;

export interface ChatBoxProps {
  lab: LabContext;
  /** Event hooks of the page's mascot; the chat only reports events, the mascot derives its own state. */
  mascot: ChatMascot;
  className?: string;
}

type ChatError = ChatErrorKind | "stopped" | "generic";

const COUNTER_FROM = Math.floor(AI_MAX_MESSAGE_CHARS * 0.8);
/** Within this many px of the end counts as "following the stream". */
const NEAR_BOTTOM_PX = 80;
const SAVE_DEBOUNCE_MS = 600;
const ATTACH_PROMPT_INDEX = 3;

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/* ------------------------------ message bubble ------------------------------ */

const MessageBubble = memo(function MessageBubble({ message, streaming, onImageLoad }: { message: ChatMessage; streaming: boolean; onImageLoad: () => void }) {
  const { t } = useTranslation("ai");
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[88%] rounded-2xl rounded-ee-md bg-gradient-to-br from-blue-600 to-indigo-600 px-4 py-2.5 text-white shadow-sm sm:max-w-[80%]">
          <span className="sr-only">{t("chat.you")}: </span>
          {message.imageUrl ? <img src={message.imageUrl} alt={t("chat.attachedImage")} onLoad={onImageLoad} className="mb-2 max-h-56 max-w-full rounded-lg bg-white object-contain" /> : null}
          {message.content ? <p dir="auto" className="whitespace-pre-wrap break-words text-start text-[15px] leading-relaxed">{message.content}</p> : null}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div className="min-w-0 max-w-full rounded-2xl rounded-ss-md border border-slate-200 bg-white px-4 py-3 text-[15px] text-slate-800 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-zinc-100 sm:max-w-[92%]">
        <span className="sr-only">{t("chat.assistant")}: </span>
        {message.content ? (
          <AiMarkdown content={message.content} />
        ) : streaming ? (
          <span aria-hidden="true" className="flex h-6 items-center gap-1">
            {[0, 1, 2].map((i) => (
              <span key={i} className="h-2 w-2 rounded-full bg-violet-400 motion-safe:animate-bounce" style={{ animationDelay: `${i * 140}ms` }} />
            ))}
          </span>
        ) : null}
      </div>
    </div>
  );
});

/* --------------------------------- ChatBox --------------------------------- */

export function ChatBox({ lab, mascot, className }: ChatBoxProps) {
  const { t } = useTranslation("ai");
  const reduceMotion = useReducedMotion();
  const { onInputActivity, onSend, onToken, onStreamEnd, onError, reset } = mascot;

  const [messages, setMessages] = useState<ChatMessage[]>(() => loadChat());
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [error, setError] = useState<ChatError | null>(null);
  const [draft, setDraft] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [status, setStatus] = useState("");

  const scrollerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const runIdRef = useRef(0);
  const stickRef = useRef(true);
  const dragDepth = useRef(0);
  const pendingText = useRef("");
  const frameRef = useRef<number | null>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const labRef = useRef(lab);
  labRef.current = lab;

  const streaming = streamingId !== null;
  const labName = t(`labs.${lab}`);
  const prompts = useMemo(() => {
    const list = t(`prompts.${lab}`, { returnObjects: true });
    return Array.isArray(list) ? (list as string[]) : [];
  }, [lab, t]);

  /* ---- persistence: debounced, and flushed when the page is hidden or the component unmounts ---- */
  useEffect(() => {
    const timer = window.setTimeout(() => saveChat(messages), SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [messages]);

  useEffect(() => {
    const flush = () => saveChat(messagesRef.current);
    const onVisibility = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
      flush();
    };
  }, []);

  // Leaving the page cancels any in-flight request so the server stops generating.
  useEffect(() => () => {
    runIdRef.current += 1;
    abortRef.current?.abort();
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
  }, []);

  /* ---- scrolling: follow the stream only while the reader is at the bottom ---- */
  const scrollToEnd = useCallback((smooth: boolean) => {
    const el = scrollerRef.current;
    if (!el) return;
    if (smooth && !reduceMotion) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    else el.scrollTop = el.scrollHeight;
  }, [reduceMotion]);

  useLayoutEffect(() => {
    if (stickRef.current) scrollToEnd(false);
  }, [messages, error, streamingId, scrollToEnd]);

  const onScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    stickRef.current = near;
    setAtBottom(near);
  }, []);

  const onImageLoad = useCallback(() => {
    if (stickRef.current) scrollToEnd(false);
  }, [scrollToEnd]);

  const jumpToLatest = () => {
    stickRef.current = true;
    setAtBottom(true);
    scrollToEnd(true);
  };

  /* ---- composer sizing ---- */
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 192)}px`;
  }, [draft]);

  const focusComposer = useCallback(() => {
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }, []);

  /* ---- streaming ---- */
  const run = useCallback(async (history: ChatMessage[]) => {
    const runId = ++runIdRef.current;
    const stale = () => runIdRef.current !== runId;
    const controller = new AbortController();
    abortRef.current = controller;
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    const reply: ChatMessage = { id: newId(), role: "model", content: "", timestamp: Date.now() };
    stickRef.current = true;
    setAtBottom(true);
    setMessages([...history, reply]);
    setStreamingId(reply.id);
    setError(null);
    setStatus(t("chat.responding"));
    onSend();

    // Deltas are batched to one state update per frame; re-parsing markdown per network chunk would be wasteful.
    const flush = () => {
      frameRef.current = null;
      const chunk = pendingText.current;
      if (!chunk || stale()) return;
      pendingText.current = "";
      setMessages((prev) => prev.map((m) => (m.id === reply.id ? { ...m, content: m.content + chunk } : m)));
    };
    const flushNow = () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      flush();
    };

    let received = false;
    pendingText.current = "";
    try {
      await streamChat({
        messages: history,
        lab: labRef.current,
        signal: controller.signal,
        onDelta: (text) => {
          received = true;
          onToken();
          pendingText.current += text;
          if (frameRef.current === null) frameRef.current = requestAnimationFrame(flush);
        },
      });
      flushNow();
      if (stale()) return;
      if (received) {
        onStreamEnd();
        setStatus(t("chat.complete"));
      } else {
        onError();
        setError("empty");
        setStatus("");
      }
    } catch (caught) {
      flushNow();
      if (stale()) return;
      onError();
      setStatus("");
      if (controller.signal.aborted) {
        // Keep whatever arrived; with nothing to keep, say the response was stopped.
        if (!received) setError("stopped");
      } else {
        setError(caught instanceof ChatStreamError ? caught.kind : "generic");
      }
    } finally {
      if (!stale()) {
        abortRef.current = null;
        setStreamingId(null);
        // A reply that never produced text leaves no empty bubble behind.
        setMessages((prev) => prev.filter((m) => m.id !== reply.id || m.content.trim() !== ""));
      }
    }
  }, [onError, onSend, onStreamEnd, onToken, t]);

  const submit = () => {
    if (streaming || preparing) return;
    const text = draft.trim();
    if (!text && !image) return;
    const message: ChatMessage = { id: newId(), role: "user", content: text, timestamp: Date.now(), ...(image ? { imageUrl: image } : {}) };
    setDraft("");
    setImage(null);
    void run([...messagesRef.current, message]);
    focusComposer();
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    submit();
  };

  const stop = () => abortRef.current?.abort();

  const retry = () => {
    const current = messagesRef.current;
    let lastUser = -1;
    current.forEach((m, i) => { if (m.role === "user") lastUser = i; });
    if (lastUser === -1 || streaming) return;
    void run(current.slice(0, lastUser + 1));
  };

  const clearConversation = () => {
    runIdRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    pendingText.current = "";
    setStreamingId(null);
    setMessages([]);
    setError(null);
    setDraft("");
    setImage(null);
    setStatus("");
    clearChat();
    reset();
    focusComposer();
  };

  /* ---- images: attach button, paste, drag and drop ---- */
  const attach = async (file: Blob) => {
    onInputActivity();
    setPreparing(true);
    try {
      setImage(await prepareImageForChat(file));
    } catch (caught) {
      toast.error(t(`image.${caught instanceof ImageError ? caught.kind : "decode"}`));
    } finally {
      setPreparing(false);
      focusComposer();
    }
  };

  const onFilePicked = (files: FileList | null) => {
    const file = files?.[0];
    if (file) void attach(file);
    if (fileRef.current) fileRef.current.value = "";
  };

  const onPaste = (event: ClipboardEvent) => {
    const file = Array.from(event.clipboardData.files).find((f) => f.type.startsWith("image/"));
    // A screenshot has no text flavour; a copy from a document may carry both, and then the text is what's wanted.
    if (file && !event.clipboardData.getData("text/plain")) {
      event.preventDefault();
      void attach(file);
    } else {
      onInputActivity();
    }
  };

  const carriesImage = (event: DragEvent) => {
    if (!Array.from(event.dataTransfer.types).includes("Files")) return false;
    const items = Array.from(event.dataTransfer.items ?? []);
    // Types are only exposed during the drag; an empty type is let through and validated on drop.
    return items.length === 0 || items.some((item) => item.kind === "file" && (item.type === "" || item.type.startsWith("image/")));
  };

  const onDragEnter = (event: DragEvent) => {
    if (!carriesImage(event)) return;
    event.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  };
  const onDragOver = (event: DragEvent) => {
    if (!carriesImage(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };
  const onDragLeave = (event: DragEvent) => {
    if (!carriesImage(event)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };
  const onDrop = (event: DragEvent) => {
    if (!Array.from(event.dataTransfer.types).includes("Files")) return;
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const files = Array.from(event.dataTransfer.files);
    const file = files.find((f) => isAcceptedImageType(f.type));
    if (file) void attach(file);
    else if (files.length > 0) toast.error(t("image.type"));
  };

  /* ---- composer input ---- */
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    // Enter during IME composition confirms the candidate; it must not send.
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    submit();
  };

  const applyExample = (text: string, index: number) => {
    setDraft(text);
    onInputActivity();
    if (index === ATTACH_PROMPT_INDEX) fileRef.current?.click();
    else focusComposer();
  };

  const canSend = !streaming && !preparing && (draft.trim().length > 0 || image !== null);
  const canRetry = messages.some((m) => m.role === "user");

  return (
    <section
      aria-labelledby="mae-ai-chat-title"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn("relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white/80 shadow-sm backdrop-blur-md dark:border-white/[0.08] dark:bg-[#08080A]/80", className)}
    >
      <header className="flex items-center justify-between gap-3 border-b border-slate-200/80 py-2 ps-4 pe-2 dark:border-white/[0.08]">
        <h2 id="mae-ai-chat-title" className="text-sm font-bold uppercase tracking-wider rtl:tracking-normal text-slate-800 dark:text-white">{t("chat.title")}</h2>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={messages.length === 0}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-lg px-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-white/[0.06]"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          <span>{t("chat.newChat")}</span>
        </button>
      </header>

      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollerRef}
          onScroll={onScroll}
          role="log"
          aria-live={streaming ? "off" : "polite"}
          aria-busy={streaming}
          aria-label={t("chat.title")}
          tabIndex={0}
          className="h-full space-y-4 overflow-y-auto overscroll-contain px-3 py-4 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600 sm:px-5"
        >
          {messages.length === 0 ? (
            <div className="mx-auto flex min-h-full max-w-xl flex-col items-center justify-center gap-4 py-6 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md" aria-hidden="true">
                <Sparkles className="h-6 w-6" />
              </span>
              <div>
                <p className="text-lg font-bold text-slate-900 dark:text-white">{t("chat.emptyTitle")}</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-zinc-400">{lab === "general" ? t("chat.emptyBodyGeneral") : t("chat.emptyBody", { lab: labName })}</p>
              </div>
              <ul className="flex w-full flex-col gap-2">
                {prompts.map((prompt, index) => (
                  <li key={prompt}>
                    <button
                      type="button"
                      onClick={() => applyExample(prompt, index)}
                      className="flex min-h-[44px] w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-start text-sm text-slate-700 transition-colors hover:border-violet-300 hover:bg-violet-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:border-violet-400/50 dark:hover:bg-violet-500/10"
                    >
                      {index === ATTACH_PROMPT_INDEX ? <ImagePlus className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-300" aria-hidden="true" /> : null}
                      <span dir="auto">{prompt}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            messages.map((message) => <MessageBubble key={message.id} message={message} streaming={message.id === streamingId} onImageLoad={onImageLoad} />)
          )}

          {error ? (
            <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-100">
              <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
              <p className="min-w-0 flex-1" dir="auto">{error === "stopped" ? t("chat.stopped") : t(`errors.${error}`)}</p>
              {canRetry ? (
                <button
                  type="button"
                  onClick={retry}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-rose-300 bg-white px-4 text-sm font-medium text-rose-800 transition-colors hover:bg-rose-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600 dark:border-rose-400/40 dark:bg-transparent dark:text-rose-100 dark:hover:bg-rose-500/20"
                >
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  {t("chat.retry")}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        {!atBottom && messages.length > 0 ? (
          <button
            type="button"
            onClick={jumpToLatest}
            className="absolute bottom-3 start-1/2 inline-flex min-h-[44px] -translate-x-1/2 items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-4 text-sm font-medium text-slate-700 shadow-md backdrop-blur transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 rtl:translate-x-1/2 dark:border-white/[0.12] dark:bg-[#15151a]/95 dark:text-zinc-100"
          >
            <ArrowDown className="h-4 w-4" aria-hidden="true" />
            {t("chat.scrollLatest")}
          </button>
        ) : null}
      </div>

      <div role="status" aria-live="polite" className="sr-only">{status}</div>

      <form onSubmit={onSubmit} onPaste={onPaste} className="border-t border-slate-200/80 p-3 dark:border-white/[0.08] sm:p-4">
        {image || preparing ? (
          <div className="mb-3 flex items-center gap-3">
            {image ? (
              <div className="relative">
                <img src={image} alt={t("chat.attachedImage")} className="h-16 w-16 rounded-lg border border-slate-200 bg-white object-cover dark:border-white/[0.12]" />
                <button
                  type="button"
                  onClick={() => setImage(null)}
                  aria-label={t("composer.removeImage")}
                  className="absolute -end-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-white shadow before:absolute before:-inset-2.5 before:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:bg-white dark:text-slate-900"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            ) : null}
            {preparing ? <span className="text-sm text-slate-500 motion-safe:animate-pulse dark:text-zinc-400">{t("composer.preparing")}</span> : null}
          </div>
        ) : null}

        <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-white p-1.5 focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-400/30 dark:border-white/[0.12] dark:bg-white/[0.03]">
          <input ref={fileRef} type="file" accept={ACCEPTED_IMAGE_TYPES.join(",")} className="hidden" tabIndex={-1} onChange={(e) => onFilePicked(e.target.files)} />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label={t("composer.attach")}
            title={t("composer.attach")}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600 dark:text-zinc-400 dark:hover:bg-white/[0.08] dark:hover:text-white"
          >
            <Paperclip className="h-5 w-5" aria-hidden="true" />
          </button>
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => { setDraft(e.target.value); onInputActivity(); }}
            onKeyDown={onKeyDown}
            rows={1}
            dir="auto"
            maxLength={AI_MAX_MESSAGE_CHARS}
            enterKeyHint="send"
            aria-label={t("composer.label")}
            placeholder={t("composer.placeholder")}
            className="max-h-48 min-h-11 min-w-0 flex-1 resize-none bg-transparent px-1 py-2.5 text-base leading-6 text-slate-900 outline-none placeholder:text-slate-400 dark:text-white dark:placeholder:text-zinc-500"
          />
          {streaming ? (
            <button
              type="button"
              onClick={stop}
              className="flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:bg-white dark:text-slate-900"
            >
              <Square className="h-4 w-4 fill-current" aria-hidden="true" />
              <span>{t("composer.stop")}</span>
            </button>
          ) : (
            <button
              type="submit"
              disabled={!canSend}
              className="flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <SendHorizontal className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
              <span className="max-sm:sr-only">{t("composer.send")}</span>
            </button>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-1 text-xs text-slate-500 dark:text-zinc-400">
          <p>{t("composer.disclaimer")}</p>
          {draft.length >= COUNTER_FROM ? (
            <p className={cn("tabular-nums", draft.length >= AI_MAX_MESSAGE_CHARS && "font-semibold text-rose-600 dark:text-rose-400")}>
              {t("composer.counter", { count: draft.length, max: AI_MAX_MESSAGE_CHARS })}
            </p>
          ) : null}
        </div>
      </form>

      {dragging ? (
        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-violet-500 bg-violet-50/90 text-violet-800 backdrop-blur-sm dark:bg-violet-950/80 dark:text-violet-100" aria-hidden="true">
          <ImagePlus className="h-10 w-10" />
          <p className="text-base font-semibold">{t("chat.dropTitle")}</p>
          <p className="text-sm opacity-80">{t("chat.dropHint")}</p>
        </div>
      ) : null}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent onCloseAutoFocus={(event) => { event.preventDefault(); textareaRef.current?.focus(); }}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("chat.confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("chat.confirmBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-[44px]">{t("chat.cancel")}</AlertDialogCancel>
            <AlertDialogAction className="min-h-[44px]" onClick={clearConversation}>{t("chat.confirm")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

export default ChatBox;
