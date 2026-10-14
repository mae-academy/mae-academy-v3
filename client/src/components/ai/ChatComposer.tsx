import { useCallback, useImperativeHandle, useLayoutEffect, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent, type Ref } from "react";
import { ArrowUp, Paperclip, Square, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AI_MAX_MESSAGE_CHARS } from "@shared/aiTypes";
import { cn } from "@/lib/utils";
import { ACCEPTED_IMAGE_TYPES, ImageError, prepareImageForChat } from "./imageUtils";
import type { RunPhase } from "./useChatRunner";

const COUNTER_FROM = Math.floor(AI_MAX_MESSAGE_CHARS * 0.8);
/** Eight lines of `leading-6`; the textarea scrolls beyond that. */
const MAX_TEXTAREA_PX = 192;

export interface ComposerHandle {
  focus: () => void;
  /** Replaces the draft and moves the caret to its end. */
  setDraft: (text: string) => void;
  openFilePicker: () => void;
  /** Resizes and attaches an image file (the same path as the picker, paste and drop). */
  attachFile: (file: Blob) => Promise<void>;
}

export interface ComposerSubmit {
  text: string;
  image: string | null;
}

export interface ChatComposerProps {
  phase: RunPhase;
  onSubmit: (payload: ComposerSubmit) => void;
  onStop: () => void;
  /** Typing, pasting or attaching: lets the mascot lean in. */
  onActivity: () => void;
  /** The larger, centered variant used on the empty state. */
  large?: boolean;
  className?: string;
  ref?: Ref<ComposerHandle>;
}

/** The message box: auto-growing textarea, image attach (picker / paste), send / stop with an in-flight spinner. */
export function ChatComposer({ phase, onSubmit, onStop, onActivity, large = false, className, ref }: ChatComposerProps) {
  const { t } = useTranslation("ai");
  const [draft, setDraft] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const busy = phase !== "idle";
  const canSend = !busy && !preparing && (draft.trim().length > 0 || image !== null);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_PX)}px`;
  }, [draft]);

  const focus = useCallback(() => {
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }, []);

  const attachFile = useCallback(
    async (file: Blob) => {
      onActivity();
      setPreparing(true);
      try {
        setImage(await prepareImageForChat(file));
      } catch (caught) {
        toast.error(t(`image.${caught instanceof ImageError ? caught.kind : "decode"}`));
      } finally {
        setPreparing(false);
        focus();
      }
    },
    [focus, onActivity, t],
  );

  useImperativeHandle(
    ref,
    () => ({
      focus,
      setDraft: (text: string) => {
        setDraft(text);
        onActivity();
        focus();
      },
      openFilePicker: () => fileRef.current?.click(),
      attachFile,
    }),
    [attachFile, focus, onActivity],
  );

  const submit = () => {
    if (!canSend) return;
    onSubmit({ text: draft.trim(), image });
    setDraft("");
    setImage(null);
    focus();
  };

  const onFormSubmit = (event: FormEvent) => {
    event.preventDefault();
    submit();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    // Enter during IME composition confirms the candidate; it must not send.
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    submit();
  };

  const onPaste = (event: ClipboardEvent) => {
    const file = Array.from(event.clipboardData.files).find((f) => f.type.startsWith("image/"));
    // A screenshot has no text flavour; a copy from a document may carry both, and then the text is what's wanted.
    if (file && !event.clipboardData.getData("text/plain")) {
      event.preventDefault();
      void attachFile(file);
    } else {
      onActivity();
    }
  };

  const onFilePicked = (files: FileList | null) => {
    const file = files?.[0];
    if (file) void attachFile(file);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <form
      onSubmit={onFormSubmit}
      onPaste={onPaste}
      className={cn(
        "rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_2px_24px_-8px_rgb(15_23_42/0.14)] transition-shadow focus-within:border-violet-300 focus-within:shadow-[0_4px_32px_-8px_rgb(124_58_237/0.28)] dark:border-white/[0.1] dark:bg-[#141418] dark:shadow-[0_2px_24px_-8px_rgb(0_0_0/0.6)] dark:focus-within:border-violet-400/50",
        className,
      )}
    >
      {image || preparing ? (
        <div className="flex items-center gap-3 px-4 pt-4">
          {image ? (
            <div className="relative">
              <img src={image} alt={t("chat.attachedImage")} className="h-16 w-16 rounded-xl border border-slate-200 bg-white object-cover dark:border-white/[0.12]" />
              <button
                type="button"
                onClick={() => { setImage(null); focus(); }}
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

      <textarea
        ref={textareaRef}
        value={draft}
        onChange={(event) => { setDraft(event.target.value); onActivity(); }}
        onKeyDown={onKeyDown}
        rows={1}
        dir="auto"
        maxLength={AI_MAX_MESSAGE_CHARS}
        enterKeyHint="send"
        aria-label={t("composer.label")}
        placeholder={t("composer.placeholder")}
        className={cn(
          "block w-full resize-none bg-transparent px-5 text-base leading-6 text-slate-900 outline-none placeholder:text-slate-400 dark:text-white dark:placeholder:text-zinc-500",
          large ? "min-h-[3.75rem] pt-5 pb-1.5" : "min-h-[3rem] pt-3.5 pb-1",
        )}
      />

      <div className="flex items-center gap-2 px-2.5 pb-2.5">
        <input ref={fileRef} type="file" accept={ACCEPTED_IMAGE_TYPES.join(",")} className="hidden" tabIndex={-1} onChange={(event) => onFilePicked(event.target.files)} />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          aria-label={t("composer.attach")}
          title={t("composer.attach")}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600 dark:text-zinc-400 dark:hover:bg-white/[0.08] dark:hover:text-white"
        >
          <Paperclip className="h-5 w-5" aria-hidden="true" />
        </button>

        <div className="min-w-0 flex-1 text-end text-xs text-slate-500 dark:text-zinc-400">
          {draft.length >= COUNTER_FROM ? (
            <span className={cn("tabular-nums", draft.length >= AI_MAX_MESSAGE_CHARS && "font-semibold text-rose-600 dark:text-rose-400")}>
              {t("composer.counter", { count: draft.length, max: AI_MAX_MESSAGE_CHARS })}
            </span>
          ) : null}
        </div>

        {busy ? (
          <button
            type="button"
            onClick={onStop}
            aria-label={t("composer.stop")}
            title={t("composer.stop")}
            className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:bg-white dark:text-slate-900"
          >
            {phase === "waiting" ? (
              <span aria-hidden="true" className="absolute inset-1 rounded-full border-2 border-current border-t-transparent opacity-60 motion-safe:animate-spin" />
            ) : null}
            <Square className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!canSend}
            aria-label={t("composer.send")}
            title={t("composer.send")}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-violet-600 text-white shadow-sm transition-[opacity,transform] hover:opacity-90 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:from-slate-200 disabled:to-slate-200 disabled:text-slate-400 disabled:shadow-none dark:disabled:from-white/[0.08] dark:disabled:to-white/[0.08] dark:disabled:text-zinc-500"
          >
            <ArrowUp className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
      </div>
    </form>
  );
}

export default ChatComposer;
