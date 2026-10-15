// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AiMarkdown } from "@/components/ai/AiMarkdown";
import { WaveDromDiagram } from "./WaveDromDiagram";
import { renderWaveDrom, setWaveLoaderForTests } from "./wavedromRender";
import { validateWaveDrom } from "./wavedromValidate";

const USER = '{ "signal": [{ "name": "clk", "wave": "p....." }, { "name": "data", "wave": "x.345x", "data": ["D0","D1","D2"] }] }';
const SPI = JSON.stringify({
  signal: [
    { name: "CS", wave: "10........1" },
    { name: "SCK", wave: "0.pppppppp0" },
    { name: "MOSI", wave: "x.========x", phase: 0.5, data: ["1", "0", "1", "0", "0", "1", "0", "1"] },
  ],
  head: { text: "SPI mode 0, 0xA5", tick: 0 },
  config: { hscale: 2 },
});

afterEach(() => {
  cleanup();
  setWaveLoaderForTests(null);
});

const reason = (source: unknown) => {
  const result = validateWaveDrom(typeof source === "string" ? source : JSON.stringify(source));
  return result.ok ? "ok" : result.reason;
};

describe("validateWaveDrom", () => {
  it("accepts the documented examples", () => {
    expect(reason(USER)).toBe("ok");
    expect(reason(SPI)).toBe("ok");
    expect(reason({ signal: ["Group", { name: "a", wave: "01zx" }, ["Inner", { name: "b", wave: "pPnNhHlL" }], {}], foot: { text: "t", tock: 1 }, edge: ["a~>b delay"] })).toBe("ok");
    expect(reason({ signal: [{ name: "d", wave: "=.=.", data: "A B", phase: 0.5, period: 2 }] })).toBe("ok");
    expect(reason({ signal: [{ name: "gap", wave: "01|01" }, { name: "ud", wave: "udZ2345" }] })).toBe("ok");
  });
  it("builds a clean copy that only has known keys", () => {
    const result = validateWaveDrom(USER);
    expect(result.ok && Object.keys(result.spec)).toEqual(["signal"]);
  });
  const denied: Array<[string, unknown, string]> = [
    ["not json", "{signal:", "notJson"],
    ["array root", "[1]", "notObject"],
    ["no signal", {}, "noSignal"],
    ["empty signal", { signal: [] }, "noSignal"],
    ["only spacers", { signal: [{}] }, "noSignal"],
    ["too many signals", { signal: Array.from({ length: 41 }, (_, i) => ({ name: `s${i}`, wave: "01" })) }, "tooManySignals"],
    ["40 signals is fine", { signal: Array.from({ length: 40 }, (_, i) => ({ name: `s${i}`, wave: "01" })) }, "ok"],
    ["wave too long", { signal: [{ name: "a", wave: "0".repeat(201) }] }, "waveTooLong"],
    ["bad wave char", { signal: [{ name: "a", wave: "01<" }] }, "badWave"],
    ["wave with script", { signal: [{ name: "a", wave: "0;alert(1)" }] }, "badWave"],
    ["wave not text", { signal: [{ name: "a", wave: 5 }] }, "badWave"],
    ["html in name", { signal: [{ name: "<img src=x onerror=alert(1)>", wave: "01" }] }, "badName"],
    ["script in name", { signal: [{ name: "<script>", wave: "01" }] }, "badName"],
    ["name too long", { signal: [{ name: "n".repeat(61), wave: "01" }] }, "badName"],
    ["bidi in name", { signal: [{ name: "a‮b", wave: "01" }] }, "badName"],
    ["html in data", { signal: [{ name: "a", wave: "=", data: ["<b>x</b>"] }] }, "badData"],
    ["data too long", { signal: [{ name: "a", wave: "=", data: ["x".repeat(41)] }] }, "badData"],
    ["data too many", { signal: [{ name: "a", wave: "=", data: Array.from({ length: 65 }, () => "x") }] }, "badData"],
    ["data object", { signal: [{ name: "a", wave: "=", data: [{ a: 1 }] }] }, "badData"],
    ["__proto__ lane key", '{"signal":[{"name":"a","wave":"01","__proto__":{"x":1}}]}', "badKey"],
    ["constructor lane key", { signal: [{ name: "a", wave: "01", constructor: { prototype: {} } }] }, "badKey"],
    ["__proto__ top key", '{"__proto__":{"polluted":1},"signal":[{"name":"a","wave":"01"}]}', "badKey"],
    ["unknown top key", { signal: [{ name: "a", wave: "01" }], onload: "alert(1)" }, "badKey"],
    ["unknown lane key", { signal: [{ name: "a", wave: "01", style: "x" }] }, "badKey"],
    ["deep nesting", { signal: [[[[[{ name: "a", wave: "01" }]]]]] }, "tooDeep"],
    ["depth 4 is fine", { signal: [["g", ["g2", ["g3", { name: "a", wave: "01" }]]]] }, "ok"],
    ["hscale 5", { signal: [{ name: "a", wave: "01" }], config: { hscale: 5 } }, "badConfig"],
    ["hscale 0", { signal: [{ name: "a", wave: "01" }], config: { hscale: 0 } }, "badConfig"],
    ["config skin", { signal: [{ name: "a", wave: "01" }], config: { skin: "narrow" } }, "badKey"],
    ["config not object", { signal: [{ name: "a", wave: "01" }], config: 3 }, "badConfig"],
    ["head text html", { signal: [{ name: "a", wave: "01" }], head: { text: "<b>" } }, "badConfig"],
    ["head text onml", { signal: [{ name: "a", wave: "01" }], head: { text: ["tspan", { "text-decoration": "x" }, "t"] } }, "badConfig"],
    ["head unknown key", { signal: [{ name: "a", wave: "01" }], head: { every: 2 } }, "badKey"],
    ["edge not list", { signal: [{ name: "a", wave: "01" }], edge: "a~>b" }, "badEdge"],
    ["edge with html", { signal: [{ name: "a", wave: "01" }], edge: ["a~>b <script>"] }, "badEdge"],
    ["bad phase", { signal: [{ name: "a", wave: "01", phase: 1e9 }] }, "badSignal"],
    ["bad node", { signal: [{ name: "a", wave: "01", node: ".a<" }] }, "badSignal"],
    ["string lane", { signal: [{ name: "a", wave: "01" }, "oops"] }, "badSignal"],
    ["too large", { signal: [{ name: "a", wave: "01" }], pad: "x".repeat(21 * 1024) }, "tooLarge"],
  ];
  for (const [name, source, expected] of denied) it(`${name} -> ${expected}`, () => expect(reason(source)).toBe(expected));
  it("never pollutes Object.prototype", () => {
    validateWaveDrom('{"__proto__":{"polluted":1},"signal":[{"name":"a","wave":"01"}]}');
    expect(({} as { polluted?: number }).polluted).toBeUndefined();
  });
});

describe("rendering with the real wavedrom package", () => {
  it("renders the user's example to a sized, white-backed SVG with no active content", async () => {
    const result = await renderWaveDrom(USER);
    expect(result.svg.startsWith("<svg")).toBe(true);
    expect(result.width).toBeGreaterThan(100);
    expect(result.height).toBeGreaterThan(30);
    expect(result.svg).toMatch(/<rect x="0" y="0" width="100%" height="100%" fill="#ffffff"\/>/);
    expect(result.svg).toMatch(/clk/);
    expect(result.svg).toMatch(/D0/);
    expect(result.svg).not.toMatch(/<script|\son[a-z]+=|javascript:/i);
  });

  it("renders SPI mode 0 with all eight data labels in order", async () => {
    const result = await renderWaveDrom(SPI);
    expect(result.svg).toMatch(/SPI mode 0, 0xA5/);
    const labels = [...result.svg.matchAll(/<tspan>([^<]*)<\/tspan>/g)].map((m) => m[1]);
    const after = labels.slice(labels.indexOf("MOSI") + 1);
    expect(after.slice(0, 8)).toEqual(["1", "0", "1", "0", "0", "1", "0", "1"]);
  });

  it("escapes markup that survives validation (ampersands in names)", async () => {
    const result = await renderWaveDrom('{"signal":[{"name":"a & b","wave":"01"}]}');
    expect(result.svg).toMatch(/a &amp; b/);
  });

  it("rejects invalid specs before the library is loaded", async () => {
    let loaded = false;
    setWaveLoaderForTests(async () => {
      loaded = true;
      throw new Error("must not load");
    });
    await expect(renderWaveDrom('{"signal":[{"name":"<img onerror=x>","wave":"01"}]}')).rejects.toMatchObject({ failure: { kind: "invalid", reason: "badName" } });
    expect(loaded).toBe(false);
  });

  it("reports a library failure as a load error", async () => {
    setWaveLoaderForTests(async () => {
      throw new Error("chunk failed");
    });
    await expect(renderWaveDrom(USER)).rejects.toMatchObject({ failure: { kind: "load" } });
  });
});

describe("WaveDromDiagram", () => {
  it("shows an image for a valid spec, with the toolbar", async () => {
    const { container } = render(<WaveDromDiagram code={USER} />);
    const img = await waitFor(() => {
      const found = container.querySelector("figure img");
      expect(found).toBeTruthy();
      return found!;
    });
    expect(img.getAttribute("src")).toMatch(/^data:image\/svg\+xml/);
    expect(container.querySelector("script, foreignObject")).toBeNull();
    for (const name of ["Expand", "Download SVG", "Download PNG", "Copy source", "View source"]) expect(screen.getByRole("button", { name })).toBeTruthy();
  });

  it("shows a calm card and the JSON for an invalid spec", async () => {
    render(<WaveDromDiagram code={'{"signal":[{"name":"a","wave":"0<1"}]}'} />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/not valid/);
    expect(alert.textContent).toMatch(/characters that are not allowed/);
    expect(screen.getByText(/"wave": "0<1"/)).toBeTruthy();
  });

  it("is chosen for the wavedrom fence; an unterminated one shows the placeholder", async () => {
    const done = render(<AiMarkdown content={`Timing:\n\n\`\`\`wavedrom\n${USER}\n\`\`\`\n`} />);
    await waitFor(() => expect(done.container.querySelector("figure img")).toBeTruthy());
    done.unmount();
    const open = render(<AiMarkdown content={'Timing:\n\n```wavedrom\n{ "signal": [{ "name": "clk"'} streaming />);
    expect(screen.getByRole("status").textContent).toMatch(/Preparing timing diagram/);
    expect(open.container.textContent).not.toMatch(/"signal"/);
  });
});
