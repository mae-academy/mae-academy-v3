// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useVoiceInput } from "./useVoiceInput";
import type { RecognitionResultLike } from "./voiceInput";

const res = (transcript: string, isFinal: boolean): RecognitionResultLike => ({ isFinal, length: 1, 0: { transcript } });

class FakeRecognition {
  static instances: FakeRecognition[] = [];
  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  onresult: ((e: { results: RecognitionResultLike[] }) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  started = 0;
  stopped = 0;
  aborted = 0;
  constructor() { FakeRecognition.instances.push(this); }
  start() { this.started++; }
  stop() { this.stopped++; }
  abort() { this.aborted++; }
  say(results: RecognitionResultLike[]) { this.onresult?.({ results }); }
  end() { this.onend?.(); }
}

const tracks: { readyState: string; stop: () => void }[] = [];
const closes = vi.fn(async () => {});
class FakeAudioContext {
  state = "running";
  createAnalyser() { return { fftSize: 0, smoothingTimeConstant: 0, frequencyBinCount: 128, getByteFrequencyData() {} }; }
  createMediaStreamSource() { return { connect() {} }; }
  async resume() {}
  close = closes;
}

let getUserMedia: ReturnType<typeof vi.fn>;
const win = window as unknown as Record<string, unknown>;

beforeEach(() => {
  vi.useFakeTimers();
  FakeRecognition.instances = [];
  tracks.length = 0;
  closes.mockClear();
  getUserMedia = vi.fn(async () => {
    const track = { readyState: "live", stop() { this.readyState = "ended"; } };
    tracks.push(track);
    return { getTracks: () => [track] } as unknown as MediaStream;
  });
  win.SpeechRecognition = FakeRecognition;
  win.AudioContext = FakeAudioContext;
  Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia }, configurable: true });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete win.SpeechRecognition;
  delete win.AudioContext;
});

const setup = (lang = "en-US") => {
  const onResult = vi.fn();
  const onActivity = vi.fn();
  const hook = renderHook(() => useVoiceInput({ lang, onResult, onActivity }));
  return { ...hook, onResult, onActivity };
};
const flush = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(0); }); };

describe("useVoiceInput", () => {
  it("starts recognition with the language, interim results and continuous mode, and opens the mic with echo cancellation", async () => {
    const { result, onActivity } = setup("ar-SA");
    act(() => result.current.start());
    await flush();
    const rec = FakeRecognition.instances[0];
    expect(rec).toMatchObject({ lang: "ar-SA", continuous: true, interimResults: true, started: 1 });
    expect(getUserMedia).toHaveBeenCalledWith({ audio: { echoCancellation: true, noiseSuppression: true } });
    expect(result.current.status).toBe("recording");
    expect(result.current.analyser).not.toBeNull();
    expect(onActivity).toHaveBeenCalled();
  });

  it("shows interim then final text and ticks the timer", async () => {
    const { result } = setup();
    act(() => result.current.start());
    await flush();
    act(() => FakeRecognition.instances[0].say([res("مرحبا", false)]));
    expect(result.current.preview).toBe("مرحبا");
    act(() => FakeRecognition.instances[0].say([res("مرحبا بك", true), res("كيف", false)]));
    expect(result.current.preview).toBe("مرحبا بك كيف");
    await act(async () => { await vi.advanceTimersByTimeAsync(3100); });
    expect(result.current.elapsedMs).toBeGreaterThanOrEqual(3000);
  });

  it("confirm stops everything, delivers the transcript once (interim included) and ends the mic tracks", async () => {
    const { result, onResult } = setup();
    act(() => result.current.start());
    await flush();
    const rec = FakeRecognition.instances[0];
    act(() => rec.say([res("what is KVL", true), res("in a loop", false)]));
    act(() => result.current.confirm());
    expect(tracks.every((t) => t.readyState === "ended")).toBe(true);
    expect(closes).toHaveBeenCalled();
    expect(rec.stopped).toBe(1);
    act(() => rec.say([res("what is KVL in a loop", true)])); // the last final result arrives after stop()
    act(() => rec.end());
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult).toHaveBeenCalledWith("what is KVL in a loop");
    expect(result.current.status).toBe("idle");
  });

  it("falls back to the text it has when the recognizer never reports its end", async () => {
    const { result, onResult } = setup();
    act(() => result.current.start());
    await flush();
    act(() => FakeRecognition.instances[0].say([res("hello", true)]));
    act(() => result.current.confirm());
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(onResult).toHaveBeenCalledWith("hello");
  });

  it("delivers an empty transcript when nothing was heard", async () => {
    const { result, onResult } = setup();
    act(() => result.current.start());
    await flush();
    act(() => result.current.confirm());
    act(() => FakeRecognition.instances[0].end());
    expect(onResult).toHaveBeenCalledWith("");
  });

  it("cancel discards the text, aborts recognition, ends tracks and never calls onResult", async () => {
    const { result, onResult } = setup();
    act(() => result.current.start());
    await flush();
    const rec = FakeRecognition.instances[0];
    act(() => rec.say([res("secret", true)]));
    act(() => result.current.cancel());
    expect(rec.aborted).toBe(1);
    expect(tracks.every((t) => t.readyState === "ended")).toBe(true);
    expect(result.current.status).toBe("idle");
    expect(result.current.preview).toBe("");
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(onResult).not.toHaveBeenCalled();
    expect(FakeRecognition.instances).toHaveLength(1);
  });

  it("releases the microphone on unmount", async () => {
    const { result, unmount } = setup();
    act(() => result.current.start());
    await flush();
    unmount();
    expect(tracks.every((t) => t.readyState === "ended")).toBe(true);
    expect(FakeRecognition.instances[0].aborted).toBe(1);
  });

  it("does not leak a stream whose permission resolves after cancel", async () => {
    let resolve!: (s: MediaStream) => void;
    getUserMedia.mockImplementationOnce(() => new Promise<MediaStream>((r) => { resolve = r; }));
    const { result } = setup();
    act(() => result.current.start());
    act(() => result.current.cancel());
    const track = { readyState: "live", stop() { this.readyState = "ended"; } };
    await act(async () => { resolve({ getTracks: () => [track] } as unknown as MediaStream); });
    expect(track.readyState).toBe("ended");
  });

  it("maps a blocked microphone to the blocked error and stops", async () => {
    getUserMedia.mockRejectedValueOnce(Object.assign(new Error("denied"), { name: "NotAllowedError" }));
    const { result, onResult } = setup();
    act(() => result.current.start());
    await flush();
    expect(result.current.error).toBe("blocked");
    expect(result.current.status).toBe("idle");
    expect(FakeRecognition.instances[0].aborted).toBe(1);
    expect(onResult).not.toHaveBeenCalled();
  });

  it("maps recognition errors; no-speech is only a hint", async () => {
    const { result } = setup();
    act(() => result.current.start());
    await flush();
    act(() => FakeRecognition.instances[0].onerror?.({ error: "no-speech" }));
    expect(result.current.silent).toBe(true);
    expect(result.current.status).toBe("recording");
    act(() => FakeRecognition.instances[0].say([res("hi", false)]));
    expect(result.current.silent).toBe(false);
    act(() => FakeRecognition.instances[0].onerror?.({ error: "network" }));
    expect(result.current.error).toBe("network");
    expect(result.current.status).toBe("idle");
    expect(tracks.every((t) => t.readyState === "ended")).toBe(true);
  });

  it("restarts after the engine ends by itself, keeping the earlier text, but not in a tight loop", async () => {
    const { result, onResult } = setup();
    act(() => result.current.start());
    await flush();
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    act(() => FakeRecognition.instances[0].say([res("first part", true)]));
    act(() => FakeRecognition.instances[0].end());
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    expect(FakeRecognition.instances).toHaveLength(2);
    act(() => FakeRecognition.instances[1].say([res("second part", true)]));
    expect(result.current.preview).toBe("first part second part");
    act(() => result.current.confirm());
    act(() => FakeRecognition.instances[1].end());
    expect(onResult).toHaveBeenCalledWith("first part second part");

    // A recognizer that dies instantly every time is given up on.
    const loop = setup();
    act(() => loop.result.current.start());
    await flush();
    for (let i = 0; i < 10 && loop.result.current.status === "recording"; i++) {
      act(() => FakeRecognition.instances[FakeRecognition.instances.length - 1].end());
      await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    }
    expect(loop.result.current.error).toBe("failed");
    expect(loop.result.current.status).toBe("idle");
  });
});
