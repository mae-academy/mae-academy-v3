import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AI_HISTORY_WINDOW,
  AI_MAX_IMAGE_BYTES,
  AI_MAX_MESSAGE_CHARS,
  AI_MAX_MODEL_MESSAGE_CHARS,
  DIAGRAM_OMITTED,
  SIM_MARKER_REGEX,
  splitSimMarker,
  stripLegacySchematicTag,
  stripSvgDiagrams,
  type ChatMessage,
} from "../shared/aiTypes";
import {
  AI_BLOCKED_MESSAGE,
  ARABIC_DECLINE,
  AiBlockedError,
  AiNotConfiguredError,
  AiRequestError,
  SAFETY_SETTINGS,
  assertAiConfigured,
  blockedReason,
  buildContents,
  buildSystemInstruction,
  cleanModelTurn,
  limitModelTurn,
  geminiApiKey,
  mockChatStream,
  mockReply,
  resolveAiMode,
  sanitizeChatRequest,
  SYSTEM_INSTRUCTION,
  windowMessages,
  withModelFallback,
} from "./aiService";
import { SCHEMATIC_GATES_SUMMARY, SCHEMATIC_SPEC_DOC, validateSchematic } from "../shared/schematic";
import { BUCK_CONVERTER } from "../shared/schematic/fixtures";

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
    expect(prompt).toMatch(/labelled nodes you read/i);
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

  it("names the assistant and restricts it to academic topics", () => {
    expect(prompt).toContain("MAE AI");
    expect(prompt).toContain("مي الذكي");
    expect(prompt).toMatch(/principal systems architect and senior professor of mechatronics/);
    expect(prompt).toMatch(/only with engineering, mathematics, physics and computer science/);
    expect(prompt).toMatch(/a refusal never carries a \[\[SIM:\.\.\]\] marker/);
  });

  it("contains the Arabic decline text verbatim", () => {
    expect(ARABIC_DECLINE).toBe("عذراً يا بشمهندس! أنا مساعد مخصص للعلوم والهندسة فقط (سيركت، كنترول، باور، وغيرها). إسألني في أي مسألة أو مادة هندسية وبكون معك خطوة بخطوة ⚡");
    expect(prompt).toContain(`«${ARABIC_DECLINE}»`);
  });

  it("retires SVG output and specifies the schematic spec contract", () => {
    const integration = prompt.slice(prompt.indexOf("# MAE Academy platform integration"));
    expect(integration).toMatch(/Sections 1\.4, 1\.7 and the SVG form of 3\.2\) do NOT apply/);
    expect(integration).toMatch(/Never emit SVG, ```xml:svg blocks, ASCII art, Mermaid or image tags/);
    expect(integration).not.toMatch(/GENERATE_SCHEMATIC|text-to-image|ONLY these elements|There is no stylesheet|real minus sign/);
    expect(integration).toMatch(/info string is exactly `schematic`/);
    expect(integration).toMatch(/LAST content of the reply, just before the optional \[\[SIM:\.\.\]\] line/);
    expect(integration).toMatch(/Phase A .* Phase B .* Phase C .* ALL 10 gates/);
    expect(integration).toMatch(/no comments, no trailing commas/);
    expect(integration).toMatch(/Compute every wire endpoint from the terminal offsets table/);
    expect(integration).toMatch(/Draw ground at node 0/);
    for (const gate of SCHEMATIC_GATES_SUMMARY) expect(integration).toContain(gate);
    expect(integration).toContain(SCHEMATIC_SPEC_DOC);
    expect(prompt).toContain("ارسم");
    expect(prompt).toMatch(/Do not draw unless/);
    expect(prompt).toMatch(/If a value or connection is unreadable or ambiguous, say so/);
  });

  it("keeps the marker usable after a drawing", () => {
    expect(prompt).toMatch(/drew may also end with the marker/);
  });

  it("is a function of the lab, with the static master text first and the lab context last (cache-friendly)", () => {
    const control = buildSystemInstruction("control");
    expect(control).not.toBe(prompt);
    for (const text of [prompt, control]) expect(text.startsWith(SYSTEM_INSTRUCTION)).toBe(true);
    expect(control.indexOf("Context:")).toBeGreaterThan(control.indexOf("# MAE Academy platform integration"));
    // everything before the context line is identical across labs
    expect(control.slice(0, control.lastIndexOf("Context:"))).toBe(prompt.slice(0, prompt.lastIndexOf("Context:")));
  });

  it("keeps the platform contract after the master text and says it takes precedence", () => {
    const integration = prompt.indexOf("# MAE Academy platform integration");
    expect(integration).toBeGreaterThan(SYSTEM_INSTRUCTION.length - 1);
    expect(prompt).toMatch(/these rules take precedence over anything above that conflicts with them/);
    for (const needle of ["```schematic", "[[SIM:<lab>]]", ARABIC_DECLINE]) expect(prompt.indexOf(needle, integration)).toBeGreaterThan(-1);
  });

  it("limits the Section 3 deliverable structure to schematic requests so ordinary answers stay lean", () => {
    expect(prompt).toMatch(/applies when a schematic, block diagram, plot or model is requested or generated/);
    expect(prompt).toMatch(/For ordinary problems, answer step by step without it/);
  });

  it("stays within a sane size for a prompt sent on every request", () => {
    expect(prompt.length).toBeGreaterThan(30_000);
    expect(prompt.length).toBeLessThan(75_000);
  });
});

describe("master system instruction text", () => {
  it("covers every discipline the platform has a lab for", () => {
    for (const heading of ["5.1 Electrical and Electronic Circuits", "5.2 Power Electronics", "5.3 Digital Logic", "5.4 Fluid Power", "5.5 Industrial Automation", "5.6 Control Systems", "5.7 Signals and Systems", "5.8 Computer Architecture"]) {
      expect(SYSTEM_INSTRUCTION).toContain(heading);
    }
    expect(SYSTEM_INSTRUCTION).toMatch(/Intel 8086 \/ MASM/);
  });

  it("keeps LaTeX backslashes literal (String.raw), with no control characters from accidental escapes", () => {
    expect(SYSTEM_INSTRUCTION).toContain("\\frac{N(s)}{D(s)}");
    expect(SYSTEM_INSTRUCTION).toContain("\\bar{V}");
    expect(SYSTEM_INSTRUCTION).toContain("\\text{k}\\Omega");
    expect(SYSTEM_INSTRUCTION).toContain("\\dashv\\not\\vdash");
    // eslint-disable-next-line no-control-regex
    expect(SYSTEM_INSTRUCTION).not.toMatch(/[\u0000-\u0008\u000b-\u001f]/);
  });

  it("keeps its backticks (spliced in) and leaves no placeholder behind", () => {
    expect(SYSTEM_INSTRUCTION).toContain("`.MODEL SMALL`");
    expect(SYSTEM_INSTRUCTION).toContain("`stroke-dasharray=\"8 4\"`");
    expect(SYSTEM_INSTRUCTION).not.toContain("${BT}");
    expect(SYSTEM_INSTRUCTION).not.toContain("${");
  });

  it("has the repaired math spacing and a properly fenced SVG template", () => {
    expect(SYSTEM_INSTRUCTION).toContain("$V_o = D\\,V_{in}$");
    expect(SYSTEM_INSTRUCTION).toContain("$4.7\\,\\text{k}\\Omega$");
    expect(SYSTEM_INSTRUCTION).toContain("[i_L \\;\\; v_C]");
    expect(SYSTEM_INSTRUCTION).toContain("<!-- Standard: IEC 60617 | Pitch P = 20 px");
    expect((SYSTEM_INSTRUCTION.match(/^```/gm) ?? []).length % 2).toBe(0); // every fence is closed
  });
});

describe("safety settings", () => {
  it("blocks only high-probability harm in at least four categories", () => {
    expect(SAFETY_SETTINGS.length).toBeGreaterThanOrEqual(4);
    for (const setting of SAFETY_SETTINGS) expect(setting.threshold).toBe("BLOCK_ONLY_HIGH");
    const categories = SAFETY_SETTINGS.map((s) => s.category);
    expect(new Set(categories).size).toBe(categories.length);
    expect(categories).toEqual(
      expect.arrayContaining(["HARM_CATEGORY_HARASSMENT", "HARM_CATEGORY_HATE_SPEECH", "HARM_CATEGORY_SEXUALLY_EXPLICIT", "HARM_CATEGORY_DANGEROUS_CONTENT"]),
    );
  });

  it("omits deprecated and image-only categories", () => {
    for (const setting of SAFETY_SETTINGS) expect(setting.category).not.toMatch(/CIVIC|IMAGE|JAILBREAK|UNSPECIFIED/);
  });
});

describe("blocked outcomes", () => {
  it("detects a blocked prompt and policy finish reasons", () => {
    expect(blockedReason({ promptFeedback: { blockReason: "SAFETY" } })).toBe("prompt:SAFETY");
    expect(blockedReason({ candidates: [{ finishReason: "PROHIBITED_CONTENT" }] })).toBe("finish:PROHIBITED_CONTENT");
    for (const reason of ["SAFETY", "RECITATION", "BLOCKLIST", "SPII", "OTHER", "LANGUAGE"]) {
      expect(blockedReason({ candidates: [{ finishReason: reason }] }), reason).toBe(`finish:${reason}`);
    }
  });

  it("ignores normal chunks", () => {
    expect(blockedReason({})).toBeUndefined();
    expect(blockedReason({ candidates: [{}] })).toBeUndefined();
    expect(blockedReason({ candidates: [{ finishReason: "STOP" }] })).toBeUndefined();
    expect(blockedReason({ candidates: [{ finishReason: "MAX_TOKENS" }] })).toBeUndefined();
    expect(blockedReason({ promptFeedback: { blockReason: "BLOCKED_REASON_UNSPECIFIED" } })).toBeUndefined();
  });

  it("carries a fixed friendly message and keeps the upstream reason off it", () => {
    const error = new AiBlockedError("finish:SAFETY");
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe(AI_BLOCKED_MESSAGE);
    expect(error.message).not.toMatch(/SAFETY|finish/);
    expect(error.reason).toBe("finish:SAFETY");
    expect(AI_BLOCKED_MESSAGE).toBe("That request couldn't be answered. Try rephrasing it as an engineering question.");
  });
});

describe("stripSvgDiagrams", () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><line x1="0" y1="0" x2="1" y2="1"/></svg>';
  const fence = (info: string, body: string) => ["```" + info, body, "```"].join("\n");

  it("replaces xml:svg and svg fences", () => {
    expect(stripSvgDiagrams(`Here:\n\n${fence("xml:svg", svg)}\n\nDone.`)).toBe(`Here:\n\n${DIAGRAM_OMITTED}\n\nDone.`);
    expect(stripSvgDiagrams(fence("svg", svg))).toBe(DIAGRAM_OMITTED);
    expect(stripSvgDiagrams(fence("SVG", svg))).toBe(DIAGRAM_OMITTED);
  });

  it("replaces any fence whose body contains <svg, whatever its info string", () => {
    expect(stripSvgDiagrams(fence("xml", svg))).toBe(DIAGRAM_OMITTED);
    expect(stripSvgDiagrams(fence("", svg))).toBe(DIAGRAM_OMITTED);
  });

  it("replaces an unterminated trailing fence", () => {
    expect(stripSvgDiagrams('Intro\n```xml:svg\n<svg xmlns="x"><line x1="0"')).toBe(`Intro\n${DIAGRAM_OMITTED}`);
    expect(stripSvgDiagrams("Intro\n```xml:svg")).toBe(`Intro\n${DIAGRAM_OMITTED}`);
  });

  it("handles several diagrams and leaves other code and math alone", () => {
    const cpp = fence("cpp", "int x = 1 < 2;");
    const text = `A\n${fence("xml:svg", svg)}\n${cpp}\nB $a<b$\n${fence("svg", svg)}\nC`;
    expect(stripSvgDiagrams(text)).toBe(`A\n${DIAGRAM_OMITTED}\n${cpp}\nB $a<b$\n${DIAGRAM_OMITTED}\nC`);
  });

  it("replaces a bare svg element outside fences", () => {
    expect(stripSvgDiagrams(`See ${svg} ok`)).toBe(`See ${DIAGRAM_OMITTED} ok`);
  });

  it("is idempotent and leaves plain text untouched", () => {
    const once = stripSvgDiagrams(`x\n${fence("xml:svg", svg)}`);
    expect(stripSvgDiagrams(once)).toBe(once);
    expect(stripSvgDiagrams("Just text, 1 < 2.")).toBe("Just text, 1 < 2.");
    expect(stripSvgDiagrams("")).toBe("");
  });
});

describe("model turn hygiene", () => {
  const bigSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500">${'<line x1="0" y1="0" x2="1" y2="1"/>'.repeat(1200)}</svg>`;
  const fence = (info: string, body: string) => ["```" + info, body, "```"].join("\n");
  const history = (modelContent: string) => [msg(0, "user", { content: "draw a divider" }), msg(1, "model", { content: modelContent }), msg(2, "user", { content: "now solve it" })];

  it("accepts a follow-up after a huge drawing, with the diagram omitted", () => {
    const reply = `Here you go.\n\n${fence("xml:svg", bigSvg)}\n\nVout is 8 V.\n[[SIM:circuits]]`;
    expect(reply.length).toBeGreaterThan(AI_MAX_MODEL_MESSAGE_CHARS);
    const { messages } = sanitizeChatRequest({ messages: history(reply) });
    expect(messages[1].content).toBe(`Here you go.\n\n${DIAGRAM_OMITTED}\n\nVout is 8 V.`);
    expect(JSON.stringify(buildContents(messages))).not.toContain("<svg");
  });

  it("handles a truncated drawing without a closing fence", () => {
    const { messages } = sanitizeChatRequest({ messages: history(`Lead-in\n\`\`\`xml:svg\n${bigSvg.slice(0, 5000)}`) });
    expect(messages[1].content).toBe(`Lead-in\n${DIAGRAM_OMITTED}`);
  });

  it("truncates, not rejects, a long model turn at the model cap", () => {
    const { messages } = sanitizeChatRequest({ messages: history("y".repeat(AI_MAX_MODEL_MESSAGE_CHARS * 2)) });
    expect(messages[1].content.length).toBe(AI_MAX_MODEL_MESSAGE_CHARS);
    expect(messages[1].content.endsWith("…")).toBe(true);
    const exact = sanitizeChatRequest({ messages: history("z".repeat(AI_MAX_MODEL_MESSAGE_CHARS)) }).messages[1].content;
    expect(exact).toBe("z".repeat(AI_MAX_MODEL_MESSAGE_CHARS));
  });

  it("lets a model turn exceed the user cap but still rejects a long user turn", () => {
    const long = "w".repeat(AI_MAX_MESSAGE_CHARS + 500);
    expect(sanitizeChatRequest({ messages: history(long) }).messages[1].content).toBe(long);
    refused({ messages: [msg(0, "user", { content: long })] });
    refused({ messages: [msg(0, "user", { content: "q" }), msg(1, "model"), msg(2, "user", { content: long })] });
  });

  it("leaves user messages untouched, even when they contain svg or a marker", () => {
    const content = `look: ${fence("xml:svg", "<svg/>")} [[SIM:circuits]]`;
    expect(sanitizeChatRequest({ messages: [msg(0, "user", { content })] }).messages[0].content).toBe(content);
  });

  it("strips the trailing simulator marker, idempotently", () => {
    const { messages } = sanitizeChatRequest({ messages: history("Answer text.\n[[SIM:control]]") });
    expect(messages[1].content).toBe("Answer text.");
    expect(cleanModelTurn(cleanModelTurn("Answer text.\n[[SIM:control]]"))).toBe("Answer text.");
    expect(cleanModelTurn("Answer\n[[SI")).toBe("Answer");
  });

  it("never produces an empty model turn", () => {
    expect(cleanModelTurn("[[SIM:plc]]").length).toBeGreaterThan(0);
    for (const c of buildContents(sanitizeChatRequest({ messages: history("[[SIM:plc]]") }).messages)) expect(c.parts.length).toBeGreaterThan(0);
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

  it("answers a draw request with a netlist table, one valid schematic fence and no SVG", () => {
    const cases: Array<[string, string, string, string]> = [
      ["draw a voltage divider", "Voltage divider", "circuits", "| Node | Connection |"],
      ["Generate a schematic diagram", "Voltage divider", "circuits", "| Node | Connection |"],
      ["ارسم دائرة مقسم جهد", "Voltage divider", "circuits", "| Node | Connection |"],
      ["Draw a 5V buck converter", "5 V buck converter", "power", "| Node | Connection |"],
      ["draw the block diagram of a unity-feedback PID loop", "Unity-feedback PID loop", "control", "| Block | Input | Output |"],
    ];
    for (const [prompt, title, lab, table] of cases) {
      const reply = mockReply(prompt);
      expect(reply.startsWith("*Demo mode"), prompt).toBe(true);
      expect(reply).not.toMatch(/<svg|xml:svg|GENERATE_SCHEMATIC/);
      expect(reply).toContain(table);
      expect(reply.match(/```schematic\n/g)).toHaveLength(1);
      const { text, lab: got } = splitSimMarker(reply);
      expect(got, prompt).toBe(lab);
      expect(text.trimEnd().endsWith("```"), "fence is the last content before the marker").toBe(true);
      const body = /```schematic\n([\s\S]*?)\n```/.exec(text)![1];
      const verdict = validateSchematic(body);
      expect(verdict.errors, prompt).toEqual([]);
      expect(verdict.spec?.title).toBe(title);
      expect(cleanModelTurn(reply)).toContain("```schematic");
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
    for (const status of [400, 401, 403, 404]) {
      const attempt = vi.fn(async () => {
        throw upstream(status);
      });
      await expect(withModelFallback(["a", "a", "b"], attempt, { sleep: noSleep })).rejects.toMatchObject({ status });
      expect(attempt).toHaveBeenCalledTimes(1);
    }
  });

  it("on a 429 (per-model quota) skips straight to the next different model, with no pause", async () => {
    const seen: string[] = [];
    const delays: number[] = [];
    const attempt = async (model: string) => {
      seen.push(model);
      if (model === "main") throw upstream(429);
      return "ok";
    };
    await expect(withModelFallback(["main", "main", "lite"], attempt, { sleep: async (ms) => void delays.push(ms) })).resolves.toBe("ok");
    expect(seen).toEqual(["main", "lite"]);
    expect(delays).toEqual([]);
  });

  it("throws the 429 when no different model is left to try", async () => {
    const attempt = vi.fn(async () => {
      throw upstream(429);
    });
    await expect(withModelFallback(["lite", "lite"], attempt, { sleep: noSleep })).rejects.toMatchObject({ status: 429 });
    expect(attempt).toHaveBeenCalledTimes(1);
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

describe("model turns that carry a schematic spec", () => {
  const spec = JSON.stringify(BUCK_CONVERTER);
  const fenceOf = (json: string) => "```schematic\n" + json + "\n```";
  const ticks = "```";

  it("keeps the schematic fence in history and still strips the marker and legacy xml:svg fences", () => {
    const turn = `Netlist...\n\n${fenceOf(spec)}\n\n${ticks}xml:svg\n<svg/>\n${ticks}\n[[SIM:power]]`;
    const out = cleanModelTurn(turn);
    expect(out).toContain(fenceOf(spec));
    expect(out).not.toContain("<svg");
    expect(out).not.toContain("SIM:");
  });

  it("strips a stray legacy GENERATE_SCHEMATIC tag from old stored turns", () => {
    expect(cleanModelTurn("Netlist.\n\n[GENERATE_SCHEMATIC: A buck converter]\n[[SIM:power]]")).toBe("Netlist.");
    expect(stripLegacySchematicTag("x")).toBe("x");
  });

  it("truncates the prose around an oversized turn but never the JSON", () => {
    const prose = "Explanation. ".repeat(2000);
    const turn = `${prose}\n\n${fenceOf(spec)}\n\n${prose}`;
    expect(turn.length).toBeGreaterThan(AI_MAX_MODEL_MESSAGE_CHARS);
    const out = limitModelTurn(turn);
    expect(out.length).toBeLessThanOrEqual(AI_MAX_MODEL_MESSAGE_CHARS);
    expect(out).toContain(fenceOf(spec));
    const body = /```schematic\n([\s\S]*?)\n```/.exec(out)![1];
    expect(JSON.parse(body)).toEqual(BUCK_CONVERTER);
    expect(out.startsWith("Explanation.")).toBe(true);
    expect(out).toContain("…");
  });

  it("through sanitizeChatRequest the spec survives a long model turn", () => {
    const turn = `${"p ".repeat(12000)}\n${fenceOf(spec)}`;
    const { messages } = sanitizeChatRequest({ messages: [{ id: "u", role: "user", content: "draw", timestamp: 1 }, { id: "m", role: "model", content: turn, timestamp: 2 }, { id: "u2", role: "user", content: "change R1 to 5 ohm", timestamp: 3 }] });
    expect(messages[1].content.length).toBeLessThanOrEqual(AI_MAX_MODEL_MESSAGE_CHARS);
    expect(messages[1].content).toContain(fenceOf(spec));
  });

  it("keeps only the newest of several fences, replacing older ones with a literal", () => {
    const out = limitModelTurn(`A\n${fenceOf('{"title":"old"}')}\nB\n${fenceOf(spec)}\nC`);
    expect(out).toContain("[earlier schematic omitted]");
    expect(out).not.toContain('"old"');
    expect(out).toContain(fenceOf(spec));
  });

  it("drops an unterminated fence and an impossibly large one whole", () => {
    expect(limitModelTurn(`Intro\n${ticks}schematic\n{"title":"cut`)).toBe("Intro\n[earlier schematic omitted]");
    const huge = fenceOf(JSON.stringify({ title: "x".repeat(AI_MAX_MODEL_MESSAGE_CHARS) }));
    const out = limitModelTurn(`Lead.\n${huge}\nTail.`);
    expect(out.length).toBeLessThanOrEqual(AI_MAX_MODEL_MESSAGE_CHARS);
    expect(out).not.toContain("```schematic");
    expect(out).toContain("Lead.");
  });

  it("leaves a short turn unchanged", () => {
    const turn = `Short.\n\n${fenceOf(spec)}`;
    expect(limitModelTurn(turn)).toBe(turn);
  });
});
