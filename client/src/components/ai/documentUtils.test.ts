// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { AI_MAX_DOCUMENT_NAME_CHARS, AI_MAX_PDF_BYTES, AI_MAX_TEXT_DOCUMENT_BYTES } from "@shared/aiTypes";
import { DocumentError, classifyAttachment, clampDocumentName, formatFileSize, prepareDocumentForChat, unsupportedKind } from "./documentUtils";

const file = (parts: BlobPart[], name: string, type: string) => new File(parts, name, { type });
const pdf = (name = "a.pdf") => file(["%PDF-1.4\n%%EOF"], name, "application/pdf");
const kindOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
    return null;
  } catch (error) {
    return error instanceof DocumentError ? error.kind : "other";
  }
};

describe("classifyAttachment", () => {
  it("classifies by MIME", () => {
    expect(classifyAttachment({ type: "image/png", name: "x.png" })).toBe("image");
    expect(classifyAttachment({ type: "application/pdf", name: "x.pdf" })).toBe("document");
    expect(classifyAttachment({ type: "text/plain", name: "x.txt" })).toBe("document");
    expect(classifyAttachment({ type: "text/markdown", name: "x.md" })).toBe("document");
  });

  it("falls back to the extension when the browser reports no type", () => {
    expect(classifyAttachment({ type: "", name: "notes.md" })).toBe("document");
    expect(classifyAttachment({ type: "", name: "NOTES.PDF" })).toBe("document");
    expect(classifyAttachment({ type: "application/octet-stream", name: "a.txt" })).toBe("document");
  });

  it("rejects everything else", () => {
    expect(classifyAttachment({ type: "image/gif", name: "a.gif" })).toBeNull();
    expect(classifyAttachment({ type: "text/csv", name: "a.csv" })).toBeNull();
    expect(classifyAttachment({ type: "", name: "archive.zip" })).toBeNull();
  });

  it("names Office files so the UI can say 'export to PDF'", () => {
    for (const name of ["a.docx", "a.DOC", "slides.pptx", "x.ppt", "sheet.xlsx"]) expect(unsupportedKind({ name })).toBe("office");
    expect(unsupportedKind({ name: "a.zip" })).toBe("type");
  });
});

describe("formatFileSize", () => {
  it("shows KB or MB with one decimal", () => {
    expect(formatFileSize(1536)).toBe("1.5 KB");
    expect(formatFileSize(200 * 1024)).toBe("200.0 KB");
    expect(formatFileSize(5 * 1024 * 1024 + 512 * 1024)).toBe("5.5 MB");
    expect(formatFileSize(10)).toBe("0.1 KB");
  });
});

describe("clampDocumentName", () => {
  it("bounds the length while keeping the extension, and strips control characters", () => {
    const long = `${"a".repeat(300)}.pdf`;
    const out = clampDocumentName(long);
    expect(out.length).toBeLessThanOrEqual(AI_MAX_DOCUMENT_NAME_CHARS);
    expect(out.endsWith(".pdf")).toBe(true);
    expect(clampDocumentName("a\u0000b\n.md")).toBe("ab.md");
  });
});

describe("prepareDocumentForChat", () => {
  it("reads a PDF into a base64 data URL with the wire type", async () => {
    const out = await prepareDocumentForChat(pdf("lecture.pdf"));
    expect(out).toMatchObject({ name: "lecture.pdf", mimeType: "application/pdf" });
    expect(out.size).toBe(14);
    expect(out.dataUrl?.startsWith("data:application/pdf;base64,JVBER")).toBe(true);
  });

  it("reads Markdown whose type is empty, and labels it text/markdown", async () => {
    const out = await prepareDocumentForChat(file(["# Title\nمرحبا"], "notes.md", ""));
    expect(out.mimeType).toBe("text/markdown");
    expect(out.dataUrl?.startsWith("data:text/markdown;base64,")).toBe(true);
  });

  it("rejects empty files, wrong types and Office files before reading", async () => {
    expect(await kindOf(prepareDocumentForChat(file([], "a.pdf", "application/pdf")))).toBe("empty");
    expect(await kindOf(prepareDocumentForChat(file(["x"], "a.zip", "application/zip")))).toBe("type");
    expect(await kindOf(prepareDocumentForChat(file(["x"], "a.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")))).toBe("office");
  });

  it("enforces the size caps from the file size, not its contents", async () => {
    const bigPdf = pdf();
    Object.defineProperty(bigPdf, "size", { value: AI_MAX_PDF_BYTES + 1 });
    expect(await kindOf(prepareDocumentForChat(bigPdf))).toBe("pdf_too_large");
    const bigText = file(["x"], "a.txt", "text/plain");
    Object.defineProperty(bigText, "size", { value: AI_MAX_TEXT_DOCUMENT_BYTES + 1 });
    expect(await kindOf(prepareDocumentForChat(bigText))).toBe("text_too_large");
    const edge = pdf();
    Object.defineProperty(edge, "size", { value: AI_MAX_PDF_BYTES });
    expect(await kindOf(prepareDocumentForChat(edge))).not.toBe("pdf_too_large");
  });

  it("checks the %PDF- magic bytes", async () => {
    expect(await kindOf(prepareDocumentForChat(file(["PK\u0003\u0004 not a pdf"], "fake.pdf", "application/pdf")))).toBe("invalid_pdf");
  });

  it("requires UTF-8 text without NUL bytes", async () => {
    expect(await kindOf(prepareDocumentForChat(file([new Uint8Array([0x68, 0x00, 0x69])], "a.txt", "text/plain")))).toBe("invalid_text");
    expect(await kindOf(prepareDocumentForChat(file([new Uint8Array([0xff, 0xfe, 0x41])], "a.txt", "text/plain")))).toBe("invalid_text");
  });
});
