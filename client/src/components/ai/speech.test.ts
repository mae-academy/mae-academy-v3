import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { arabicRatio, chunkSentences, createSpeechController, detectSpeechLang, latexToSpoken, pickVoice, toSpokenText } from "./speech";

describe("latexToSpoken", () => {
  it("reads fractions, powers, roots and subscripts", () => {
    expect(latexToSpoken("\\frac{a}{b}")).toBe("a over b");
    expect(latexToSpoken("x^2")).toBe("x squared");
    expect(latexToSpoken("x^3")).toBe("x cubed");
    expect(latexToSpoken("x^{10}")).toBe("x to the power of 10");
    expect(latexToSpoken("\\sqrt{2}")).toBe("square root of 2");
    expect(latexToSpoken("V_{out}")).toBe("V sub out");
    expect(latexToSpoken("R_1")).toBe("R sub 1");
  });
  it("reads nested fractions and Greek letters, and Omega as ohms", () => {
    expect(latexToSpoken("\\frac{1}{\\frac{a}{b}}")).toBe("1 over a over b");
    expect(latexToSpoken("\\omega_0 = 2\\pi f")).toBe("omega sub 0 equals 2 pi f");
    expect(latexToSpoken("R = 10\\,\\Omega")).toBe("R equals 10 ohms");
    expect(latexToSpoken("10 Ω")).toBe("10 ohms");
  });
  it("never reads out a backslash for an unknown command", () => {
    expect(latexToSpoken("\\foo{x} + y")).not.toContain("\\");
    expect(latexToSpoken("\\left( x \\right)")).toBe("( x )");
  });
  it("speaks the operator words in the message language", () => {
    expect(latexToSpoken("\\frac{a}{b}", "ar")).toBe("a على b");
    expect(latexToSpoken("x^2", "es")).toBe("x al cuadrado");
    expect(latexToSpoken("R = 5\\Omega", "ar")).toContain("أوم");
  });
});

describe("toSpokenText", () => {
  it("strips markdown to plain sentences", () => {
    const md = "## Title\n\n- **Bold** and *italic* with `code`\n- [a link](https://x.y) ![img](a.png)\n\n> quoted";
    expect(toSpokenText(md)).toBe("Title\nBold and italic with code\na link\nquoted");
  });
  it("replaces code blocks with a short note and drops schematic fences and netlist JSON entirely", () => {
    const md = 'Before.\n\n```cpp\nint x = 1;\n```\n\n```schematic\n{"title":"x","parts":[]}\n```\n\nAfter.';
    const out = toSpokenText(md);
    expect(out).toContain("code block omitted");
    expect(out).not.toContain("int x");
    expect(out).not.toContain("title");
    expect(out).toMatch(/Before\.\ncode block omitted\.\nAfter\./);
  });
  it("handles an unclosed fence from a stopped stream", () => {
    expect(toSpokenText("Hi.\n\n```python\nprint(1)")).toBe("Hi.\ncode block omitted.");
  });
  it("converts inline and display math, including dollar delimiters", () => {
    expect(toSpokenText("Voltage is $V = \\frac{I}{R}$ here.")).toBe("Voltage is V equals I over R here.");
    expect(toSpokenText("$$x^2 + y^2$$")).toContain("x squared plus y squared");
    expect(toSpokenText("Use \\(a_1\\) and \\[b^2\\].")).toContain("a sub 1");
    expect(toSpokenText("It costs $5 and $6.")).toBe("It costs $5 and $6.");
  });
  it("flattens tables and drops the rule row", () => {
    const md = "| Part | Value |\n|------|-------|\n| R1 | 10k |";
    expect(toSpokenText(md)).toBe("Part, Value\nR1, 10k");
  });
  it("removes markers and generation tags", () => {
    expect(toSpokenText("Done.\n[[SIM:power]]")).toBe("Done.");
    expect(toSpokenText("Done. [GENERATE_IMAGE: a buck converter]")).toBe("Done.");
  });
});

describe("chunkSentences", () => {
  it("splits at sentence ends and keeps each piece under the limit", () => {
    expect(chunkSentences("One. Two! Three?")).toEqual(["One.", "Two!", "Three?"]);
    expect(chunkSentences("مرحبا بك. كيف حالك؟")).toEqual(["مرحبا بك.", "كيف حالك؟"]);
    const long = Array.from({ length: 80 }, (_, i) => `word${i}`).join(" ");
    const pieces = chunkSentences(long, 100);
    expect(pieces.length).toBeGreaterThan(3);
    expect(pieces.every((p) => p.length <= 100)).toBe(true);
    expect(pieces.join(" ")).toBe(long);
    expect(chunkSentences("   ")).toEqual([]);
  });
});

describe("language detection", () => {
  it("uses Arabic when more than 30% of the letters are Arabic script", () => {
    expect(arabicRatio("مرحبا")).toBe(1);
    expect(arabicRatio("hello")).toBe(0);
    expect(arabicRatio("123 !!")).toBe(0);
    expect(detectSpeechLang("ما هو قانون أوم؟", "en")).toBe("ar-SA");
    expect(detectSpeechLang("What is V = IR? ما", "en")).toBe("en-US");
    expect(detectSpeechLang("Hello", "es")).toBe("es-ES");
    expect(detectSpeechLang("", "ar")).toBe("ar-SA");
  });
});

const voice = (lang: string, localService = true, name = lang) => ({ lang, localService, name }) as SpeechSynthesisVoice;

describe("pickVoice", () => {
  it("prefers the exact tag, then the same language, preferring a local voice", () => {
    expect(pickVoice([voice("en-GB"), voice("ar-EG"), voice("ar-SA")], "ar-SA")?.lang).toBe("ar-SA");
    expect(pickVoice([voice("en-GB"), voice("ar-EG")], "ar-SA")?.lang).toBe("ar-EG");
    expect(pickVoice([voice("ar-EG", false, "remote"), voice("ar_AE", true, "local")], "ar-SA")?.name).toBe("local");
    expect(pickVoice([voice("en-US")], "ar-SA")).toBeNull();
    expect(pickVoice([], "en-US")).toBeNull();
  });
});

/* ---- controller with a mocked speechSynthesis ---- */

class FakeUtterance {
  lang = "";
  voice: SpeechSynthesisVoice | null = null;
  onend: (() => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  constructor(public text: string) {}
}

function makeSynth(voices: SpeechSynthesisVoice[] = [voice("en-US"), voice("ar-SA")]) {
  const spoken: FakeUtterance[] = [];
  const listeners = new Set<() => void>();
  const synth = {
    spoken,
    voices,
    speak: vi.fn((u: SpeechSynthesisUtterance) => { spoken.push(u as unknown as FakeUtterance); }),
    cancel: vi.fn(),
    getVoices: () => synth.voices,
    addEventListener: (_t: "voiceschanged", cb: () => void) => { listeners.add(cb); },
    removeEventListener: (_t: "voiceschanged", cb: () => void) => { listeners.delete(cb); },
    fireVoicesChanged: () => listeners.forEach((cb) => cb()),
  };
  return synth;
}
const controllerFor = (synth: ReturnType<typeof makeSynth>) => createSpeechController(() => synth, (text) => new FakeUtterance(text) as unknown as SpeechSynthesisUtterance);
const tick = () => vi.advanceTimersByTimeAsync(0);

describe("speech controller", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("speaks sentence chunks one after another, with the detected language and a matching voice", async () => {
    const synth = makeSynth();
    const speech = controllerFor(synth);
    speech.speak("m1", "ما هو قانون أوم؟ إنه V = IR.", "en");
    expect(speech.getSnapshot().speakingId).toBe("m1");
    await tick();
    expect(synth.spoken).toHaveLength(1);
    expect(synth.spoken[0].lang).toBe("ar-SA");
    expect(synth.spoken[0].voice?.lang).toBe("ar-SA");
    synth.spoken[0].onend?.();
    expect(synth.spoken).toHaveLength(2);
    synth.spoken[1].onend?.();
    expect(speech.getSnapshot().speakingId).toBeNull();
  });

  it("only one message speaks at a time: a second speak replaces the first", async () => {
    const synth = makeSynth();
    const speech = controllerFor(synth);
    speech.speak("a", "First message. More.", "en");
    await tick();
    speech.speak("b", "Second message.", "en");
    await tick();
    expect(speech.getSnapshot().speakingId).toBe("b");
    expect(synth.cancel).toHaveBeenCalledTimes(2);
    synth.spoken[0].onend?.(); // the cancelled first utterance reports in late and must be ignored
    expect(synth.spoken.map((u) => u.text)).toEqual(["First message.", "Second message."]);
  });

  it("stop cancels and clears the speaking id; late callbacks do nothing", async () => {
    const synth = makeSynth();
    const speech = controllerFor(synth);
    const seen: (string | null)[] = [];
    speech.subscribe(() => seen.push(speech.getSnapshot().speakingId));
    speech.speak("a", "One. Two.", "en");
    await tick();
    speech.stop();
    expect(speech.getSnapshot().speakingId).toBeNull();
    synth.spoken[0].onend?.();
    expect(synth.spoken).toHaveLength(1);
    expect(seen).toEqual(["a", null]);
  });

  it("waits briefly for voices that load asynchronously, then proceeds", async () => {
    const synth = makeSynth([]);
    const speech = controllerFor(synth);
    speech.speak("a", "Hello there.", "en");
    await tick();
    expect(synth.spoken).toHaveLength(0);
    synth.voices = [voice("en-US")];
    synth.fireVoicesChanged();
    await tick();
    expect(synth.spoken[0].voice?.lang).toBe("en-US");
  });

  it("still speaks with the language set when no voice matches, and reports a missing voice on error", async () => {
    const synth = makeSynth([voice("en-US")]);
    const speech = controllerFor(synth);
    const onProblem = vi.fn();
    speech.speak("a", "مرحبا بك.", "en", onProblem);
    await tick();
    expect(synth.spoken[0].lang).toBe("ar-SA");
    expect(synth.spoken[0].voice).toBeNull();
    synth.spoken[0].onerror?.({ error: "language-unavailable" });
    expect(onProblem).toHaveBeenCalledWith("voice");
    expect(speech.getSnapshot().speakingId).toBeNull();
  });

  it("treats cancellation errors as normal and other errors on a matched voice as failures", async () => {
    const synth = makeSynth();
    const speech = controllerFor(synth);
    const onProblem = vi.fn();
    speech.speak("a", "Hello.", "en", onProblem);
    await tick();
    synth.spoken[0].onerror?.({ error: "interrupted" });
    expect(onProblem).not.toHaveBeenCalled();
    synth.spoken[0].onerror?.({ error: "synthesis-failed" });
    expect(onProblem).toHaveBeenCalledWith("failed");
  });
});
