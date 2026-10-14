import OpenAI from "openai";
import "dotenv/config";
import { SYSTEM_INSTRUCTION } from "./aiSystemPrompt";
import { GoogleGenAI, HarmBlockThreshold, HarmCategory, type SafetySetting } from "@google/genai";
import {
  AI_HISTORY_WINDOW,
  AI_MAX_IMAGE_BYTES,
  AI_MAX_MESSAGE_CHARS,
  AI_MAX_MODEL_MESSAGE_CHARS,
  LAB_CONTEXTS,
  splitImageTag,
  splitSimMarker,
  stripLegacySchematicTag,
  stripSvgDiagrams,
  type ChatMessage,
  type LabContext,
  type SimLab,
} from "../shared/aiTypes";
import { SCHEMATIC_FENCE, SCHEMATIC_GATES_SUMMARY, SCHEMATIC_SPEC_DOC } from "../shared/schematic";
import { BJT_CE_STAGE, BUCK_CONVERTER, PID_LOOP, VOLTAGE_DIVIDER } from "../shared/schematic/fixtures";

const nvidiaClient = new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY ?? "",
  baseURL: process.env.NVIDIA_BASE_URL ?? "https://integrate.api.nvidia.com/v1",
  timeout: 20_000,
});

export async function generateCircuitAnalysis(prompt: string): Promise<string> {
  const normalizedPrompt = prompt.trim();
  if (!normalizedPrompt) throw new Error("Analysis prompt is required.");
  if (!process.env.NVIDIA_API_KEY) throw new Error("NVIDIA_API_KEY is not configured.");

  try {
    const completion = await nvidiaClient.chat.completions.create({
      model: "deepseek-ai/deepseek-v4-flash-0731",
      messages: [
        {
          role: "system",
          content: "You are an electrical engineering analysis assistant. Give concise, technically rigorous circuit analysis. Use LaTeX delimiters $...$ for inline math and $$...$$ for displayed equations.",
        },
        { role: "user", content: normalizedPrompt },
      ],
      max_tokens: 1024,
      temperature: 0.2,
    });
    return completion.choices[0]?.message?.content?.trim() ?? "No analysis was returned.";
  } catch (error) {
    console.error("NVIDIA circuit analysis request failed:", error);
    throw new Error("Unable to generate circuit analysis.");
  }
}

// ---------------------------------------------------------------------------------------------
// MAE AI: streaming engineering-professor chat on Gemini.
// ---------------------------------------------------------------------------------------------

export class AiNotConfiguredError extends Error {
  constructor() {
    super("MAE AI is not configured");
    this.name = "AiNotConfiguredError";
  }
}

/** A request the caller got wrong; the route maps it to HTTP 400. */
export class AiRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiRequestError";
  }
}

/** The answer was blocked by safety filters or came back empty; the route maps it to HTTP 422 / an `error` event. */
export const AI_BLOCKED_MESSAGE = "That request couldn't be answered. Try rephrasing it as an engineering question.";
export class AiBlockedError extends Error {
  /** Upstream reason, for server logs only: it is never sent to the client. */
  readonly reason: string;
  constructor(reason: string) {
    super(AI_BLOCKED_MESSAGE);
    this.name = "AiBlockedError";
    this.reason = reason;
  }
}

const IMAGE_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]*={0,2})$/;

export interface SanitizedChat {
  readonly messages: readonly ChatMessage[];
  readonly lab: LabContext;
}

/** Decoded byte length of a base64 payload, without decoding it. */
function base64Bytes(payload: string): number {
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  return Math.floor((payload.length * 3) / 4) - padding;
}

/** Last N messages, trimmed so the sequence starts on a user turn (Gemini rejects a leading model turn). */
export function windowMessages(messages: readonly ChatMessage[]): ChatMessage[] {
  const tail = messages.slice(-AI_HISTORY_WINDOW);
  while (tail.length > 0 && tail[0].role !== "user") tail.shift();
  return tail;
}

const SCHEMATIC_FENCE_RE = new RegExp("(^|\\n)([ \\t]{0,3}```" + SCHEMATIC_FENCE + "[ \\t]*\\r?\\n[\\s\\S]*?)(\\r?\\n[ \\t]{0,3}```[ \\t]*(?=\\r?\\n|$)|$)", "g");
const SCHEMATIC_OMITTED = "[earlier schematic omitted]";

/**
 * Bounds a model turn to `cap` characters without ever cutting a ```schematic fence in half: the model needs its
 * previous spec to apply "change R1 to 5 kΩ". Only the newest complete fence is kept (older and unterminated ones become a
 * short literal); the prose before it is truncated first, then the prose after it. A fence too large to fit is dropped whole.
 */
export function limitModelTurn(text: string, cap: number = AI_MAX_MODEL_MESSAGE_CHARS): string {
  const fences: Array<{ start: number; end: number; closed: boolean }> = [];
  const re = new RegExp(SCHEMATIC_FENCE_RE.source, "g");
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    fences.push({ start: m.index + m[1].length, end: m.index + m[0].length, closed: m[3].length > 0 });
    if (m[0].length === 0) re.lastIndex++;
  }
  if (fences.length === 0) return text.length > cap ? `${text.slice(0, cap - 1)}…` : text;

  const keep = fences[fences.length - 1].closed ? fences[fences.length - 1] : undefined;
  let out = "";
  let cursor = 0;
  let pre = "";
  let post = "";
  for (const f of fences) {
    const prose = text.slice(cursor, f.start);
    if (f === keep) pre = out + prose;
    else out += prose + SCHEMATIC_OMITTED;
    cursor = f.end;
  }
  post = text.slice(cursor);
  if (!keep) {
    const joined = out + post;
    return joined.length > cap ? `${joined.slice(0, cap - 1)}…` : joined;
  }
  const fence = text.slice(keep.start, keep.end);
  if (pre.length + fence.length + post.length <= cap) return pre + fence + post;
  if (fence.length > cap - 400) {
    const joined = pre + SCHEMATIC_OMITTED + post;
    return joined.length > cap ? `${joined.slice(0, cap - 1)}…` : joined;
  }
  const budget = cap - fence.length - 2;
  const postKeep = Math.min(post.length, Math.floor(budget / 4));
  const preKeep = Math.min(pre.length, budget - postKeep);
  const head = pre.length > preKeep ? `${pre.slice(0, Math.max(0, preKeep - 2)).trimEnd()}…\n\n` : pre;
  const tail = post.length > postKeep ? `${post.slice(0, Math.max(0, postKeep - 1))}…` : post;
  return head + fence + tail;
}

/** A model turn as it is resent to the model: no SVG (old chats still hold some), no legacy tag, no illustration tag, no trailing simulator marker, bounded length (schematic fences stay whole), never empty. */
export function cleanModelTurn(content: string): string {
  const text = limitModelTurn(stripLegacySchematicTag(splitImageTag(splitSimMarker(stripSvgDiagrams(content)).text).text));
  return text.trim() ? text : "[empty reply]";
}

/** Validates an untrusted request body; throws AiRequestError with a client-safe message. */
export function sanitizeChatRequest(body: unknown): SanitizedChat {
  if (typeof body !== "object" || body === null) throw new AiRequestError("Request body must be a JSON object.");
  const { messages, lab } = body as { messages?: unknown; lab?: unknown };
  if (!Array.isArray(messages) || messages.length === 0) throw new AiRequestError("messages must be a non-empty array.");

  // Only the tail is ever used, so validate (and pay for) just that.
  const tail = messages.slice(-AI_HISTORY_WINDOW);
  const clean: ChatMessage[] = tail.map((raw, index) => {
    if (typeof raw !== "object" || raw === null) throw new AiRequestError(`messages[${index}] must be an object.`);
    const { id, role, content, imageUrl, timestamp } = raw as Record<string, unknown>;
    if (role !== "user" && role !== "model") throw new AiRequestError(`messages[${index}].role must be "user" or "model".`);
    if (typeof content !== "string") throw new AiRequestError(`messages[${index}].content must be a string.`);
    // User turns are capped. Model turns are our own earlier output resent by the client: diagrams are dropped
    // (a drawing alone can be 30 KB), the marker is stripped, and anything still too long is truncated, not rejected.
    if (role === "user" && content.length > AI_MAX_MESSAGE_CHARS) throw new AiRequestError(`Messages are limited to ${AI_MAX_MESSAGE_CHARS} characters.`);
    const message: ChatMessage = {
      id: typeof id === "string" ? id.slice(0, 64) : String(index),
      role,
      content: role === "model" ? cleanModelTurn(content) : content,
      timestamp: typeof timestamp === "number" && Number.isFinite(timestamp) ? timestamp : 0,
    };
    if (imageUrl !== undefined && imageUrl !== null && imageUrl !== "") {
      if (typeof imageUrl !== "string") throw new AiRequestError(`messages[${index}].imageUrl must be a string.`);
      const match = IMAGE_URL.exec(imageUrl);
      if (!match) throw new AiRequestError("Images must be base64 data URLs of type JPEG, PNG or WebP.");
      if (base64Bytes(match[2]) > AI_MAX_IMAGE_BYTES) throw new AiRequestError("Image is too large.");
      message.imageUrl = imageUrl;
    }
    return message;
  });

  const last = clean[clean.length - 1];
  if (last.role !== "user") throw new AiRequestError("The last message must come from the user.");
  if (!last.content.trim() && !last.imageUrl) throw new AiRequestError("The last message is empty.");
  const safeLab = LAB_CONTEXTS.includes(lab as LabContext) ? (lab as LabContext) : "general";
  return { messages: windowMessages(clean), lab: safeLab };
}

export interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}
export interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

/** Gemini `contents` for an already-sanitized window; only the newest image-bearing message keeps its image. */
export function buildContents(messages: readonly ChatMessage[]): GeminiContent[] {
  let newestImage = -1;
  messages.forEach((m, i) => {
    if (m.imageUrl) newestImage = i;
  });
  return messages.map((m, i) => {
    const parts: GeminiPart[] = [];
    if (i === newestImage && m.imageUrl) {
      const match = IMAGE_URL.exec(m.imageUrl);
      if (match) parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
    }
    // Gemini rejects empty text parts; a dropped old image would otherwise leave one behind.
    const text = m.content.trim() ? m.content : m.imageUrl && i !== newestImage ? "[image omitted]" : "";
    if (text) parts.push({ text });
    return { role: m.role, parts };
  });
}

const LAB_HINTS: Record<LabContext, string> = {
  general: "The student is browsing the whole MAE Academy platform; infer the topic from the question.",
  circuits: "The student is in the Circuit Lab: DC/AC analysis, nodal and mesh methods, Thevenin/Norton, RC/RL/RLC transients, op-amps.",
  power: "The student is in the Power Electronics studio: rectifiers, buck/boost converters, inverters, switching waveforms, ripple and efficiency.",
  logic: "The student is in the Digital Logic studio: Boolean algebra, K-maps, combinational and sequential circuits, FSMs, timing.",
  control: "The student is in the Control Systems studio: transfer functions, poles and zeros, Bode, root locus, Nyquist, PID tuning, stability.",
  code: "The student is in the Code studio: C/C++ tracing, data structures and algorithms; prefer fenced `cpp` examples.",
  arduino: "The student is in the Arduino studio: sketches, pins, PWM, ADC, interrupts, serial, sensors; prefer fenced `arduino` examples.",
  signals: "The student is in the Signals & Systems studio: convolution, Fourier/Laplace/Z transforms, sampling, filters, frequency response.",
  fluid: "The student is in the Fluid Power studio: pneumatics and hydraulics (cylinders, valves, pumps, pressure and flow), sequencing and relay/ladder control of actuators.",
  plc: "The student is in the PLC studio: ladder logic, timers, counters, scan cycle, I/O wiring, and IEC 61131-3 languages.",
};

/** The one place the marker contract is worded; the client strips it with `splitSimMarker`. */
const SIM_MARKER_RULE =
  "Only when your answer analyzes or designs something that can be opened in one of our interactive simulators (a circuit, a logic gate network or Boolean problem, a control transfer function, root locus or PID, a power converter, a signals transform, Arduino or other code, a pneumatic or hydraulic circuit, or a PLC ladder), end your reply with exactly one final line, alone on its own line: [[SIM:<lab>]] where <lab> is one of circuits|power|logic|control|code|arduino|signals|fluid|plc. Never add the marker to general chat, refusals, or purely conceptual theory with nothing to simulate. Never write more than one marker, and never put it inside a code fence.";

/** Exact refusal for Arabic-speaking students; the model is told to use it verbatim. */
export const ARABIC_DECLINE = "عذراً يا بشمهندس! أنا مساعد مخصص للعلوم والهندسة فقط (سيركت، كنترول، باور، وغيرها). إسألني في أي مسألة أو مادة هندسية وبكون معك خطوة بخطوة ⚡";

/**
 * Platform-integration rules, appended after the master prompt. The master prompt is general engineering-assistant
 * behaviour; these are the contracts the MAE Academy client depends on, so they are worded once, here, and stated
 * to win over anything above that conflicts with them.
 */
const INTEGRATION_RULES = [
  "# MAE Academy platform integration (these rules take precedence over anything above that conflicts with them)",
  "",
  "Scope and refusals:",
  '- Your name is MAE AI; in Arabic you are "مي الذكي". Mention it only when asked who you are.',
  "- Help only with engineering, mathematics, physics and computer science. For anything else (cooking, gossip, sports, politics, everyday chat, ...) politely decline and redirect to engineering; a refusal never carries a [[SIM:..]] marker.",
  `- If the student writes Arabic, decline with exactly this text: «${ARABIC_DECLINE}». For other languages decline with the same meaning, in the student's language, in one or two sentences.`,
  "",
  "Language and format:",
  "- Reply in the language the student writes in (English, Arabic or Spanish), judged from their latest message alone: an English question gets an English answer. Keep LaTeX, code and standard symbols unchanged.",
  "- Write ALL mathematics with $...$ (inline) and $$...$$ (display). Never use \\( \\) or \\[ \\] delimiters, and never put math in code fences.",
  "- Put code in fenced blocks with a language tag: cpp, arduino, python, matlab, or asm for 8086/MASM. Keep the explanation around it short.",
  "- The Section 3 deliverable structure (table, graphic, assumptions, verification summary) applies when a schematic, block diagram, plot or model is requested or generated. For ordinary problems, answer step by step without it. Do not draw unless a drawing is clearly requested (for example «ارسم» or «حول هذه الرسمة لمخطط عالي الدقة»).",
  "- Infer the engineering sub-domain automatically from the question or image; do not ask which lab it belongs to.",
  "- When an image of a schematic or diagram is attached, first state the components, values and labelled nodes you read (for example node A, node B, ground). If a value or connection is unreadable or ambiguous, say so and ask for a clearer image instead of guessing.",
  "",
  "Schematic drawings (the platform draws them from a JSON spec, so this format is mandatory):",
  "- The master prompt's SVG rules (Sections 1.4, 1.7 and the SVG form of 3.2) do NOT apply here. Never emit SVG, ```xml:svg blocks, ASCII art, Mermaid or image tags (for a circuit; the separate illustration tag below is the only exception). A deterministic engine draws the symbols from a validated library and enforces the 10 verification gates below; your job is a correct, grid-snapped spec.",
  "- Only when a drawing, schematic or block diagram is clearly requested (for example «ارسم» or «draw»): first give the academic explanation, the equations and the node netlist or block table as text and LaTeX. THEN append exactly ONE fenced block whose info string is exactly `schematic` and whose content is ONLY the JSON spec (no prose inside, strict JSON: double quotes, no comments, no trailing commas). It is the LAST content of the reply, just before the optional [[SIM:..]] line. Never emit it for ordinary questions, refusals or when only an explanation is wanted. At most one per reply; for a change request (\"make R1 5 kΩ\") re-emit the complete corrected spec, starting from your previous ```schematic block in the conversation.",
  "- Before writing the spec, mentally run Phase A (topology and node extraction), Phase B (grid alignment and clearance) and Phase C (engineering sanity) of the master prompt and then ALL 10 gates below. Fix your own errors first; the spec you emit must already pass every gate. Gates:",
  ...SCHEMATIC_GATES_SUMMARY.map((gate) => `  ${gate}`),
  "- Practical rules: all coordinates are integers in grid units. Compute every wire endpoint from the terminal offsets table (position + rotated offset), never by eye. Give every part a value with a unit (blocks carry their transfer function or name). Draw ground at node 0. Put a wire between parts instead of letting them touch, keep parts at least one grid unit apart, and run wires between perpendicular terminals with an explicit bend point. Keep the figure compact (about 40 x 24 grid units at most) and place labels in free space.",
  "- Write the text in the student's language; keep identifiers, designators and units in the spec in standard notation. If the circuit is too complex to draw faithfully, say so and draw the essential core instead of guessing.",
  "",
  "Spec format (reference; the engine reads exactly this):",
  SCHEMATIC_SPEC_DOC,
  "",
  "Verified reference specs (they pass all 10 gates; copy their conventions: switch/diode orientation, rails, ground at the bottom, labels, a feedback tap that starts ON the output wire):",
  "Buck converter (series switch, freewheeling diode, LC filter, load):",
  "```" + SCHEMATIC_FENCE,
  JSON.stringify(BUCK_CONVERTER),
  "```",
  "Unity-feedback loop (a block diagram has NO ground, rails or values on the sum; the feedback wire ends on the sum's S terminal and begins at a vertex on the output wire):",
  "```" + SCHEMATIC_FENCE,
  JSON.stringify(PID_LOOP),
  "```",
  "Common-emitter BJT stage with divider bias and bypass capacitor (rails repeated per branch, one ground per branch, ports for input/output):",
  "```" + SCHEMATIC_FENCE,
  JSON.stringify(BJT_CE_STAGE),
  "```",
  "- Extra explicit checks before ANY diagram, on top of the 10 gates: (a) in a three-phase circuit label the sources and lines A, B and C consistently, and count the parts (a three-phase full-wave bridge has 6 diodes or SCRs: 3 on the upper rail, 3 on the lower rail, each leg fed by one phase); (b) check the polarity of every diode and SCR: conduction runs anode to cathode, and the cathodes of the upper group join the positive DC rail while the anodes of the lower group join the negative rail; (c) every net ties to a real node, with nothing left floating.",
  "",
  "Illustrations (a different tool from schematics; never mix them up):",
  "- Some requests are best served by an ILLUSTRATION rather than a wiring schematic: classifications and types of machines (for example «أنواع الماشينز» or \"types of electric machines\"), cutaway or construction diagrams, taxonomies, concept maps, conceptual waveform sketches. For these, give the FULL academic explanation in text and LaTeX first, then end the reply with exactly ONE tag on a single line: [GENERATE_IMAGE: <prompt>]. The prompt is ultra-detailed English, one line, at most 1000 characters, with NO square brackets inside, shaped like: \"Publication-grade technical illustration of <topic>, IEEE textbook style, crisp line art, white background, high contrast, labeled components (<list every label>), zero photographic clutter, academic journal quality, 4k resolution.\" The platform draws it with an image model and shows it under your text; your text answer must stay complete without it.",
  "- Circuits, schematics, rectifiers, converters, block diagrams, ladder logic and anything with electrical connectivity MUST use the ```schematic engine and NEVER the image tag, because the wiring of a schematic is verified by code and an image model cannot guarantee it. If a request needs both, draw the circuit with the schematic engine and skip the tag.",
  "- At most one image tag per reply; none in refusals, none for ordinary questions or calculations. The tag goes before the optional [[SIM:..]] line, and never inside a code fence.",
  "",
  "Simulator marker:",
  `- ${SIM_MARKER_RULE} A circuit or network you drew may also end with the marker when a simulator can open it.`,
].join("\n");

/**
 * The full instruction: the master prompt (static, so Gemini's implicit prompt caching can reuse it), then the
 * platform rules, then the per-lab context last because it is the only part that varies between requests.
 */
export function buildSystemInstruction(lab: LabContext): string {
  return [SYSTEM_INSTRUCTION, "", INTEGRATION_RULES, "", `Context: ${LAB_HINTS[lab]}`].join("\n");
}

export { SYSTEM_INSTRUCTION };

// Mode selection: the single place that decides live vs demo vs not configured.

export type AiMode = "live" | "mock" | "unconfigured";

/** The trimmed key, read at call time; an empty or whitespace-only value (`GEMINI_API_KEY=`) counts as missing. */
export function geminiApiKey(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.GEMINI_API_KEY?.trim() || undefined;
}

/** Demo replies are a dev convenience only: production and Vercel without a key fail closed. */
export function resolveAiMode(env: NodeJS.ProcessEnv = process.env): AiMode {
  if (geminiApiKey(env)) return "live";
  return env.NODE_ENV !== "production" && !env.VERCEL ? "mock" : "unconfigured";
}

/** Fails fast (before any SSE headers go out) with AiNotConfiguredError; otherwise says which stream to serve. */
export function assertAiConfigured(): Exclude<AiMode, "unconfigured"> {
  const mode = resolveAiMode();
  if (mode === "unconfigured") throw new AiNotConfiguredError();
  return mode;
}

let client: GoogleGenAI | undefined;
let clientKey: string | undefined;
export function getGeminiClient(): GoogleGenAI {
  const apiKey = geminiApiKey();
  if (!apiKey) throw new AiNotConfiguredError();
  if (!client || clientKey !== apiKey) {
    client = new GoogleGenAI({ apiKey });
    clientKey = apiKey;
  }
  return client;
}

// Aliases, not versioned names. gemini-2.0-flash / 1.5-flash are retired and absent from this key's model
// list, and 2.5-flash already 404s, so the `-latest` alias is the only reliable choice; override with GEMINI_MODEL.
const DEFAULT_MODEL = "gemini-flash-latest";
const FALLBACK_MODEL = "gemini-flash-lite-latest";
/** Transient upstream failures worth another attempt ("model is experiencing high demand" is a 503). */
const RETRYABLE_STATUS = new Set([500, 503, 504]);

/**
 * Runs `attempt` against each model in turn, but only for upstream errors that happen before any output exists:
 * transient 5xx are retried after a pause, and a 429 (quota is per model, so retrying the same one can't help)
 * jumps straight to the next different model. Anything else (bad request, auth, 404) is thrown at once.
 */
export async function withModelFallback<T>(
  models: readonly string[],
  attempt: (model: string) => Promise<T>,
  options: { signal?: AbortSignal; delayMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<T> {
  const { signal, delayMs = 600, sleep = (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)) } = options;
  for (let i = 0; ; i++) {
    try {
      return await attempt(models[i]);
    } catch (error) {
      const status = (error as { status?: unknown } | null)?.status;
      if (signal?.aborted) throw error;
      if (status === 429) {
        const next = models.findIndex((model, j) => j > i && model !== models[i]);
        if (next === -1) throw error;
        i = next - 1; // the loop increment lands on `next`
        continue;
      }
      const retryable = typeof status === "number" && RETRYABLE_STATUS.has(status);
      if (!retryable || i >= models.length - 1) throw error;
      await sleep(delayMs * (i + 1));
      if (signal?.aborted) throw error;
    }
  }
}

/**
 * Permissive but sane: block only high-probability harm. Civic integrity is deprecated upstream and the image-only
 * categories are not supported by the Gemini API, so just the four text categories are set.
 */
export const SAFETY_SETTINGS: readonly SafetySetting[] = [
  HarmCategory.HARM_CATEGORY_HARASSMENT,
  HarmCategory.HARM_CATEGORY_HATE_SPEECH,
  HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
  HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
].map((category) => ({ category, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH }));

/** Finish reasons that mean the model stopped for policy reasons rather than because it was done. */
const BLOCKING_FINISH_REASONS: ReadonlySet<string> = new Set(["SAFETY", "RECITATION", "LANGUAGE", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "IMAGE_SAFETY", "OTHER"]);

/** The slice of a streamed Gemini chunk that decides whether the answer was blocked. */
export interface ChunkVerdictInput {
  promptFeedback?: { blockReason?: string };
  candidates?: ReadonlyArray<{ finishReason?: string }>;
}

/** The upstream reason this chunk reports a block or policy stop, or undefined when it does not. */
export function blockedReason(chunk: ChunkVerdictInput): string | undefined {
  const prompt = chunk.promptFeedback?.blockReason;
  if (prompt && prompt !== "BLOCKED_REASON_UNSPECIFIED") return `prompt:${prompt}`;
  const finish = chunk.candidates?.[0]?.finishReason;
  return finish && BLOCKING_FINISH_REASONS.has(finish) ? `finish:${finish}` : undefined;
}

/** Models tried in order for any Gemini text call: the chosen one twice (a spike usually passes), then a lighter one as a last resort. */
export function modelChain(env: NodeJS.ProcessEnv = process.env): string[] {
  const primary = env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  return primary === FALLBACK_MODEL ? [primary, primary] : [primary, primary, FALLBACK_MODEL];
}

/** Streams the model's reply as text deltas. Aborting `signal` stops reading from the upstream stream. Throws AiBlockedError when the answer is blocked or empty. */
export async function* streamChat(request: SanitizedChat, signal?: AbortSignal): AsyncGenerator<string> {
  const models = modelChain();
  const client = getGeminiClient();
  const stream = await withModelFallback(
    models,
    (model) =>
      client.models.generateContentStream({
        model,
        contents: buildContents(request.messages),
        config: {
          systemInstruction: buildSystemInstruction(request.lab),
          temperature: 0.3,
          // Long derivations plus thinking tokens count against this budget;
          // 8192 risked cutting an answer off. Flash models allow up to 65536.
          maxOutputTokens: 16384,
          safetySettings: [...SAFETY_SETTINGS],
          abortSignal: signal,
        },
      }),
    { signal },
  );
  let produced = false;
  let blocked: string | undefined;
  for await (const chunk of stream) {
    if (signal?.aborted) return;
    blocked ??= blockedReason(chunk);
    const text = chunk.text;
    if (text) {
      produced = true;
      yield text;
    }
  }
  if (signal?.aborted) return;
  // Never end silently: a blocked prompt, a policy stop, or no text at all becomes a controlled error.
  if (blocked) throw new AiBlockedError(blocked);
  if (!produced) throw new AiBlockedError("empty");
}

// Dev-only demo stream (see resolveAiMode). Same shape as streamChat: an async generator of text deltas.

const MOCK_NOTE = "*Demo mode — no `GEMINI_API_KEY` is set, so this is a canned reply.*";

type MockTopic = Extract<SimLab, "circuits" | "power" | "logic" | "control" | "code" | "arduino">;

const MOCK_REPLIES: Record<MockTopic, string> = {
  circuits: [
    "A series loop with $V_s = 12\\,\\text{V}$, $R_1 = 1\\,\\text{k}\\Omega$ and $R_2 = 2\\,\\text{k}\\Omega$.",
    "",
    "**Given:** one loop, one source. **Method:** Kirchhoff's voltage law around the loop.",
    "",
    "$$-V_s + I R_1 + I R_2 = 0 \\;\\Rightarrow\\; I = \\frac{V_s}{R_1 + R_2} = \\frac{12}{3000} = 4\\,\\text{mA}$$",
    "",
    "The voltage across $R_2$ is the divider output:",
    "",
    "$$V_{R_2} = V_s \\frac{R_2}{R_1 + R_2} = 12 \\cdot \\frac{2}{3} = 8\\,\\text{V}$$",
  ].join("\n"),
  control: [
    "Take the unity-feedback plant $G(s) = \\dfrac{K}{s(s+2)}$.",
    "",
    "The closed-loop transfer function is",
    "",
    "$$T(s) = \\frac{K}{s^2 + 2s + K}, \\qquad s = -1 \\pm \\sqrt{1 - K}$$",
    "",
    "For $0 < K < 1$ both poles are real and negative; for $K > 1$ they become a complex pair at $\\text{Re}(s) = -1$, so the root locus bends vertically and the response turns oscillatory. A PID adds $u(t) = K_p e + K_i \\int e\\,dt + K_d \\dot{e}$ to shape that trade-off.",
  ].join("\n"),
  power: [
    "For an ideal buck converter in continuous conduction, the duty cycle sets the output directly:",
    "",
    "$$D = \\frac{V_o}{V_{in}}$$",
    "",
    "Example: $V_{in} = 12\\,\\text{V}$ and $V_o = 5\\,\\text{V}$ give $D \\approx 0.42$. The inductor ripple is $\\Delta I_L = \\dfrac{(V_{in} - V_o)\\,D}{L f_s}$.",
  ].join("\n"),
  arduino: [
    "A minimal blink sketch that toggles the on-board LED every 500 ms:",
    "",
    "```cpp",
    "const int LED = 13;",
    "",
    "void setup() {",
    "  pinMode(LED, OUTPUT);",
    "}",
    "",
    "void loop() {",
    "  digitalWrite(LED, !digitalRead(LED));",
    "  delay(500);",
    "}",
    "```",
  ].join("\n"),
  code: [
    "A small C++ function that sums an array:",
    "",
    "```cpp",
    "int sum(const int* a, int n) {",
    "  int total = 0;",
    "  for (int i = 0; i < n; ++i) total += a[i];",
    "  return total;",
    "}",
    "```",
    "",
    "It runs in $O(n)$ time and $O(1)$ extra space.",
  ].join("\n"),
  logic: [
    "Simplify $F = AB + A\\bar{B}$ with the distributive law:",
    "",
    "$$F = A(B + \\bar{B}) = A \\cdot 1 = A$$",
    "",
    "The whole network collapses to a wire from $A$ to the output; $B$ has no effect.",
  ].join("\n"),
};

const mockFence = (spec: unknown): string => ["```" + SCHEMATIC_FENCE, JSON.stringify(spec), "```"].join("\n");

const MOCK_DRAWINGS: ReadonlyArray<{ pattern: RegExp; reply: string }> = [
  {
    pattern: /buck|converter|smps/i,
    reply: [
      "A 5 V buck converter: the switch S1 chops the 12 V source, the diode D1 freewheels the inductor current and L1/C1 filter it for the load.",
      "",
      "| Node | Connection |",
      "| --- | --- |",
      "| Vin | V1+ to S1 |",
      "| SW | S1, D1 cathode and L1 |",
      "| Vout | L1, C1 and R1 |",
      "| 0 (GND) | V1-, D1 anode, C1 and R1 |",
      "",
      "In continuous conduction $D = V_o / V_{in} = 5/12 \\approx 0.42$.",
      "",
      mockFence(BUCK_CONVERTER),
    ].join("\n"),
  },
  {
    pattern: /\bpid\b|block diagram|feedback|loop|مخطط صندوقي/i,
    reply: [
      "A unity-feedback loop: the error $e = r - y$ drives the PID controller $C(s)$, whose output $u$ drives the plant $G(s)$.",
      "",
      "| Block | Input | Output |",
      "| --- | --- | --- |",
      "| Sum | r(t), y(t) | e(t) |",
      "| C(s) | e(t) | u(t) |",
      "| G(s) | u(t) | y(t) |",
      "",
      mockFence(PID_LOOP),
    ].join("\n"),
  },
  {
    pattern: /./,
    reply: [
      "Here is a voltage divider: a 10 V source feeding R1 and R2 in series, with the output taken across R2.",
      "",
      "| Node | Connection |",
      "| --- | --- |",
      "| A | V1+ to R1 |",
      "| Vout | R1 to R2 |",
      "| 0 (GND) | R2 and V1- |",
      "",
      "$V_{out} = 10 \\cdot \\frac{10}{10 + 10} = 5\\,\\text{V}$.",
      "",
      mockFence(VOLTAGE_DIVIDER),
    ].join("\n"),
  },
];

/** Asks for a drawing (English or Arabic); checked before the topic keywords so "draw a voltage divider" draws. */
const MOCK_DRAW = /\b(draw|diagram|schematic)\b|ارسم|رسم|مخطط/;

const MOCK_DEFAULT =
  "Hi, I'm MAE AI. Ask me about circuits, control systems, power electronics, digital logic, signals, Arduino or PLC and I'll walk through it step by step.";

/** Keyword routing for the demo reply; the first match wins, so the specific topics come before `circuits`. */
const MOCK_TOPICS: ReadonlyArray<readonly [MockTopic, RegExp]> = [
  ["power", /\b(buck|boost|converter|inverter|rectifier)\b/],
  ["control", /root locus|transfer function|\bpid\b|\bbode\b|nyquist|control system/],
  ["arduino", /\barduino\b/],
  ["code", /c\+\+|\bcpp\b|\bcode\b|\bsketch\b/],
  ["logic", /\blogic\b|\bgates?\b|boolean|k-map|karnaugh/],
  ["circuits", /circuit|\bkvl\b|\bkcl\b|resistor|voltage divider|\bohm/],
];

/** The complete demo reply (note, answer, trailing simulator marker where relevant) for one user message. */
export function mockReply(content: string, hasImage = false): string {
  const text = content.toLowerCase();
  if (MOCK_DRAW.test(text)) {
    const drawing = MOCK_DRAWINGS.find((d) => d.pattern.test(text)) ?? MOCK_DRAWINGS[MOCK_DRAWINGS.length - 1];
    return `${MOCK_NOTE}\n\n${drawing.reply}\n\n[[SIM:${drawing === MOCK_DRAWINGS[1] ? "control" : drawing === MOCK_DRAWINGS[0] ? "power" : "circuits"}]]`;
  }
  const topic = MOCK_TOPICS.find(([, pattern]) => pattern.test(text))?.[0];
  if (!topic) {
    const imageNote = hasImage ? "\n\nI can see you attached an image, but reading images needs the real Gemini key; set `GEMINI_API_KEY` to try that." : "";
    return `${MOCK_NOTE}\n\n${MOCK_DEFAULT}${imageNote}`;
  }
  return `${MOCK_NOTE}\n\n${MOCK_REPLIES[topic]}\n\n[[SIM:${topic}]]`;
}

let warnedMock = false;

/** Resolves after `ms`, or immediately when `signal` aborts. */
function pause(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal?.addEventListener("abort", done, { once: true });
  });
}

/** Streams a canned reply in small chunks with a short delay so streaming UI can be exercised; stops on abort. */
export async function* mockChatStream(request: SanitizedChat, signal?: AbortSignal): AsyncGenerator<string> {
  if (!warnedMock) {
    warnedMock = true;
    console.warn("GEMINI_API_KEY is not set; /api/ai/chat is serving demo responses (dev only)");
  }
  const last = request.messages[request.messages.length - 1];
  const reply = mockReply(last?.content ?? "", Boolean(last?.imageUrl));
  // The tag and the marker go out in two pieces each, as a real model streams them, so the UI's partial stripping is exercised.
  const cut = reply.lastIndexOf("[[SIM:");
  const body = cut < 0 ? reply : reply.slice(0, cut);
  const marker = cut < 0 ? "" : reply.slice(cut);
  const chunks: string[] = [];
  let pending = "";
  for (const word of body.match(/\S{1,40}\s*/g) ?? []) {
    pending += word;
    if (pending.length < 16) continue;
    chunks.push(pending);
    pending = "";
  }
  if (pending) chunks.push(pending);
  if (marker) chunks.push(marker.slice(0, 6), marker.slice(6));
  for (const chunk of chunks) {
    if (signal?.aborted) return;
    yield chunk;
    await pause(15 + Math.random() * 15, signal);
  }
}
