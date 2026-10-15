// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatWorkspace } from "./ChatWorkspace";
import { composer, getComposerValue, typeInComposer } from "./composerTestUtils";
import { ACTIVE_THREAD_KEY, THREADS_STORAGE_KEY } from "./chatStorage";

const encoder = new TextEncoder();
const sse = (events: unknown[]) => events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
function streamResponse(text: string): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(sse([{ type: "delta", text }, { type: "done" }])));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

interface Body { messages: { role: string; content: string; imageUrl?: string; document?: unknown }[]; lab: string; stepMode?: boolean }
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
let replies: string[];
beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
  replies = [];
  let n = 0;
  fetchMock = vi.fn(async () => streamResponse(replies.shift() ?? `Answer ${++n}.`));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const type = (text: string) => typeInComposer(text);
const send = (name = "Send") => fireEvent.click(screen.getByRole("button", { name }));
const turn = async (text: string, answer: RegExp) => {
  type(text);
  send();
  await screen.findByText(answer);
};
const visibleText = (el: Element) => {
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll(".katex-mathml").forEach((node) => node.remove());
  return clone.textContent ?? "";
};

describe("editing a user message", () => {
  it("replaces the message and truncates the rest: no duplicate bubble, stale reply or extra request state", async () => {
    render(<ChatWorkspace lab="general" />);
    await turn("question one", /Answer 1\./);
    await turn("question two", /Answer 2\./);
    await turn("question three", /Answer 3\./);

    const edits = screen.getAllByRole("button", { name: "Edit message" });
    expect(edits).toHaveLength(3);
    fireEvent.click(edits[1]);
    expect(screen.getByText("Editing message")).toBeTruthy();
    expect(getComposerValue()).toBe("question two");
    expect(document.querySelector('[data-editing="true"]')).toBeTruthy();

    type("question two EDITED");
    send("Send edited message");
    await screen.findByText(/Answer 4\./);

    expect(bodies(fetchMock)[3].messages.map((m) => `${m.role}:${m.content}`)).toEqual(["user:question one", "model:Answer 1.", "user:question two EDITED"]);
    expect(screen.queryByText("question two")).toBeNull();
    expect(screen.queryByText("question three")).toBeNull();
    expect(screen.queryByText(/Answer 2\./)).toBeNull();
    expect(screen.queryByText(/Answer 3\./)).toBeNull();
    expect(screen.getAllByText("question two EDITED")).toHaveLength(1);
    expect(screen.getByText(/Answer 1\./)).toBeTruthy();
    expect(screen.queryByText("Editing message")).toBeNull();
    expect(getComposerValue()).toBe("");
    expect(screen.queryByRole("alert")).toBeNull();

    cleanup(); // unmount flushes storage
    const saved = JSON.parse(localStorage.getItem(THREADS_STORAGE_KEY) ?? "{}").threads[0].messages as { role: string; content: string }[];
    expect(saved.map((m) => `${m.role}:${m.content}`)).toEqual(["user:question one", "model:Answer 1.", "user:question two EDITED", "model:Answer 4."]);
  });

  it("edits the first message and retitles the thread; Cancel and Escape leave the thread untouched and restore the draft", async () => {
    render(<ChatWorkspace lab="general" />);
    await turn("first question", /Answer 1\./);
    type("half-typed draft");
    fireEvent.click(screen.getByRole("button", { name: "Edit message" }));
    expect(getComposerValue()).toBe("first question");
    fireEvent.click(screen.getByRole("button", { name: "Cancel editing" }));
    expect(getComposerValue()).toBe("half-typed draft");
    expect(screen.queryByText("Editing message")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Edit message" }));
    fireEvent.keyDown(composer(), { key: "Escape" });
    expect(getComposerValue()).toBe("half-typed draft");
    expect(document.querySelector('[data-editing="true"]')).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Edit message" }));
    type("brand new opener");
    send("Send edited message");
    await screen.findByText(/Answer 2\./);
    expect(within(screen.getByRole("navigation", { name: "Chat history" })).getByRole("button", { name: "brand new opener" })).toBeTruthy();
    expect(bodies(fetchMock)[1].messages).toHaveLength(1);
    expect(getComposerValue()).toBe("half-typed draft");
  });

  it("refuses an empty edit and offers no Edit button while a reply streams", async () => {
    render(<ChatWorkspace lab="general" />);
    await turn("hello", /Answer 1\./);
    fireEvent.click(screen.getByRole("button", { name: "Edit message" }));
    type("   ");
    expect((screen.getByRole("button", { name: "Send edited message" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(composer(), { key: "Escape" });

    let release: () => void = () => {};
    fetchMock.mockImplementationOnce(async () => new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(sse([{ type: "delta", text: "partial " }])));
        release = () => { controller.enqueue(encoder.encode(sse([{ type: "done" }]))); controller.close(); };
      },
    }), { status: 200, headers: { "content-type": "text/event-stream" } }));
    type("slow");
    send();
    await screen.findByText(/partial/);
    expect(screen.queryByRole("button", { name: "Edit message" })).toBeNull();
    await act(async () => { release(); });
  });

  it("keeps an attached image in edit mode and lets it be removed", async () => {
    const IMG = "data:image/png;base64,iVBORw0KGgo=";
    // Seed a message with an image through storage, as a restored chat would hold it.
    localStorage.setItem(ACTIVE_THREAD_KEY, "t1");
    localStorage.setItem(THREADS_STORAGE_KEY, JSON.stringify({ v: 2, threads: [{ id: "t1", createdAt: 1, updatedAt: 2, messages: [{ id: "a", role: "user", content: "what is this", imageUrl: IMG, timestamp: 1 }, { id: "b", role: "model", content: "A resistor.", timestamp: 2 }] }] }));
    render(<ChatWorkspace lab="general" />);
    fireEvent.click(screen.getByRole("button", { name: "Edit message" }));
    expect(screen.getAllByAltText("Attached image").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Remove attached image" }));
    type("what is this part");
    send("Send edited message");
    await screen.findByText(/Answer 1\./);
    const body = bodies(fetchMock)[0];
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].imageUrl).toBeUndefined();
  });
});

describe("inline math in the composer and rendered user bubbles", () => {
  it("editing a sent message that holds a formula loads it as a math node, and the edit sends the same clean string", async () => {
    render(<ChatWorkspace lab="general" />);
    await turn("evaluate $\\int_{a}^{b} x\\,dx$ now", /Answer 1\./);
    fireEvent.click(screen.getByRole("button", { name: "Edit message" }));
    expect(screen.getByText("Editing message")).toBeTruthy();
    expect(document.querySelectorAll("[data-math-input] [data-mae-math]")).toHaveLength(1);
    expect(visibleText(composer())).not.toContain("$");
    expect(getComposerValue()).toBe("evaluate $\\int_{a}^{b} x\\,dx$ now");
    send("Send edited message");
    await screen.findByText(/Answer 2\./);
    expect(bodies(fetchMock)[1].messages.at(-1)?.content).toBe("evaluate $\\int_{a}^{b} x\\,dx$ now");
  });

  it("shows a draft's formulas inline as math nodes (no preview strip, no raw dollars or commands), and survives invalid LaTeX", () => {
    render(<ChatWorkspace lab="general" />);
    expect(document.querySelector("[data-math-input] [data-mae-math]")).toBeNull();
    type("compute $\\int_{a}^{b} f(x)\\,dx$ please");
    const nodes = document.querySelectorAll("[data-math-input] [data-mae-math]");
    expect(nodes).toHaveLength(1);
    expect(document.querySelector("[data-math-preview]")).toBeNull();
    expect(visibleText(composer())).not.toContain("$");
    expect(visibleText(composer())).not.toContain("\\int");
    expect(visibleText(composer())).toContain("please");
    expect(getComposerValue()).toBe("compute $\\int_{a}^{b} f(x)\\,dx$ please");

    type("plain text, price 5 dollars");
    expect(document.querySelector("[data-math-input] [data-mae-math]")).toBeNull();

    expect(() => type("bad $\\frac{1}{$ and $\\notacommand{x}$ end")).not.toThrow();
    expect(visibleText(composer())).toContain("end");
  });

  it("renders the sent message through KaTeX, copies and sends raw LaTeX", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<ChatWorkspace lab="general" />);
    const raw = "evaluate $\\int_{a}^{b} x^2\\,dx$ for me";
    type(raw);
    send();
    await screen.findByText(/Answer 1\./);

    expect(bodies(fetchMock)[0].messages[0].content).toBe(raw);
    const bubble = within(screen.getByRole("log")).getByText(/evaluate/).closest("p")!;
    expect(bubble.querySelector(".katex")).toBeTruthy();
    expect(visibleText(bubble)).not.toContain("$\\int");
    expect(visibleText(bubble)).not.toContain("$");

    const [userCopy] = screen.getAllByRole("button", { name: "Copy message" });
    await act(async () => { fireEvent.click(userCopy); });
    expect(writeText).toHaveBeenCalledWith(raw);
  });

  it("only interprets math in a user message: no Markdown headings or lists, currency stays literal", async () => {
    render(<ChatWorkspace lab="general" />);
    type("# not a heading\n- not a list\ncost is $5 and $10 total");
    send();
    await screen.findByText(/Answer 1\./);
    const userBubble = within(screen.getByRole("log")).getByText(/not a heading/).closest("p")!;
    expect(userBubble.querySelector("h1, ul, li")).toBeNull();
    expect(userBubble.querySelector(".katex")).toBeNull();
    expect(userBubble.textContent).toContain("$5 and $10");
  });
});

describe("step-by-step guidance", () => {
  const toggle = () => screen.getByRole("switch", { name: /Step Guidance/ });

  it("is an accessible switch, off by default, persisted, and sends the flag only while on", async () => {
    render(<ChatWorkspace lab="general" />);
    expect(toggle().getAttribute("aria-checked")).toBe("false");
    expect(toggle().getAttribute("aria-label")).toBe("Step Guidance: OFF");
    await turn("first", /Answer 1\./);
    expect(bodies(fetchMock)[0]).not.toHaveProperty("stepMode");

    fireEvent.click(toggle());
    expect(toggle().getAttribute("aria-checked")).toBe("true");
    expect(toggle().getAttribute("aria-label")).toBe("Step Guidance: ON");
    expect(localStorage.getItem("mae-ai:step-mode:v1")).toBe("on");
    await turn("second", /Answer 2\./);
    expect(bodies(fetchMock)[1].stepMode).toBe(true);

    fireEvent.click(toggle());
    expect(localStorage.getItem("mae-ai:step-mode:v1")).toBe("off");
    await turn("third", /Answer 3\./);
    expect(bodies(fetchMock)[2]).not.toHaveProperty("stepMode");

    fireEvent.click(toggle());
    cleanup();
    render(<ChatWorkspace lab="general" />);
    expect(toggle().getAttribute("aria-checked")).toBe("true");
  });

  it("shows the progress chip and a Reveal button for a non-final latest step; the marker is never visible", async () => {
    localStorage.setItem("mae-ai:step-mode:v1", "on");
    replies = ["Given $V=10$ V. Apply KVL.\nWhat is the equation?\n[[STEP:1/3]]", "Right. Now solve.\nWhat is $i(t)$?\n[[STEP:2/3]]", "Final: $i=5$ A.\n[[STEP:3/3]]"];
    render(<ChatWorkspace lab="general" />);
    type("solve the circuit");
    send();
    await screen.findByText(/Apply KVL/);
    expect(document.body.textContent).not.toContain("[[STEP");
    expect(document.body.textContent).not.toContain("STEP:");
    expect(screen.getByRole("img", { name: "Step 1 of 3" })).toBeTruthy();
    const reveal = screen.getByRole("button", { name: /Reveal Step 2/ });

    fireEvent.click(reveal);
    await screen.findByText(/Now solve/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const second = bodies(fetchMock)[1];
    expect(second.messages.at(-1)!.content).toBe("Continue to the next step.");
    expect(second.messages.map((m) => m.role)).toEqual(["user", "model", "user"]);
    expect(JSON.stringify(second)).not.toContain("STEP:");
    expect(second.stepMode).toBe(true);
    expect(screen.getAllByRole("button", { name: /Reveal Step/ })).toHaveLength(1); // only the latest message offers it
    expect(screen.getByRole("img", { name: "Step 2 of 3" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Reveal Step 3/ }));
    await screen.findByText(/Final:/);
    expect(screen.queryByRole("button", { name: /Reveal Step/ })).toBeNull(); // last step
    expect(screen.getByRole("img", { name: "Step 3 of 3" })).toBeTruthy();
  });

  it("hides the Reveal button when guidance is off but still keeps the marker hidden", async () => {
    replies = ["Step text.\n[[STEP:1/3]]"];
    render(<ChatWorkspace lab="general" />);
    type("solve it");
    send();
    await screen.findByText(/Step text\./);
    expect(screen.queryByRole("button", { name: /Reveal Step/ })).toBeNull();
    expect(document.body.textContent).not.toContain("[[STEP");
  });

  it("does not leak the marker through copy", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    localStorage.setItem("mae-ai:step-mode:v1", "on");
    replies = ["Step text.\n[[STEP:1/3]]"];
    render(<ChatWorkspace lab="general" />);
    type("solve it");
    send();
    await screen.findByText(/Step text\./);
    const copies = screen.getAllByRole("button", { name: "Copy message" });
    await act(async () => { fireEvent.click(copies[1]); });
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(JSON.stringify(writeText.mock.calls)).not.toContain("STEP");
  });
});
