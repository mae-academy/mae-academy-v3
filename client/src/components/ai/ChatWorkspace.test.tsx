// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatWorkspace } from "./ChatWorkspace";
import { getComposerValue, typeInComposer } from "./composerTestUtils";
import { LEGACY_CHAT_KEY, THREADS_STORAGE_KEY } from "./chatStorage";

const encoder = new TextEncoder();
const sse = (events: unknown[]) => events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");

function streamResponse(text: string, headers: Record<string, string> = {}): Response {
  // The marker arrives in two pieces, as a real model streams it.
  const cut = text.lastIndexOf("[[SIM:");
  const chunks = cut === -1 ? [text] : [text.slice(0, cut), text.slice(cut, cut + 6), text.slice(cut + 6)];
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(sse([...chunks.map((chunk) => ({ type: "delta", text: chunk })), { type: "done" }])));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream", ...headers } });
}

const requestBodies = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string) as { messages: { role: string; content: string }[]; lab: string });

let fetchMock: ReturnType<typeof vi.fn>;

/** Node's experimental global `localStorage` shadows jsdom's (and throws without a backing file), so tests bring their own. */
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

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
  fetchMock = vi.fn(async () => streamResponse("Use Kirchhoff's voltage law.\n\n[[SIM:circuits]]", { "X-MAE-AI-Mode": "mock" }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const send = () => fireEvent.click(screen.getByRole("button", { name: "Send" }));
const sidebar = () => screen.getByRole("navigation", { name: "Chat history" });

describe("ChatWorkspace thinking effort", () => {
  const bodyEffort = () => (requestBodies(fetchMock).at(-1) as unknown as { thinkingEffort?: string }).thinkingEffort;

  it("sends medium by default, then the chosen level, and remembers it in mae_thinking_effort", async () => {
    render(<ChatWorkspace lab="general" />);
    expect(screen.getByRole("button", { name: "Thinking: Medium (Balanced)" })).toBeTruthy();
    typeInComposer("first");
    send();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(bodyEffort()).toBe("medium");

    fireEvent.keyDown(screen.getByRole("button", { name: "Thinking: Medium (Balanced)" }), { key: "Enter" });
    fireEvent.click(screen.getByRole("menuitemradio", { name: /High/ }));
    expect(localStorage.getItem("mae_thinking_effort")).toBe("high");
    await screen.findByText(/Kirchhoff/);
    typeInComposer("second");
    send();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(bodyEffort()).toBe("high");
  });

  it("restores the saved level on the next visit", () => {
    localStorage.setItem("mae_thinking_effort", "low");
    render(<ChatWorkspace lab="general" />);
    expect(screen.getByRole("button", { name: "Thinking: Low (Fast)" })).toBeTruthy();
  });
});

describe("ChatWorkspace", () => {
  it("starts on the empty state: one h1, the hero mascot, the composer and four suggestion chips; no lab tabs or info cards", () => {
    render(<ChatWorkspace lab="general" />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("What can I help you calculate or build today?");
    expect(document.querySelector('[data-variant="hero"]')).toBeTruthy();
    expect(screen.getByRole("list", { name: "Suggested prompts" }).querySelectorAll("button")).toHaveLength(4);
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.queryByText(/What MAE AI can do/i)).toBeNull();
    expect(screen.getByText("Guest")).toBeTruthy();
  });

  it("fills the composer from a chip, sends, streams, and shows the simulator action only after completion, never the marker", async () => {
    render(<ChatWorkspace lab="control" />);
    fireEvent.click(screen.getByRole("button", { name: "Analyze this KVL circuit" }));
    expect(getComposerValue()).toBe("Analyze this KVL circuit");
    send();

    const action = await screen.findByRole("link", { name: /Open in Interactive Simulator/ });
    expect(action.getAttribute("href")).toBe("/simulations/circuit-lab");
    expect(document.body.textContent).not.toContain("[[SIM");
    expect(screen.getByText(/Use Kirchhoff/)).toBeTruthy();

    // The invisible lab hint rode along; the empty-state hero gave way to the transcript and a hidden h1.
    expect(requestBodies(fetchMock)[0]).toMatchObject({ lab: "control", messages: [{ role: "user", content: "Analyze this KVL circuit" }] });
    expect(document.querySelector('[data-variant="hero"]')).toBeNull();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 }).className).toContain("sr-only");
    // The thread is titled after the first message and highlighted in the sidebar.
    expect(within(sidebar()).getByRole("button", { name: "Analyze this KVL circuit" }).getAttribute("aria-current")).toBe("true");
    // Demo mode notice from the response header, calm and dismissible.
    expect(screen.getByText("Demo mode — add GEMINI_API_KEY for real answers")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss demo mode notice" }));
    expect(screen.queryByText("Demo mode — add GEMINI_API_KEY for real answers")).toBeNull();
  });

  it("strips the marker from earlier answers in the next request", async () => {
    render(<ChatWorkspace lab="general" />);
    typeInComposer("first");
    send();
    await screen.findByRole("link", { name: /Open in Interactive Simulator/ });
    typeInComposer("second");
    send();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const second = requestBodies(fetchMock)[1];
    expect(second.messages.map((m) => m.role)).toEqual(["user", "model", "user"]);
    expect(JSON.stringify(second)).not.toContain("[[SIM");
  });

  it("new chat returns to the empty state, and thread switching restores each conversation", async () => {
    render(<ChatWorkspace lab="general" />);
    typeInComposer("alpha question");
    send();
    await screen.findByRole("link", { name: /Open in Interactive Simulator/ });

    fireEvent.click(screen.getByRole("button", { name: "New chat" }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("What can I help you");
    fetchMock.mockImplementationOnce(async () => streamResponse("Beta answer."));
    typeInComposer("beta question");
    send();
    await screen.findByText("Beta answer.");
    expect(screen.queryByText(/Use Kirchhoff/)).toBeNull();

    const nav = within(sidebar());
    expect(nav.getAllByRole("listitem")).toHaveLength(2);
    fireEvent.click(nav.getByRole("button", { name: "alpha question" }));
    expect(screen.getByText(/Use Kirchhoff/)).toBeTruthy();
    expect(screen.queryByText("Beta answer.")).toBeNull();
    expect(nav.getByRole("button", { name: "alpha question" }).getAttribute("aria-current")).toBe("true");
  });

  it("switching threads mid-stream stops the request but keeps the partial text in its own thread", async () => {
    let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;
    fetchMock.mockImplementationOnce(async (_url: string, init: RequestInit) => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controllerRef = controller;
          controller.enqueue(encoder.encode(sse([{ type: "delta", text: "Partial answer " }])));
          init.signal?.addEventListener("abort", () => { try { controller.error(new DOMException("aborted", "AbortError")); } catch { /* already closed */ } });
        },
      });
      return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
    });
    render(<ChatWorkspace lab="general" />);
    typeInComposer("slow one");
    send();
    await screen.findByText(/Partial answer/);
    expect(screen.getByRole("button", { name: "Stop" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "New chat" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Stop" })).toBeNull());
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("What can I help you");
    expect(controllerRef).not.toBeNull();

    fireEvent.click(within(sidebar()).getByRole("button", { name: "slow one" }));
    expect(screen.getByText(/Partial answer/)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("deletes a thread only after the AlertDialog confirm, falling back to a blank chat", async () => {
    render(<ChatWorkspace lab="general" />);
    typeInComposer("to delete");
    send();
    await screen.findByRole("link", { name: /Open in Interactive Simulator/ });

    const trigger = within(sidebar()).getByRole("button", { name: /Options for chat: to delete/ });
    fireEvent.keyDown(trigger, { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Delete this chat?")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(within(sidebar()).getByRole("button", { name: "to delete" })).toBeTruthy();

    fireEvent.keyDown(within(sidebar()).getByRole("button", { name: /Options for chat: to delete/ }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Delete chat" }));
    await waitFor(() => expect(within(sidebar()).queryByRole("button", { name: "to delete" })).toBeNull());
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("What can I help you");
    expect(within(sidebar()).getByText("Your chats will appear here.")).toBeTruthy();
  });

  it("restores a saved thread from storage and migrates the old single-conversation key on first load", () => {
    const t = Date.now() - 2 * 86_400_000;
    localStorage.setItem(LEGACY_CHAT_KEY, JSON.stringify({ v: 1, messages: [{ id: "1", role: "user", content: "old question", timestamp: t }, { id: "2", role: "model", content: "old answer", timestamp: t + 1 }] }));
    render(<ChatWorkspace lab="general" />);
    expect(screen.getByText("old answer")).toBeTruthy();
    expect(within(sidebar()).getByText("Previous 7 days")).toBeTruthy();
    expect(within(sidebar()).getByRole("button", { name: "old question" })).toBeTruthy();
    expect(localStorage.getItem(LEGACY_CHAT_KEY)).toBeNull();
    expect(JSON.parse(localStorage.getItem(THREADS_STORAGE_KEY) ?? "{}").threads).toHaveLength(1);
  });

  it("shows a friendly localized message with Retry on 503, never the server's text", async () => {
    fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({ error: "GEMINI_API_KEY is not set on the server" }), { status: 503 }));
    render(<ChatWorkspace lab="general" />);
    typeInComposer("hello");
    send();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("taking a short break");
    expect(document.body.textContent).not.toContain("GEMINI_API_KEY is not set");
    expect(within(alert).getByRole("button", { name: "Retry" })).toBeTruthy();
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    await screen.findByRole("link", { name: /Open in Interactive Simulator/ });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
