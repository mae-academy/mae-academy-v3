import { memo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Zap } from "lucide-react";
import { useTranslation } from "react-i18next";
import { splitSimMarker, stripLegacySchematicTag, type ChatMessage, type MascotState, type SimLab } from "@shared/aiTypes";
import PrefetchLink from "@/components/common/PrefetchLink";
import { simulatorPathForLab } from "@/lib/aiLab";
import AiMarkdown from "./AiMarkdown";
import { DocumentBadge } from "./DocumentBadge";
import MaiMascot from "./MaiMascot";
import { MessageActions } from "./MessageActions";
import { SchematicAutoRepairContext } from "./SchematicDiagram";
import { isSessionMessage } from "./sessionMessages";

/**
 * What an assistant message shows: the text without the trailing `[[SIM:<lab>]]` marker (and without the stray legacy
 * text-to-image tag that chats stored before the schematic spec format may still contain; see stripLegacySchematicTag), plus the lab
 * once the answer is complete. Mid-stream the marker is hidden even when only half of it has arrived. The stored content
 * keeps both. A schematic is a fenced ```schematic block inside the text and renders where it sits.
 */
export function assistantView(content: string, streaming: boolean): { text: string; lab: SimLab | null } {
  const { text: withoutMarker, lab } = splitSimMarker(content);
  return { text: stripLegacySchematicTag(withoutMarker), lab: streaming ? null : lab };
}

/** Shared-layout transition from the empty-state hero to the first assistant avatar. */
export const MAI_LAYOUT_ID = "mai";
export const MAI_LAYOUT_TRANSITION = { type: "spring", stiffness: 220, damping: 28, mass: 0.9 } as const;

function TypingDots() {
  return (
    <span aria-hidden="true" className="flex h-7 items-center gap-1.5">
      {[0, 1, 2].map((i) => (
        <span key={i} className="h-1.5 w-1.5 rounded-full bg-slate-400 motion-safe:animate-bounce dark:bg-zinc-500" style={{ animationDelay: `${i * 140}ms` }} />
      ))}
    </span>
  );
}

export interface AssistantAvatarProps {
  /** Only the latest assistant message is live; older ones are frozen at idle. */
  live: boolean;
  state: MascotState;
  stateLabels: Partial<Record<MascotState, string>>;
  /** Join the hero's shared layout so the big mascot shrinks into this avatar. */
  shared: boolean;
}

export function AssistantAvatar({ live, state, stateLabels, shared }: AssistantAvatarProps) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      layoutId={shared && !reduceMotion ? MAI_LAYOUT_ID : undefined}
      transition={MAI_LAYOUT_TRANSITION}
      // Without a shared layout (reduced motion) the avatar simply fades in.
      initial={shared && reduceMotion ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      aria-hidden={live ? undefined : true}
      className="mt-0.5 size-8 shrink-0 rounded-full sm:size-9"
    >
      <MaiMascot variant="avatar" state={live ? state : "idle"} animated={live} stateLabels={stateLabels} className="size-8 sm:size-9" />
    </motion.div>
  );
}

export function SimulatorAction({ lab }: { lab: SimLab }) {
  const { t } = useTranslation("ai");
  return (
    <PrefetchLink
      href={simulatorPathForLab(lab)}
      data-sim-lab={lab}
      className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full border border-violet-300/70 bg-gradient-to-r from-blue-50 to-violet-50 px-4 text-sm font-medium text-violet-900 shadow-sm transition-[box-shadow,border-color] hover:border-violet-400 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-violet-400/30 dark:from-blue-500/10 dark:to-violet-500/10 dark:text-violet-100 dark:hover:border-violet-300/60"
    >
      <Zap className="h-4 w-4 text-amber-500" aria-hidden="true" />
      <span>{t("actions.openSimulator")}</span>
    </PrefetchLink>
  );
}

export interface MessageProps {
  message: ChatMessage;
  streaming: boolean;
  onImageLoad: () => void;
}

export const UserMessage = memo(function UserMessage({ message, onImageLoad }: Omit<MessageProps, "streaming">) {
  const { t } = useTranslation("ai");
  return (
    <div className="group/msg flex flex-col items-end">
      <div className="max-w-[88%] rounded-3xl bg-slate-100 px-4 py-2.5 text-slate-900 dark:bg-white/[0.08] dark:text-zinc-50 sm:max-w-[80%]">
        <span className="sr-only">{t("chat.you")}: </span>
        {message.imageUrl ? <img src={message.imageUrl} alt={t("chat.attachedImage")} onLoad={onImageLoad} className="mb-2 max-h-60 max-w-full rounded-2xl bg-white object-contain" /> : null}
        {message.document ? (
          <div className="mb-2 flex flex-col items-start gap-1">
            <DocumentBadge document={message.document} className="bg-white dark:bg-white/[0.06]" />
            {message.document.dataUrl ? null : <p dir="auto" className="text-xs text-slate-500 dark:text-zinc-400">{t("document.reattach")}</p>}
          </div>
        ) : null}
        {message.content ? <p dir="auto" className="whitespace-pre-wrap break-words text-start text-base leading-7">{message.content}</p> : null}
      </div>
      {message.content ? <MessageActions messageId={message.id} content={message.content} role="user" /> : null}
    </div>
  );
});

export interface AssistantMessageProps extends MessageProps {
  live: boolean;
  mascotState: MascotState;
  stateLabels: Partial<Record<MascotState, string>>;
  sharedAvatar: boolean;
  /** The latest assistant message can be regenerated (the transcript passes a stable callback). */
  canRegenerate?: boolean;
  /** A reply is being produced somewhere: regenerate is disabled. */
  busy?: boolean;
  onRegenerate?: () => void;
}

export const AssistantMessage = memo(function AssistantMessage({ message, streaming, live, mascotState, stateLabels, sharedAvatar, canRegenerate, busy, onRegenerate }: Omit<AssistantMessageProps, "onImageLoad"> & { onImageLoad?: () => void }) {
  const { t } = useTranslation("ai");
  const { text, lab } = assistantView(message.content, streaming);
  return (
    <div className="group/msg flex items-start gap-3 sm:gap-4">
      <AssistantAvatar live={live} state={mascotState} stateLabels={stateLabels} shared={sharedAvatar} />
      <div className="min-w-0 flex-1 text-base leading-7 text-slate-800 dark:text-zinc-100">
        <span className="sr-only">{t("chat.assistant")}: </span>
        {text ? (
          <SchematicAutoRepairContext.Provider value={isSessionMessage(message.id)}>
            <AiMarkdown content={text} streaming={streaming} />
          </SchematicAutoRepairContext.Provider>
        ) : streaming ? (
          <TypingDots />
        ) : null}
        {lab ? <SimulatorAction lab={lab} /> : null}
        {!streaming && text ? <MessageActions messageId={message.id} content={message.content} role="model" canRegenerate={canRegenerate} busy={busy} onRegenerate={onRegenerate} /> : null}
      </div>
    </div>
  );
});
