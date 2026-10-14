/** Pure helpers for voice input: feature detection, language mapping, transcript assembly, timer formatting, error mapping. */

/** The minimal slice of the Web Speech API this feature uses (the DOM lib does not ship these types). */
export interface RecognitionAlternativeLike {
  transcript: string;
}
export interface RecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: RecognitionAlternativeLike;
}
export interface RecognitionEventLike {
  resultIndex?: number;
  results: ArrayLike<RecognitionResultLike>;
}
export interface RecognitionErrorEventLike {
  error: string;
}
export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: ((event: RecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  onstart?: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
export type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

type SpeechWindow = { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };

/** The browser's recognition constructor (standard or webkit-prefixed), or null where there is none (Firefox, some in-app browsers). */
export function getSpeechRecognitionCtor(target: SpeechWindow | undefined = typeof window === "undefined" ? undefined : (window as unknown as SpeechWindow)): SpeechRecognitionCtor | null {
  if (!target) return null;
  return target.SpeechRecognition ?? target.webkitSpeechRecognition ?? null;
}

/** Voice input needs both transcription and a microphone API; without either the button is not rendered. */
export function isVoiceInputSupported(
  target: SpeechWindow | undefined = typeof window === "undefined" ? undefined : (window as unknown as SpeechWindow),
  nav: { mediaDevices?: { getUserMedia?: unknown } } | undefined = typeof navigator === "undefined" ? undefined : navigator,
): boolean {
  return getSpeechRecognitionCtor(target) !== null && typeof nav?.mediaDevices?.getUserMedia === "function";
}

/** UI language (`en`, `ar-EG`, `es_MX`...) to a recognition BCP 47 tag. Unknown languages fall back to English. */
export function recognitionLang(uiLang: string | undefined | null): string {
  const base = (uiLang ?? "").toLowerCase().split(/[-_]/)[0];
  if (base === "ar") return "ar-SA";
  if (base === "es") return "es-ES";
  return "en-US";
}

export interface TranscriptParts {
  /** Finalized text of this recognition session. */
  final: string;
  /** Still-changing text after the final part. */
  interim: string;
}

/** Joins two text pieces with exactly one space (no space when either side is empty). */
export function joinText(a: string, b: string): string {
  const left = a.trimEnd();
  const right = b.trim();
  if (!left) return right;
  if (!right) return left;
  return `${left} ${right}`;
}

/**
 * Builds the session transcript from every result the recognizer has reported so far. Final results are concatenated
 * (an identical consecutive final is dropped: Android Chrome is known to repeat them); non-final ones form the interim tail.
 */
export function assembleTranscript(results: ArrayLike<RecognitionResultLike>): TranscriptParts {
  let final = "";
  let interim = "";
  let lastFinal = "";
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const text = (result[0]?.transcript ?? "").trim();
    if (!text) continue;
    if (result.isFinal) {
      if (text === lastFinal) continue;
      lastFinal = text;
      final = joinText(final, text);
    } else {
      interim = joinText(interim, text);
    }
  }
  return { final, interim };
}

/** `m:ss` style `mm:ss`, from milliseconds. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export type VoiceErrorKind = "blocked" | "noMic" | "network" | "language" | "failed";

/**
 * Maps a SpeechRecognition `error` code. `fatal` ends the recording; `no-speech` is only a hint and `aborted` is ignored
 * (it is what our own abort() produces).
 */
export function mapRecognitionError(code: string): { kind: VoiceErrorKind | "noSpeech" | null; fatal: boolean } {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return { kind: "blocked", fatal: true };
    case "audio-capture":
      return { kind: "noMic", fatal: true };
    case "network":
      return { kind: "network", fatal: true };
    case "language-not-supported":
      return { kind: "language", fatal: true };
    case "no-speech":
      return { kind: "noSpeech", fatal: false };
    case "aborted":
      return { kind: null, fatal: false };
    default:
      return { kind: "failed", fatal: true };
  }
}

/** Maps a getUserMedia rejection to an error kind. */
export function mapMediaError(error: unknown): VoiceErrorKind {
  const name = (error as { name?: string } | null)?.name ?? "";
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") return "blocked";
  if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "NotReadableError") return "noMic";
  return "failed";
}

/** Clamps a transcript to `max` characters, cutting at a word boundary when one is close. */
export function truncateTranscript(text: string, max: number): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  const clean = space > max * 0.8 ? cut.slice(0, space) : cut;
  return { text: clean.trimEnd(), truncated: true };
}

/* ---- waveform math ---- */

/**
 * Turns an analyser's byte frequency data into `bars` smoothed levels in 0..1. Uses the lower 60% of the bins (speech lives
 * there) and eases each bar toward its target so the motion stays calm; `previous` is the last frame's levels.
 */
export function barLevels(data: ArrayLike<number>, bars: number, previous: readonly number[] = [], ease = 0.35): number[] {
  const usable = Math.max(1, Math.floor(data.length * 0.6));
  const out: number[] = [];
  for (let i = 0; i < bars; i++) {
    const from = Math.floor((i / bars) * usable);
    const to = Math.max(from + 1, Math.floor(((i + 1) / bars) * usable));
    let sum = 0;
    for (let j = from; j < to; j++) sum += data[j] ?? 0;
    const target = Math.min(1, sum / (to - from) / 255);
    const before = previous[i] ?? 0;
    out.push(before + (target - before) * ease);
  }
  return out;
}

/** Mean level 0..1 of a byte array, for the reduced-motion meter. */
export function meanLevel(data: ArrayLike<number>): number {
  if (data.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i];
  return Math.min(1, sum / data.length / 255);
}

/* ---- first-use privacy notice ---- */

export const VOICE_NOTICE_KEY = "mae-ai:voice-notice:v1";

export function hasAcceptedVoiceNotice(): boolean {
  try {
    return localStorage.getItem(VOICE_NOTICE_KEY) === "1";
  } catch {
    return false;
  }
}

export function acceptVoiceNotice(): void {
  try {
    localStorage.setItem(VOICE_NOTICE_KEY, "1");
  } catch {
    /* private mode: the notice simply shows again next time */
  }
}
