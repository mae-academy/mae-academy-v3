import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertCircle, ArrowDown, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ChatMessage, MascotState } from "@shared/aiTypes";
import { AssistantMessage, UserMessage } from "./ChatMessages";
import MaiMascot from "./MaiMascot";
import type { ChatError } from "./useChatRunner";

/** Within this many px of the end counts as "following the stream". */
const NEAR_BOTTOM_PX = 80;
/** Past this scroll depth the hero/avatar has left the screen, so the compact sticky mascot header takes over. */
const STICKY_AFTER_PX = 160;

export interface ChatTranscriptProps {
  messages: ChatMessage[];
  /** Id of the reply that is still arriving (it shows typing dots until its first text). */
  streamingId: string | null;
  mascotState: MascotState;
  stateLabels: Partial<Record<MascotState, string>>;
  /** The latest assistant avatar joins the hero's shared layout (first message of a chat). */
  sharedAvatar: boolean;
  error: ChatError | null;
  onRetry: () => void;
  /** Regenerates the final assistant message (it replaces that message; no user message is added). */
  onRegenerate: (assistantId: string) => void;
  /** A reply is being produced; regenerate is disabled meanwhile. */
  busy: boolean;
  /** Loads a user message into the composer for editing; omitted (no Edit button) while a reply streams. */
  onEdit?: (messageId: string) => void;
  /** The user message currently being edited, if any. */
  editingId?: string | null;
  /** Step-by-step guidance is on. */
  stepMode?: boolean;
  /** Sends the fixed "continue to the next step" message. */
  onReveal?: () => void;
}

/** The scrolling message column: follows the stream only while the reader is at the bottom, with a jump-to-latest pill otherwise. */
export function ChatTranscript({ messages, streamingId, mascotState, stateLabels, sharedAvatar, error, onRetry, onRegenerate, busy, onEdit, editingId = null, stepMode = false, onReveal }: ChatTranscriptProps) {
  const { t } = useTranslation("ai");
  const reduceMotion = useReducedMotion();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const [atBottom, setAtBottom] = useState(true);
  const [scrolled, setScrolled] = useState(false);

  const visible = useMemo(() => messages.filter((m) => m.role === "user" || m.content.trim() !== "" || m.id === streamingId), [messages, streamingId]);
  const latestAssistantId = useMemo(() => [...visible].reverse().find((m) => m.role === "model")?.id ?? null, [visible]);

  const lastId = visible.length > 0 ? visible[visible.length - 1].id : null;
  // A stable callback keeps memoized messages from re-rendering on every streamed token.
  const regenerateRef = useRef({ onRegenerate, id: latestAssistantId });
  regenerateRef.current = { onRegenerate, id: latestAssistantId };
  const regenerateLatest = useCallback(() => {
    const { onRegenerate: run, id } = regenerateRef.current;
    if (id) run(id);
  }, []);

  const scrollToEnd = useCallback(
    (smooth: boolean) => {
      const el = scrollerRef.current;
      if (!el) return;
      if (smooth && !reduceMotion) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      else el.scrollTop = el.scrollHeight;
    },
    [reduceMotion],
  );

  useLayoutEffect(() => {
    if (stickRef.current) scrollToEnd(false);
  }, [visible, error, streamingId, scrollToEnd]);

  const onScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    stickRef.current = near;
    setAtBottom(near);
    setScrolled(el.scrollTop > STICKY_AFTER_PX);
  }, []);

  const onImageLoad = useCallback(() => {
    if (stickRef.current) scrollToEnd(false);
  }, [scrollToEnd]);

  const jumpToLatest = () => {
    stickRef.current = true;
    setAtBottom(true);
    scrollToEnd(true);
  };

  const thinking = busy && mascotState === "thinking";

  return (
    <div className="relative min-h-0 flex-1">
      {/* Telegram-style: once the conversation has scrolled, the mascot shrinks into a blurred sticky bar instead of leaving. */}
      <AnimatePresence initial={false}>
        {scrolled ? (
          <motion.div
            key="sticky-mascot"
            data-sticky-mascot
            aria-hidden="true"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -10 }}
            transition={{ duration: reduceMotion ? 0 : 0.2, ease: "easeOut" }}
            className="pointer-events-none absolute inset-x-0 top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur-md dark:border-white/10 dark:bg-zinc-950/80"
          >
            <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-1.5 sm:px-6">
              <MaiMascot variant="avatar" state={mascotState} stateLabels={stateLabels} className="size-8" animated={!reduceMotion} />
              <div className="flex min-w-0 flex-col">
                <span className="text-sm font-semibold leading-tight text-slate-800 dark:text-zinc-100">{t("chat.assistant")}</span>
                {thinking ? (
                  <span data-sticky-thinking className="mt-0.5 inline-flex w-fit max-w-full items-center truncate rounded-full bg-blue-50 px-2 py-0.5 font-mono text-[11px] leading-4 text-blue-700 motion-safe:animate-pulse dark:bg-blue-950/40 dark:text-blue-300">
                    {t("chat.analyzing")}
                  </span>
                ) : (
                  <span className="truncate text-xs leading-tight text-slate-500 dark:text-zinc-400">{stateLabels[mascotState] ?? ""}</span>
                )}
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        role="log"
        aria-live={streamingId ? "off" : "polite"}
        aria-busy={streamingId !== null}
        aria-label={t("chat.title")}
        tabIndex={0}
        className="h-full overflow-y-auto overscroll-contain focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600"
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-7 px-4 pb-8 pt-6 sm:px-6">
          {visible.map((message) =>
            message.role === "user" ? (
              <UserMessage key={message.id} message={message} onImageLoad={onImageLoad} onEdit={busy ? undefined : onEdit} editing={editingId === message.id} />
            ) : (
              <AssistantMessage
                key={message.id}
                message={message}
                streaming={message.id === streamingId}
                live={message.id === latestAssistantId}
                mascotState={message.id === latestAssistantId ? mascotState : "idle"}
                stateLabels={stateLabels}
                sharedAvatar={sharedAvatar && message.id === latestAssistantId}
                canRegenerate={message.id === latestAssistantId && message.id === lastId}
                busy={busy}
                onRegenerate={regenerateLatest}
                stepMode={stepMode && editingId === null}
                onReveal={onReveal}
              />
            ),
          )}

          {error ? (
            <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-zinc-300 sm:ms-[3.25rem]">
              <AlertCircle className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-300" aria-hidden="true" />
              <p className="min-w-0 flex-1" dir="auto">{error === "stopped" ? t("chat.stopped") : t(`errors.${error}`)}</p>
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-white/[0.14] dark:bg-transparent dark:text-zinc-100 dark:hover:bg-white/[0.08]"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                {t("chat.retry")}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {!atBottom ? (
        <button
          type="button"
          onClick={jumpToLatest}
          className="absolute bottom-3 start-1/2 inline-flex min-h-11 -translate-x-1/2 items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-4 text-sm font-medium text-slate-700 shadow-md backdrop-blur transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 rtl:translate-x-1/2 dark:border-white/[0.12] dark:bg-[#1a1a20]/95 dark:text-zinc-100"
        >
          <ArrowDown className="h-4 w-4" aria-hidden="true" />
          {t("chat.scrollLatest")}
        </button>
      ) : null}
    </div>
  );
}

export default ChatTranscript;
