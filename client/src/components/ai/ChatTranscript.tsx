import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { AlertCircle, ArrowDown, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ChatMessage, MascotState } from "@shared/aiTypes";
import { AssistantMessage, UserMessage } from "./ChatMessages";
import type { ChatError } from "./useChatRunner";

/** Within this many px of the end counts as "following the stream". */
const NEAR_BOTTOM_PX = 80;

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
}

/** The scrolling message column: follows the stream only while the reader is at the bottom, with a jump-to-latest pill otherwise. */
export function ChatTranscript({ messages, streamingId, mascotState, stateLabels, sharedAvatar, error, onRetry }: ChatTranscriptProps) {
  const { t } = useTranslation("ai");
  const reduceMotion = useReducedMotion();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const [atBottom, setAtBottom] = useState(true);

  const visible = useMemo(() => messages.filter((m) => m.role === "user" || m.content.trim() !== "" || m.id === streamingId), [messages, streamingId]);
  const latestAssistantId = useMemo(() => [...visible].reverse().find((m) => m.role === "model")?.id ?? null, [visible]);

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
  }, []);

  const onImageLoad = useCallback(() => {
    if (stickRef.current) scrollToEnd(false);
  }, [scrollToEnd]);

  const jumpToLatest = () => {
    stickRef.current = true;
    setAtBottom(true);
    scrollToEnd(true);
  };

  return (
    <div className="relative min-h-0 flex-1">
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
              <UserMessage key={message.id} message={message} onImageLoad={onImageLoad} />
            ) : (
              <AssistantMessage
                key={message.id}
                message={message}
                streaming={message.id === streamingId}
                live={message.id === latestAssistantId}
                mascotState={message.id === latestAssistantId ? mascotState : "idle"}
                stateLabels={stateLabels}
                sharedAvatar={sharedAvatar && message.id === latestAssistantId}
              />
            ),
          )}

          {error ? (
            <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-zinc-300 sm:ms-[3.25rem]">
              <AlertCircle className="h-5 w-5 shrink-0 text-amber-500" aria-hidden="true" />
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
