// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatDocument } from "@shared/aiTypes";
import { ChatWorkspace } from "./ChatWorkspace";
import { composer, composerPlaceholder, getComposerValue, typeInComposer } from "./composerTestUtils";
import { DocumentBadge } from "./DocumentBadge";
import { UserMessage } from "./ChatMessages";
import { THREADS_STORAGE_KEY } from "./chatStorage";

// These tests mount the whole workspace and read files; testing-library's default 1 s waitFor is too tight when the
// full suite (Pyodide, simulators) is hogging the CPU.
configure({ asyncUtilTimeout: 5000 });

const toastMock = vi.hoisted(() => ({ error: vi.fn(), info: vi.fn(), success: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("./imageUtils", async (importActual) => {
  const actual = await importActual<typeof import("./imageUtils")>();
  return { ...actual, prepareImageForChat: vi.fn(async () => "data:image/jpeg;base64,/9j/AAAA") };
});

const encoder = new TextEncoder();
const sse = (events: unknown[]) => events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
const streamResponse = (text: string) =>
  new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(sse([{ type: "delta", text }, { type: "done" }])));
        controller.close();
      },
    }),
    { status: 200, headers: { "content-type": "text/event-stream" } },
  );

type Body = { messages: { role: string; content: string; imageUrl?: string; document?: ChatDocument }[] };
const bodies = (fetchMock: ReturnType<typeof vi.fn>) => fetchMock.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string) as Body);

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; },
    clear: () => data.clear(),
    getItem: (key: string) => data.get(key) ?? null,
    key: (index: number) => [...data.keys()][index] ?? null,
    removeItem: (key: string) => { data.delete(key); },
    setItem: (key: string, value: string) => { data.set(key, String(value)); },
  };
}

let fetchMock: ReturnType<typeof vi.fn>;
let storage: Storage;
beforeEach(() => {
  storage = memoryStorage();
  vi.stubGlobal("localStorage", storage);
  fetchMock = vi.fn(async () => streamResponse("Here is the summary."));
  vi.stubGlobal("fetch", fetchMock);
  Object.values(toastMock).forEach((fn) => fn.mockClear());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const pdf = (name = "lecture-notes.pdf") => new File(["%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF"], name, { type: "application/pdf" });
const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;
const pick = (file: File) => fireEvent.change(fileInput(), { target: { files: [file] } });
const attach = async (file = pdf()) => {
  pick(file);
  await screen.findByRole("button", { name: "Remove attachment" });
};
const ask = async (text: string, replies: number) => {
  typeInComposer(text);
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(screen.getAllByText("Here is the summary.")).toHaveLength(replies));
};

describe("DocumentBadge", () => {
  it("shows the name with a full-name tooltip, a one-decimal size and a remove button", () => {
    const onRemove = vi.fn();
    const name = `${"very-long-lecture-title-".repeat(6)}.pdf`;
    render(<DocumentBadge document={{ name, size: 1536 }} onRemove={onRemove} />);
    const label = screen.getByTitle(name);
    expect(label.className).toContain("truncate");
    expect(label.getAttribute("dir")).toBe("auto");
    expect(screen.getByText("1.5 KB")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove attachment" }));
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it("formats megabytes and has no button when read-only", () => {
    render(<DocumentBadge document={{ name: "a.pdf", size: 3.25 * 1024 * 1024 }} />);
    expect(screen.getByText("3.3 MB")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("UserMessage with a document", () => {
  const doc = { name: "a.pdf", mimeType: "application/pdf" as const, size: 2048 };
  it("shows the badge, not clickable, and no re-attach note while the bytes exist", () => {
    render(<UserMessage message={{ id: "u", role: "user", content: "q", timestamp: 1, document: { ...doc, dataUrl: "data:application/pdf;base64,JVBER" } }} onImageLoad={() => {}} />);
    expect(screen.getByText("a.pdf")).toBeTruthy();
    expect(screen.getByText("2.0 KB")).toBeTruthy();
    expect(screen.queryByText("Re-attach this file to ask more about it")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("notes that the file must be re-attached once the bytes are gone", () => {
    render(<UserMessage message={{ id: "u", role: "user", content: "q", timestamp: 1, document: doc }} onImageLoad={() => {}} />);
    expect(screen.getByText("Re-attach this file to ask more about it")).toBeTruthy();
  });
});

describe("attaching documents in the composer", () => {
  it("accepts images, PDFs and text from the picker", () => {
    render(<ChatWorkspace lab="general" />);
    const accept = fileInput().accept;
    for (const part of ["image/png", "image/jpeg", "image/webp", "application/pdf", ".pdf", "text/plain", "text/markdown", ".md", ".txt"]) expect(accept).toContain(part);
  });

  it("shows the badge, document placeholder and three suggestion chips that fill the draft", async () => {
    render(<ChatWorkspace lab="general" />);
    await attach();
    expect(screen.getByTitle("lecture-notes.pdf")).toBeTruthy();
    expect(composerPlaceholder()).toBe("Ask a question about this document…");
    const chips = within(screen.getByRole("list", { name: "Suggested questions about the document" })).getAllByRole("button");
    expect(chips.map((c) => c.textContent)).toEqual(["Summarise this document", "Explain the derivations step by step", "Check it for errors"]);
    fireEvent.click(chips[1]);
    expect(getComposerValue()).toBe("Explain the derivations step by step");
  });

  it("requires a question: the send button stays disabled with an empty draft", async () => {
    render(<ChatWorkspace lab="general" />);
    await attach();
    expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("removes the attachment", async () => {
    render(<ChatWorkspace lab="general" />);
    await attach();
    fireEvent.click(screen.getByRole("button", { name: "Remove attachment" }));
    expect(screen.queryByTitle("lecture-notes.pdf")).toBeNull();
    expect(composerPlaceholder()).not.toContain("document");
  });

  it("explains that Word and PowerPoint files are not supported yet", async () => {
    render(<ChatWorkspace lab="general" />);
    pick(new File(["x"], "slides.pptx", { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" }));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith("Word and PowerPoint files aren't supported yet — export to PDF and attach that."));
    expect(screen.queryByRole("button", { name: "Remove attachment" })).toBeNull();
  });

  it("rejects other types, oversize PDFs, fake PDFs and empty files with a toast", async () => {
    render(<ChatWorkspace lab="general" />);
    pick(new File(["x"], "a.zip", { type: "application/zip" }));
    await waitFor(() => expect(toastMock.error).toHaveBeenLastCalledWith("Only images, PDF, Markdown and plain text files can be attached."));
    const big = pdf("big.pdf");
    Object.defineProperty(big, "size", { value: 7 * 1024 * 1024 });
    pick(big);
    await waitFor(() => expect(toastMock.error).toHaveBeenLastCalledWith("That PDF is too large (over 6 MB)."));
    pick(new File(["hello"], "fake.pdf", { type: "application/pdf" }));
    await waitFor(() => expect(toastMock.error).toHaveBeenLastCalledWith("That file isn't a valid PDF."));
    pick(new File([], "empty.md", { type: "" }));
    await waitFor(() => expect(toastMock.error).toHaveBeenLastCalledWith("That file is empty."));
    expect(screen.queryByRole("button", { name: "Remove attachment" })).toBeNull();
  });

  it("attaches a PDF dropped on the canvas, and explains a dropped Office file", async () => {
    const { container } = render(<ChatWorkspace lab="general" />);
    const root = container.firstElementChild as HTMLElement;
    fireEvent.drop(root, { dataTransfer: { types: ["Files"], files: [pdf("dropped.pdf")] } });
    await screen.findByTitle("dropped.pdf");
    fireEvent.drop(root, { dataTransfer: { types: ["Files"], files: [new File(["x"], "a.docx", { type: "" })] } });
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith("Word and PowerPoint files aren't supported yet — export to PDF and attach that."));
  });

  it("attaches a PDF pasted from the clipboard", async () => {
    render(<ChatWorkspace lab="general" />);
    fireEvent.paste(composer(), { clipboardData: { files: [pdf("pasted.pdf")], getData: () => "" } });
    await screen.findByTitle("pasted.pdf");
  });

  it("keeps one attachment per message: a document replaces an image and vice versa, with a hint", async () => {
    render(<ChatWorkspace lab="general" />);
    pick(new File(["x"], "shot.png", { type: "image/png" }));
    await screen.findByAltText("Attached image");
    pick(pdf("doc.pdf"));
    await screen.findByTitle("doc.pdf");
    expect(screen.queryByAltText("Attached image")).toBeNull();
    expect(toastMock.info).toHaveBeenLastCalledWith("The document replaced the attached image. One attachment per message.");
    pick(new File(["x"], "shot.png", { type: "image/png" }));
    await screen.findByAltText("Attached image");
    expect(screen.queryByTitle("doc.pdf")).toBeNull();
    expect(toastMock.info).toHaveBeenLastCalledWith("The image replaced the attached document. One attachment per message.");
  });
});

describe("sending with a document", () => {
  it("sends the PDF on the last user message, keeps it for follow-ups (metadata only earlier) and never stores the bytes", async () => {
    render(<ChatWorkspace lab="general" />);
    await attach();
    await ask("Summarise this document", 1);
    expect(screen.queryByRole("button", { name: "Remove attachment" })).toBeNull();
    expect(screen.getByText("lecture-notes.pdf")).toBeTruthy();

    const first = bodies(fetchMock)[0].messages;
    expect(first[first.length - 1].document).toMatchObject({ name: "lecture-notes.pdf", mimeType: "application/pdf" });
    expect(first[first.length - 1].document?.dataUrl?.startsWith("data:application/pdf;base64,JVBER")).toBe(true);

    await ask("And what about page 2?", 2);
    const second = bodies(fetchMock)[1].messages;
    const users = second.filter((m) => m.role === "user");
    expect(users[0].document?.dataUrl).toBeUndefined();
    expect(users[0].document?.name).toBe("lecture-notes.pdf");
    expect(users[1].content).toBe("And what about page 2?");
    expect(users[1].document?.dataUrl?.startsWith("data:application/pdf;base64,JVBER")).toBe(true);

    await waitFor(() => expect(storage.getItem(THREADS_STORAGE_KEY)).toContain("lecture-notes.pdf"), { timeout: 2500 });
    expect(storage.getItem(THREADS_STORAGE_KEY)).not.toContain("JVBER");
  });

  it("resends the document when regenerating the answer", async () => {
    render(<ChatWorkspace lab="general" />);
    await attach();
    await ask("Summarise this document", 1);
    fireEvent.click(screen.getByRole("button", { name: "Regenerate response" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const messages = bodies(fetchMock)[1].messages;
    expect(messages).toHaveLength(1);
    expect(messages[0].document?.dataUrl?.startsWith("data:application/pdf;base64,JVBER")).toBe(true);
  });

  it("after a reload the message keeps its badge with a re-attach note and no bytes go out", async () => {
    const first = render(<ChatWorkspace lab="general" />);
    await attach();
    await ask("Summarise this document", 1);
    await waitFor(() => expect(storage.getItem(THREADS_STORAGE_KEY)).toContain("lecture-notes.pdf"), { timeout: 2500 });
    first.unmount();

    render(<ChatWorkspace lab="general" />);
    expect(await screen.findByText("Re-attach this file to ask more about it")).toBeTruthy();
    await ask("Another question", 2);
    const messages = bodies(fetchMock)[1].messages;
    expect(messages.some((m) => m.document?.dataUrl)).toBe(false);
  });
});
