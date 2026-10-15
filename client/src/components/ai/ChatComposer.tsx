import { useCallback, useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent, type Ref } from "react";
import { ArrowUp, Mic, Paperclip, Square, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AI_MAX_MESSAGE_CHARS, type ChatDocument } from "@shared/aiTypes";
import { cn } from "@/lib/utils";
import { DocumentBadge } from "./DocumentBadge";
import { DocumentError, classifyAttachment, prepareDocumentForChat, unsupportedKind } from "./documentUtils";
import { ImageError, prepareImageForChat } from "./imageUtils";
import { insertAtCursor } from "./insertAtCursor";
import { MathKeyboard, MathKeyboardToggle } from "./MathKeyboard";
import type { MathKey } from "./mathKeyboardData";
import type { RunPhase } from "./useChatRunner";
import { useVoiceInput } from "./useVoiceInput";
import { VoiceWaveform } from "./VoiceWaveform";
import { acceptVoiceNotice, formatElapsed, hasAcceptedVoiceNotice, isVoiceInputSupported, joinText, recognitionLang, truncateTranscript } from "./voiceInput";

const COUNTER_FROM = Math.floor(AI_MAX_MESSAGE_CHARS * 0.8);
/** Eight lines of `leading-6`; the textarea scrolls beyond that. */
const MAX_TEXTAREA_PX = 192;
/** The picker accepts images, PDFs and Markdown / plain text; classification re-checks by MIME with an extension fallback. */
const FILE_ACCEPT = "image/png,image/jpeg,image/webp,application/pdf,.pdf,text/plain,text/markdown,.md,.txt";
const DOCUMENT_PROMPTS = ["summarise", "derivations", "errors"] as const;

export interface ComposerHandle {
  focus: () => void;
  /** Replaces the draft and moves the caret to its end. */
  setDraft: (text: string) => void;
  openFilePicker: () => void;
  /** Validates and attaches an image (resized) or a PDF / text document: the same path as the picker, paste and drop. */
  attachFile: (file: Blob) => Promise<void>;
}

export interface ComposerSubmit {
  text: string;
  image: string | null;
  document: ChatDocument | null;
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
  const { t, i18n } = useTranslation("ai");
  const [draft, setDraft] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [doc, setDocument] = useState<ChatDocument | null>(null);
  const [preparing, setPreparing] = useState<"image" | "document" | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [voiceSupported] = useState(() => isVoiceInputSupported());
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [voiceMessage, setVoiceMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null);
  const recordingRef = useRef<HTMLDivElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);

  const [mathOpen, setMathOpen] = useState(false);
  const [tooLong, setTooLong] = useState(false);
  const tooLongTimer = useRef<number | undefined>(undefined);
  const pendingSelection = useRef<{ value: string; start: number; end: number } | null>(null);
  const mathPanelId = `math-keyboard-${useId().replace(/:/g, "")}`;

  const imageRef = useRef<string | null>(null);
  const documentRef = useRef<ChatDocument | null>(null);
  imageRef.current = image;
  documentRef.current = doc;

  const busy = phase !== "idle";
  const canSend = !busy && preparing === null && draft.trim().length > 0;

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
      const named = file as File;
      const kind = classifyAttachment({ type: file.type, name: named.name });
      if (!kind) {
        toast.error(t(`document.errors.${unsupportedKind({ name: named.name })}`));
        focus();
        return;
      }
      setPreparing(kind);
      try {
        if (kind === "image") {
          const prepared = await prepareImageForChat(file);
          setImage(prepared);
          if (documentRef.current) toast.info(t("document.replacedByImage"));
          documentRef.current = null;
          setDocument(null);
        } else {
          const prepared = await prepareDocumentForChat(named);
          setDocument(prepared);
          documentRef.current = prepared;
          if (imageRef.current) toast.info(t("document.replacedImage"));
          imageRef.current = null;
          setImage(null);
        }
      } catch (caught) {
        if (kind === "image") toast.error(t(`image.${caught instanceof ImageError ? caught.kind : "decode"}`));
        else toast.error(t(`document.errors.${caught instanceof DocumentError ? caught.kind : "read"}`));
      } finally {
        setPreparing(null);
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

  const voice = useVoiceInput({
    lang: recognitionLang(i18n.language),
    onActivity,
    onResult: (spoken) => {
      if (!spoken.trim()) {
        setVoiceMessage({ tone: "info", text: t("voice.empty") });
        focus();
        return;
      }
      const { text, truncated } = truncateTranscript(joinText(draft, spoken), AI_MAX_MESSAGE_CHARS);
      if (truncated) setVoiceMessage({ tone: "info", text: t("voice.truncated", { max: AI_MAX_MESSAGE_CHARS }) });
      if (busy) {
        // A reply started meanwhile: keep the words in the box rather than sending over it.
        setDraft(text);
        focus();
        return;
      }
      setDraft("");
      setImage(null);
      setDocument(null);
      onSubmit({ text, image, document: doc });
      focus();
    },
  });
  const recording = voice.status !== "idle";

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_PX)}px`;
  }, [draft, recording]);

  // A key press sets the draft and the wanted selection; apply it once React has put that value in the DOM, so the caret never jumps to the end.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    const pending = pendingSelection.current;
    if (!el || !pending || el.value !== pending.value) return;
    pendingSelection.current = null;
    el.focus();
    el.setSelectionRange(pending.start, pending.end);
  }, [draft]);
  useEffect(() => () => window.clearTimeout(tooLongTimer.current), []);

  const closeMath = () => {
    setMathOpen(false);
    textareaRef.current?.focus();
  };

  const insertKey = (key: MathKey) => {
    const el = textareaRef.current;
    if (!el) return;
    const current = el.value;
    const start = Math.min(el.selectionStart, el.selectionEnd);
    const end = Math.max(el.selectionStart, el.selectionEnd);
    const result = insertAtCursor(current, start, end, key, { maxChars: AI_MAX_MESSAGE_CHARS });
    el.focus();
    if (!result) {
      setTooLong(true);
      window.clearTimeout(tooLongTimer.current);
      tooLongTimer.current = window.setTimeout(() => setTooLong(false), 2500);
      return;
    }
    setTooLong(false);
    onActivity();
    // execCommand keeps the browser's undo stack; the state write is the fallback where it is missing or declined.
    const inserted = result.value.slice(start, result.value.length - (current.length - end));
    let native = false;
    if (typeof document.execCommand === "function") {
      el.setSelectionRange(start, end);
      try {
        native = document.execCommand("insertText", false, inserted) && el.value === result.value;
      } catch {
        native = false;
      }
    }
    if (!native) {
      pendingSelection.current = { value: result.value, start: result.caretStart, end: result.caretEnd };
      setDraft(result.value);
    }
    el.setSelectionRange(result.caretStart, result.caretEnd);
  };

  useEffect(() => {
    if (voice.error) setVoiceMessage({ tone: "error", text: t(`voice.errors.${voice.error}`) });
  }, [voice.error, t]);
  useEffect(() => {
    if (voice.status === "recording") recordingRef.current?.focus();
  }, [voice.status]);
  useEffect(() => {
    if (noticeOpen) continueRef.current?.focus();
  }, [noticeOpen]);

  const startVoice = () => {
    setVoiceMessage(null);
    if (!hasAcceptedVoiceNotice()) {
      setNoticeOpen(true);
      return;
    }
    voice.start();
  };

  const confirmNotice = () => {
    acceptVoiceNotice();
    setNoticeOpen(false);
    voice.start();
  };

  const onRecordingKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      voice.cancel();
      focus();
    } else if (event.key === "Enter" && !(event.target instanceof HTMLButtonElement)) {
      event.preventDefault();
      voice.confirm();
    }
  };

  const submit = () => {
    if (!canSend) return;
    onSubmit({ text: draft.trim(), image, document: doc });
    setDraft("");
    setImage(null);
    setDocument(null);
    focus();
  };

  const onFormSubmit = (event: FormEvent) => {
    event.preventDefault();
    submit();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape" && mathOpen) {
      event.preventDefault();
      closeMath();
      return;
    }
    if (event.key !== "Enter" || event.shiftKey) return;
    // Enter during IME composition confirms the candidate; it must not send.
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    submit();
  };

  const onPaste = (event: ClipboardEvent) => {
    const file = Array.from(event.clipboardData.files).find((f) => f.type.startsWith("image/") || classifyAttachment(f) !== null);
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
      {image || doc || preparing ? (
        <div className="flex min-w-0 items-center gap-3 px-4 pt-4">
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
          {doc ? <DocumentBadge document={doc} onRemove={() => { setDocument(null); focus(); }} /> : null}
          {preparing ? <span role="status" className="text-sm text-slate-500 motion-safe:animate-pulse dark:text-zinc-400">{t(preparing === "document" ? "composer.preparingDocument" : "composer.preparing")}</span> : null}
        </div>
      ) : null}

      {doc && draft.trim() === "" && !recording ? (
        <ul aria-label={t("document.suggestionsLabel")} className="flex flex-wrap gap-2 px-4 pt-3">
          {DOCUMENT_PROMPTS.map((id) => {
            const label = t(`document.prompts.${id}`);
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => { setDraft(label); onActivity(); focus(); }}
                  className="inline-flex min-h-11 items-center rounded-full border border-slate-200 bg-white/70 px-4 text-sm text-slate-600 transition-colors hover:border-violet-300 hover:bg-violet-50 hover:text-violet-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-white/[0.1] dark:bg-white/[0.03] dark:text-zinc-300 dark:hover:border-violet-400/40 dark:hover:bg-violet-500/10 dark:hover:text-violet-100"
                >
                  <span dir="auto">{label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {voiceMessage ? (
        <p
          role={voiceMessage.tone === "error" ? "alert" : "status"}
          dir="auto"
          className={cn("mx-4 mt-3 rounded-xl px-3 py-2 text-sm", voiceMessage.tone === "error" ? "bg-rose-50 text-rose-800 dark:bg-rose-500/10 dark:text-rose-200" : "bg-slate-100 text-slate-700 dark:bg-white/[0.06] dark:text-zinc-300")}
        >
          {voiceMessage.text}
        </p>
      ) : null}

      {noticeOpen ? (
        <div role="group" aria-label={t("voice.noticeTitle")} className="mx-4 mt-3 rounded-2xl border border-violet-200 bg-violet-50/70 p-3 text-sm text-slate-700 dark:border-violet-400/25 dark:bg-violet-500/10 dark:text-zinc-200">
          <p className="font-semibold text-slate-900 dark:text-white">{t("voice.noticeTitle")}</p>
          <p className="mt-1" dir="auto">{t("voice.notice")}</p>
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => setNoticeOpen(false)} className="min-h-11 rounded-full px-4 text-sm font-medium text-slate-700 hover:bg-white/70 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600 dark:text-zinc-200 dark:hover:bg-white/[0.08]">
              {t("voice.noticeCancel")}
            </button>
            <button ref={continueRef} type="button" onClick={confirmNotice} className="min-h-11 rounded-full bg-gradient-to-br from-blue-600 to-violet-600 px-5 text-sm font-semibold text-white shadow-sm hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
              {t("voice.noticeContinue")}
            </button>
          </div>
        </div>
      ) : null}

      {recording ? (
        <div
          ref={recordingRef}
          tabIndex={-1}
          onKeyDown={onRecordingKeyDown}
          aria-busy={voice.status === "finishing"}
          className="px-2.5 pb-2.5 pt-3 outline-none"
        >
          <span className="sr-only" role="status">{t("voice.recording")}</span>
          <p dir="auto" aria-hidden="true" className="min-h-6 px-3 pb-2 text-base leading-6 text-slate-600 dark:text-zinc-300">
            {voice.preview || <span className="text-slate-400 dark:text-zinc-500">{voice.silent ? t("voice.silent") : t("voice.listening")}</span>}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { voice.cancel(); focus(); }}
              disabled={voice.status === "finishing"}
              aria-label={t("voice.cancel")}
              title={t("voice.cancel")}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-white/[0.08] dark:hover:text-white"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
            <VoiceWaveform analyser={voice.analyser} className="h-11 min-w-0 flex-1" />
            <span aria-live="off" className="w-12 shrink-0 text-center text-sm font-medium tabular-nums text-slate-600 dark:text-zinc-300">{formatElapsed(voice.elapsedMs)}</span>
            <button
              type="button"
              onClick={voice.confirm}
              disabled={voice.status === "finishing"}
              aria-label={t("voice.send")}
              title={t("voice.send")}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-violet-600 text-white shadow-sm transition-[opacity,transform] hover:opacity-90 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-60"
            >
              <ArrowUp className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : (
        <>
      <MathKeyboard open={mathOpen} id={mathPanelId} onInsert={insertKey} onClose={closeMath} tooLong={tooLong} />
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
        placeholder={t(doc ? "composer.documentPlaceholder" : "composer.placeholder")}
        className={cn(
          "block w-full resize-none bg-transparent px-5 text-base leading-6 text-slate-900 outline-none placeholder:text-slate-400 dark:text-white dark:placeholder:text-zinc-500",
          large ? "min-h-[3.75rem] pt-5 pb-1.5" : "min-h-[3rem] pt-3.5 pb-1",
        )}
      />

      <div className="flex items-center gap-2 px-2.5 pb-2.5">
        <input ref={fileRef} type="file" accept={FILE_ACCEPT} className="hidden" tabIndex={-1} onChange={(event) => onFilePicked(event.target.files)} />
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
          {draft.length >= COUNTER_FROM || tooLong ? (
            <span className={cn("tabular-nums", (draft.length >= AI_MAX_MESSAGE_CHARS || tooLong) && "font-semibold text-rose-600 dark:text-rose-400")}>
              {t("composer.counter", { count: draft.length, max: AI_MAX_MESSAGE_CHARS })}
            </span>
          ) : null}
        </div>

        <MathKeyboardToggle open={mathOpen} panelId={mathPanelId} onToggle={() => (mathOpen ? closeMath() : setMathOpen(true))} />

        {voiceSupported ? (
          <button
            type="button"
            onClick={startVoice}
            disabled={busy || preparing !== null}
            aria-label={t("voice.start")}
            title={t("voice.start")}
            data-voice-start
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-white/[0.08] dark:hover:text-white"
          >
            <Mic className="h-5 w-5" aria-hidden="true" />
          </button>
        ) : null}

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
        </>
      )}
    </form>
  );
}

export default ChatComposer;
