import { AI_MAX_IMAGE_BYTES } from "@shared/aiTypes";

export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
/** The longer side of an uploaded image; also keeps a very tall screenshot from allocating an enormous canvas. */
export const MAX_IMAGE_DIMENSION = 1200;
/** Refuse absurd inputs before decoding them. */
export const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
const JPEG_QUALITIES = [0.8, 0.6] as const;

export type ImageErrorKind = "type" | "source_too_large" | "decode" | "too_large";

export class ImageError extends Error {
  constructor(readonly kind: ImageErrorKind) {
    super(kind);
    this.name = "ImageError";
  }
}

export function isAcceptedImageType(type: string): boolean {
  return (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(type);
}

/** Target size: the longer side at most `maxDimension`, aspect ratio kept, never upscaled. */
export function fitWithin(width: number, height: number, maxDimension = MAX_IMAGE_DIMENSION): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: 1, height: 1 };
  const scale = Math.min(1, maxDimension / width, maxDimension / height);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Decoded byte length of a base64 data URL, without decoding it. */
export function dataUrlBytes(dataUrl: string): number {
  const payload = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  return Math.floor((payload.length * 3) / 4) - padding;
}

interface Decoded {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

async function decode(file: Blob): Promise<Decoded> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      /* fall through to the <img> decoder */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new ImageError("decode"));
      image.src = url;
    });
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, release: () => URL.revokeObjectURL(url) };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

/**
 * Validates and shrinks an image for upload: longer side at most 1200px, JPEG q0.8 on a white background (so transparent PNGs
 * do not turn black), re-encoded once at lower quality if it is still over the server's size cap.
 * Resolves to a `data:image/jpeg;base64,...` URL; rejects with ImageError.
 */
export async function prepareImageForChat(file: Blob): Promise<string> {
  if (!isAcceptedImageType(file.type)) throw new ImageError("type");
  if (file.size > MAX_SOURCE_BYTES) throw new ImageError("source_too_large");

  let decoded: Decoded;
  try {
    decoded = await decode(file);
  } catch {
    throw new ImageError("decode");
  }
  try {
    const { width, height } = fitWithin(decoded.width, decoded.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new ImageError("decode");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(decoded.source, 0, 0, width, height);
    for (const quality of JPEG_QUALITIES) {
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      if (dataUrlBytes(dataUrl) <= AI_MAX_IMAGE_BYTES) return dataUrl;
    }
    throw new ImageError("too_large");
  } finally {
    decoded.release();
  }
}
