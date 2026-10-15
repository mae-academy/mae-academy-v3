// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiMarkdown } from "@/components/ai/AiMarkdown";
import { MermaidDiagram } from "./MermaidDiagram";
import { setMermaidLoaderForTests } from "./mermaidRender";
import { svgIsSafe, sizeSvg } from "./svgInspect";
import { validateMermaid } from "./mermaidValidate";

const FSM = "stateDiagram-v2\n  [*] --> Idle\n  Idle --> Run: start / motor_on\n  Run --> Idle: stop / motor_off";
const FLOW = 'flowchart LR\n  R["$$R(s)$$"] --> G["$$\\frac{K}{s+1}$$"] --> Y["Y(s)"]';

const SVG = '<svg id="m" width="100%" xmlns="http://www.w3.org/2000/svg" style="max-width: 360px;" viewBox="4 4 360 64.5"><style>#m{fill:#000}</style><g><foreignObject width="20" height="10"><div xmlns="http://www.w3.org/1999/xhtml"><span>R(s)</span></div></foreignObject></g></svg>';

let render_: ReturnType<typeof vi.fn>;
let initialize: ReturnType<typeof vi.fn>;
let loads: number;

beforeEach(() => {
  render_ = vi.fn(async () => ({ svg: SVG }));
  initialize = vi.fn();
  loads = 0;
  setMermaidLoaderForTests(async () => {
    loads += 1;
    return { initialize, render: render_ } as never;
  });
});
afterEach(() => {
  cleanup();
  setMermaidLoaderForTests(null);
});

describe("validateMermaid", () => {
  const ok: Array<[string, string]> = [
    ["flowchart LR\n A-->B", "flowchart"],
    ["graph TD\n A-->B", "flowchart"],
    ["flowchart\n A-->B", "flowchart"],
    [FSM, "state"],
    ["stateDiagram\n [*] --> A", "state"],
    ["%% a comment\nsequenceDiagram\n A->>B: hi", "sequence"],
    ["\n\n  flowchart TB\n A-->B\n", "flowchart"],
    ["stateDiagram-v2\n state c <<choice>>\n [*] --> c\n c --> A: x>0", "state"],
    [FLOW, "flowchart"],
    ['flowchart LR\n A["Tom & Jerry"] --> B["a < b is false"]'.replace("a < b", "a lt b"), "flowchart"],
    ["stateDiagram-v2\n A --> B: data: ready / ack", "state"],
  ];
  for (const [source, kind] of ok) {
    it(`allows ${JSON.stringify(source.slice(0, 40))}`, () => {
      const result = validateMermaid(source);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.kind).toBe(kind);
    });
  }

  const denied: Array<[string, string, string]> = [
    ["empty", "", "empty"],
    ["init directive", '%%{init: {"securityLevel":"loose"}}%%\nflowchart LR\n A-->B', "directive"],
    ["directive spaced", "%% {init: {}} %%\nflowchart LR\n A-->B", "directive"],
    ["directive mid", "flowchart LR\n A-->B\n%%{init: {'secure': []}}%%", "directive"],
    ["frontmatter", "---\nconfig:\n  securityLevel: loose\n---\nflowchart LR\n A-->B", "frontmatter"],
    ["unknown type", "pie title x\n \"a\": 1", "type"],
    ["gantt", "gantt\n title x", "type"],
    ["classDiagram", "classDiagram\n A <|-- B", "type"],
    ["text before type", "hello\nflowchart LR\n A-->B", "type"],
    ["click call", "flowchart LR\n A-->B\n click A call alert()", "click"],
    ["click href", 'flowchart LR\n A-->B\n click A href "https://x.test"', "click"],
    ["click indented", "flowchart LR\n A-->B\n    CLICK A callback", "click"],
    ["inline href", 'flowchart LR\n A["<a href=x>y</a>"]-->B', "click"],
    ["javascript url", "flowchart LR\n A[javascript:alert(1)]-->B", "url"],
    ["data uri", "flowchart LR\n A[data:text/html;base64,AAA]-->B", "url"],
    ["http url", "flowchart LR\n A[http://evil.test/x]-->B", "url"],
    ["css url()", "flowchart LR\n A-->B\n style A fill:url(#x)", "url"],
    ["script tag", 'flowchart LR\n A["<script>alert(1)</script>"]-->B', "html"],
    ["img onerror", 'flowchart LR\n A["<img src=x onerror=alert(1)>"]-->B', "html"],
    ["iframe", 'flowchart LR\n A["<iframe src=x>"]-->B', "html"],
    ["br tag", 'flowchart LR\n A["a<br/>b"]-->B', "html"],
    ["html comment", "flowchart LR\n A-->B <!-- x -->", "html"],
    ["entity-encoded tag", 'flowchart LR\n A["&lt;script&gt;"]-->B', "html"],
    ["numeric entity tag", 'flowchart LR\n A["&#60;script"]-->B', "html"],
    ["too big", "flowchart LR\n" + " A-->B\n".repeat(2000), "size"],
    ["long line", "flowchart LR\n A[" + "x".repeat(250) + "]-->B", "lineLength"],
    ["too many lines", "flowchart LR\n" + "\n".repeat(0) + Array.from({ length: 220 }, (_, i) => `A${i}-->B${i}`).join("\n"), "lineLength"],
  ];
  for (const [name, source, reason] of denied) {
    it(`denies ${name}`, () => {
      const result = validateMermaid(source);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe(reason);
    });
  }
});

describe("svg inspection", () => {
  it("sizes an svg from its viewBox, dropping width=100% and max-width", () => {
    const sized = sizeSvg(SVG)!;
    expect(sized.width).toBe(360);
    expect(sized.height).toBe(65);
    expect(sized.svg).toMatch(/^<svg [^>]*width="360" height="65">/);
    expect(sized.svg).not.toMatch(/max-width|width="100%"/);
  });
  it("refuses svg without a viewBox or with an absurd size", () => {
    expect(sizeSvg("<svg></svg>")).toBeNull();
    expect(sizeSvg('<svg viewBox="0 0 90000 10"></svg>')).toBeNull();
  });
  const unsafe = [
    "<svg><script>alert(1)</script></svg>",
    '<svg onload="alert(1)"></svg>',
    '<svg><rect onclick = "x"/></svg>',
    '<svg><a href="javascript:alert(1)"/></svg>',
    '<svg><a xlink:href="https://evil.test"/></svg>',
    '<svg><image href="data:image/png;base64,AA"/></svg>',
    "<svg><style>@import url(https://evil.test/x.css)</style></svg>",
    '<svg><rect style="fill:url(https://evil.test/x)"/></svg>',
    "<svg><foreignObject><iframe src=x></iframe></foreignObject></svg>",
  ];
  for (const svg of unsafe) it(`flags ${svg.slice(0, 50)}`, () => expect(svgIsSafe(svg)).toBe(false));
  it("accepts mermaid-style svg with internal references", () => {
    expect(svgIsSafe(SVG)).toBe(true);
    expect(svgIsSafe('<svg><defs><marker id="a"/></defs><path marker-end="url(#a)" style="fill:url(#g)"/><use href="#a"/></svg>')).toBe(true);
  });
});

describe("MermaidDiagram", () => {
  it("renders through the mocked module as an image data URI and initialises securely", async () => {
    render(<MermaidDiagram code={FSM} />);
    expect(screen.getByRole("status").textContent).toMatch(/Drawing the diagram/);
    const first = await waitFor(() => {
      const img = document.querySelector("figure img");
      expect(img).toBeTruthy();
      return img!;
    });
    expect(first.getAttribute("src")).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
    const config = initialize.mock.calls[0][0] as Record<string, unknown>;
    expect(config.securityLevel).toBe("strict");
    expect(config.startOnLoad).toBe(false);
    expect(config.theme).toBe("neutral");
    expect(render_).toHaveBeenCalledTimes(1);
    expect(render_.mock.calls[0][1]).toBe(FSM);
  });

  it("the final DOM holds no script, handler or foreignObject: the svg lives only inside an <img> data URI", async () => {
    const { container } = render(<MermaidDiagram code={FSM} />);
    await waitFor(() => expect(container.querySelector("img")).toBeTruthy());
    expect(container.querySelector("script, foreignObject, svg:not([aria-hidden])")).toBeNull();
    expect(container.innerHTML).not.toMatch(/\son[a-z]+=/i);
    const src = decodeURIComponent(container.querySelector("img")!.getAttribute("src")!.split(",")[1]);
    expect(svgIsSafe(src)).toBe(true);
  });

  it("offers expand, download, copy and view-source actions", async () => {
    render(<MermaidDiagram code={FSM} />);
    await screen.findByRole("img");
    for (const name of ["Expand", "Download SVG", "Download PNG", "Copy source", "View source"]) expect(screen.getByRole("button", { name })).toBeTruthy();
  });

  it("serialises renders and caches by source", async () => {
    const first = render(<MermaidDiagram code={FSM} />);
    await screen.findByRole("img");
    first.unmount();
    render(<MermaidDiagram code={FSM} />);
    expect(screen.getByRole("img")).toBeTruthy(); // from cache, synchronously
    expect(render_).toHaveBeenCalledTimes(1);
    expect(loads).toBe(1);
  });

  it("a mermaid syntax error becomes a calm card with the source and no stack", async () => {
    render_.mockRejectedValueOnce(new Error("Parse error on line 2:\n...\nExpecting 'SEMI'\n    at foo (bar.js:1:1)"));
    render(<MermaidDiagram code={"flowchart LR\n A -->"} />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/syntax error/);
    expect(alert.textContent).not.toMatch(/bar\.js/);
    expect(screen.getByText(/flowchart LR/)).toBeTruthy();
  });

  it("a blocked source never reaches the library", async () => {
    render(<MermaidDiagram code={'%%{init: {"securityLevel":"loose"}}%%\nflowchart LR\n A-->B'} />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/not allowed/);
    expect(alert.textContent).toMatch(/directives/);
    expect(loads).toBe(0);
    expect(render_).not.toHaveBeenCalled();
  });

  it("unsafe svg coming back from the library is refused", async () => {
    render_.mockResolvedValueOnce({ svg: SVG.replace("<g>", '<g onclick="alert(1)">') });
    render(<MermaidDiagram code={FLOW} />);
    expect((await screen.findByRole("alert")).textContent).toMatch(/not drawn/);
  });

  it("a failed library download shows a retryable load error", async () => {
    setMermaidLoaderForTests(async () => {
      throw new Error("chunk failed");
    });
    render(<MermaidDiagram code={FSM} />);
    expect((await screen.findByRole("alert")).textContent).toMatch(/could not be downloaded/);
  });

  it("is chosen for the mermaid fence and keeps math labels in the source it sends", async () => {
    render(<AiMarkdown content={`Here it is.\n\n\`\`\`mermaid\n${FLOW}\n\`\`\`\n`} />);
    await screen.findByRole("img");
    expect(render_.mock.calls[0][1]).toContain("$$R(s)$$");
  });

  it("an unterminated mermaid fence shows the placeholder, never raw source", () => {
    const { container } = render(<AiMarkdown content={"Intro\n\n```mermaid\nflowchart LR\n A --> B"} streaming />);
    expect(screen.getByRole("status").textContent).toMatch(/Preparing diagram/);
    expect(container.textContent).not.toMatch(/flowchart LR/);
    expect(loads).toBe(0);
  });
});
