// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearPlotCaches } from "@/features/plot/plotJobs";
import { PlotError, type PlotResult, type PlotStage } from "@/features/plot/plotProtocol";
import { setPlotRunnerForTests, type PlotRunner, type PlotRunOptions } from "@/features/plot/plotRunner";
import { AiMarkdown } from "./AiMarkdown";
import { PlotAutoRunContext, PlotCard, PlotFixContext, plainTitle } from "./PlotCard";

const CODE = "import numpy as np\nimport matplotlib.pyplot as plt\nplt.plot([1, 2])\n";

const RESULT: PlotResult = {
  png: new Uint8Array([137, 80, 78, 71]),
  width: 1600,
  height: 900,
  dpi: 300,
  warnings: [],
  summary: { axes: [{ title: "Step response, $\\zeta=0.5$", xlabel: "", ylabel: "", lines: [], legend: [], xlim: [0, 1], ylim: [0, 1], grid: true, gridLinestyle: "dashed", position: [0, 0, 1, 1], titleSize: 12, labelSize: 11 }], suptitle: "", figsize: [8, 4.5] },
};

interface Pending {
  code: string;
  options: PlotRunOptions;
  resolve: (value: PlotResult) => void;
  reject: (error: PlotError) => void;
}

let pending: Pending[];
let run: ReturnType<typeof vi.fn>;
let createUrl: ReturnType<typeof vi.fn>;
let revokeUrl: ReturnType<typeof vi.fn>;

beforeEach(() => {
  pending = [];
  run = vi.fn((code: string, options: PlotRunOptions = {}) => new Promise<PlotResult>((resolve, reject) => pending.push({ code, options, resolve, reject })));
  const runner: PlotRunner = { run: run as unknown as PlotRunner["run"], dispose: () => undefined };
  setPlotRunnerForTests(runner);
  let n = 0;
  createUrl = vi.fn(() => `blob:plot-${++n}`);
  revokeUrl = vi.fn();
  Object.defineProperty(URL, "createObjectURL", { value: createUrl, configurable: true });
  Object.defineProperty(URL, "revokeObjectURL", { value: revokeUrl, configurable: true });
});

afterEach(() => {
  cleanup();
  setPlotRunnerForTests(null);
  clearPlotCaches();
});

const card = (auto: boolean, fix: ((text: string) => void) | null = null, code = CODE) =>
  render(
    <PlotAutoRunContext.Provider value={auto}>
      <PlotFixContext.Provider value={fix}>
        <PlotCard code={code} />
      </PlotFixContext.Provider>
    </PlotAutoRunContext.Provider>,
  );

describe("PlotCard", () => {
  it("runs a session message on its own: loading with staged progress, then the image", async () => {
    const { container } = card(true);
    expect(run).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status").textContent).toMatch(/Starting the plot engine/);
    expect(screen.getByRole("status").textContent).toMatch(/20.30 MB/);
    // Premium loading skeleton: engineering grid + shimmer, with the headline label.
    expect(screen.getByRole("status").textContent).toMatch(/Synthesizing high-resolution analytical plot\.\.\./);
    expect(container.querySelector("[data-plot-skeleton] .mae-plot-grid")).toBeTruthy();
    expect(container.querySelector("[data-plot-skeleton] .mae-plot-shimmer")).toBeTruthy();

    act(() => pending[0].options.onProgress?.("numpy" as PlotStage));
    expect(screen.getByRole("status").textContent).toMatch(/Loading NumPy/);
    expect(screen.getByRole("status").textContent).toMatch(/\(2\/4\)/);
    act(() => pending[0].options.onProgress?.("rendering"));
    expect(screen.getByRole("status").textContent).toMatch(/Drawing the plot/);

    await act(async () => pending[0].resolve(RESULT));
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("blob:plot-1");
    expect(img.getAttribute("alt")).toBe("Plot: Step response, =0.5");
    expect(container.querySelector("button[dir=ltr]")?.className).toContain("bg-white");
    expect(createUrl).toHaveBeenCalledTimes(1);
  });

  it("revokes the blob URL on unmount", async () => {
    const { unmount } = card(true);
    await act(async () => pending[0].resolve(RESULT));
    expect(revokeUrl).not.toHaveBeenCalled();
    unmount();
    expect(revokeUrl).toHaveBeenCalledWith("blob:plot-1");
  });

  it("shows a Run button for a restored message and does not execute until clicked", async () => {
    card(false);
    expect(run).not.toHaveBeenCalled();
    expect(screen.getByText(/not been drawn in this session/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Run plot" }));
    expect(run).toHaveBeenCalledTimes(1);
    await act(async () => pending[0].resolve(RESULT));
    expect(screen.getByRole("img")).toBeTruthy();
  });

  it("shows the cleaned error, the code and an ask-to-fix button that sends the error", async () => {
    const fix = vi.fn();
    const { container } = card(true, fix);
    await act(async () => pending[0].reject(new PlotError("python", "ZeroDivisionError: division by zero", 3)));
    expect(screen.getByRole("alert").textContent).toMatch(/stopped with an error/);
    expect(screen.getByRole("alert").textContent).toContain("Line 3: ZeroDivisionError: division by zero");
    expect(container.querySelector("pre code")?.textContent).toBe(CODE.replace(/\n$/, "") + "\n");
    expect(screen.getByText("Python")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ask MAE AI to fix this plot" }));
    expect(fix).toHaveBeenCalledTimes(1);
    expect(fix.mock.calls[0][0]).toContain("Line 3: ZeroDivisionError: division by zero");
  });

  it("offers no fix button where sending is impossible, and a retry for transient failures", async () => {
    card(true, null);
    await act(async () => pending[0].reject(new PlotError("timeout", "too slow")));
    expect(screen.queryByRole("button", { name: "Ask MAE AI to fix this plot" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("explains a refused script", async () => {
    card(true);
    await act(async () => pending[0].reject(new PlotError("rejected", 'Import of "os" is not allowed in plot scripts.', 1)));
    expect(screen.getByRole("alert").textContent).toMatch(/was not run/);
    expect(screen.getByRole("alert").textContent).toContain('Import of "os" is not allowed');
  });

  it("shares one run and the cached result between cards with the same code", async () => {
    const first = card(true);
    const second = card(true);
    expect(run).toHaveBeenCalledTimes(1);
    await act(async () => pending[0].resolve(RESULT));
    expect(first.container.querySelector("img")).toBeTruthy();
    expect(second.container.querySelector("img")).toBeTruthy();
    first.unmount();
    second.unmount();
    // Remounted later (e.g. scrolled back): straight from the cache, no new run.
    const third = card(false);
    expect(run).toHaveBeenCalledTimes(1);
    expect(third.container.querySelector("img")).toBeTruthy();
  });

  it("toggles the Python code and notes warnings", async () => {
    const { container } = card(true);
    await act(async () => pending[0].resolve({ ...RESULT, warnings: ["RuntimeWarning: divide by zero (line 4)"] }));
    expect(container.querySelector("pre")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "View Python code" }));
    expect(container.querySelector("pre code")?.textContent).toContain("plt.plot");
    expect(screen.getByRole("button", { name: "Hide Python code" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("1 warning(s)")).toBeTruthy();
  });

  it("downloads the 300 DPI bytes as mae-plot-<ts>.png and opens the lightbox", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    card(true);
    await act(async () => pending[0].resolve(RESULT));
    fireEvent.click(screen.getByRole("button", { name: "Download PNG (300 DPI)" }));
    expect(click).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Expand plot" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Zoom in" })).toBeTruthy();
    click.mockRestore();
  });
});

describe("plainTitle", () => {
  it("drops mathtext markers for alt text", () => {
    expect(plainTitle(String.raw`Step response, $\zeta = 0.5$`)).toBe("Step response, = 0.5");
  });
  it("keeps words inside \\mathrm", () => {
    expect(plainTitle(String.raw`$\mathrm{Gain}$ of $G(s)$`)).toBe("Gain of G(s)");
  });
});

describe("AiMarkdown with plot fences", () => {
  const fence = "```python:plot\n" + CODE + "```";

  it("renders a python:plot fence as a plot card, not a code block", async () => {
    const { container } = render(
      <PlotAutoRunContext.Provider value={true}>
        <AiMarkdown content={`Here you go.\n\n${fence}`} />
      </PlotAutoRunContext.Provider>,
    );
    expect(run).toHaveBeenCalledWith(CODE.replace(/\n$/, ""), expect.anything());
    await act(async () => pending[0].resolve(RESULT));
    expect(container.querySelector("img")).toBeTruthy();
    expect(container.querySelector("pre")).toBeNull();
  });

  it("shows a placeholder, not raw code, while the fence is still streaming, and never runs it", () => {
    const { container } = render(<AiMarkdown streaming content={"Plot:\n\n```python:plot\nimport numpy as np\nt = np.lin"} />);
    expect(screen.getByText("Preparing plot…")).toBeTruthy();
    expect(container.textContent).not.toContain("np.lin");
    expect(run).not.toHaveBeenCalled();
  });

  it("also hides the fence while only its info line has arrived", () => {
    render(<AiMarkdown streaming content={"Plot:\n\n```python:pl"} />);
    expect(screen.getByText("Preparing plot…")).toBeTruthy();
  });

  it("leaves ordinary python fences as code blocks", () => {
    const { container } = render(<AiMarkdown content={"```python\nprint(1)\n```"} />);
    expect(container.querySelector("pre code")?.textContent).toBe("print(1)");
    expect(screen.queryByRole("button", { name: "Run plot" })).toBeNull();
    expect(run).not.toHaveBeenCalled();
  });

  it("still renders KaTeX next to a plot card", () => {
    const { container } = render(<AiMarkdown content={`Where $\\zeta=0.5$.\n\n${fence}`} />);
    expect(container.querySelectorAll(".katex").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Run plot" })).toBeTruthy();
  });
});
