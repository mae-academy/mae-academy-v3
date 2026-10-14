import type { Request, Response } from "express";
import { MAX_SCHEMATIC_PROMPT_CHARS } from "../shared/aiTypes";
import { AiNotConfiguredError, AiRequestError, assertAiConfigured, geminiApiKey, getGeminiClient, withModelFallback } from "./aiService";
import { nodeClientIp } from "../api/_lib/security/node-adapter";

// Text-to-image schematics for MAE AI: POST /api/ai/schematic { prompt } -> image bytes.

export const MIN_SCHEMATIC_PROMPT_CHARS = 10;
export const DEFAULT_IMAGE_MODEL = "gemini-2.5-flash-image";
export const IMAGE_TIMEOUT_MS = 60_000;

/** Prepended to every prompt server-side, so the style does not depend on the chat model's wording. */
export const STYLE_PREAMBLE =
  "Draw a black-and-white textbook electrical/engineering schematic: pure white background, black thin line art only, IEC 60617 / IEEE standard symbols, clean orthogonal wiring with junction dots, generous spacing between components, every component labeled with its designator and value, nodes labeled. No photograph, no 3D, no shading, no gradients, no colors, no decorative elements, no watermark, no border. The diagram to draw: ";

/** Validates the untrusted body and returns the clean prompt; throws AiRequestError with a client-safe message. */
export function parseSchematicRequest(body: unknown): string {
  const raw = typeof body === "object" && body !== null ? (body as { prompt?: unknown }).prompt : undefined;
  if (typeof raw !== "string") throw new AiRequestError("prompt must be a string.");
  // Control characters (including newlines) become spaces, then whitespace collapses.
  // eslint-disable-next-line no-control-regex
  const prompt = raw.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  if (prompt.length < MIN_SCHEMATIC_PROMPT_CHARS) throw new AiRequestError(`prompt must be at least ${MIN_SCHEMATIC_PROMPT_CHARS} characters.`);
  if (prompt.length > MAX_SCHEMATIC_PROMPT_CHARS) throw new AiRequestError(`prompt is limited to ${MAX_SCHEMATIC_PROMPT_CHARS} characters.`);
  return prompt;
}

export function buildImagePrompt(prompt: string): string {
  return `${STYLE_PREAMBLE}${prompt}`;
}

/** Image models in the order they are tried: env override or default, then the optional fallback. */
export function imageModels(env: NodeJS.ProcessEnv = process.env): string[] {
  const primary = env.GEMINI_IMAGE_MODEL?.trim() || DEFAULT_IMAGE_MODEL;
  const fallback = env.GEMINI_IMAGE_FALLBACK_MODEL?.trim();
  return fallback && fallback !== primary ? [primary, fallback] : [primary];
}

/** The slice of a generateContent response this module reads. */
export interface ImageResponseLike {
  promptFeedback?: { blockReason?: string };
  candidates?: ReadonlyArray<{ finishReason?: string; content?: { parts?: ReadonlyArray<{ inlineData?: { mimeType?: string; data?: string } }> } }>;
}

export class ImageBlockedError extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super("That schematic couldn't be generated.");
    this.name = "ImageBlockedError";
    this.reason = reason;
  }
}

const IMAGE_MIME = /^image\/(png|jpeg|webp)$/;

/** First inline image of the response; throws ImageBlockedError when there is none (blocked or text-only). */
export function extractImage(response: ImageResponseLike): { mimeType: string; data: Buffer } {
  const blockReason = response.promptFeedback?.blockReason;
  if (blockReason) throw new ImageBlockedError(`prompt:${blockReason}`);
  const candidate = response.candidates?.[0];
  for (const part of candidate?.content?.parts ?? []) {
    const inline = part.inlineData;
    if (inline?.data && inline.mimeType && IMAGE_MIME.test(inline.mimeType)) return { mimeType: inline.mimeType, data: Buffer.from(inline.data, "base64") };
  }
  throw new ImageBlockedError(`finish:${candidate?.finishReason ?? "no-image"}`);
}

/** Calls Gemini image generation. The key is read lazily; 429 falls through to GEMINI_IMAGE_FALLBACK_MODEL if set. */
export async function generateSchematicImage(prompt: string, signal?: AbortSignal): Promise<{ mimeType: string; data: Buffer }> {
  const client = getGeminiClient();
  const response = await withModelFallback(
    imageModels(),
    (model) =>
      client.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: buildImagePrompt(prompt) }] }],
        config: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "16:9" }, abortSignal: signal },
      }),
    { signal },
  );
  return extractImage(response);
}

const openByIp = new Set<string>();

/** Express handler for POST /api/ai/schematic. Mount with its own small `express.json` parser. */
export async function schematicHandler(req: Request, res: Response): Promise<void> {
  let prompt: string;
  try {
    prompt = parseSchematicRequest(req.body);
    // Dev without a key and unconfigured production behave the same: 503, and the client falls back to its own image source.
    if (!geminiApiKey()) throw new AiNotConfiguredError();
  } catch (error) {
    if (error instanceof AiNotConfiguredError) res.status(503).json({ error: "image generation not configured" });
    else if (error instanceof AiRequestError) res.status(400).json({ error: error.message });
    else res.status(500).json({ error: "Internal error." });
    return;
  }

  const ip = nodeClientIp(req);
  if (openByIp.has(ip)) {
    res.status(429).json({ error: "A schematic is already being generated. Please wait for it to finish." });
    return;
  }
  openByIp.add(ip);
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), IMAGE_TIMEOUT_MS);
  res.on("close", () => {
    clearTimeout(timer);
    abort.abort();
    openByIp.delete(ip);
  });
  try {
    const image = await generateSchematicImage(prompt, abort.signal);
    if (res.destroyed) return;
    res.status(200).setHeader("Content-Type", image.mimeType);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.end(image.data);
  } catch (error) {
    if (res.destroyed) return;
    const status = (error as { status?: unknown } | null)?.status;
    if (error instanceof ImageBlockedError) {
      console.warn("MAE AI schematic blocked:", error.reason);
      res.status(422).json({ error: error.message });
    } else if (status === 429) {
      res.status(429).json({ error: "Image generation is busy. Please try again in a moment." });
    } else {
      console.error("MAE AI schematic failed:", typeof status === "number" ? `upstream ${status}` : abort.signal.aborted ? "timeout" : error);
      res.status(502).json({ error: "Image generation is unavailable right now." });
    }
  }
}
