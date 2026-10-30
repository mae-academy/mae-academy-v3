/**
 * Text descriptions of curves (STEPS.md §4 Accessibility, §9): domain, zeros and approximate extrema, generated from
 * samples. Returns structured data; the UI turns it into a localized sentence through i18next (ADR-13).
 */
import type { Polyline } from "../sample/adaptive";

export interface CurveDescription {
  /** Visible pieces as [xStart, xEnd] intervals. */
  domain: Array<[number, number]>;
  /** Approximate x where the curve crosses or touches y = 0, ascending. */
  zeros: number[];
  /** Approximate local maxima and minima (x, y), in x order. */
  extrema: Array<{ x: number; y: number; type: "max" | "min" }>;
  /** Number of disconnected pieces (asymptotes and undefined regions split the curve). */
  pieces: number;
  /** For curves that are not a function graph (implicit, polar, parametric): the box they span. */
  extent?: { xmin: number; xmax: number; ymin: number; ymax: number };
}

/** Description values are rounded to this many significant digits for speech. */
const SPOKEN_DIGITS = 3;
/** At most this many zeros and extrema are listed, so a screen reader is not flooded. */
const MAX_LISTED = 10;

export function roundForSpeech(v: number): number {
  if (v === 0 || !Number.isFinite(v)) return v;
  return Number(v.toPrecision(SPOKEN_DIGITS));
}

export function describeExplicit(segments: readonly Polyline[]): CurveDescription {
  const domain: Array<[number, number]> = [];
  const zeros: number[] = [];
  const extrema: CurveDescription["extrema"] = [];
  for (const s of segments) {
    if (s.length < 2) continue;
    domain.push([s[0], s[s.length - 2]]);
    for (let i = 0; i + 3 < s.length; i += 2) {
      const x0 = s[i];
      const y0 = s[i + 1];
      const x1 = s[i + 2];
      const y1 = s[i + 3];
      if (y0 === 0) zeros.push(x0);
      else if (y0 * y1 < 0) zeros.push(x0 - (y0 * (x1 - x0)) / (y1 - y0));
      if (i + 5 < s.length) {
        const y2 = s[i + 5];
        // A strict turn of the sampled slope marks an approximate extremum at the middle sample.
        if ((y1 > y0 && y1 > y2) || (y1 < y0 && y1 < y2)) {
          extrema.push({ ...parabolaVertex(x0, y0, x1, y1, s[i + 4], y2), type: y1 > y0 ? "max" : "min" });
        }
      }
    }
    if (s[s.length - 1] === 0) zeros.push(s[s.length - 2]);
  }
  return {
    domain: domain.map(([a, b]) => [roundForSpeech(a), roundForSpeech(b)]),
    zeros: dedupe(zeros).slice(0, MAX_LISTED).map(roundForSpeech),
    extrema: extrema.slice(0, MAX_LISTED).map((e) => ({ x: roundForSpeech(e.x), y: roundForSpeech(e.y), type: e.type })),
    pieces: segments.length,
  };
}

/** Vertex of the parabola through three samples, so an extremum is located between samples, not at one. */
function parabolaVertex(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number): { x: number; y: number } {
  const d = (x0 - x1) * (x0 - x2) * (x1 - x2);
  const A = (x2 * (y1 - y0) + x1 * (y0 - y2) + x0 * (y2 - y1)) / d;
  const B = (x2 * x2 * (y0 - y1) + x1 * x1 * (y2 - y0) + x0 * x0 * (y1 - y2)) / d;
  const C = (x1 * x2 * (x1 - x2) * y0 + x2 * x0 * (x2 - x0) * y1 + x0 * x1 * (x0 - x1) * y2) / d;
  if (!Number.isFinite(A) || A === 0) return { x: x1, y: y1 };
  const xv = -B / (2 * A);
  if (!(xv >= Math.min(x0, x2) && xv <= Math.max(x0, x2))) return { x: x1, y: y1 };
  return { x: xv, y: A * xv * xv + B * xv + C };
}

/** Description of a curve that is not y = f(x): how many pieces and the box they span. */
export function describeExtent(segments: readonly Polyline[]): CurveDescription {
  let xmin = Infinity;
  let xmax = -Infinity;
  let ymin = Infinity;
  let ymax = -Infinity;
  for (const s of segments) {
    for (let i = 0; i + 1 < s.length; i += 2) {
      xmin = Math.min(xmin, s[i]);
      xmax = Math.max(xmax, s[i]);
      ymin = Math.min(ymin, s[i + 1]);
      ymax = Math.max(ymax, s[i + 1]);
    }
  }
  if (xmin > xmax) return { domain: [], zeros: [], extrema: [], pieces: 0 };
  const r = roundForSpeech;
  return { domain: [], zeros: [], extrema: [], pieces: segments.length, extent: { xmin: r(xmin), xmax: r(xmax), ymin: r(ymin), ymax: r(ymax) } };
}

function dedupe(xs: number[]): number[] {
  const out: number[] = [];
  for (const x of xs.sort((a, b) => a - b)) if (out.length === 0 || Math.abs(x - out[out.length - 1]) > 1e-9 * Math.max(1, Math.abs(x))) out.push(x);
  return out;
}

/** English fallback sentence (the UI uses i18n keys with the same data). */
export function describeInEnglish(label: string, d: CurveDescription): string {
  if (d.pieces === 0) return `${label}: not visible in this view.`;
  const parts = [`${label}: ${d.pieces === 1 ? "one piece" : `${d.pieces} pieces`} over x from ${d.domain[0][0]} to ${d.domain[d.domain.length - 1][1]}`];
  parts.push(d.zeros.length ? `crosses zero at x = ${d.zeros.join(", ")}` : "no zeros in view");
  const max = d.extrema.filter((e) => e.type === "max").map((e) => `(${e.x}, ${e.y})`);
  const min = d.extrema.filter((e) => e.type === "min").map((e) => `(${e.x}, ${e.y})`);
  if (max.length) parts.push(`local maxima near ${max.join(", ")}`);
  if (min.length) parts.push(`local minima near ${min.join(", ")}`);
  return parts.join("; ") + ".";
}
