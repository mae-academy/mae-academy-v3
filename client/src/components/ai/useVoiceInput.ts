import { useCallback, useEffect, useRef, useState } from "react";
import {
  assembleTranscript,
  getSpeechRecognitionCtor,
  joinText,
  mapMediaError,
  mapRecognitionError,
  type SpeechRecognitionLike,
  type VoiceErrorKind,
} from "./voiceInput";

export type VoiceStatus = "idle" | "recording" | "finishing";

/** A recognition session that ends sooner than this after starting counts as a "quick" end for the restart-loop guard. */
const QUICK_END_MS = 400;
const MAX_QUICK_RESTARTS = 5;
const RESTART_DELAY_MS = 120;
/** After stop(), how long to wait for the recognizer's last final result before using what we have. */
const FINISH_TIMEOUT_MS = 1500;
const TICK_MS = 250;

export interface UseVoiceInputOptions {
  /** Recognition language tag, e.g. `ar-SA`. */
  lang: string;
  /** Called once with the finished transcript after `confirm()` (possibly empty). Never called after cancel or an error. */
  onResult: (text: string) => void;
  /** Called while recording so the mascot keeps listening. */
  onActivity?: () => void;
}

export interface VoiceInputApi {
  status: VoiceStatus;
  /** Everything heard so far (final + interim), for the live caption. */
  preview: string;
  elapsedMs: number;
  /** Live mic analyser for the waveform; null before the mic opened or if it could not be opened. */
  analyser: AnalyserNode | null;
  error: VoiceErrorKind | null;
  /** A soft hint (no speech heard yet), cleared as soon as words arrive. */
  silent: boolean;
  start: () => void;
  confirm: () => void;
  cancel: () => void;
  clearError: () => void;
}

/**
 * Speech-to-text via the Web Speech API plus a parallel microphone stream that only feeds the waveform. Every resource
 * (recognizer, tracks, AudioContext, timers) is released on confirm, cancel, error and unmount.
 */
export function useVoiceInput({ lang, onResult, onActivity }: UseVoiceInputOptions): VoiceInputApi {
  const [status, setStatusState] = useState<VoiceStatus>("idle");
  const [preview, setPreview] = useState("");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [error, setError] = useState<VoiceErrorKind | null>(null);
  const [silent, setSilent] = useState(false);

  const optionsRef = useRef({ lang, onResult, onActivity });
  optionsRef.current = { lang, onResult, onActivity };

  const statusRef = useRef<VoiceStatus>("idle");
  const tokenRef = useRef(0);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const restartRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textRef = useRef({ committed: "", final: "", interim: "" });
  const guardRef = useRef({ startedAt: 0, quick: 0 });
  const launchRef = useRef<() => void>(() => {});

  const setStatus = useCallback((next: VoiceStatus) => {
    statusRef.current = next;
    setStatusState(next);
  }, []);

  const releaseAudio = useCallback(() => {
    const stream = streamRef.current;
    streamRef.current = null;
    stream?.getTracks().forEach((track) => track.stop());
    const ctx = ctxRef.current;
    ctxRef.current = null;
    if (ctx && ctx.state !== "closed") void ctx.close().catch(() => {});
    setAnalyser(null);
  }, []);

  const releaseAll = useCallback(() => {
    tokenRef.current += 1;
    if (tickRef.current) clearInterval(tickRef.current);
    if (restartRef.current) clearTimeout(restartRef.current);
    if (finishRef.current) clearTimeout(finishRef.current);
    tickRef.current = restartRef.current = finishRef.current = null;
    const rec = recRef.current;
    recRef.current = null;
    if (rec) {
      rec.onresult = rec.onerror = rec.onend = null;
      try { rec.abort(); } catch { /* already stopped */ }
    }
    releaseAudio();
  }, [releaseAudio]);

  const currentText = () => joinText(textRef.current.committed, joinText(textRef.current.final, textRef.current.interim));

  const fail = useCallback((kind: VoiceErrorKind) => {
    releaseAll();
    textRef.current = { committed: "", final: "", interim: "" };
    setPreview("");
    setSilent(false);
    setStatus("idle");
    setError(kind);
  }, [releaseAll, setStatus]);

  const finalize = useCallback(() => {
    if (statusRef.current !== "finishing") return;
    const text = currentText();
    releaseAll();
    textRef.current = { committed: "", final: "", interim: "" };
    setPreview("");
    setSilent(false);
    setStatus("idle");
    optionsRef.current.onResult(text);
  }, [releaseAll, setStatus]);

  launchRef.current = () => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) { fail("failed"); return; }
    const rec = new Ctor();
    rec.lang = optionsRef.current.lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    recRef.current = rec;
    guardRef.current.startedAt = Date.now();

    rec.onresult = (event) => {
      if (recRef.current !== rec) return;
      const parts = assembleTranscript(event.results);
      textRef.current.final = parts.final;
      textRef.current.interim = parts.interim;
      guardRef.current.quick = 0;
      setSilent(false);
      setPreview(currentText());
      optionsRef.current.onActivity?.();
    };
    rec.onerror = (event) => {
      if (recRef.current !== rec) return;
      const mapped = mapRecognitionError(event.error);
      if (mapped.fatal && mapped.kind && mapped.kind !== "noSpeech") fail(mapped.kind);
      else if (mapped.kind === "noSpeech") setSilent(true);
    };
    rec.onend = () => {
      if (recRef.current !== rec) return;
      if (statusRef.current === "finishing") { finalize(); return; }
      if (statusRef.current !== "recording") return;
      // The engine stops by itself after silence or a network blip: bank what we have and listen again, but never in a tight loop.
      const text = textRef.current;
      text.committed = joinText(text.committed, joinText(text.final, text.interim));
      text.final = text.interim = "";
      const guard = guardRef.current;
      guard.quick = Date.now() - guard.startedAt < QUICK_END_MS ? guard.quick + 1 : 0;
      if (guard.quick >= MAX_QUICK_RESTARTS) { fail("failed"); return; }
      recRef.current = null;
      restartRef.current = setTimeout(() => {
        restartRef.current = null;
        if (statusRef.current === "recording") launchRef.current();
      }, RESTART_DELAY_MS);
    };

    try {
      rec.start();
    } catch {
      fail("failed");
    }
  };

  const openMic = useCallback(async (token: number) => {
    const media = typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
    if (!media?.getUserMedia) return;
    let stream: MediaStream;
    try {
      stream = await media.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (caught) {
      if (tokenRef.current !== token) return;
      const kind = mapMediaError(caught);
      if (kind !== "failed") fail(kind);
      return; // any other failure only costs the waveform
    }
    if (tokenRef.current !== token) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    streamRef.current = stream;
    try {
      const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Context) return;
      const ctx = new Context();
      ctxRef.current = ctx;
      const node = ctx.createAnalyser();
      node.fftSize = 256;
      node.smoothingTimeConstant = 0.8;
      ctx.createMediaStreamSource(stream).connect(node);
      if (ctx.state === "suspended") void ctx.resume().catch(() => {});
      setAnalyser(node);
    } catch {
      /* no waveform; transcription still works */
    }
  }, [fail]);

  const start = useCallback(() => {
    if (statusRef.current !== "idle") return;
    if (!getSpeechRecognitionCtor()) { setError("failed"); return; }
    const token = ++tokenRef.current;
    textRef.current = { committed: "", final: "", interim: "" };
    guardRef.current = { startedAt: Date.now(), quick: 0 };
    setError(null);
    setSilent(false);
    setPreview("");
    setElapsedMs(0);
    setStatus("recording");
    const startedAt = Date.now();
    let ticks = 0;
    tickRef.current = setInterval(() => {
      setElapsedMs(Date.now() - startedAt);
      if (++ticks % 4 === 0) optionsRef.current.onActivity?.();
    }, TICK_MS);
    optionsRef.current.onActivity?.();
    launchRef.current();
    if ((statusRef.current as VoiceStatus) === "recording") void openMic(token);
  }, [openMic, setStatus]);

  const confirm = useCallback(() => {
    if (statusRef.current !== "recording") return;
    setStatus("finishing");
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
    releaseAudio(); // the mic light goes off right away; only the recognizer is still flushing
    const rec = recRef.current;
    if (!rec) { finalize(); return; }
    finishRef.current = setTimeout(() => { finishRef.current = null; finalize(); }, FINISH_TIMEOUT_MS);
    try { rec.stop(); } catch { finalize(); }
  }, [finalize, releaseAudio, setStatus]);

  const cancel = useCallback(() => {
    if (statusRef.current === "idle") return;
    releaseAll();
    textRef.current = { committed: "", final: "", interim: "" };
    setPreview("");
    setSilent(false);
    setStatus("idle");
  }, [releaseAll, setStatus]);

  const clearError = useCallback(() => setError(null), []);

  // Leaving the page (unmount / route change) must never leave a live microphone behind.
  useEffect(() => releaseAll, [releaseAll]);

  return { status, preview, elapsedMs, analyser, error, silent, start, confirm, cancel, clearError };
}

export default useVoiceInput;
