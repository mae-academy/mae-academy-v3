// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiMarkdown } from "./AiMarkdown";
import { languageLabel } from "./CodeBlock";

afterEach(cleanup);

describe("AiMarkdown", () => {
  it("renders inline and display math through KaTeX", () => {
    const { container } = render(<AiMarkdown content={"Inline $x^2$ and\n\n$$\\frac{V}{R}$$\n\ndone"} />);
    expect(container.querySelectorAll(".katex")).toHaveLength(2);
    expect(container.querySelectorAll(".katex-display")).toHaveLength(1);
    expect(container.querySelector(".katex-mathml annotation")?.textContent).toBeTruthy();
    expect(container.textContent).not.toContain("$$");
  });

  it("converts \\( \\) and \\[ \\] delimiters", () => {
    const { container } = render(<AiMarkdown content={"So \\(a+b\\) and \\[\\sqrt{x}\\]"} />);
    expect(container.querySelectorAll(".katex")).toHaveLength(2);
    expect(container.querySelectorAll(".katex-display")).toHaveLength(1);
  });

  it("degrades unfinished or invalid math to text without throwing", () => {
    expect(() => render(<AiMarkdown content={"Streaming $$\\frac{V}{"} />)).not.toThrow();
    expect(() => render(<AiMarkdown content={"Bad $\\notacommand{$ here"} />)).not.toThrow();
    expect(screen.getAllByText(/Streaming|Bad/).length).toBeGreaterThan(0);
  });

  it("renders a fenced code block with a language label and a working Copy button", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const { container } = render(<AiMarkdown content={"```cpp\nint x = 1;\n```"} />);
    expect(screen.getByText("C++")).toBeTruthy();
    expect(container.querySelector("pre code")?.textContent).toBe("int x = 1;");
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("int x = 1;"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy());
  });

  it("falls back to a textarea copy when the Clipboard API is unavailable", async () => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    const exec = vi.fn(() => true);
    (document as unknown as { execCommand: typeof exec }).execCommand = exec;
    render(<AiMarkdown content={"```\nplain\n```"} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(exec).toHaveBeenCalledWith("copy"));
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("keeps raw HTML inert as literal text", () => {
    const { container } = render(<AiMarkdown content={'<script>window.__pwned = 1</script>\n\n<img src=x onerror="window.__pwned = 2">\n\nhi <b onclick="x()">bold</b>'} />);
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(container.textContent).toContain("<script>");
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
  });

  it("opens only http(s)/mailto links in a new tab and never renders images", () => {
    const { container } = render(<AiMarkdown content={"[ok](https://example.com) [mail](mailto:a@b.co) [bad](javascript:alert(1)) ![pic](https://evil.example/x.png)"} />);
    const links = Array.from(container.querySelectorAll("a"));
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["https://example.com", "mailto:a@b.co"]);
    for (const a of links) {
      expect(a.getAttribute("target")).toBe("_blank");
      expect(a.getAttribute("rel")).toBe("noopener noreferrer");
    }
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("bad");
  });

  it("wraps GFM tables for horizontal scrolling and never emits h1/h2", () => {
    const { container } = render(<AiMarkdown content={"# Big\n\n## Medium\n\n| a | b |\n|---|---|\n| 1 | 2 |"} />);
    expect(container.querySelector("table")?.parentElement?.className).toContain("overflow-x-auto");
    expect(container.querySelector("h1, h2")).toBeNull();
    expect(container.querySelectorAll("h3")).toHaveLength(2);
  });
});

describe("AiMarkdown diagrams", () => {
  const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500"><title>Voltage divider</title><rect x="10" y="10" width="100" height="40"/><text x="20" y="30">R1 = 1 kΩ</text></svg>';
  const fenced = (svg = SVG) => `Here is the circuit.\n\n\`\`\`xml:svg\n${svg}\n\`\`\`\n\nThe output is $V_{out}$.`;
  const decodeSrc = (img: Element | null) => decodeURIComponent((img?.getAttribute("src") ?? "").replace("data:image/svg+xml;charset=utf-8,", ""));

  it("parses the colon in the info string, so the fence reaches the renderer as xml:svg", () => {
    const { container } = render(<AiMarkdown content={fenced()} />);
    expect(container.querySelector("pre")).toBeNull();
    expect(container.querySelector("code")).toBeNull();
  });

  it("shows a finished diagram as an image from a data URI, with the surrounding text and math intact", () => {
    const { container } = render(<AiMarkdown content={fenced()} />);
    const img = container.querySelector("figure img");
    expect(img?.getAttribute("src")?.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
    expect(decodeSrc(img)).toContain("R1 = 1 kΩ");
    expect(screen.getByRole("button", { name: /Open diagram larger: Voltage divider/ })).toBeTruthy();
    expect(container.querySelector("svg[viewBox='0 0 800 500']")).toBeNull(); // never inlined into the DOM
    expect(container.textContent).toContain("Here is the circuit.");
    expect(container.querySelectorAll(".katex")).toHaveLength(1);
  });

  it("does not show the template's header comment as text when the model writes it outside the fence", () => {
    const comment = "<!-- Standard: ISO/IEEE Control Block Diagram | Pitch P = 20 px | Signal stroke 2 px -->";
    const { container } = render(<AiMarkdown content={`PID loop:\n${comment}\n\n\`\`\`xml:svg\n${SVG}\n\`\`\`\n\nDone.`} />);
    expect(container.textContent).not.toContain("<!--");
    expect(container.textContent).not.toContain("Standard: ISO");
    expect(container.querySelector("figure img")).toBeTruthy();
    expect(container.textContent).toContain("PID loop:");
  });

  it("recognises a diagram in an untyped fence that opens with the header comment", () => {
    const body = `<!-- Standard: IEC 60617 | Pitch P = 20 px -->\n${SVG}`;
    const { container } = render(<AiMarkdown content={`\`\`\`\n${body}\n\`\`\``} />);
    expect(container.querySelector("figure img")).toBeTruthy();
    expect(container.querySelector("pre")).toBeNull();
  });

  it("also renders svg fences and xml fences whose body is an <svg", () => {
    for (const lang of ["svg", "xml", ""]) {
      const { container, unmount } = render(<AiMarkdown content={`\`\`\`${lang}\n${SVG}\n\`\`\``} />);
      expect(container.querySelector("figure img"), lang).not.toBeNull();
      unmount();
    }
  });

  it("never treats inline code or other code as a diagram", () => {
    const { container } = render(<AiMarkdown content={`Use \`${SVG}\` inline.\n\n\`\`\`xml\n<note>hi</note>\n\`\`\`\n\n\`\`\`python\nprint(1)\n\`\`\``} />);
    expect(container.querySelector("figure")).toBeNull();
    expect(container.querySelectorAll("pre")).toHaveLength(2);
    expect(screen.getByText("XML")).toBeTruthy();
    expect(screen.getByText("Python")).toBeTruthy();
  });

  it("shows a calm placeholder, never a half-built code block, while the fence is still open", () => {
    const partial = `Drawing it now.\n\n\`\`\`xml:svg\n${SVG.slice(0, 120)}`;
    const { container, rerender } = render(<AiMarkdown content={partial} streaming />);
    expect(screen.getByRole("status").textContent).toContain("Drawing diagram");
    expect(container.querySelector("pre")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).not.toContain("viewBox");
    expect(container.textContent).toContain("Drawing it now.");

    rerender(<AiMarkdown content={`${partial}${SVG.slice(120)}\n\`\`\``} streaming />);
    expect(container.querySelector("figure img")).not.toBeNull();
    expect(screen.queryByText(/Drawing diagram/)).toBeNull();
  });

  it("shows the placeholder for a fence whose info string is still arriving", () => {
    render(<AiMarkdown content={"Sure.\n\n```xml:s"} streaming />);
    expect(screen.getByText(/Drawing diagram/)).toBeTruthy();
  });

  it("leaves no placeholder behind once the stream has ended (a cut-off diagram falls back to code)", () => {
    const { container } = render(<AiMarkdown content={`\`\`\`xml:svg\n${SVG.slice(0, 120)}`} />);
    expect(screen.queryByText(/Drawing diagram/)).toBeNull();
    expect(container.querySelector("figure")).toBeNull();
    expect(container.querySelector("pre")).not.toBeNull();
    expect(screen.getByText("The diagram couldn't be displayed")).toBeTruthy();
  });

  it("falls back to the raw source plus a note when the SVG cannot be sanitised", () => {
    const { container } = render(<AiMarkdown content={fenced('<svg xmlns="http://www.w3.org/2000/svg"><rect></svg>')} />);
    expect(container.querySelector("figure")).toBeNull();
    expect(container.querySelector("pre code")?.textContent).toContain("<rect></svg>");
    expect(screen.getByRole("note").textContent).toContain("The diagram couldn't be displayed");
    expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy();
  });

  it("renders hostile SVG harmlessly: nothing executable reaches the DOM or the image source", () => {
    const hostile = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" onload="window.__pwned=1"><script>window.__pwned=2</script><foreignObject><div xmlns="http://www.w3.org/1999/xhtml"><img src="x" onerror="window.__pwned=3"/></div></foreignObject><image href="https://evil.example/a.png"/><rect width="10" height="10" onclick="window.__pwned=4"/></svg>`;
    const { container } = render(<AiMarkdown content={fenced(hostile)} />);
    const decoded = decodeSrc(container.querySelector("figure img"));
    expect(decoded).toContain("<rect");
    expect(decoded).not.toMatch(/script|foreignObject|onload|onclick|evil\.example|<image/i);
    expect(container.querySelector("script, foreignObject, image, svg:not(.lucide)")).toBeNull();
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
  });

  it("copies the sanitized SVG source from the toolbar", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<AiMarkdown content={fenced('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 50" onload="x()"><rect width="5" height="5"/></svg>')} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy SVG code" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    const copied = (writeText.mock.calls[0] as unknown as [string])[0];
    expect(copied).toContain('viewBox="0 0 80 50"');
    expect(copied).not.toContain("onload");
    await waitFor(() => expect(screen.getByText("SVG code copied")).toBeTruthy());
  });

  it("downloads the sanitized SVG as a file", async () => {
    const blobs: Blob[] = [];
    URL.createObjectURL = vi.fn((blob: Blob | MediaSource) => { blobs.push(blob as Blob); return "blob:diagram"; });
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toMatch(/^mae-diagram-\d{8}-\d{6}\.svg$/);
    });
    render(<AiMarkdown content={fenced()} />);
    fireEvent.click(screen.getByRole("button", { name: "Download SVG" }));
    expect(click).toHaveBeenCalledOnce();
    expect(blobs[0].type).toContain("image/svg+xml");
    expect(await blobs[0].text()).toContain("R1 = 1 kΩ");
    click.mockRestore();
  });

  it("opens a lightbox with zoom controls, closes on Escape and returns focus to the picture", async () => {
    render(<AiMarkdown content={fenced()} />);
    const opener = screen.getByRole("button", { name: /Open diagram larger/ });
    opener.focus();
    fireEvent.click(opener);
    const dialog = await screen.findByRole("dialog");
    expect(dialog.querySelector("img")?.getAttribute("src")).toContain("data:image/svg+xml");
    const fit = screen.getByRole("button", { name: "Fit to screen" });
    expect(fit.textContent).toBe("Fit");
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(fit.textContent).toMatch(/^\d+%$/);
    fireEvent.click(fit);
    expect(fit.textContent).toBe("Fit");
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });
});

describe("languageLabel", () => {
  it("normalises common languages", () => {
    expect(languageLabel("cpp")).toBe("C++");
    expect(languageLabel("ino")).toBe("Arduino");
    expect(languageLabel("PY")).toBe("Python");
    expect(languageLabel("matlab")).toBe("MATLAB");
    expect(languageLabel("zig")).toBe("Zig");
    expect(languageLabel("")).toBeNull();
    expect(languageLabel("text")).toBeNull();
    expect(languageLabel(undefined)).toBeNull();
  });
});
