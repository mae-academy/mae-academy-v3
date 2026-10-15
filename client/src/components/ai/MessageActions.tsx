import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, Copy, RotateCcw, Square, Volume2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { copyText } from "./CodeBlock";
import { cleanMessageSource } from "./messageText";
import { copyRichMessage } from "./richCopy";
import { detectSpeechLang, isSpeechSynthesisSupported, spokenLangOf, toSpokenText, useSpeech } from "./speech";

const COPIED_MS = 1800;

export interface MessageActionsProps {
  messageId: string;
  content: string;
  role: "user" | "model";
  /** Show the regenerate button (only the latest assistant message). */
  canRegenerate?: boolean;
  /** Regenerate is unavailable while a reply is being produced. */
  busy?: boolean;
  onRegenerate?: () => void;
}

/** Targets are 44px on touch and 32px with a mouse; the row is revealed on hover / focus and always shown without hover. */
function ActionButton({ label, onClick, disabled, small, pressed, children }: { label: string; onClick: () => void; disabled?: boolean; small?: boolean; pressed?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-white/[0.08] dark:hover:text-white",
        small ? "size-11 sm:size-7" : "size-11 sm:size-8",
      )}
    >
      {children}
    </button>
  );
}

/** Copy / regenerate / read aloud under a finished message. Rendered only for completed messages so streaming never reflows. */
export function MessageActions({ messageId, content, role, canRegenerate = false, busy = false, onRegenerate }: MessageActionsProps) {
  const { t, i18n } = useTranslation("ai");
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speech = useSpeech();
  const speechSupported = useMemo(() => isSpeechSynthesisSupported(), []);
  const speaking = speech.speakingId === messageId;
  const user = role === "user";
  const icon = user ? "h-3.5 w-3.5" : "h-4 w-4";

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const copy = async () => {
    // Assistant replies go to the clipboard as HTML with MathML equations plus plain text, so a paste into Word
    // gives equations instead of $...$; the user's own messages stay plain text.
    const ok = await (user ? copyText(content) : copyRichMessage(cleanMessageSource(content)));
    if (!ok) {
      toast.error(t("chat.copyFailed"));
      return;
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_MS);
  };

  const toggleSpeech = () => {
    if (speaking) {
      speech.stop();
      return;
    }
    const clean = cleanMessageSource(content);
    const lang = detectSpeechLang(clean, i18n.language);
    const spoken = toSpokenText(clean, spokenLangOf(lang));
    if (!spoken) return;
    speech.speak(messageId, spoken, i18n.language, (problem) => toast.error(t(problem === "voice" ? "message.noVoice" : "message.speakFailed")));
  };

  return (
    <div
      data-message-actions
      className={cn(
        "flex items-center gap-0.5 transition-opacity",
        user ? "mt-1 justify-end" : "-ms-2 mt-1",
        // Shown on hover or keyboard focus with a mouse; always on touch. While speaking it stays visible.
        !speaking && !copied && "sm:opacity-0 sm:group-hover/msg:opacity-100 sm:group-focus-within/msg:opacity-100 [@media(hover:none)]:!opacity-100",
      )}
    >
      <ActionButton label={copied ? t("message.copied") : t("message.copy")} onClick={() => void copy()} small={user}>
        {copied ? <Check className={cn(icon, "text-emerald-600 dark:text-emerald-400")} aria-hidden="true" /> : <Copy className={icon} aria-hidden="true" />}
      </ActionButton>
      <span role="status" aria-live="polite" className="sr-only">{copied ? t("message.copied") : ""}</span>

      {!user && speechSupported ? (
        <ActionButton label={speaking ? t("message.stopReading") : t("message.readAloud")} onClick={toggleSpeech} pressed={speaking}>
          {speaking ? <Square className="h-3.5 w-3.5 fill-current" aria-hidden="true" /> : <Volume2 className={icon} aria-hidden="true" />}
        </ActionButton>
      ) : null}

      {!user && canRegenerate && onRegenerate ? (
        <ActionButton label={t("message.regenerate")} onClick={onRegenerate} disabled={busy}>
          <RotateCcw className={icon} aria-hidden="true" />
        </ActionButton>
      ) : null}
    </div>
  );
}

export default MessageActions;
