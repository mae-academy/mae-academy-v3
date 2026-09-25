/**
 * MAE Academy / Signals & Systems — piecewise analytical breakdown of y(t)=∫x(τ)h(t−τ)dτ.
 * Pure module: regimes come from the exact finite supports [a,b] of x and [c,d] of h;
 * closed forms are recovered by fitting a low-degree polynomial inside a regime (cached per regime).
 */
import { continuousConvolutionAt, supportRange, type Interval } from "./convolutionEngine";
import { type SignalNode } from "./signalEngine";

export type RegimeKind = "before" | "entering" | "full-x" | "full-h" | "exiting" | "after" | "impulse" | "unbounded";
export type ConvolutionRegime = {
  kind: RegimeKind; index: number; total: number; label: string;
  tRange: Interval; tau1Latex: string; tau2Latex: string; integralLatex: string;
  closedFormLatex: string | null; overlap: Interval;
};
export type RegimeCache = Map<string, string | null>;

const EPS = 1e-9;
const VIEW: Interval = { from: -3, to: 3 };
const num = (v: number, digits = 3) => { const n = Number(v.toFixed(digits)); return Object.is(n, -0) ? "0" : String(n); };
const shifted = (offset: number) => Math.abs(offset) < EPS ? "t" : offset > 0 ? `t-${num(offset)}` : `t+${num(-offset)}`;

/** Solves the Vandermonde system for exact polynomial coefficients (ascending powers) via Gaussian elimination. */
function polyFit(ts: number[], ys: number[]): number[] | null {
  const n = ts.length; const m = ts.map((t, r) => [...Array.from({ length: n }, (_, c) => t ** c), ys[r]]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col; for (let r = col + 1; r < n; r += 1) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    if (Math.abs(m[pivot][col]) < 1e-12) return null; [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let r = 0; r < n; r += 1) if (r !== col) { const f = m[r][col] / m[col][col]; for (let c = col; c <= n; c += 1) m[r][c] -= f * m[col][c]; }
  }
  return m.map((row, i) => row[n] / row[i]);
}

function polyLatex(coeffs: number[]): string {
  const terms: string[] = [];
  coeffs.map((raw, power) => ({ raw, power })).reverse().forEach(({ raw, power }) => {
    const c = Math.abs(raw) < 5e-3 ? 0 : raw; if (c === 0) return;
    const mag = Math.abs(c); const body = power === 0 ? num(mag) : `${Math.abs(mag - 1) < 5e-3 ? "" : num(mag)}${power === 1 ? "t" : `t^{${power}}`}`;
    terms.push(`${c < 0 ? "-" : terms.length ? "+" : ""}${body}`);
  });
  return terms.length ? terms.join("") : "0";
}

function fitClosedForm(x: SignalNode, h: SignalNode, range: Interval): string | null {
  const from = Math.max(range.from, VIEW.from); const to = Math.min(range.to, VIEW.to); if (to - from < 1e-3) return null;
  const sample = (k: number, of: number) => from + (to - from) * (k + 1) / (of + 1);
  const y = (t: number) => continuousConvolutionAt(x, h, t, { tauDomain: { from: -8, to: 8 }, resolution: 0.005 }).value;
  for (let degree = 0; degree <= 3; degree += 1) {
    const ts = Array.from({ length: degree + 1 }, (_, k) => sample(k, degree + 1)); const coeffs = polyFit(ts, ts.map(y)); if (!coeffs) continue;
    const ok = Array.from({ length: 3 }, (_, k) => from + (to - from) * (k + 0.5) / 3).every((t) => Math.abs(coeffs.reduce((sum, c, p) => sum + c * t ** p, 0) - y(t)) < 4e-3);
    if (ok) return polyLatex(coeffs);
  }
  return null;
}

export function analyzeConvolutionRegime(x: SignalNode, h: SignalNode, t: number, cache: RegimeCache = new Map()): ConvolutionRegime {
  const xs = supportRange(x); const hs = supportRange(h);
  const base = { integralLatex: "y(t)=\\int_{\\tau_1(t)}^{\\tau_2(t)}x(\\tau)\\,h(t-\\tau)\\,d\\tau" };
  if (!Number.isFinite(t)) t = 0;
  if (!xs || !hs) {
    const r = continuousConvolutionAt(x, h, t);
    return { ...base, kind: "unbounded", index: 1, total: 1, label: "Unbounded support · numeric integral", tRange: { from: -Infinity, to: Infinity }, tau1Latex: "-6", tau2Latex: "6", closedFormLatex: null, overlap: r.overlap };
  }
  const r0 = continuousConvolutionAt(x, h, t);
  if (r0.usedDeltaShortcut) {
    const at = (hs.from + hs.to) / 2;
    return { ...base, kind: "impulse", index: 1, total: 1, label: "Impulse sifting", tRange: { from: -Infinity, to: Infinity }, tau1Latex: "\\tau=" + shifted(at), tau2Latex: "\\tau=" + shifted(at), integralLatex: r0.overlapLatex, closedFormLatex: null, overlap: r0.overlap };
  }
  const { from: a, to: b } = xs; const { from: c, to: d } = hs;
  const cuts = [a + c, a + d, b + c, b + d].filter(Number.isFinite).sort((p, q) => p - q).filter((v, i, arr) => !i || v - arr[i - 1] > EPS);
  const edges = [-Infinity, ...cuts, Infinity]; let seg = edges.findIndex((edge, i) => t >= edge && t < edges[i + 1]); if (seg < 0) seg = edges.length - 2;
  const tRange: Interval = { from: edges[seg], to: edges[seg + 1] };
  const probe = Number.isFinite(tRange.from) && Number.isFinite(tRange.to) ? (tRange.from + tRange.to) / 2 : Number.isFinite(tRange.from) ? tRange.from + 1 : Number.isFinite(tRange.to) ? tRange.to - 1 : 0;
  const lowFromH = probe - d > a; const highFromH = probe - c < b; // which bound is moving with t at the probe point
  const kind: RegimeKind = probe <= a + c ? "before" : probe >= b + d ? "after" : lowFromH ? (highFromH ? "full-h" : "exiting") : (highFromH ? "entering" : "full-x");
  const labels: Record<RegimeKind, string> = { before: "No overlap · y(t)=0", entering: "Partial overlap · inflow", "full-x": "Full enclosure · x inside h(t−τ)", "full-h": "Full enclosure · h(t−τ) inside x", exiting: "Partial overlap · outflow", after: "Post overlap · y(t)=0", impulse: "", unbounded: "" };
  const tau1Latex = kind === "before" || kind === "after" ? "\\varnothing" : lowFromH ? shifted(d) : num(a);
  const tau2Latex = kind === "before" || kind === "after" ? "\\varnothing" : highFromH ? shifted(c) : num(b);
  const key = `${seg}`; let closed = cache.get(key);
  if (closed === undefined) { closed = kind === "before" || kind === "after" ? "0" : fitClosedForm(x, h, tRange); cache.set(key, closed); }
  return { ...base, kind, index: seg + 1, total: edges.length - 1, label: labels[kind], tRange, tau1Latex, tau2Latex, closedFormLatex: closed, overlap: r0.overlap };
}
