import OpenAI from "openai";
import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
import { AI_HISTORY_WINDOW, AI_MAX_IMAGE_BYTES, AI_MAX_MESSAGE_CHARS, LAB_CONTEXTS, type ChatMessage, type LabContext } from "../shared/aiTypes";

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
    if (content.length > AI_MAX_MESSAGE_CHARS) throw new AiRequestError(`Messages are limited to ${AI_MAX_MESSAGE_CHARS} characters.`);
    const message: ChatMessage = {
      id: typeof id === "string" ? id.slice(0, 64) : String(index),
      role,
      content,
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

export function buildSystemInstruction(lab: LabContext): string {
  return [
    "You are MAE AI, a patient and rigorous engineering professor on MAE Academy. You help students with circuits, power electronics, control systems, digital logic, signals and systems, mechatronics, PLC and fluid power, and embedded or engineering code.",
    "",
    "How to answer:",
    "- Solve problems step by step: state what is given, name the method, show each step, then give the final result with units. Be concise and do not pad.",
    "- Write ALL mathematics in LaTeX. Use $...$ for inline math and $$...$$ for display equations. Never use \\( \\) or \\[ \\] delimiters, and never put math in plain text or code fences.",
    "- When an image of a schematic or diagram is attached, inspect it carefully: identify the resistors, inductors, capacitors, sources and logic gates, with their values. Before solving, explicitly state and label the nodes you read (for example node A, node B, ground) and the component connected between them. If any value or connection is unreadable or ambiguous, say so and ask for a clearer image instead of guessing.",
    "- Put code in fenced blocks with a language tag (cpp, arduino, python or matlab) and keep the surrounding explanation short.",
    "- If a question is not about engineering, science or mathematics (or is unrelated to learning on this platform), politely decline in one or two sentences and invite an engineering question instead.",
    "- Reply in the language the student writes in (English, Arabic or Spanish). Keep LaTeX itself unchanged and in standard notation.",
    "",
    `Context: ${LAB_HINTS[lab]}`,
  ].join("\n");
}

let client: GoogleGenAI | undefined;
function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new AiNotConfiguredError();
  client ??= new GoogleGenAI({ apiKey });
  return client;
}

/** Fails fast (before any SSE headers go out) when the key is missing. */
export function assertAiConfigured(): void {
  getClient();
}

/** Streams the model's reply as text deltas. Aborting `signal` stops reading from the upstream stream. */
export async function* streamChat(request: SanitizedChat, signal?: AbortSignal): AsyncGenerator<string> {
  const stream = await getClient().models.generateContentStream({
    model: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
    contents: buildContents(request.messages),
    config: {
      systemInstruction: buildSystemInstruction(request.lab),
      temperature: 0.3,
      maxOutputTokens: 8192, // thinking tokens count against this on 2.5 models, so leave headroom
      abortSignal: signal,
    },
  });
  for await (const chunk of stream) {
    if (signal?.aborted) return;
    const text = chunk.text;
    if (text) yield text;
  }
}
