// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SchematicImage } from "./SchematicImage";
import { fallbackImageUrl, resetSchematicCache } from "./schematicClient";

const PROMPT = "A crisp black-and-white schematic of a 5V buck converter with S1, D1, 50uH and 47uF";
const png = () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });

let fetchMock: ReturnType<typeof vi.fn>;
let created: string[];
let revoked: string[];

beforeEach(() => {
  resetSchematicCache();
  created = [];
  revoked = [];
  let n = 0;
  URL.createObjectURL = vi.fn(() => {
    const url = `blob:test-${++n}`;
    created.push(url);
    return url;
  });
  URL.revokeObjectURL = vi.fn((url: string) => {
    revoked.push(url);
  });
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ok = () => Promise.resolve(new Response(png(), { status: 200, headers: { "Content-Type": "image/png" } }));
const fail = (status = 503) => Promise.resolve(new Response(JSON.stringify({ error: "x" }), { status }));

describe("SchematicImage", () => {
  it("shows a loading card, then the server image with the disclaimer, and revokes the URL on unmount", async () => {
    let release!: (r: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (release = resolve)));
    const { unmount } = render(<SchematicImage prompt={PROMPT} autoStart />);
    expect(screen.getByRole("status").textContent).toContain("Generating schematic…");
    await act(async () => release(new Response(png(), { status: 200, headers: { "Content-Type": "image/png" } })));
    const img = await screen.findByRole("img", { name: /AI-generated schematic/ });
    expect(img.getAttribute("src")).toBe("blob:test-1");
    expect(img.getAttribute("alt")).toContain(PROMPT);
    expect(screen.getByText(/Verify it against the netlist/)).toBeTruthy();
    expect(screen.queryByText(/general-purpose image model/)).toBeNull();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/ai/schematic");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ prompt: PROMPT });
    unmount();
    expect(revoked).toContain("blob:test-1");
  });

  it("falls back to the image host URL when the server fails, with the extra note", async () => {
    fetchMock.mockReturnValueOnce(fail(503));
    render(<SchematicImage prompt={PROMPT} autoStart />);
    const img = await screen.findByRole("img", { hidden: true, name: /AI-generated schematic/ });
    const src = img.getAttribute("src")!;
    expect(src).toBe(fallbackImageUrl(PROMPT));
    expect(src.startsWith("https://image.pollinations.ai/prompt/")).toBe(true);
    expect(src).toContain(encodeURIComponent(PROMPT));
    expect(src).toContain("?width=1024&height=640&nologo=true&model=flux");
    expect(screen.getByRole("status")).toBeTruthy(); // still downloading
    fireEvent.load(img);
    expect(await screen.findByText(/general-purpose image model/)).toBeTruthy();
    expect(screen.getByText(/Verify it against the netlist/)).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("falls back on a network error too", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    render(<SchematicImage prompt={PROMPT} autoStart />);
    const img = await screen.findByRole("img", { hidden: true });
    expect(img.getAttribute("src")).toContain("pollinations");
  });

  it("shows a calm error with Retry when the fallback image fails too, and retry asks the server again", async () => {
    fetchMock.mockReturnValueOnce(fail(429));
    render(<SchematicImage prompt={PROMPT} autoStart />);
    const img = await screen.findByRole("img", { hidden: true });
    fireEvent.error(img);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("couldn't be generated");
    expect(alert.textContent).not.toMatch(/429|503|Error/);
    fetchMock.mockReturnValueOnce(ok());
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    const next = await screen.findByRole("img", { name: /AI-generated schematic/ });
    expect(next.getAttribute("src")).toBe("blob:test-1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not fetch for a restored message; it shows a button that generates on click", async () => {
    render(<SchematicImage prompt={PROMPT} autoStart={false} />);
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockReturnValueOnce(ok());
    fireEvent.click(screen.getByRole("button", { name: "Generate schematic image" }));
    await screen.findByRole("img", { name: /AI-generated schematic/ });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("caches per prompt: a remount reuses the result without another request", async () => {
    fetchMock.mockReturnValueOnce(ok());
    const first = render(<SchematicImage prompt={PROMPT} autoStart />);
    await screen.findByRole("img", { name: /AI-generated schematic/ });
    first.unmount();
    render(<SchematicImage prompt={PROMPT} autoStart={false} />);
    expect(await screen.findByRole("img", { name: /AI-generated schematic/ })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("joins an identical request already in flight (StrictMode double mount)", async () => {
    fetchMock.mockReturnValue(ok());
    render(
      <>
        <SchematicImage prompt={PROMPT} autoStart />
        <SchematicImage prompt={PROMPT} autoStart />
      </>,
    );
    await waitFor(() => expect(screen.getAllByRole("img", { name: /AI-generated schematic/ })).toHaveLength(2));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("regenerates on demand with a fresh request", async () => {
    fetchMock.mockReturnValueOnce(ok());
    render(<SchematicImage prompt={PROMPT} autoStart />);
    await screen.findByRole("img", { name: /AI-generated schematic/ });
    fetchMock.mockReturnValueOnce(ok());
    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(revoked).toContain("blob:test-1"));
  });

  it("downloads the server image as mae-schematic-<ts>.png", async () => {
    fetchMock.mockReturnValueOnce(ok());
    render(<SchematicImage prompt={PROMPT} autoStart />);
    await screen.findByRole("img", { name: /AI-generated schematic/ });
    const names: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      names.push(this.download);
    });
    fireEvent.click(screen.getByRole("button", { name: "Download PNG" }));
    await waitFor(() => expect(names).toHaveLength(1));
    expect(names[0]).toMatch(/^mae-schematic-\d+\.png$/);
    click.mockRestore();
  });

  it("opens the fallback image in a new tab when the cross-origin download is blocked", async () => {
    fetchMock.mockReturnValueOnce(fail(503));
    render(<SchematicImage prompt={PROMPT} autoStart />);
    fireEvent.load(await screen.findByRole("img", { hidden: true }));
    await screen.findByText(/general-purpose image model/);
    fetchMock.mockRejectedValueOnce(new TypeError("CORS"));
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    fireEvent.click(screen.getByRole("button", { name: "Download PNG" }));
    await waitFor(() => expect(open).toHaveBeenCalledWith(fallbackImageUrl(PROMPT), "_blank", "noopener,noreferrer"));
    open.mockRestore();
  });

  it("opens a zoomable fullscreen viewer and closes it on Escape", async () => {
    fetchMock.mockReturnValueOnce(ok());
    render(<SchematicImage prompt={PROMPT} autoStart />);
    await screen.findByRole("img", { name: /AI-generated schematic/ });
    fireEvent.click(screen.getByRole("button", { name: "Open schematic larger" }));
    const dialog = await screen.findByRole("dialog");
    const fit = screen.getByRole("button", { name: "Fit to screen" });
    expect(fit.textContent).toBe("Fit");
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(fit.textContent).toMatch(/^\d+%$/);
    fireEvent.click(fit);
    expect(fit.textContent).toBe("Fit");
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("treats the prompt as text only: markup in it is never interpreted and the URL is encoded", async () => {
    const hostile = 'x<img src=x onerror=alert(1)> & "quote" #hash?a=b';
    fetchMock.mockReturnValueOnce(fail(502));
    const { container } = render(<SchematicImage prompt={hostile} autoStart />);
    const img = await screen.findByRole("img", { hidden: true });
    expect(container.querySelectorAll("img")).toHaveLength(1);
    const src = img.getAttribute("src")!;
    expect(src).not.toMatch(/[<>"]/);
    expect(src).toContain(encodeURIComponent(hostile));
  });
});
