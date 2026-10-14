import OpenAI from "openai";
import "dotenv/config";
import { GoogleGenAI, HarmBlockThreshold, HarmCategory, type SafetySetting } from "@google/genai";
import {
  AI_HISTORY_WINDOW,
  AI_MAX_IMAGE_BYTES,
  AI_MAX_MESSAGE_CHARS,
  AI_MAX_MODEL_MESSAGE_CHARS,
  LAB_CONTEXTS,
  splitSimMarker,
  stripSvgDiagrams,
  type ChatMessage,
  type LabContext,
  type SimLab,
} from "../shared/aiTypes";

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

/** A model turn as it is resent to the model: no SVG, no trailing simulator marker, bounded length, never empty. */
export function cleanModelTurn(content: string): string {
  const text = splitSimMarker(stripSvgDiagrams(content)).text;
  if (text.length > AI_MAX_MODEL_MESSAGE_CHARS) return `${text.slice(0, AI_MAX_MODEL_MESSAGE_CHARS - 1)}…`;
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

/** The allow-list the client sanitiser enforces on `xml:svg` blocks; anything else is dropped there. */
const DIAGRAM_RULES = [
  "- When the student asks you to draw, generate an image of, or re-create a circuit or any diagram (schematic, block diagram, ladder diagram, logic network, timing diagram, root-locus sketch, ...), in any language (for example «ارسم» or «حول هذه الرسمة لمخطط عالي الدقة»), reply with one short lead-in sentence and then ONE complete standalone vector SVG inside a fenced block whose info string is exactly `xml:svg`. Do not draw unless a drawing is clearly requested; ordinary solve-this questions get no SVG.",
  '- SVG contract (the client sanitises with an allow-list and drops everything else): root `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" width="100%" height="100%" style="background:#ffffff;">` (another viewBox size is fine if needed, but always include xmlns and viewBox). Use ONLY these elements: svg, g, defs, marker, line, polyline, polygon, path, rect, circle, ellipse, text, tspan, title, desc. Use presentation attributes only (stroke, stroke-width, fill, d, points, x, y, cx, cy, r, rx, ry, x1, y1, x2, y2, transform, font-size, font-family, text-anchor, dominant-baseline, marker-end, id, class). NEVER use script, foreignObject, image, style elements, event handlers, or external URLs/hrefs; internal `url(#id)` references to defs or markers are fine. Escape `&` as `&amp;` and `<` as `&lt;` in text. Close the SVG properly with `</svg>`.',
  "- Drawing quality: white background, crisp black lines (stroke-width 2 to 3, no gradients), sharp standard IEEE/IEC symbols (resistor zig-zag or IEC box, capacitor plates, inductor loops, sources, ground, logic gate shapes, op-amp triangle), clean orthogonal wires with junction dots, every component labelled with its value (for example `R1 = 10 kΩ`, `V_in = 12 V`), node labels where relevant, balanced proportions and generous spacing so labels never overlap. One SVG per answer; keep explanations and math outside the block as normal text.",
  "- When re-creating from an uploaded image, first state the components and nodes you read, then draw faithfully; say so when a part is unreadable instead of inventing values.",
].join("\n");

export function buildSystemInstruction(lab: LabContext): string {
  return [
    'You are MAE AI (Arabic: "مي الذكي"), the premier academic engineering teaching assistant of MAE Academy, specialised in Mechatronics, Electrical Circuits, Control Systems, Power Electronics, Digital Logic, Embedded Systems and Arduino, PLC, and Signals & Systems (plus fluid power and engineering code). You are patient, rigorous and concise.',
    "",
    "Scope (strict academic focus):",
    "- Help only with engineering, mathematics, physics and computer science. For anything else (cooking, gossip, sports, politics, everyday chat, ...) politely decline and redirect to engineering; a refusal never carries a [[SIM:..]] marker.",
    `- If the student writes Arabic, decline with exactly this text: «${ARABIC_DECLINE}». For other languages decline with the same meaning, in the student's language, in one or two sentences.`,
    "",
    "How to answer:",
    "- Solve problems step by step: state what is given, name the method, show each step, then give the final result with units. Be concise and do not pad.",
    "- Write ALL mathematics in LaTeX. Use $...$ for inline math and $$...$$ for display equations. Never use \\( \\) or \\[ \\] delimiters, and never put math in plain text or code fences.",
    "- When an image of a schematic or diagram is attached, inspect it carefully: identify the resistors, inductors, capacitors, sources and logic gates, with their values. Before solving, explicitly state and label the nodes you read (for example node A, node B, ground) and the component connected between them. If any value or connection is unreadable or ambiguous, say so and ask for a clearer image instead of guessing.",
    "- Put code in fenced blocks with a language tag (cpp, arduino, python or matlab) and keep the surrounding explanation short.",
    "- Reply in the language the student writes in (English, Arabic or Spanish), judged from their latest message alone: an English question gets an English answer. Keep LaTeX itself unchanged and in standard notation.",
    "- Infer the engineering sub-domain (circuits, power electronics, logic, control, signals, code, fluid power, PLC) automatically from the question or image; do not ask the student which one it is.",
    "",
    "Diagrams and schematics:",
    DIAGRAM_RULES,
    "",
    "Simulator marker:",
    `- ${SIM_MARKER_RULE} A circuit or network you drew may also end with the marker when a simulator can open it.`,
    "",
    `Context: ${LAB_HINTS[lab]}`,
  ].join("\n");
}

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
function getClient(): GoogleGenAI {
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

/** Streams the model's reply as text deltas. Aborting `signal` stops reading from the upstream stream. Throws AiBlockedError when the answer is blocked or empty. */
export async function* streamChat(request: SanitizedChat, signal?: AbortSignal): AsyncGenerator<string> {
  const primary = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  // Try the chosen model twice (a spike usually passes), then a lighter one as a last resort.
  const models = primary === FALLBACK_MODEL ? [primary, primary] : [primary, primary, FALLBACK_MODEL];
  const client = getClient();
  const stream = await withModelFallback(
    models,
    (model) =>
      client.models.generateContentStream({
        model,
        contents: buildContents(request.messages),
        config: {
          systemInstruction: buildSystemInstruction(request.lab),
          temperature: 0.3,
          // A full SVG diagram runs 10-30 KB (several thousand tokens) and thinking tokens count against this
          // budget too; 8192 risked cutting a drawing off mid-tag. Flash models allow up to 65536.
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

/** Small valid sample drawing (allowed elements only) so the diagram UI can be exercised without a key. */
const MOCK_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" width="100%" height="100%" style="background:#ffffff;">',
  "  <title>Voltage divider</title>",
  '  <g stroke="#000000" stroke-width="3" fill="none" stroke-linejoin="round">',
  '    <polyline points="150,220 150,100 400,100 400,125"/>',
  '    <polyline points="400,125 415,135 385,155 415,175 385,195 400,205 400,295"/>',
  '    <polyline points="400,295 415,305 385,325 415,345 385,365 400,375 400,400"/>',
  '    <polyline points="150,280 150,400 400,400 400,420"/>',
  '    <line x1="400" y1="250" x2="556" y2="250"/>',
  '    <circle cx="150" cy="250" r="30"/>',
  '    <line x1="370" y1="420" x2="430" y2="420"/>',
  '    <line x1="380" y1="432" x2="420" y2="432"/>',
  '    <line x1="390" y1="444" x2="410" y2="444"/>',
  '    <circle cx="560" cy="250" r="5" fill="#ffffff"/>',
  "  </g>",
  '  <circle cx="400" cy="250" r="6" fill="#000000"/>',
  '  <circle cx="400" cy="400" r="6" fill="#000000"/>',
  '  <g font-family="sans-serif" font-size="18" fill="#000000">',
  '    <text x="150" y="246" text-anchor="middle">+</text>',
  '    <text x="150" y="274" text-anchor="middle">-</text>',
  '    <text x="112" y="256" text-anchor="end">Vin = 12 V</text>',
  '    <text x="435" y="170">R1 = 1 kΩ</text>',
  '    <text x="435" y="340">R2 = 2 kΩ</text>',
  '    <text x="575" y="256">Vout</text>',
  '    <text x="415" y="238">A</text>',
  "  </g>",
  "</svg>",
].join("\n");

const MOCK_DRAW_REPLY = [
  "Here is a voltage divider: a 12 V source feeding R1 and R2 in series, with the output taken across R2.",
  "",
  "```xml:svg",
  MOCK_SVG,
  "```",
  "",
  "With these values $V_{out} = 12 \\cdot \\frac{2}{3} = 8\\,\\text{V}$.",
].join("\n");

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
  if (MOCK_DRAW.test(text)) return `${MOCK_NOTE}\n\n${MOCK_DRAW_REPLY}\n\n[[SIM:circuits]]`;
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
  // The marker goes out in two pieces, as a real model streams it, so the UI's partial-marker stripping is exercised.
  const cut = reply.lastIndexOf("[[SIM:");
  const body = cut < 0 ? reply : reply.slice(0, cut);
  const marker = cut < 0 ? "" : reply.slice(cut);
  const chunks: string[] = [];
  let pending = "";
  for (const word of body.match(/\S+\s*/g) ?? []) {
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
