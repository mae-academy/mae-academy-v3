/** Inspection and sizing of SVG markup produced by the diagram libraries before it is shown through <img>. */

export interface SvgSize {
  svg: string;
  width: number;
  height: number;
}

/** Inspects library-produced SVG; anything that could execute or load something is refused (defence in depth: it is shown through <img> anyway). */
export function svgIsSafe(svg: string): boolean {
  if (/<\s*(?:script|iframe|object|embed|link|meta|base|form|audio|video)\b/i.test(svg)) return false;
  if (/\son[a-z]+\s*=/i.test(svg)) return false;
  if (/(?:javascript|vbscript)\s*:/i.test(svg)) return false;
  if (/\s(?:xlink:)?href\s*=\s*["'](?!#)/i.test(svg)) return false;
  if (/@import|url\(\s*["']?\s*(?!#)/i.test(svg.replace(/url\(\s*["']?#/g, ""))) return false;
  return true;
}

/** Sets an explicit pixel size from the viewBox (an <img> has no layout context for width="100%") and drops the max-width style. */
export function sizeSvg(svg: string): SvgSize | null {
  const start = svg.indexOf("<svg");
  const end = start === -1 ? -1 : svg.indexOf(">", start);
  if (end === -1) return null;
  const attributes = svg.slice(start + 4, end);
  const box = /viewBox="\s*-?[\d.]+[\s,]+-?[\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/.exec(attributes);
  if (!box) return null;
  const width = Math.max(1, Math.ceil(Number(box[1])));
  const height = Math.max(1, Math.ceil(Number(box[2])));
  if (!Number.isFinite(width) || !Number.isFinite(height) || width > 8000 || height > 8000) return null;
  const cleaned = attributes.replace(/\s(?:width|height)="[^"]*"/g, "").replace(/\sstyle="[^"]*max-width[^"]*"/, "");
  return { svg: `<svg${cleaned} width="${width}" height="${height}">${svg.slice(end + 1)}`, width, height };
}
