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
