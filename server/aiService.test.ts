import { afterEach, describe, expect, it, vi } from "vitest";
import { AI_HISTORY_WINDOW, AI_MAX_IMAGE_BYTES, AI_MAX_MESSAGE_CHARS, SIM_MARKER_REGEX, splitSimMarker, type ChatMessage } from "../shared/aiTypes";
import {
  AiNotConfiguredError,
  AiRequestError,
  assertAiConfigured,
  buildContents,
  buildSystemInstruction,
  geminiApiKey,
  mockChatStream,
  mockReply,
  resolveAiMode,
  sanitizeChatRequest,
  windowMessages,
  withModelFallback,
} from "./aiService";

const PNG = "data:image/png;base64,iVBORw0KGgo=";
const msg = (n: number, role: "user" | "model", extra: Partial<ChatMessage> = {}): ChatMessage => ({ id: String(n), role, content: `m${n}`, timestamp: n, ...extra });
/** Alternating conversation u0 m1 u2 m3 ... of `count` messages. */
const convo = (count: number) => Array.from({ length: count }, (_, i) => msg(i, i % 2 === 0 ? "user" : "model"));
const refused = (body: unknown) => {
  try {
    sanitizeChatRequest(body);
  } catch (error) {
    expect(error).toBeInstanceOf(AiRequestError);
    return (error as Error).message;
  }
  throw new Error("expected sanitizeChatRequest to throw");
};

describe("history window", () => {
  it("keeps only the last AI_HISTORY_WINDOW messages", () => {
    const { messages } = sanitizeChatRequest({ messages: convo(11) }); // ends on a user turn (index 10)
    expect(messages.length).toBeLessThanOrEqual(AI_HISTORY_WINDOW);
    expect(messages[messages.length - 1].id).toBe("10");
    expect(messages.map((m) => m.id)).toEqual(["5", "6", "7", "8", "9", "10"].slice(-messages.length));
  });

  it("drops leading model turns after windowing", () => {
    // last 6 of an 11-message conversation start with index 5 (model)
    const windowed = windowMessages(convo(11));
    expect(windowed[0].role).toBe("user");
    expect(windowed.map((m) => m.id)).toEqual(["6", "7", "8", "9", "10"]);
  });

  it("rejects a conversation whose last turn is not the user's", () => {
    expect(refused({ messages: convo(4) })).toMatch(/last message/i);
  });

  it("keeps only the most recent image", () => {
    const messages = [msg(0, "user", { imageUrl: PNG }), msg(1, "model"), msg(2, "user", { imageUrl: PNG }), msg(3, "model"), msg(4, "user")];
    const contents = buildContents(sanitizeChatRequest({ messages }).messages);
    const withImage = contents.map((c, i) => (c.parts.some((p) => p.inlineData) ? i : -1)).filter((i) => i >= 0);
    expect(withImage).toEqual([2]);
    expect(contents[2].parts[0].inlineData).toEqual({ mimeType: "image/png", data: "iVBORw0KGgo=" });
  });

  it("never emits an empty part list for an old image-only message", () => {
    const messages = [msg(0, "user", { imageUrl: PNG, content: "" }), msg(1, "model"), msg(2, "user", { imageUrl: PNG })];
    for (const c of buildContents(sanitizeChatRequest({ messages }).messages)) expect(c.parts.length).toBeGreaterThan(0);
  });

  it("maps roles to Gemini roles and starts and ends on a user turn", () => {
    const contents = buildContents(sanitizeChatRequest({ messages: convo(5) }).messages);
    expect(contents.map((c) => c.role)).toEqual(["user", "model", "user", "model", "user"]);
  });
});

describe("validation", () => {
  it("rejects non-object bodies and empty message lists", () => {
    refused(null);
    refused("hi");
    refused({});
    refused({ messages: [] });
  });

  it("rejects an unknown role", () => {
    refused({ messages: [{ ...msg(0, "user"), role: "system" }] });
  });

  it("rejects overlong content", () => {
    refused({ messages: [msg(0, "user", { content: "x".repeat(AI_MAX_MESSAGE_CHARS + 1) })] });
  });

  it("rejects non-image or unsupported data URLs", () => {
    refused({ messages: [msg(0, "user", { imageUrl: "data:image/gif;base64,R0lGOD==" })] });
    refused({ messages: [msg(0, "user", { imageUrl: "data:text/html;base64,PGI+" })] });
    refused({ messages: [msg(0, "user", { imageUrl: "https://example.com/a.png" })] });
  });

  it("rejects an image over the decoded size cap and accepts one at the cap", () => {
    const big = `data:image/jpeg;base64,${"A".repeat(Math.ceil((AI_MAX_IMAGE_BYTES * 4) / 3) + 8)}`;
    expect(refused({ messages: [msg(0, "user", { imageUrl: big })] })).toMatch(/too large/i);
    const ok = `data:image/jpeg;base64,${"A".repeat(Math.floor(AI_MAX_IMAGE_BYTES / 3) * 4)}`;
    expect(sanitizeChatRequest({ messages: [msg(0, "user", { imageUrl: ok })] }).messages).toHaveLength(1);
  });

  it("falls back to the general lab for unknown or missing lab values", () => {
    expect(sanitizeChatRequest({ messages: [msg(0, "user")], lab: "bogus" }).lab).toBe("general");
    expect(sanitizeChatRequest({ messages: [msg(0, "user")] }).lab).toBe("general");
    expect(sanitizeChatRequest({ messages: [msg(0, "user")], lab: "fluid" }).lab).toBe("fluid");
  });
});

describe("system instruction", () => {
  const prompt = buildSystemInstruction("general");

  it("demands dollar-delimited LaTeX and forbids the bracket forms", () => {
    expect(prompt).toContain("$...$");
    expect(prompt).toContain("$$...$$");
    expect(prompt).toMatch(/Never use \\\( \\\) or \\\[ \\\]/);
  });

  it("tells the model to label nodes read from a schematic and admit unreadable parts", () => {
    expect(prompt).toMatch(/label the nodes/i);
    expect(prompt).toMatch(/unreadable/i);
  });

  it("refuses off-topic questions and answers in the user's language", () => {
    expect(prompt).toMatch(/decline/i);
    expect(prompt).toMatch(/language the student writes in/i);
  });

  it("appends a lab-specific hint", () => {
    expect(buildSystemInstruction("fluid")).toMatch(/pneumatics and hydraulics/);
    expect(buildSystemInstruction("arduino")).toMatch(/arduino/);
  });

  it("states the simulator marker contract with every lab and its restrictions", () => {
    expect(prompt).toContain("[[SIM:<lab>]]");
    expect(prompt).toContain("circuits|power|logic|control|code|arduino|signals|fluid|plc");
    expect(prompt).toMatch(/exactly one final line, alone on its own line/);
    expect(prompt).toMatch(/Never add the marker to general chat, refusals, or purely conceptual theory/);
    expect(prompt).toMatch(/never put it inside a code fence/);
  });

  it("tells the model to infer the sub-domain itself", () => {
    expect(prompt).toMatch(/Infer the engineering sub-domain/);
  });
});

describe("key and mode resolution", () => {
  const live = { GEMINI_API_KEY: "abc" } as NodeJS.ProcessEnv;

  it("trims the key and treats empty or whitespace-only values as missing", () => {
    expect(geminiApiKey({ GEMINI_API_KEY: "  abc \n" } as NodeJS.ProcessEnv)).toBe("abc");
    expect(geminiApiKey({ GEMINI_API_KEY: "" } as NodeJS.ProcessEnv)).toBeUndefined();
    expect(geminiApiKey({ GEMINI_API_KEY: "  \t" } as NodeJS.ProcessEnv)).toBeUndefined();
    expect(geminiApiKey({} as NodeJS.ProcessEnv)).toBeUndefined();
  });

  it("uses the live model whenever a key exists, even in production", () => {
    expect(resolveAiMode(live)).toBe("live");
    expect(resolveAiMode({ ...live, NODE_ENV: "production" })).toBe("live");
    expect(resolveAiMode({ ...live, VERCEL: "1" })).toBe("live");
  });

  it("serves the demo only in dev without a key", () => {
    expect(resolveAiMode({} as NodeJS.ProcessEnv)).toBe("mock");
    expect(resolveAiMode({ NODE_ENV: "development" } as NodeJS.ProcessEnv)).toBe("mock");
    expect(resolveAiMode({ NODE_ENV: "test", GEMINI_API_KEY: "   " } as NodeJS.ProcessEnv)).toBe("mock");
  });

  it("fails closed in production or on Vercel without a key", () => {
    expect(resolveAiMode({ NODE_ENV: "production" } as NodeJS.ProcessEnv)).toBe("unconfigured");
    expect(resolveAiMode({ NODE_ENV: "production", GEMINI_API_KEY: " " } as NodeJS.ProcessEnv)).toBe("unconfigured");
    expect(resolveAiMode({ VERCEL: "1" } as NodeJS.ProcessEnv)).toBe("unconfigured");
    expect(resolveAiMode({ NODE_ENV: "development", VERCEL: "1" } as NodeJS.ProcessEnv)).toBe("unconfigured");
  });

  describe("assertAiConfigured", () => {
    afterEach(() => vi.unstubAllEnvs());

    it("reads process.env at call time", () => {
      vi.stubEnv("VERCEL", "");
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("GEMINI_API_KEY", "");
      expect(assertAiConfigured()).toBe("mock");
      vi.stubEnv("GEMINI_API_KEY", "k");
      expect(assertAiConfigured()).toBe("live");
    });

    it("throws AiNotConfiguredError in production without a key", () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("GEMINI_API_KEY", "  ");
      expect(() => assertAiConfigured()).toThrow(AiNotConfiguredError);
    });
  });
});

describe("demo stream", () => {
  const request = (content: string, extra: Partial<ChatMessage> = {}) => sanitizeChatRequest({ messages: [msg(0, "user", { content, ...extra })] });
  const collect = async (content: string) => {
    const chunks: string[] = [];
    for await (const chunk of mockChatStream(request(content))) chunks.push(chunk);
    return chunks;
  };

  it("picks a reply by keyword and ends with the matching marker", () => {
    const cases: Array<[string, string, RegExp]> = [
      ["Analyze this KVL circuit", "circuits", /\$\$.*\$\$/],
      ["what does this resistor network do", "circuits", /\$/],
      ["sketch the root locus", "control", /\$\$/],
      ["tune a PID for my transfer function", "control", /\$/],
      ["design a buck converter", "power", /\\frac\{V_o\}\{V_\{in\}\}/],
      ["blink an led on arduino", "arduino", /```cpp/],
      ["write c++ code to sum an array", "code", /```cpp/],
      ["simplify this boolean logic gate expression", "logic", /\$\$/],
    ];
    for (const [prompt, lab, shape] of cases) {
      const reply = mockReply(prompt);
      expect(reply, prompt).toMatch(shape);
      expect(splitSimMarker(reply).lab, prompt).toBe(lab);
      expect(reply.startsWith("*Demo mode")).toBe(true);
      expect(reply.match(/\[\[SIM:/g)).toHaveLength(1);
    }
  });

  it("gives the default reply no marker, and mentions images only when one was attached", () => {
    const plain = mockReply("hello there");
    expect(splitSimMarker(plain).lab).toBeNull();
    expect(plain).not.toMatch(/image/i);
    expect(mockReply("hello there", true)).toMatch(/images? needs the real/i);
  });

  it("streams several chunks that rebuild the full reply, ending with the marker", async () => {
    for (const prompt of ["Analyze this KVL circuit", "Find the root locus of this transfer function"]) {
      const chunks = await collect(prompt);
      expect(chunks.length).toBeGreaterThanOrEqual(2);
      expect(chunks.join("")).toBe(mockReply(prompt));
      expect(SIM_MARKER_REGEX.test(chunks.join(""))).toBe(true);
    }
  });

  it("never exposes a half-streamed marker once split", async () => {
    const chunks = await collect("Analyze this KVL circuit");
    let text = "";
    for (const chunk of chunks) {
      text += chunk;
      expect(splitSimMarker(text).text).not.toContain("[[");
    }
    expect(chunks.slice(-2).join("")).toBe("[[SIM:circuits]]");
  });

  it("reads the last user message, and passes the image flag through", async () => {
    const chunks: string[] = [];
    const sanitized = sanitizeChatRequest({ messages: [msg(0, "user", { content: "circuit?" }), msg(1, "model"), msg(2, "user", { content: "hi", imageUrl: PNG })] });
    for await (const chunk of mockChatStream(sanitized)) chunks.push(chunk);
    expect(chunks.join("")).toBe(mockReply("hi", true));
  });

  it("stops promptly when aborted", async () => {
    const abort = new AbortController();
    const chunks: string[] = [];
    for await (const chunk of mockChatStream(request("Analyze this KVL circuit"), abort.signal)) {
      chunks.push(chunk);
      abort.abort();
    }
    expect(chunks).toHaveLength(1);
    const pre = new AbortController();
    pre.abort();
    const none: string[] = [];
    for await (const chunk of mockChatStream(request("Analyze this KVL circuit"), pre.signal)) none.push(chunk);
    expect(none).toHaveLength(0);
  });

  it("warns only once", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await collect("hi");
    await collect("hi again");
    // Earlier tests may already have used the demo stream, so this is 0 or 1 but never 2.
    expect(warn.mock.calls.length).toBeLessThanOrEqual(1);
    warn.mockRestore();
  });
});

describe("splitSimMarker", () => {
  it("strips a complete trailing marker and returns the lab", () => {
    expect(splitSimMarker("Answer.\n[[SIM:circuits]]")).toEqual({ text: "Answer.", lab: "circuits" });
    expect(splitSimMarker("Answer.\n\n[[SIM:plc]]\n")).toEqual({ text: "Answer.", lab: "plc" });
    expect(splitSimMarker("[[SIM:fluid]]")).toEqual({ text: "", lab: "fluid" });
    for (const lab of ["circuits", "power", "logic", "control", "code", "arduino", "signals", "fluid", "plc"]) {
      expect(splitSimMarker(`x\n[[SIM:${lab}]]`).lab).toBe(lab);
    }
  });

  it("handles CRLF line endings", () => {
    expect(splitSimMarker("Answer.\r\n[[SIM:control]]\r\n")).toEqual({ text: "Answer.", lab: "control" });
  });

  it("strips a trailing partial marker so streaming never shows half of it", () => {
    for (const tail of ["[", "[[", "[[S", "[[SI", "[[SIM", "[[SIM:", "[[SIM:con", "[[SIM:circuits", "[[SIM:circuits]"]) {
      expect(splitSimMarker(`Answer.\n${tail}`), tail).toEqual({ text: "Answer.", lab: null });
      expect(splitSimMarker(`Answer. ${tail}`), tail).toEqual({ text: "Answer.", lab: null });
    }
  });

  it("leaves a marker in the middle of the text alone", () => {
    const text = "See [[SIM:circuits]] above.\nMore text.";
    expect(splitSimMarker(text)).toEqual({ text, lab: null });
    const followed = "[[SIM:logic]]\nand then more";
    expect(splitSimMarker(followed)).toEqual({ text: followed, lab: null });
  });

  it("only strips the final marker when there are two", () => {
    expect(splitSimMarker("a\n[[SIM:power]]\nb\n[[SIM:logic]]")).toEqual({ text: "a\n[[SIM:power]]\nb", lab: "logic" });
  });

  it("does not match unknown labs, wrong case, or look-alike prose", () => {
    for (const text of ["x\n[[SIM:bogus]]", "x\n[[SIM:general]]", "x\n[[sim:circuits]]", "x\n[SIM:circuits]", "array a[", "a[[", "x\n[[SIM:circuits]] trailing"]) {
      expect(splitSimMarker(text), text).toEqual({ text, lab: null });
    }
  });

  it("returns plain text unchanged", () => {
    expect(splitSimMarker("")).toEqual({ text: "", lab: null });
    expect(splitSimMarker("Just an answer.\n")).toEqual({ text: "Just an answer.\n", lab: null });
  });
});

describe("withModelFallback", () => {
  const upstream = (status: number) => Object.assign(new Error(`upstream ${status}`), { status });
  const noSleep = async () => {};

  it("returns the first success without retrying", async () => {
    const attempt = vi.fn(async (model: string) => model);
    await expect(withModelFallback(["a", "a", "b"], attempt, { sleep: noSleep })).resolves.toBe("a");
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("retries a 503 on the same model, then falls back to the last model", async () => {
    const seen: string[] = [];
    const attempt = async (model: string) => {
      seen.push(model);
      if (model !== "lite") throw upstream(503);
      return "ok";
    };
    await expect(withModelFallback(["main", "main", "lite"], attempt, { sleep: noSleep })).resolves.toBe("ok");
    expect(seen).toEqual(["main", "main", "lite"]);
  });

  it("pauses between attempts with a growing delay", async () => {
    const delays: number[] = [];
    const attempt = vi.fn().mockRejectedValueOnce(upstream(503)).mockRejectedValueOnce(upstream(500)).mockResolvedValue("ok");
    await withModelFallback(["a", "a", "b"], attempt, { delayMs: 100, sleep: async (ms) => void delays.push(ms) });
    expect(delays).toEqual([100, 200]);
  });

  it("throws the last error once every model has failed", async () => {
    const attempt = vi.fn(async () => {
      throw upstream(503);
    });
    await expect(withModelFallback(["a", "b"], attempt, { sleep: noSleep })).rejects.toMatchObject({ status: 503 });
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it("does not retry client or auth errors", async () => {
    for (const status of [400, 401, 403, 404, 429]) {
      const attempt = vi.fn(async () => {
        throw upstream(status);
      });
      await expect(withModelFallback(["a", "a", "b"], attempt, { sleep: noSleep })).rejects.toMatchObject({ status });
      expect(attempt).toHaveBeenCalledTimes(1);
    }
  });

  it("does not retry errors without a status, or after the request was aborted", async () => {
    const plain = vi.fn(async () => {
      throw new Error("network");
    });
    await expect(withModelFallback(["a", "b"], plain, { sleep: noSleep })).rejects.toThrow("network");
    expect(plain).toHaveBeenCalledTimes(1);

    const controller = new AbortController();
    controller.abort();
    const aborted = vi.fn(async () => {
      throw upstream(503);
    });
    await expect(withModelFallback(["a", "a", "b"], aborted, { signal: controller.signal, sleep: noSleep })).rejects.toMatchObject({ status: 503 });
    expect(aborted).toHaveBeenCalledTimes(1);
  });
});
