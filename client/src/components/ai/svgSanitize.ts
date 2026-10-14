/**
 * Sanitizer for model-generated SVG diagrams. The input is untrusted, so nothing is "cleaned in place": the
 * document is parsed, and a brand-new tree is built from an allow-list of elements and attributes. Whatever is not
 * on the list (scripts, foreignObject, images, <use>, styles, animation, links, event handlers, external
 * references ...) simply never makes it into the output. The result is only ever displayed through
 * `<img src="data:image/svg+xml,...">`, where the browser additionally forbids scripts and subresource loads.
 */

const SVG_NS = "http://www.w3.org/2000/svg";

export const MAX_SVG_SOURCE_CHARS = 200_000;
export const MAX_SVG_NODES = 5000;
const MAX_DEPTH = 40;
const DEFAULT_VIEWBOX = { x: 0, y: 0, width: 800, height: 500 };
/** Larger than any sensible schematic; guards the canvas export against absurd dimensions. */
const MAX_DIMENSION = 20_000;
const DEFAULT_FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";

const ALLOWED_ELEMENTS = new Set(["svg", "g", "defs", "marker", "line", "polyline", "polygon", "path", "rect", "circle", "ellipse", "text", "tspan", "title", "desc"]);
/** Elements whose character data is kept; text anywhere else is layout whitespace. */
const TEXT_ELEMENTS = new Set(["text", "tspan", "title", "desc"]);

const ALLOWED_ATTRIBUTES = new Set([
  // identity and layout
  "id", "class", "transform", "opacity", "display", "visibility", "viewBox", "preserveAspectRatio",
  // geometry
  "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "width", "height", "d", "points", "dx", "dy", "rotate", "textLength", "lengthAdjust",
  // paint
  "fill", "fill-opacity", "fill-rule", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "stroke-dasharray", "stroke-dashoffset", "stroke-opacity", "color", "shape-rendering", "paint-order",
  // text
  "font-family", "font-size", "font-weight", "font-style", "text-anchor", "dominant-baseline", "alignment-baseline", "baseline-shift", "letter-spacing", "word-spacing", "text-decoration",
  // markers
  "marker-start", "marker-mid", "marker-end", "markerWidth", "markerHeight", "markerUnits", "refX", "refY", "orient",
  // only kept when the value is an internal `url(#id)`
  "clip-path",
]);

const ID_VALUE = /^[A-Za-z_][\w.:-]*$/;
const CLASS_VALUE = /^[\w\s-]*$/;
const INTERNAL_URL = /url\(\s*(['"]?)#[A-Za-z_][\w.:-]*\1\s*\)/gi;
const SAFE_COLOR = /^(#[0-9a-f]{3,8}|[a-z]+|(?:rgb|hsl)a?\([\d\s.,%/-]+\))$/i;

/** HTML entities a model is likely to type in SVG text; XML only knows five, so the rest would be a parse error. */
const HTML_ENTITIES: Record<string, number> = {
  nbsp: 160, Omega: 937, omega: 969, mu: 956, micro: 181, deg: 176, plusmn: 177, times: 215, divide: 247, minus: 8722,
  rarr: 8594, larr: 8592, uarr: 8593, darr: 8595, pi: 960, theta: 952, phi: 966, alpha: 945, beta: 946, Delta: 916, delta: 948,
  infin: 8734, ne: 8800, le: 8804, ge: 8805, asymp: 8776, radic: 8730, middot: 183, hellip: 8230, ndash: 8211, mdash: 8212,
};
const XML_ENTITIES = new Set(["amp", "lt", "gt", "quot", "apos"]);

export interface SanitizedSvg {
  /** Standalone markup: namespaced root, viewBox and numeric width/height set. */
  svg: string;
  /** Size of the viewBox, used to size exports; the on-screen size comes from CSS. */
  width: number;
  height: number;
  /** Text of the diagram's `<title>`, if any (for the accessible name). */
  title?: string;
}

/** Bare `&` and the common HTML named entities would otherwise make an otherwise fine drawing unparseable. */
function repairEntities(source: string): string {
  return source.replace(/&(#\d+;|#x[\da-fA-F]+;|[A-Za-z][A-Za-z0-9]*;)?/g, (match, entity: string | undefined) => {
    if (!entity) return "&amp;";
    if (entity.startsWith("#")) return match;
    const name = entity.slice(0, -1);
    if (XML_ENTITIES.has(name)) return match;
    const code = HTML_ENTITIES[name];
    return code ? `&#${code};` : `&amp;${entity}`;
  });
}

/** True when an attribute value carries anything that could execute or fetch. */
function isDangerousValue(value: string): boolean {
  // Strip whitespace and control characters first so `java\tscript:` and friends cannot slip through.
  const flat = value.replace(/[\s\u0000-\u001f\u007f-\u009f\u200b-\u200f]+/g, "").toLowerCase();
  if (/javascript:|vbscript:|data:|expression\(|@import|<|\\/.test(flat)) return true;
  // Any url(...) must point at an element in this same document.
  if (/url\(/i.test(value) && /url\(/i.test(value.replace(INTERNAL_URL, ""))) return true;
  return false;
}

function parseNumber(value: string | null): number | null {
  if (value === null) return null;
  const match = /^\s*(-?\d*\.?\d+(?:e[+-]?\d+)?)\s*(?:px)?\s*$/i.exec(value);
  if (!match) return null;
  const number = Number(match[1]);
  return Number.isFinite(number) ? number : null;
}

function resolveViewBox(root: Element): { x: number; y: number; width: number; height: number } {
  const raw = root.getAttribute("viewBox");
  if (raw) {
    const parts = raw.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every(Number.isFinite) && parts[2] > 0 && parts[3] > 0 && parts[2] <= MAX_DIMENSION && parts[3] <= MAX_DIMENSION) {
      return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
    }
  }
  const width = parseNumber(root.getAttribute("width"));
  const height = parseNumber(root.getAttribute("height"));
  if (width && height && width > 0 && height > 0 && width <= MAX_DIMENSION && height <= MAX_DIMENSION) return { x: 0, y: 0, width, height };
  return DEFAULT_VIEWBOX;
}

/** The root `style` is reduced to a background colour; every other property is dropped. */
function safeRootStyle(style: string | null): string | null {
  if (!style) return null;
  for (const declaration of style.split(";")) {
    const colon = declaration.indexOf(":");
    if (colon === -1) continue;
    const property = declaration.slice(0, colon).trim().toLowerCase();
    const value = declaration.slice(colon + 1).trim();
    if ((property === "background" || property === "background-color") && SAFE_COLOR.test(value)) return `background:${value}`;
  }
  return null;
}

function attributeAllowed(name: string, value: string): boolean {
  if (!ALLOWED_ATTRIBUTES.has(name)) return false;
  if (isDangerousValue(value)) return false;
  if (name === "id") return ID_VALUE.test(value);
  if (name === "class") return CLASS_VALUE.test(value);
  if (name === "clip-path") return /^\s*url\(\s*['"]?#[A-Za-z_][\w.:-]*['"]?\s*\)\s*$/i.test(value);
  return true;
}

class LimitError extends Error {}

/**
 * Parses `source` and returns a sanitized, standalone copy, or null when it is not a usable SVG (not
 * well-formed XML, not an `<svg>` root, too large, too many nodes, nested too deep).
 */
/** The presentation attribute's value on `element` or the nearest ancestor that sets it, or null if none does. */
function inheritedAttribute(element: Element, name: string): string | null {
  for (let node: Node | null = element; node && node.nodeType === 1; node = node.parentNode) {
    const value = (node as Element).getAttribute(name);
    if (value !== null) return value;
  }
  return null;
}

/**
 * Models often draw wires as `<line x1=... />` with no `stroke`, which SVG renders as nothing at all, or leave a
 * polyline unfilled-by-attribute so it fills black. Give such shapes the schematic default (2 px black line, no fill)
 * unless the element or an ancestor already says otherwise, so a styled `<g>` is never overridden.
 */
function applyVisibleDefaults(element: Element): void {
  const name = element.localName;
  const isWire = name === "line" || name === "polyline";
  const isShape = isWire || name === "path" || name === "rect" || name === "circle" || name === "ellipse" || name === "polygon";
  if (!isShape) return;
  if (name === "polyline" && inheritedAttribute(element, "fill") === null) element.setAttribute("fill", "none");
  const fill = inheritedAttribute(element, "fill");
  // A wire always needs a stroke; any other shape only when its fill is none, since otherwise the fill is visible.
  const invisible = isWire || (fill !== null && fill.trim().toLowerCase() === "none");
  if (!invisible || inheritedAttribute(element, "stroke") !== null) return;
  element.setAttribute("stroke", "#000");
  if (inheritedAttribute(element, "stroke-width") === null) element.setAttribute("stroke-width", "2");
}

export function sanitizeSvg(source: string): SanitizedSvg | null {
  if (typeof source !== "string") return null;
  const trimmed = source.trim();
  if (trimmed === "" || trimmed.length > MAX_SVG_SOURCE_CHARS) return null;
  // Custom entities are the vector for expansion bombs and external fetches; a drawing never needs a DTD.
  if (/<!\s*(doctype|entity|element|attlist)/i.test(trimmed)) return null;

  let parsed: Document;
  try {
    parsed = new DOMParser().parseFromString(repairEntities(trimmed), "image/svg+xml");
  } catch {
    return null;
  }
  const sourceRoot = parsed.documentElement;
  if (!sourceRoot || sourceRoot.localName !== "svg") return null;
  if (sourceRoot.namespaceURI !== SVG_NS && sourceRoot.namespaceURI !== null) return null;
  if (parsed.getElementsByTagNameNS("*", "parsererror").length > 0) return null;

  const output = document.implementation.createDocument(SVG_NS, "svg", null);
  const outputRoot = output.documentElement;
  let nodes = 0;
  let title: string | undefined;

  const copyAttributes = (from: Element, to: Element, isRoot: boolean) => {
    for (const attribute of Array.from(from.attributes)) {
      // Only plain, un-namespaced attributes: `xlink:href`, `xml:*` and `xmlns:*` are never copied.
      if (attribute.namespaceURI !== null || attribute.name.includes(":")) continue;
      if (isRoot && (attribute.name === "width" || attribute.name === "height" || attribute.name === "viewBox")) continue;
      if (attributeAllowed(attribute.name, attribute.value)) to.setAttribute(attribute.name, attribute.value);
    }
  };

  const walk = (from: Element, to: Element, depth: number) => {
    if (depth > MAX_DEPTH) throw new LimitError();
    const keepText = TEXT_ELEMENTS.has(from.localName);
    for (const child of Array.from(from.childNodes)) {
      if (++nodes > MAX_SVG_NODES) throw new LimitError();
      if (child.nodeType === 1) {
        const element = child as Element;
        // Anything off the list (or in a foreign namespace) is dropped together with its whole subtree.
        if (!ALLOWED_ELEMENTS.has(element.localName)) continue;
        if (element.namespaceURI !== SVG_NS && element.namespaceURI !== null) continue;
        const copy = output.createElementNS(SVG_NS, element.localName);
        copyAttributes(element, copy, false);
        to.appendChild(copy);
        applyVisibleDefaults(copy);
        walk(element, copy, depth + 1);
        if (element.localName === "title" && title === undefined && element.parentNode === sourceRoot) title = copy.textContent?.trim() || undefined;
      } else if ((child.nodeType === 3 || child.nodeType === 4) && keepText) {
        to.appendChild(output.createTextNode(child.nodeValue ?? ""));
      }
    }
  };

  try {
    copyAttributes(sourceRoot, outputRoot, true);
    walk(sourceRoot, outputRoot, 0);
  } catch (error) {
    if (error instanceof LimitError) return null;
    throw error;
  }

  const box = resolveViewBox(sourceRoot);
  outputRoot.setAttribute("viewBox", `${box.x} ${box.y} ${box.width} ${box.height}`);
  outputRoot.setAttribute("width", String(box.width));
  outputRoot.setAttribute("height", String(box.height));
  if (!outputRoot.hasAttribute("font-family")) outputRoot.setAttribute("font-family", DEFAULT_FONT);
  const style = safeRootStyle(sourceRoot.getAttribute("style"));
  if (style) outputRoot.setAttribute("style", style);

  const svg = new XMLSerializer().serializeToString(outputRoot);
  return { svg, width: box.width, height: box.height, ...(title ? { title } : {}) };
}
