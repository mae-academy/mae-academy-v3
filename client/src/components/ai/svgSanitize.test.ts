// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { MAX_SVG_NODES, MAX_SVG_SOURCE_CHARS, sanitizeSvg } from "./svgSanitize";

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const wrap = (inner: string, attrs = 'viewBox="0 0 800 500"') => `<svg ${NS} ${attrs}>${inner}</svg>`;

/** Parses sanitizer output back so the assertions look at real elements, not substrings. */
function reparse(svg: string): Document {
  return new DOMParser().parseFromString(svg, "image/svg+xml");
}
function allAttributes(doc: Document): Array<[string, string]> {
  return Array.from(doc.querySelectorAll("*")).flatMap((el) => Array.from(el.attributes).map((a): [string, string] => [a.name, a.value]));
}
const clean = (source: string) => {
  const result = sanitizeSvg(source);
  expect(result).not.toBeNull();
  return result!;
};

const VOLTAGE_DIVIDER = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" font-family="Arial">
  <title>Voltage divider</title>
  <defs>
    <marker id="arrow" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto"><path d="M0,0 L10,4 L0,8 z" fill="#2563eb"/></marker>
  </defs>
  <g stroke="#111" stroke-width="2" fill="none" stroke-linecap="round">
    <polyline points="100,80 100,120 120,130 80,150 120,170 80,190 120,210 100,220 100,260"/>
    <line x1="100" y1="80" x2="400" y2="80"/>
    <circle cx="400" cy="80" r="4" fill="#111"/>
    <rect x="360" y="260" width="80" height="40" rx="4"/>
    <ellipse cx="200" cy="400" rx="30" ry="12"/>
    <polygon points="500,300 520,320 480,320"/>
    <path d="M400,80 L560,80" marker-end="url(#arrow)"/>
  </g>
  <text x="130" y="150" font-size="18" text-anchor="start" fill="#111">R1 = 1 kΩ</text>
  <text x="130" y="230" font-size="18"><tspan font-weight="bold">R2</tspan> = 2 kΩ</text>
</svg>`;

describe("sanitizeSvg happy path", () => {
  it("keeps a voltage-divider schematic intact", () => {
    const { svg, width, height, title } = clean(VOLTAGE_DIVIDER);
    expect(width).toBe(800);
    expect(height).toBe(500);
    expect(title).toBe("Voltage divider");
    const doc = reparse(svg);
    expect(doc.getElementsByTagNameNS("*", "parsererror")).toHaveLength(0);
    const root = doc.documentElement;
    expect(root.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(root.getAttribute("viewBox")).toBe("0 0 800 500");
    expect(root.getAttribute("width")).toBe("800");
    expect(root.getAttribute("height")).toBe("500");
    for (const tag of ["polyline", "line", "circle", "rect", "ellipse", "polygon", "path", "marker", "text", "tspan", "title", "defs", "g"]) {
      expect(doc.getElementsByTagName(tag).length, tag).toBeGreaterThan(0);
    }
    expect(doc.querySelector("path[marker-end]")?.getAttribute("marker-end")).toBe("url(#arrow)");
    expect(doc.querySelector("marker")?.getAttribute("id")).toBe("arrow");
    expect(doc.querySelector("marker")?.getAttribute("orient")).toBe("auto");
    expect(doc.querySelector("polyline")?.getAttribute("points")).toBe("100,80 100,120 120,130 80,150 120,170 80,190 120,210 100,220 100,260");
    expect(doc.querySelector("g")?.getAttribute("stroke-linecap")).toBe("round");
    const texts = Array.from(doc.getElementsByTagName("text")).map((t) => t.textContent);
    expect(texts).toEqual(["R1 = 1 kΩ", "R2 = 2 kΩ"]);
    expect(doc.documentElement.getAttribute("font-family")).toBe("Arial");
  });

  it("escapes ampersands in text and repairs bare ones and HTML entities", () => {
    const { svg } = clean(wrap('<text x="1" y="2">R1 &amp; R2</text><text x="1" y="9">Tom & Jerry R&D</text><text x="1" y="20">10&nbsp;&Omega; &deg;</text>'));
    const texts = Array.from(reparse(svg).getElementsByTagName("text")).map((t) => t.textContent);
    expect(texts).toEqual(["R1 & R2", "Tom & Jerry R&D", "10 Ω °"]);
    expect(svg).toContain("R1 &amp; R2");
  });

  it("adds the namespace when the model forgot it", () => {
    const { svg } = clean('<svg viewBox="0 0 100 50"><rect x="1" y="1" width="10" height="10"/><text x="2" y="3">hi</text></svg>');
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    const doc = reparse(svg);
    expect(doc.documentElement.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(doc.querySelector("rect")).not.toBeNull();
  });

  it("derives a viewBox from numeric width/height, else the 800x500 default", () => {
    const sized = clean(`<svg ${NS} width="300" height="150px"><rect width="5" height="5"/></svg>`);
    expect([sized.width, sized.height]).toEqual([300, 150]);
    expect(reparse(sized.svg).documentElement.getAttribute("viewBox")).toBe("0 0 300 150");
    const bare = clean(`<svg ${NS}><rect width="5" height="5"/></svg>`);
    expect([bare.width, bare.height]).toEqual([800, 500]);
    const percent = clean(`<svg ${NS} width="100%" height="100%"><rect width="5" height="5"/></svg>`);
    expect([percent.width, percent.height]).toEqual([800, 500]);
    const garbage = clean(`<svg ${NS} viewBox="0 0 -4 NaN"><rect width="5" height="5"/></svg>`);
    expect([garbage.width, garbage.height]).toEqual([800, 500]);
  });

  it("sets root width/height to the viewBox size, overriding the model's", () => {
    const { svg } = clean(wrap("<rect width='1' height='1'/>", 'viewBox="0 0 400 200" width="100%" height="9999"'));
    const root = reparse(svg).documentElement;
    expect([root.getAttribute("width"), root.getAttribute("height")]).toEqual(["400", "200"]);
  });

  it("keeps only a safe background colour from the root style", () => {
    const ok = clean(wrap("<rect width='1' height='1'/>", 'viewBox="0 0 8 5" style="background-color:#fff; position:fixed; background-image:url(http://evil.example/x.png)"'));
    expect(reparse(ok.svg).documentElement.getAttribute("style")).toBe("background:#fff");
    const hostile = clean(wrap("<rect width='1' height='1'/>", 'viewBox="0 0 8 5" style="background:url(http://evil.example/x.png)"'));
    expect(reparse(hostile.svg).documentElement.hasAttribute("style")).toBe(false);
  });

  it("drops style on non-root elements", () => {
    const { svg } = clean(wrap('<rect width="1" height="1" style="fill:red"/>'));
    expect(reparse(svg).querySelector("rect")?.hasAttribute("style")).toBe(false);
  });

  it("accepts a nested svg element (allow-listed) but not its dangerous parts", () => {
    const { svg } = clean(wrap('<svg x="10" y="10" width="50" height="50" viewBox="0 0 10 10" onload="alert(1)"><rect width="10" height="10"/></svg>'));
    const doc = reparse(svg);
    expect(doc.getElementsByTagName("svg")).toHaveLength(2);
    expect(doc.querySelectorAll("svg svg")[0]?.hasAttribute("onload")).toBe(false);
  });
});

describe("sanitizeSvg hostile input", () => {
  const hostile: Record<string, string> = {
    script: wrap('<script>window.__pwned = 1</script><rect width="5" height="5"/>'),
    "script in cdata": wrap('<script><![CDATA[window.__pwned = 1]]></script><rect width="5" height="5"/>'),
    "onload on root": `<svg ${NS} viewBox="0 0 8 5" onload="window.__pwned=1"><rect width="5" height="5"/></svg>`,
    onclick: wrap('<rect width="5" height="5" onclick="window.__pwned=1"/>'),
    "onmouseover on text": wrap('<text x="1" y="1" onmouseover="window.__pwned=1">x</text>'),
    foreignObject: wrap('<foreignObject width="100" height="100"><div xmlns="http://www.w3.org/1999/xhtml"><img src="x" onerror="window.__pwned=1"/><script>window.__pwned=1</script></div></foreignObject>'),
    image: wrap('<image href="http://evil.example/track.png" width="10" height="10"/><image xlink:href="http://evil.example/a.png" xmlns:xlink="http://www.w3.org/1999/xlink"/>'),
    use: wrap('<defs><g id="a"><rect width="5" height="5"/></g></defs><use href="http://evil.example/x.svg#a"/><use xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="#a"/>'),
    "javascript: attribute": wrap('<rect width="5" height="5" fill="javascript:alert(1)" stroke="  JaVa\tScRiPt:alert(1)"/>'),
    "style url": wrap('<rect width="5" height="5" style="fill:url(http://evil.example/a.svg#x)"/>'),
    "fill url external": wrap('<rect width="5" height="5" fill="url(http://evil.example/a.svg#x)"/>'),
    "fill url data": wrap('<rect width="5" height="5" fill="url(data:image/svg+xml;base64,AAAA)"/>'),
    "marker url external": wrap('<path d="M0 0 L5 5" marker-end="url(https://evil.example/m.svg#a)"/>'),
    "clip-path external": wrap('<rect width="5" height="5" clip-path="url(//evil.example/c.svg#c)"/>'),
    "anchor javascript": wrap('<a href="javascript:window.__pwned=1"><text x="1" y="1">click</text></a>'),
    "anchor xlink": wrap('<a xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="javascript:alert(1)"><rect width="5" height="5"/></a>'),
    iframe: wrap('<iframe src="http://evil.example"/>'),
    "style element": wrap('<style>@import url(http://evil.example/x.css); rect{fill:red}</style><rect width="5" height="5"/>'),
    animate: wrap('<rect width="5" height="5"><animate attributeName="href" values="javascript:alert(1)"/><set attributeName="onload" to="alert(1)"/></rect>'),
    "animateTransform+discard": wrap('<animateTransform attributeName="transform" type="rotate"/><discard/>'),
    "entity-encoded javascript": wrap('<rect width="5" height="5" fill="&#106;avascript&#58;alert(1)"/>'),
    "expression()": wrap('<rect width="5" height="5" fill="expression(alert(1))"/>'),
    "xhtml script via namespace": wrap('<html:script xmlns:html="http://www.w3.org/1999/xhtml">window.__pwned=1</html:script>'),
    "uppercase SCRIPT": wrap("<SCRIPT>window.__pwned=1</SCRIPT>"),
  };

  for (const [name, source] of Object.entries(hostile)) {
    it(`neutralises: ${name}`, () => {
      const result = sanitizeSvg(source);
      // Rebuilt without the dangerous parts, never passed through (and not refused: the drawing itself is fine).
      expect(result).not.toBeNull();
      if (!result) return;
      const doc = reparse(result.svg);
      expect(doc.getElementsByTagNameNS("*", "parsererror")).toHaveLength(0);
      const tags = Array.from(doc.querySelectorAll("*")).map((el) => el.localName.toLowerCase());
      for (const bad of ["script", "foreignobject", "image", "use", "a", "iframe", "style", "animate", "set", "animatetransform", "discard", "div", "img", "html"]) {
        expect(tags, `element ${bad}`).not.toContain(bad);
      }
      for (const [attrName, value] of allAttributes(doc)) {
        expect(attrName, `attribute ${attrName}`).not.toMatch(/^on|href/i);
        expect(value.replace(/\s/g, "").toLowerCase(), `${attrName}=${value}`).not.toMatch(/javascript:|data:|expression\(|@import|evil\.example/);
      }
      expect(result.svg).not.toMatch(/onload|onclick|onerror|onmouseover|<script|foreignObject|<image|<use|href|@import|evil\.example|javascript/i);
    });
  }

  it("keeps the harmless siblings of a removed element", () => {
    const { svg } = clean(wrap('<script>1</script><rect id="keep" width="5" height="5" onclick="x()"/><image href="http://evil.example/a.png"/>'));
    const doc = reparse(svg);
    expect(doc.querySelector("rect#keep")).not.toBeNull();
    expect(doc.querySelector("rect")?.hasAttribute("onclick")).toBe(false);
  });

  it("allows internal url(#id) references only", () => {
    const { svg } = clean(wrap('<marker id="m"/><path d="M0 0 L5 5" marker-end="url(#m)" clip-path="url(#c)"/><rect width="5" height="5" fill="url(#g) red"/>'));
    const doc = reparse(svg);
    expect(doc.querySelector("path")?.getAttribute("marker-end")).toBe("url(#m)");
    expect(doc.querySelector("path")?.getAttribute("clip-path")).toBe("url(#c)");
    expect(doc.querySelector("rect")?.getAttribute("fill")).toBe("url(#g) red");
    // clip-path must be a url at all.
    expect(reparse(clean(wrap('<rect width="5" height="5" clip-path="inset(0)"/>')).svg).querySelector("rect")?.hasAttribute("clip-path")).toBe(false);
  });

  it("rejects DOCTYPE and entity declarations (expansion bombs, external entities)", () => {
    const bomb = `<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;">]><svg ${NS}><text>&b;</text></svg>`;
    expect(sanitizeSvg(bomb)).toBeNull();
    const external = `<!DOCTYPE svg SYSTEM "http://evil.example/x.dtd"><svg ${NS}><rect width="5" height="5"/></svg>`;
    expect(sanitizeSvg(external)).toBeNull();
    const xxe = `<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg ${NS}><text>&x;</text></svg>`;
    expect(sanitizeSvg(xxe)).toBeNull();
  });

  it("does not resolve an undeclared entity into anything", () => {
    const { svg } = clean(wrap("<text x='1' y='1'>&foo; &bar</text>"));
    expect(reparse(svg).querySelector("text")?.textContent).toBe("&foo; &bar");
  });

  it("drops id values that are not plain identifiers and class values with odd characters", () => {
    const { svg } = clean(wrap('<rect id="a b" class="x;y" width="1" height="1"/><rect id="ok_1" class="wire dim" width="1" height="1"/>'));
    const rects = reparse(svg).querySelectorAll("rect");
    expect(rects[0].hasAttribute("id")).toBe(false);
    expect(rects[0].hasAttribute("class")).toBe(false);
    expect(rects[1].getAttribute("id")).toBe("ok_1");
    expect(rects[1].getAttribute("class")).toBe("wire dim");
  });

  it("ignores unknown attributes and namespaced attributes", () => {
    const { svg } = clean(wrap('<rect width="1" height="1" data-x="1" xml:space="preserve" mask="url(#m)" filter="url(#f)" xmlns:foo="http://example.com" foo:bar="1"/>'));
    const names = Array.from(reparse(svg).querySelector("rect")!.attributes).map((a) => a.name).sort();
    expect(names).toEqual(["height", "width"]);
  });
});

describe("sanitizeSvg refusals and limits", () => {
  it("returns null for malformed XML, non-svg roots, empty and non-string input", () => {
    expect(sanitizeSvg(`<svg ${NS}><rect></svg>`)).toBeNull();
    expect(sanitizeSvg(`<svg ${NS}><text>unterminated`)).toBeNull();
    expect(sanitizeSvg("<div>hi</div>")).toBeNull();
    expect(sanitizeSvg(`<html xmlns="http://www.w3.org/1999/xhtml"><body/></html>`)).toBeNull();
    expect(sanitizeSvg(`<svg xmlns="http://www.w3.org/1999/xhtml"/>`)).toBeNull();
    expect(sanitizeSvg("")).toBeNull();
    expect(sanitizeSvg("   \n ")).toBeNull();
    expect(sanitizeSvg("just text")).toBeNull();
    expect(sanitizeSvg(undefined as unknown as string)).toBeNull();
  });

  it("returns null for oversize input without parsing it", () => {
    expect(sanitizeSvg(wrap(`<text>${"a".repeat(MAX_SVG_SOURCE_CHARS)}</text>`))).toBeNull();
  });

  it("returns null for too many nodes but accepts a large legitimate drawing", () => {
    const rect = '<rect width="1" height="1"/>';
    expect(sanitizeSvg(wrap(rect.repeat(MAX_SVG_NODES + 10)))).toBeNull();
    const big = clean(wrap(rect.repeat(2000)));
    expect(reparse(big.svg).getElementsByTagName("rect")).toHaveLength(2000);
  });

  it("returns null for absurdly deep nesting", () => {
    expect(sanitizeSvg(wrap("<g>".repeat(200) + "</g>".repeat(200)))).toBeNull();
    expect(sanitizeSvg(wrap("<g>".repeat(20) + "</g>".repeat(20)))).not.toBeNull();
  });

  it("is idempotent: sanitising its own output changes nothing", () => {
    const once = clean(VOLTAGE_DIVIDER);
    const twice = clean(once.svg);
    expect(twice.svg).toBe(once.svg);
  });
});
