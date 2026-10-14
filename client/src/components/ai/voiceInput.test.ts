import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  assembleTranscript,
  barLevels,
  formatElapsed,
  getSpeechRecognitionCtor,
  isVoiceInputSupported,
  joinText,
  mapMediaError,
  mapRecognitionError,
  meanLevel,
  recognitionLang,
  truncateTranscript,
  type RecognitionResultLike,
} from "./voiceInput";

const result = (transcript: string, isFinal: boolean): RecognitionResultLike => ({ isFinal, length: 1, 0: { transcript } });

describe("feature detection", () => {
  class Fake {}
  const nav = { mediaDevices: { getUserMedia: () => {} } };
  it("finds the standard or the webkit constructor", () => {
    expect(getSpeechRecognitionCtor({ SpeechRecognition: Fake as never })).toBe(Fake);
    expect(getSpeechRecognitionCtor({ webkitSpeechRecognition: Fake as never })).toBe(Fake);
    expect(getSpeechRecognitionCtor({})).toBeNull();
  });
  it("needs both recognition and getUserMedia", () => {
    expect(isVoiceInputSupported({ webkitSpeechRecognition: Fake as never }, nav)).toBe(true);
    expect(isVoiceInputSupported({}, nav)).toBe(false);
    expect(isVoiceInputSupported({ SpeechRecognition: Fake as never }, {})).toBe(false);
    expect(isVoiceInputSupported({ SpeechRecognition: Fake as never }, undefined)).toBe(false);
  });
});

describe("recognitionLang", () => {
  it("maps the UI language, ignoring region and case", () => {
    expect(recognitionLang("en")).toBe("en-US");
    expect(recognitionLang("ar")).toBe("ar-SA");
    expect(recognitionLang("ar-EG")).toBe("ar-SA");
    expect(recognitionLang("es_MX")).toBe("es-ES");
    expect(recognitionLang("ES")).toBe("es-ES");
    expect(recognitionLang("fr")).toBe("en-US");
    expect(recognitionLang(undefined)).toBe("en-US");
  });
});

describe("assembleTranscript", () => {
  it("separates final text from the interim tail", () => {
    expect(assembleTranscript([result("hello world", true), result("how are", false)])).toEqual({ final: "hello world", interim: "how are" });
    expect(assembleTranscript([])).toEqual({ final: "", interim: "" });
  });
  it("joins several finals with single spaces and drops empty segments", () => {
    expect(assembleTranscript([result(" one ", true), result("", true), result("two", true)]).final).toBe("one two");
  });
  it("drops an identical consecutive final (Android repeats them) but keeps real repeats separated by other text", () => {
    expect(assembleTranscript([result("what is KVL", true), result("what is KVL", true)]).final).toBe("what is KVL");
    expect(assembleTranscript([result("yes", true), result("no", true), result("yes", true)]).final).toBe("yes no yes");
  });
  it("keeps Arabic text intact", () => {
    expect(assembleTranscript([result("ما هو قانون كيرشوف", true), result("للجهد", false)])).toEqual({ final: "ما هو قانون كيرشوف", interim: "للجهد" });
  });
});

describe("joinText", () => {
  it("never doubles or drops the separator", () => {
    expect(joinText("a ", " b")).toBe("a b");
    expect(joinText("", "b")).toBe("b");
    expect(joinText("a", "")).toBe("a");
  });
});

describe("formatElapsed", () => {
  it("renders mm:ss", () => {
    expect(formatElapsed(0)).toBe("00:00");
    expect(formatElapsed(999)).toBe("00:00");
    expect(formatElapsed(65_400)).toBe("01:05");
    expect(formatElapsed(600_000)).toBe("10:00");
    expect(formatElapsed(-5)).toBe("00:00");
  });
});

describe("error mapping", () => {
  it("classifies recognition errors", () => {
    expect(mapRecognitionError("not-allowed")).toEqual({ kind: "blocked", fatal: true });
    expect(mapRecognitionError("service-not-allowed")).toEqual({ kind: "blocked", fatal: true });
    expect(mapRecognitionError("audio-capture")).toEqual({ kind: "noMic", fatal: true });
    expect(mapRecognitionError("network")).toEqual({ kind: "network", fatal: true });
    expect(mapRecognitionError("language-not-supported")).toEqual({ kind: "language", fatal: true });
    expect(mapRecognitionError("no-speech")).toEqual({ kind: "noSpeech", fatal: false });
    expect(mapRecognitionError("aborted")).toEqual({ kind: null, fatal: false });
    expect(mapRecognitionError("weird")).toEqual({ kind: "failed", fatal: true });
  });
  it("classifies getUserMedia rejections", () => {
    expect(mapMediaError({ name: "NotAllowedError" })).toBe("blocked");
    expect(mapMediaError({ name: "NotFoundError" })).toBe("noMic");
    expect(mapMediaError(new Error("x"))).toBe("failed");
    expect(mapMediaError(null)).toBe("failed");
  });
});

describe("truncateTranscript", () => {
  it("leaves short text alone and cuts long text at a word", () => {
    expect(truncateTranscript("short", 10)).toEqual({ text: "short", truncated: false });
    const out = truncateTranscript("aaaa bbbb cccc dddd", 15);
    expect(out.truncated).toBe(true);
    expect(out.text).toBe("aaaa bbbb cccc");
    expect(truncateTranscript("x".repeat(50), 10).text).toHaveLength(10);
  });
});

describe("waveform math", () => {
  it("produces one level per bar in 0..1 and eases toward the target", () => {
    const loud = new Uint8Array(128).fill(255);
    const first = barLevels(loud, 44);
    expect(first).toHaveLength(44);
    expect(first.every((v) => v > 0 && v <= 1)).toBe(true);
    const second = barLevels(loud, 44, first);
    expect(second[0]).toBeGreaterThan(first[0]);
    expect(barLevels(new Uint8Array(128), 44).every((v) => v === 0)).toBe(true);
  });
  it("meanLevel is the normalized average", () => {
    expect(meanLevel(new Uint8Array([255, 255]))).toBe(1);
    expect(meanLevel(new Uint8Array([0, 255]))).toBeCloseTo(0.5, 2);
    expect(meanLevel(new Uint8Array(0))).toBe(0);
  });
});

describe("Permissions-Policy", () => {
  it("lets the page itself use the microphone, which voice input needs, and nothing else", () => {
    const config = JSON.parse(readFileSync(new URL("../../../../vercel.json", import.meta.url), "utf8")) as { headers: { headers: { key: string; value: string }[] }[] };
    const value = config.headers.flatMap((h) => h.headers).find((h) => h.key === "Permissions-Policy")?.value ?? "";
    expect(value).toContain("microphone=(self)");
    expect(value).toContain("camera=()");
    expect(value).toContain("geolocation=()");
    expect(value).toContain("payment=()");
  });
});
