// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiMarkdown } from "./AiMarkdown";
import { IllustrationImage } from "./IllustrationImage";
import { resetIllustrationCache } from "./illustrationClient";
import { SchematicAutoRepairContext } from "./SchematicDiagram";

const PROMPT = "Publication-grade technical illustration of electric machine types, labeled components (stator, rotor, brushes)";
const png = () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });

let fetchMock: ReturnType<typeof vi.fn>;
let revoked: string[];

beforeEach(() => {
  resetIllustrationCache();
  revoked = [];
  let n = 0;
  URL.createObjectURL = vi.fn(() => `blob:test-${++n}`);
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

const fail = (status: number) => Promise.resolve(new Response(JSON.stringify({ error: "x" }), { status }));

describe("IllustrationImage", () => {
  it("shows the skeleton, then the image with the disclaimer, and revokes the blob URL on unmount", async () => {
    let release!: (r: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (release = resolve)));
    const { unmount } = render(<IllustrationImage prompt={PROMPT} autoStart />);
    expect(screen.getByRole("status").textContent).toContain("Generating illustration…");
    await act(async () => release(new Response(png(), { status: 200, headers: { "Content-Type": "image/png" } })));
    const img = await screen.findByRole("img", { name: /AI-generated illustration/ });
    expect(img.getAttribute("src")).toBe("blob:test-1");
    expect(screen.getByText(/AI-generated illustration — verify against the explanation/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Download PNG" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Regenerate" })).toBeTruthy();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/ai/generate-image");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ prompt: PROMPT });
    unmount();
    expect(revoked).toContain("blob:test-1");
  });

  it("shows a calm unavailable card with the service hint on 429 and 503, and Retry works", async () => {
    fetchMock.mockReturnValueOnce(fail(429));
    render(<IllustrationImage prompt={PROMPT} autoStart />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Illustration generation isn't available right now");
    expect(alert.textContent).toContain("image service needs to be enabled");
    expect(alert.textContent).not.toMatch(/429|quota|limit/i);
    fetchMock.mockReturnValueOnce(Promise.resolve(new Response(png(), { status: 200, headers: { "Content-Type": "image/png" } })));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Retry" })));
    expect(await screen.findByRole("img", { name: /AI-generated illustration/ })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shows no service hint for a generic failure", async () => {
    fetchMock.mockReturnValueOnce(fail(502));
    render(<IllustrationImage prompt={PROMPT} autoStart />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("isn't available right now");
    expect(alert.textContent).not.toContain("image service");
  });

  it("restored messages show a button and do not fetch until clicked", async () => {
    render(<IllustrationImage prompt={PROMPT} autoStart={false} />);
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockReturnValueOnce(Promise.resolve(new Response(png(), { status: 200, headers: { "Content-Type": "image/png" } })));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Generate illustration" })));
    expect(await screen.findByRole("img", { name: /AI-generated illustration/ })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shares one in-flight request between identical prompts and caches the result", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response(png(), { status: 200, headers: { "Content-Type": "image/png" } })));
    render(
      <>
        <IllustrationImage prompt={PROMPT} autoStart />
        <IllustrationImage prompt={PROMPT} autoStart />
      </>,
    );
    expect((await screen.findAllByRole("img", { name: /AI-generated illustration/ })).length).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("AiMarkdown illustration tag", () => {
  const TAG = `[GENERATE_IMAGE: ${PROMPT}]`;

  it("hides complete and partial tags while streaming and renders no card", () => {
    for (const content of [`Explanation.\n\n${TAG}`, "Explanation.\n\n[GENERATE_IMAGE: Publication-gr", "Explanation.\n\n[GENER"]) {
      const { container, unmount } = render(<AiMarkdown content={content} streaming />);
      expect(container.textContent).toContain("Explanation.");
      expect(container.textContent).not.toContain("GENERATE");
      expect(container.textContent).not.toContain("GENER");
      unmount();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renders the card once the reply is complete, auto-generating only for session messages", async () => {
    fetchMock.mockReturnValueOnce(Promise.resolve(new Response(png(), { status: 200, headers: { "Content-Type": "image/png" } })));
    const { container } = render(
      <SchematicAutoRepairContext.Provider value>
        <AiMarkdown content={`Explanation.\n\n${TAG}`} />
      </SchematicAutoRepairContext.Provider>,
    );
    expect(container.textContent).not.toContain("GENERATE_IMAGE");
    expect(await screen.findByRole("img", { name: /AI-generated illustration/ })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("offers a button for restored messages and still renders KaTeX and code", () => {
    const { container } = render(<AiMarkdown content={`Energy $E=\\frac{1}{2}Li^2$\n\n\`\`\`cpp\nint x;\n\`\`\`\n\n${TAG}`} />);
    expect(container.querySelectorAll(".katex").length).toBeGreaterThan(0);
    expect(container.textContent).toContain("int x;");
    expect(screen.getByRole("button", { name: "Generate illustration" })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
