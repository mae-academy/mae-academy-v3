import { AI_MAX_DOCUMENT_NAME_CHARS, AI_MAX_PDF_BYTES, AI_MAX_TEXT_DOCUMENT_BYTES, type ChatDocument, type DocumentMimeType } from "@shared/aiTypes";
import { isAcceptedImageType } from "./imageUtils";

export type DocumentErrorKind = "type" | "office" | "empty" | "pdf_too_large" | "text_too_large" | "invalid_pdf" | "invalid_text" | "read";

export class DocumentError extends Error {
  constructor(readonly kind: DocumentErrorKind) {
    super(kind);
    this.name = "DocumentError";
  }
}

const OFFICE_EXTENSIONS = /\.(docx?|pptx?|xlsx?)$/i;
const PDF_MAGIC = "%PDF-";

/** The extension-less browsers report `.md` as '' or `application/octet-stream`, so the name is the fallback. */
function documentMime(file: { type: string; name?: string }): DocumentMimeType | null {
  const type = file.type.toLowerCase();
  const name = file.name ?? "";
  if (type === "application/pdf") return "application/pdf";
  if (type === "text/markdown" || type === "text/x-markdown") return "text/markdown";
  if (type === "text/plain") return /\.(md|markdown)$/i.test(name) ? "text/markdown" : "text/plain";
  if (type === "" || type === "application/octet-stream") {
    if (/\.pdf$/i.test(name)) return "application/pdf";
    if (/\.(md|markdown)$/i.test(name)) return "text/markdown";
    if (/\.txt$/i.test(name)) return "text/plain";
  }
  return null;
}

export type AttachmentKind = "image" | "document";

/** What a picked, pasted or dropped file is. Returns null for anything that cannot be attached. */
export function classifyAttachment(file: { type: string; name?: string }): AttachmentKind | null {
  if (isAcceptedImageType(file.type)) return "image";
  return documentMime(file) ? "document" : null;
}

/** The localized-error kind for a file that is neither an image nor a supported document. */
export function unsupportedKind(file: { name?: string }): "office" | "type" {
  return OFFICE_EXTENSIONS.test(file.name ?? "") ? "office" : "type";
}

export function formatFileSize(bytes: number): string {
  if (!(bytes > 0)) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(0.1, bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Keeps the extension while capping the name length (the badge truncates visually; this bounds what goes on the wire). */
export function clampDocumentName(name: string): string {
  const clean = name.replace(/[\u0000-\u001f\u007f]/g, "").trim() || "document";
  if (clean.length <= AI_MAX_DOCUMENT_NAME_CHARS) return clean;
  const dot = clean.lastIndexOf(".");
  const ext = dot > 0 && clean.length - dot <= 8 ? clean.slice(dot) : "";
  return clean.slice(0, AI_MAX_DOCUMENT_NAME_CHARS - 1 - ext.length) + "…" + ext;
}

function readBlob<T extends string | ArrayBuffer>(blob: Blob, method: "readAsDataURL" | "readAsArrayBuffer"): Promise<T> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as T);
    reader.onerror = () => reject(new DocumentError("read"));
    reader.onabort = () => reject(new DocumentError("read"));
    reader[method](blob);
  });
}

/**
 * Validates a PDF or text/Markdown file and reads it into a `ChatDocument` with a base64 `dataUrl`. The size caps and the
 * type are checked before any byte is read; a PDF must start with `%PDF-`, text must be UTF-8 without NUL bytes.
 * Rejects with DocumentError.
 */
export async function prepareDocumentForChat(file: File): Promise<ChatDocument> {
  const mimeType = documentMime(file);
  if (!mimeType) throw new DocumentError(unsupportedKind(file));
  if (file.size === 0) throw new DocumentError("empty");
  const isPdf = mimeType === "application/pdf";
  if (file.size > (isPdf ? AI_MAX_PDF_BYTES : AI_MAX_TEXT_DOCUMENT_BYTES)) throw new DocumentError(isPdf ? "pdf_too_large" : "text_too_large");

  if (isPdf) {
    const head = new Uint8Array(await readBlob<ArrayBuffer>(file.slice(0, PDF_MAGIC.length), "readAsArrayBuffer"));
    if (Array.from(head, (byte) => String.fromCharCode(byte)).join("") !== PDF_MAGIC) throw new DocumentError("invalid_pdf");
  } else {
    const bytes = new Uint8Array(await readBlob<ArrayBuffer>(file, "readAsArrayBuffer"));
    if (bytes.includes(0)) throw new DocumentError("invalid_text");
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new DocumentError("invalid_text");
    }
  }

  const raw = await readBlob<string>(file, "readAsDataURL");
  const comma = raw.indexOf(",");
  if (comma === -1) throw new DocumentError("read");
  // The reported type may be '' (.md); the wire type is the classified one.
  return { name: clampDocumentName(file.name), mimeType, size: file.size, dataUrl: `data:${mimeType};base64,${raw.slice(comma + 1)}` };
}
