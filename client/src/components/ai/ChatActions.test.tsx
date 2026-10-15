// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatWorkspace } from "./ChatWorkspace";
import { getComposerValue, typeInComposer } from "./composerTestUtils";
import { VOICE_NOTICE_KEY, type RecognitionResultLike } from "./voiceInput";

const encoder = new TextEncoder();
const sse = (events: unknown[]) => events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
const REPLY = "Use Kirchhoff's voltage law.\n\n[[SIM:circuits]]";

function streamResponse(text: string): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(sse([{ type: "delta", text }, { type: "done" }])));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

const requestBodies = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string) as { messages: { role: string; content: string; imageUrl?: string }[] });

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; },
    clear: () => data.clear(),
    getItem: (key: string) => data.get(key) ?? null,
    key: (index: number) => [...data.keys()][index] ?? null,
    removeItem: (key: string) => { data.delete(key); },
    setItem: (key: string, value: string) => { data.set(key, String(value)); },
  };
}

let fetchMock: ReturnType<typeof vi.fn>;
const win = window as unknown as Record<string, unknown>;

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
  fetchMock = vi.fn(async () => streamResponse(REPLY));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete win.SpeechRecognition;
  delete win.speechSynthesis;
  delete win.SpeechSynthesisUtterance;
});

const sendMessage = async (text: string, replies: number) => {
  typeInComposer(text);
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(screen.getAllByRole("link", { name: /Open in Interactive Simulator/ })).toHaveLength(replies));
};

describe("message actions", () => {
  it("copies the clean source of an answer, without the simulator marker, and confirms", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<ChatWorkspace lab="general" />);
    await sendMessage("what is kvl", 1);
    // The user's message has its own, separate copy button.
    const [userCopy, answerCopy] = screen.getAllByRole("button", { name: "Copy message" });
    await act(async () => { fireEvent.click(answerCopy); });
    expect(writeText).toHaveBeenCalledWith("Use Kirchhoff's voltage law.");
    expect(screen.getAllByText("Copied").length).toBeGreaterThan(0);
    await act(async () => { fireEvent.click(userCopy); });
    expect(writeText).toHaveBeenLastCalledWith("what is kvl");
  });

  it("regenerates only the latest answer, replacing it without a new user message", async () => {
    render(<ChatWorkspace lab="general" />);
    await sendMessage("first", 1);
    expect(screen.getAllByRole("button", { name: "Regenerate response" })).toHaveLength(1);
    await sendMessage("second", 2);
    // Two answers on screen, but only the newest can be regenerated.
    expect(screen.getAllByRole("button", { name: "Regenerate response" })).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Regenerate response" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const regenerated = requestBodies(fetchMock)[2];
    expect(regenerated.messages.map((m) => `${m.role}:${m.content.slice(0, 6)}`)).toEqual(["user:first", "model:Use Ki", "user:second"]);
    await waitFor(() => expect(screen.getAllByRole("link", { name: /Open in Interactive Simulator/ })).toHaveLength(2));
    expect(screen.getAllByText("second")).toHaveLength(1); // one user bubble, not a duplicate
    expect(document.querySelectorAll('[data-message-actions]')).toHaveLength(4);
  });

  it("has no read-aloud button where speech synthesis does not exist", async () => {
    render(<ChatWorkspace lab="general" />);
    await sendMessage("hi", 1);
    expect(screen.queryByRole("button", { name: "Read aloud" })).toBeNull();
  });

  it("reads an answer aloud and stops on a second click", async () => {
    const spoken: { text: string; lang: string }[] = [];
    const cancel = vi.fn();
    class Utterance { lang = ""; voice = null; onend: (() => void) | null = null; onerror: (() => void) | null = null; constructor(public text: string) {} }
    win.SpeechSynthesisUtterance = Utterance;
    win.speechSynthesis = {
      speak: (u: Utterance) => { spoken.push(u); },
      cancel,
      getVoices: () => [{ lang: "en-US", localService: true, name: "x" }],
    };
    render(<ChatWorkspace lab="general" />);
    await sendMessage("hi", 1);
    fireEvent.click(screen.getByRole("button", { name: "Read aloud" }));
    await waitFor(() => expect(spoken).toHaveLength(1));
    expect(spoken[0]).toMatchObject({ text: "Use Kirchhoff's voltage law.", lang: "en-US" });
    const stop = screen.getByRole("button", { name: "Stop reading" });
    expect(stop.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(stop);
    expect(screen.getByRole("button", { name: "Read aloud" })).toBeTruthy();
    expect(cancel).toHaveBeenCalled();
  });
});

class FakeRecognition {
  static last: FakeRecognition | null = null;
  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  onresult: ((e: { results: RecognitionResultLike[] }) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  constructor() { FakeRecognition.last = this; }
  start() {}
  stop() { queueMicrotask(() => this.onend?.()); }
  abort() {}
  say(text: string, isFinal = true) { this.onresult?.({ results: [{ isFinal, length: 1, 0: { transcript: text } }] }); }
}

describe("voice input in the composer", () => {
  let tracks: { readyState: string; stop: () => void }[];
  beforeEach(() => {
    tracks = [];
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => {
          const track = { readyState: "live", stop() { this.readyState = "ended"; } };
          tracks.push(track);
          return { getTracks: () => [track] };
        }),
      },
    });
  });

  it("appends the transcript after a draft that holds a formula, and sends one clean string", async () => {
    win.SpeechRecognition = FakeRecognition;
    localStorage.setItem(VOICE_NOTICE_KEY, "1");
    render(<ChatWorkspace lab="general" />);
    typeInComposer("integrate $x^2$ and");
    fireEvent.click(screen.getByRole("button", { name: "Dictate a message" }));
    await waitFor(() => expect(FakeRecognition.last).not.toBeNull());
    act(() => FakeRecognition.last?.say("explain each step", false));
    fireEvent.click(screen.getByRole("button", { name: "Stop and send" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(requestBodies(fetchMock)[0].messages).toEqual([expect.objectContaining({ role: "user", content: "integrate $x^2$ and explain each step" })]);
    FakeRecognition.last = null;
  });

  it("brings the draft's formula back as a math node after the recording is cancelled", async () => {
    win.SpeechRecognition = FakeRecognition;
    localStorage.setItem(VOICE_NOTICE_KEY, "1");
    render(<ChatWorkspace lab="general" />);
    typeInComposer("keep $x^2$ here");
    fireEvent.click(screen.getByRole("button", { name: "Dictate a message" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel recording" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Cancel recording" }));
    expect(document.querySelectorAll("[data-math-input] [data-mae-math]")).toHaveLength(1);
    expect(getComposerValue()).toBe("keep $x^2$ here");
    FakeRecognition.last = null;
  });

  it("shows no microphone button where speech recognition is missing", () => {
    render(<ChatWorkspace lab="general" />);
    expect(screen.queryByRole("button", { name: "Dictate a message" })).toBeNull();
  });

  it("asks once for consent, then transcribes, shows the live text and sends on confirm", async () => {
    win.SpeechRecognition = FakeRecognition;
    render(<ChatWorkspace lab="general" />);
    const mic = screen.getByRole("button", { name: "Dictate a message" });
    expect(mic.className).toContain("h-11");

    fireEvent.click(mic);
    expect(screen.getByText(/Google's/)).toBeTruthy();
    expect(FakeRecognition.last).toBeNull(); // nothing is recorded before consent
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(localStorage.getItem(VOICE_NOTICE_KEY)).toBe("1");
    await waitFor(() => expect(FakeRecognition.last).not.toBeNull());
    expect(FakeRecognition.last?.lang).toBe("en-US");

    act(() => FakeRecognition.last?.say("explain root locus", false));
    expect(screen.getByText("explain root locus")).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Message MAE AI" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Stop and send" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(requestBodies(fetchMock)[0].messages).toEqual([expect.objectContaining({ role: "user", content: "explain root locus" })]);
    await screen.findByRole("link", { name: /Open in Interactive Simulator/ });
    expect(tracks.every((t) => t.readyState === "ended")).toBe(true);
  });

  it("does not show the notice again once accepted, and Escape cancels while keeping the draft", async () => {
    win.SpeechRecognition = FakeRecognition;
    localStorage.setItem(VOICE_NOTICE_KEY, "1");
    render(<ChatWorkspace lab="general" />);
    typeInComposer("my draft");
    fireEvent.click(screen.getByRole("button", { name: "Dictate a message" }));
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel recording" })).toBeTruthy());
    act(() => FakeRecognition.last?.say("never sent"));
    fireEvent.keyDown(screen.getByRole("button", { name: "Cancel recording" }).parentElement!.parentElement!, { key: "Escape" });
    expect(getComposerValue()).toBe("my draft");
    expect(fetchMock).not.toHaveBeenCalled();
    await waitFor(() => expect(tracks.every((t) => t.readyState === "ended")).toBe(true));
  });

  it("does not send when nothing was heard and says so", async () => {
    win.SpeechRecognition = FakeRecognition;
    localStorage.setItem(VOICE_NOTICE_KEY, "1");
    render(<ChatWorkspace lab="general" />);
    fireEvent.click(screen.getByRole("button", { name: "Dictate a message" }));
    await waitFor(() => expect(FakeRecognition.last).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Stop and send" }));
    expect(await screen.findByText(/I didn't catch that/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("explains a blocked microphone", async () => {
    win.SpeechRecognition = FakeRecognition;
    localStorage.setItem(VOICE_NOTICE_KEY, "1");
    render(<ChatWorkspace lab="general" />);
    fireEvent.click(screen.getByRole("button", { name: "Dictate a message" }));
    await waitFor(() => expect(FakeRecognition.last).not.toBeNull());
    act(() => FakeRecognition.last?.onerror?.({ error: "not-allowed" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Microphone access is blocked/);
    expect(tracks.every((t) => t.readyState === "ended")).toBe(true);
  });
});
