import { memo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Zap } from "lucide-react";
import { useTranslation } from "react-i18next";
import { splitTrailingMarkers, stripLegacySchematicTag, type ChatMessage, type MascotState, type SimLab, type StepInfo } from "@shared/aiTypes";
import { cn } from "@/lib/utils";
import PrefetchLink from "@/components/common/PrefetchLink";
import { simulatorPathForLab } from "@/lib/aiLab";
import AiMarkdown from "./AiMarkdown";
import { DocumentBadge } from "./DocumentBadge";
import MaiMascot from "./MaiMascot";
import { MessageActions } from "./MessageActions";
import { PlotAutoRunContext } from "./PlotCard";
import { SchematicAutoRepairContext } from "./SchematicDiagram";
import { MathText, hasMath } from "./mathText";
import { isSessionMessage } from "./sessionMessages";

/**
 * What an assistant message shows: the text without the trailing `[[SIM:<lab>]]` marker (and without the stray legacy
 * text-to-image tag that chats stored before the schematic spec format may still contain; see stripLegacySchematicTag), plus the lab
 * once the answer is complete. Mid-stream the marker is hidden even when only half of it has arrived. The stored content
 * keeps both. A schematic is a fenced ```schematic block inside the text and renders where it sits.
 */
export function assistantView(content: string, streaming: boolean): { text: string; lab: SimLab | null; step: StepInfo | null } {
  const { text: withoutMarker, lab, step } = splitTrailingMarkers(content);
  return { text: stripLegacySchematicTag(withoutMarker), lab: streaming ? null : lab, step: streaming ? null : step };
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
      <Zap className="h-4 w-4 text-blue-500" aria-hidden="true" />
      <span>{t("actions.openSimulator")}</span>
    </PrefetchLink>
  );
}

export interface MessageProps {
  message: ChatMessage;
  streaming: boolean;
  onImageLoad: () => void;
}

export interface UserMessageProps extends Omit<MessageProps, "streaming"> {
  /** Offered when the message can be edited (idle chat); the transcript passes a stable callback. */
  onEdit?: (messageId: string) => void;
  /** This message is currently loaded in the composer for editing. */
  editing?: boolean;
}

export const UserMessage = memo(function UserMessage({ message, onImageLoad, onEdit, editing = false }: UserMessageProps) {
  const { t } = useTranslation("ai");
  const edit = onEdit ? () => onEdit(message.id) : undefined;
  return (
    <div className="group/msg flex flex-col items-end" data-editing={editing ? "true" : undefined}>
      <div className={cn("max-w-[88%] rounded-3xl bg-slate-100 px-4 py-2.5 text-slate-900 dark:bg-white/[0.08] dark:text-zinc-50 sm:max-w-[80%]", editing && "ring-2 ring-violet-500 ring-offset-2 ring-offset-white dark:ring-violet-400 dark:ring-offset-[#09090b]")}>
        {editing ? <span className="sr-only">{t("edit.editing")}: </span> : null}
        <span className="sr-only">{t("chat.you")}: </span>
        {message.imageUrl ? <img src={message.imageUrl} alt={t("chat.attachedImage")} onLoad={onImageLoad} className="mb-2 max-h-60 max-w-full rounded-2xl bg-white object-contain" /> : null}
        {message.document ? (
          <div className="mb-2 flex flex-col items-start gap-1">
            <DocumentBadge document={message.document} className="bg-white dark:bg-white/[0.06]" />
            {message.document.dataUrl ? null : <p dir="auto" className="text-xs text-slate-500 dark:text-zinc-400">{t("document.reattach")}</p>}
          </div>
        ) : null}
        {message.content ? (
          <p dir="auto" className="whitespace-pre-wrap break-words text-start text-base leading-7">
            {hasMath(message.content) ? <MathText text={message.content} /> : message.content}
          </p>
        ) : null}
      </div>
      {message.content ? <MessageActions messageId={message.id} content={message.content} role="user" onEdit={edit} /> : null}
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
  /** Step-by-step guidance is on: a non-final step of the latest message offers "Reveal Step n+1". */
  stepMode?: boolean;
  /** Stable callback sending the fixed "continue" message. */
  onReveal?: () => void;
}

export function StepProgress({ step }: { step: StepInfo }) {
  const { t } = useTranslation("ai");
  return (
    <span
      role="img"
      aria-label={t("stepMode.progress", { n: step.n, total: step.total })}
      data-step-chip
      className="mt-3 inline-flex min-h-6 items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-2.5 text-xs font-medium text-violet-800 dark:border-violet-400/25 dark:bg-violet-500/10 dark:text-violet-200"
    >
      <span aria-hidden="true">{t("stepMode.progress", { n: step.n, total: step.total })}</span>
      <span aria-hidden="true" className="h-1 w-12 overflow-hidden rounded-full bg-violet-200 dark:bg-violet-400/25">
        <span className="block h-full rounded-full bg-violet-600 dark:bg-violet-300" style={{ width: `${Math.round((step.n / step.total) * 100)}%` }} />
      </span>
    </span>
  );
}

export const AssistantMessage = memo(function AssistantMessage({ message, streaming, live, mascotState, stateLabels, sharedAvatar, canRegenerate, busy, onRegenerate, stepMode = false, onReveal }: Omit<AssistantMessageProps, "onImageLoad"> & { onImageLoad?: () => void }) {
  const { t } = useTranslation("ai");
  const { text, lab, step } = assistantView(message.content, streaming);
  const canReveal = step !== null && step.n < step.total && stepMode && canRegenerate === true && !busy && onReveal !== undefined;
  return (
    <div className="group/msg flex items-start gap-3 sm:gap-4">
      <AssistantAvatar live={live} state={mascotState} stateLabels={stateLabels} shared={sharedAvatar} />
      <div className="min-w-0 flex-1 text-base leading-7 text-slate-800 dark:text-zinc-100">
        <span className="sr-only">{t("chat.assistant")}: </span>
        {text ? (
          <SchematicAutoRepairContext.Provider value={isSessionMessage(message.id)}>
            <PlotAutoRunContext.Provider value={isSessionMessage(message.id)}>
              <AiMarkdown content={text} streaming={streaming} />
            </PlotAutoRunContext.Provider>
          </SchematicAutoRepairContext.Provider>
        ) : streaming ? (
          <TypingDots />
        ) : null}
        {lab ? <SimulatorAction lab={lab} /> : null}
        {step && text ? (
          <div className="flex flex-wrap items-center gap-3">
            <StepProgress step={step} />
            {canReveal ? (
              <button
                type="button"
                onClick={onReveal}
                data-step-reveal
                className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full bg-gradient-to-br from-blue-600 to-violet-600 px-5 text-sm font-semibold text-white shadow-sm transition-[opacity,transform] hover:opacity-90 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                <span>{t("stepMode.reveal", { next: step.n + 1 })}</span>
                <span aria-hidden="true" className="inline-block rtl:-scale-x-100">➔</span>
              </button>
            ) : null}
          </div>
        ) : null}
        {!streaming && text ? <MessageActions messageId={message.id} content={message.content} role="model" canRegenerate={canRegenerate} busy={busy} onRegenerate={onRegenerate} /> : null}
      </div>
    </div>
  );
});
