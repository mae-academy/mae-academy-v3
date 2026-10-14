// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BUCK_CONVERTER, VOLTAGE_DIVIDER } from "@shared/schematic/fixtures";
import { AiMarkdown } from "./AiMarkdown";
import { SchematicAutoRepairContext, SchematicDiagram } from "./SchematicDiagram";
import { resetSchematicVerifyCache } from "./schematicVerify";

const good = JSON.stringify(BUCK_CONVERTER);
const noGround = JSON.stringify({ ...BUCK_CONVERTER, parts: BUCK_CONVERTER.parts.filter((p) => p.type !== "ground") });

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const renderCard = (text: string, auto: boolean) =>
  render(
    <SchematicAutoRepairContext.Provider value={auto}>
      <SchematicDiagram text={text} />
    </SchematicAutoRepairContext.Provider>,
  );

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  resetSchematicVerifyCache();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("SchematicDiagram", () => {
  it("draws a valid spec as an inert data-URI image in a white card, with the status row and netlist, and no network call", () => {
    const { container } = renderCard(good, true);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")?.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
    expect(img.getAttribute("alt")).toBe("Schematic: 5 V buck converter");
    expect(container.querySelector("svg:not(.lucide), script, foreignObject")).toBeNull(); // markup is never injected
    expect(container.querySelector("button[dir=ltr]")?.className).toContain("bg-white");
    expect(screen.getByText("✓ 10/10 verification gates passed")).toBeTruthy();
    expect(container.querySelector("[aria-live=polite]")).toBeTruthy();
    expect(screen.getByText("Netlist")).toBeTruthy();
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Designator", "Type", "Value", "Nodes"]);
    expect(screen.getByRole("rowheader", { name: "D1" })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("repairs an invalid spec once and shows the corrected diagram with a note", async () => {
    fetchMock.mockResolvedValue(reply({ spec: BUCK_CONVERTER, ok: true, errors: [], warnings: [] }));
    const { container } = renderCard(noGround, true);
    expect(screen.getByText("Verifying…")).toBeTruthy();
    await waitFor(() => expect(container.querySelector("img")).toBeTruthy());
    expect(screen.getByText("✓ 10/10 verification gates passed")).toBeTruthy();
    expect(screen.getByText("Auto-corrected by the verifier.")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/ai/schematic-repair");
    const body = JSON.parse(init.body);
    expect(body.spec).toBe(noGround);
    expect(body.errors.length).toBeGreaterThan(0);
  });

  it("shows the progress text while it fixes", async () => {
    let release: (r: Response) => void = () => undefined;
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => (release = resolve)));
    renderCard(noGround, true);
    await waitFor(() => expect(screen.getByText(/Fixing \d+ issue\(s\) \(attempt 1\/2\)…/)).toBeTruthy());
    await act(async () => release(reply({ spec: BUCK_CONVERTER })));
    await waitFor(() => expect(screen.getByText("✓ 10/10 verification gates passed")).toBeTruthy());
  });

  it("shows an amber Unverified banner with the issues, and never claims a pass, when the repair route is down", async () => {
    fetchMock.mockResolvedValue(reply({ error: "not configured" }, 503));
    const { container } = renderCard(noGround, true);
    await waitFor(() => expect(screen.getByText(/Unverified — \d+ issue/)).toBeTruthy());
    expect(container.querySelector("img")).toBeTruthy(); // best-effort drawing
    expect(screen.queryByText(/verification gates passed/)).toBeNull();
    expect(screen.getByText("Automatic fixing is unavailable right now.")).toBeTruthy();
    expect(container.querySelector("details")).toBeTruthy();
    expect(container.textContent).toMatch(/ground/i);
    expect(screen.getByRole("button", { name: "Verify & fix" })).toBeTruthy();
  });

  it("stops after two failed repair attempts and stays unverified", async () => {
    fetchMock.mockImplementation(async () => reply({ spec: JSON.parse(noGround), ok: true }));
    renderCard(noGround, true);
    await waitFor(() => expect(screen.getByText(/Unverified — \d+ issue/)).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("button", { name: "Verify & fix" })).toBeNull();
  });

  it("falls back to the raw JSON in a code block, plus the reason, when the spec is unreadable", () => {
    const broken = '{"title": "x", "parts": [';
    const { container } = renderCard(broken, false);
    expect(container.querySelector("pre code")?.textContent).toContain('"parts": [');
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText(/could not be read/)).toBeTruthy();
    expect(container.textContent).toMatch(/JSON/);
  });

  it("restored messages validate locally with no request, and Verify & fix repairs on click", async () => {
    fetchMock.mockResolvedValue(reply({ spec: BUCK_CONVERTER }));
    const { container } = renderCard(noGround, false);
    expect(container.querySelector("img")).toBeTruthy();
    expect(screen.getByText(/Unverified — \d+ issue/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Verify & fix" }));
    await waitFor(() => expect(screen.getByText("✓ 10/10 verification gates passed")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("renders hostile strings inert", () => {
    const hostile = JSON.stringify({
      ...VOLTAGE_DIVIDER,
      title: '<script>window.__pwned=1</script>"><svg onload="window.__pwned=2">',
      parts: VOLTAGE_DIVIDER.parts.map((p) => (p.id === "R1" ? { ...p, value: '<img src=x onerror="window.__pwned=3"> 10 kΩ' } : p)),
      labels: [{ text: "<foreignObject>", at: [12, 2], anchor: "start" }],
    });
    const { container } = renderCard(hostile, false);
    expect(container.querySelector("script, foreignObject, svg:not(.lucide)")).toBeNull();
    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(decodeURIComponent(container.querySelector("img")!.getAttribute("src")!)).not.toMatch(/<script|<foreignObject/i);
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
  });

  it("opens a lightbox with zoom controls and closes it on Escape", async () => {
    renderCard(good, false);
    fireEvent.click(screen.getAllByRole("button", { name: "Expand schematic" })[0]);
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeTruthy();
    expect(screen.getByRole("button", { name: "Zoom in" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(screen.getByRole("button", { name: "Fit to screen" }).textContent).toBe("125%");
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("copies the spec JSON and the netlist, and downloads an SVG, reporting failures with a toast instead of throwing", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const createObjectURL = vi.fn(() => "blob:x");
    Object.defineProperty(URL, "createObjectURL", { value: createObjectURL, configurable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: vi.fn(), configurable: true });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    renderCard(good, false);
    fireEvent.click(screen.getByRole("button", { name: "Copy spec (JSON)" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(JSON.parse((writeText.mock.calls[0] as unknown as [string])[0]).title).toBe("5 V buck converter");
    fireEvent.click(screen.getByRole("button", { name: "Copy netlist" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
    expect((writeText.mock.calls[1] as unknown as [string])[0]).toContain("| Designator | Type | Value | Nodes |");
    fireEvent.click(screen.getByRole("button", { name: "Download SVG" }));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = (createObjectURL.mock.calls[0] as unknown as [Blob])[0];
    expect(blob.type).toContain("image/svg+xml");
    expect(click).toHaveBeenCalled();
    expect(() => fireEvent.click(screen.getByRole("button", { name: "Download PNG" }))).not.toThrow();
  });
});

describe("schematic fences inside AiMarkdown", () => {
  const T = "```";

  it("renders a completed fence as the diagram, in place, between the prose", () => {
    const { container } = render(<AiMarkdown content={`Before.\n\n${T}schematic\n${good}\n${T}\n\nAfter.`} />);
    expect(container.querySelector("img")?.getAttribute("src")).toContain("data:image/svg+xml");
    expect(container.querySelector("pre")).toBeNull();
    expect(container.textContent).toContain("Before.");
    expect(container.textContent).toContain("After.");
    expect(container.textContent).not.toContain('"parts"');
  });

  it("shows a Drawing schematic placeholder, never raw JSON, while the fence is still streaming", () => {
    for (const partial of [`Net.\n\n${T}schematic`, `Net.\n\n${T}schematic\n{"title":"5 V bu`, `Net.\n\n${T}schematic\n${good}\n\`\``]) {
      const { container, unmount } = render(<AiMarkdown content={partial} streaming />);
      expect(screen.getByText("Drawing schematic…")).toBeTruthy();
      expect(container.querySelector("pre")).toBeNull();
      expect(container.textContent).not.toContain('"title"');
      unmount();
    }
  });

  it("keeps a legacy xml:svg fence as plain code", () => {
    const { container } = render(<AiMarkdown content={`${T}xml:svg\n<svg><rect/></svg>\n${T}`} />);
    expect(container.querySelector("pre code")?.textContent).toContain("<svg>");
    expect(container.querySelector("img")).toBeNull();
  });
});
