/**
 * Renderer interface (ADR-10) and the only v1 implementation: CPU Canvas 2D (ADR-4, ADR-7). No WebGL.
 * Colors and the label font come from the design tokens in client/src/index.css, read at draw time, so the theme
 * (light/dark) is always current and no color is written in this file.
 */
import { DASH_PATTERNS, FIELD_OPACITY, TRANSFORM_GRID_OPACITY } from "@shared/mathcore/constants";
import type { Viewport } from "@shared/mathcore/ir/types";

export interface DrawCurve {
  segments: readonly Float64Array[];
  color: string;
  width: number;
  dash?: "solid" | "dashed" | "dotted";
  highlighted?: boolean;
  /** Implicit contours (STEPS.md §7.3): drawn through the midpoints of the polyline with quadratic curves. */
  smooth?: boolean;
}

/** Inequality shading: a mask (1 = inside) over the viewport it was computed for, tinted with the item color. */
export interface DrawField {
  width: number;
  height: number;
  data: Uint8Array;
  color: string;
  /** Where the mask lies; while the view pans or zooms it is drawn there until the new mask arrives. */
  viewport?: Viewport;
}

export interface DrawPoint {
  x: number;
  y: number;
  color: string;
  label?: string;
}

export interface DrawTangent {
  x0: number;
  y0: number;
  slope: number;
  /** Slope-triangle run in world units. */
  dx: number;
  color: string;
}

/** A 2×2 matrix on the canvas (STEPS.md §8.2). Colors are resolved from LINALG_TOKENS by the page. */
export interface DrawTransform {
  grid: readonly Float64Array[];
  parallelogram: Float64Array;
  orientation: -1 | 0 | 1;
  iHat: [number, number];
  jHat: [number, number];
  eigenLines: readonly Float64Array[];
  /** Item color: the transformed grid. */
  color: string;
  /** Unit-square image fill for orientation +1 and −1. */
  positive: string;
  negative: string;
  arrow: string;
  eigen: string;
}

export interface Scene {
  viewport: Viewport;
  grid: boolean;
  curves: DrawCurve[];
  fields?: DrawField[];
  transforms?: DrawTransform[];
  points: DrawPoint[];
  tangent?: DrawTangent | null;
}

export interface Renderer {
  resize(width: number, height: number, pixelRatio: number): void;
  draw(scene: Scene): void;
}

/** Curve palette: design-token names (index.css); item styles may also name a token. */
export const PALETTE_TOKENS = ["--slider-blue", "--slider-red", "--slider-violet", "--foreground", "--muted-foreground"] as const;

/**
 * Design tokens for matrices: orientation kept (blue) or reversed (red) shades the unit square's image differently
 * (§8.2 "negative orientation changes color"); Aî, Aĵ use the text color; eigen-directions the violet accent.
 */
export const LINALG_TOKENS = { positive: "--slider-blue", negative: "--slider-red", arrow: "--foreground", eigen: "--slider-violet" } as const;

/** Resolves a style color: `#RRGGBB` as is, a token name (`primary` or `--primary`) through the element's style. */
export function resolveColor(el: Element, color: string | undefined, fallbackToken: string): string {
  const style = getComputedStyle(el);
  if (color && color.startsWith("#")) return color;
  const token = color ? (color.startsWith("--") ? color : `--${color}`) : fallbackToken;
  return style.getPropertyValue(token).trim() || style.getPropertyValue(fallbackToken).trim() || style.color;
}

/** Nice grid step (1, 2 or 5 × 10ⁿ) for about `target` lines across `span`. */
export function gridStep(span: number, target: number): number {
  const raw = span / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * mag;
}


/** `rgb` bytes of any CSS color, read back from a 1×1 canvas (so tokens, hex and oklch all work). */
const rgbCache = new Map<string, [number, number, number]>();
function rgbOf(color: string): [number, number, number] {
  const hit = rgbCache.get(color);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = c.height = 1;
  const g = c.getContext("2d", { willReadFrequently: true });
  let rgb: [number, number, number] = [0, 0, 0];
  if (g) {
    g.fillStyle = color;
    g.fillRect(0, 0, 1, 1);
    const d = g.getImageData(0, 0, 1, 1).data;
    rgb = [d[0], d[1], d[2]];
  }
  rgbCache.set(color, rgb);
  return rgb;
}

/** Target grid lines across the larger dimension. */
const GRID_LINES = 10;
/** Minor lines between major lines. */
const MINOR_DIVISIONS = 5;
/** Label offset from an axis, in label-font ems. */
const LABEL_GAP_EM = 0.4;
/** Point radius and tangent line width in CSS pixels (drawing units, not layout spacing). */
const POINT_RADIUS = 4.5;
const AXIS_WIDTH = 1.25;
/** Basis-vector arrows: shaft width and head length in CSS pixels. */
const ARROW_WIDTH = 2.5;
const ARROW_HEAD = 10;
/** Eigen-direction line width in CSS pixels. */
const EIGEN_WIDTH = 1.5;
/** Arrow-head half width and label offset, as fractions of the head length. */
const ARROW_HEAD_SPREAD = 0.5;
const ARROW_LABEL_OFFSET = 0.6;

export class Canvas2DRenderer implements Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private ratio = 1;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is not available");
    this.ctx = ctx;
  }

  resize(width: number, height: number, pixelRatio: number): void {
    this.width = width;
    this.height = height;
    this.ratio = pixelRatio;
    this.canvas.width = Math.round(width * pixelRatio);
    this.canvas.height = Math.round(height * pixelRatio);
  }

  draw(scene: Scene): void {
    const { ctx, width: W, height: H } = this;
    const { xmin, xmax, ymin, ymax } = scene.viewport;
    const sx = W / (xmax - xmin);
    const sy = H / (ymax - ymin);
    const X = (x: number) => (x - xmin) * sx;
    const Y = (y: number) => (ymax - y) * sy;
    const css = getComputedStyle(this.canvas);
    const tok = (name: string) => css.getPropertyValue(name).trim();
    const fontSize = parseFloat(css.fontSize) || 12;

    ctx.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    ctx.fillStyle = tok("--background");
    ctx.fillRect(0, 0, W, H);

    if (scene.grid) {
      const step = gridStep(Math.max(xmax - xmin, ymax - ymin), GRID_LINES);
      this.gridLines(step / MINOR_DIVISIONS, tok("--muted"), 1, scene, X, Y);
      this.gridLines(step, tok("--border"), 1, scene, X, Y);
      // Axes and labels.
      ctx.strokeStyle = tok("--muted-foreground");
      ctx.lineWidth = AXIS_WIDTH;
      ctx.beginPath();
      if (xmin <= 0 && xmax >= 0) {
        ctx.moveTo(X(0), 0);
        ctx.lineTo(X(0), H);
      }
      if (ymin <= 0 && ymax >= 0) {
        ctx.moveTo(0, Y(0));
        ctx.lineTo(W, Y(0));
      }
      ctx.stroke();
      ctx.fillStyle = tok("--muted-foreground");
      ctx.font = css.font;
      const gap = fontSize * LABEL_GAP_EM;
      const yAxisX = Math.min(Math.max(X(0), gap), W - gap);
      const xAxisY = Math.min(Math.max(Y(0), fontSize + gap), H - gap);
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      for (let x = Math.ceil(xmin / step) * step; x <= xmax; x += step) {
        if (Math.abs(x) < step / 2) continue;
        const label = formatTick(x, step);
        const half = ctx.measureText(label).width / 2;
        // A label that would be cut by the canvas edge is skipped rather than drawn half.
        if (X(x) - half < gap || X(x) + half > W - gap) continue;
        ctx.fillText(label, X(x), Math.min(xAxisY + gap, H - fontSize - gap));
      }
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      for (let y = Math.ceil(ymin / step) * step; y <= ymax; y += step) {
        if (Math.abs(y) < step / 2 || Y(y) < fontSize || Y(y) > H - fontSize) continue;
        ctx.fillText(formatTick(y, step), Math.max(yAxisX - gap, ctx.measureText(formatTick(y, step)).width + gap), Y(y));
      }
    }

    for (const f of scene.fields ?? []) {
      const fv = f.viewport ?? scene.viewport;
      this.drawField(f, X(fv.xmin), Y(fv.ymax), (fv.xmax - fv.xmin) * sx, (fv.ymax - fv.ymin) * sy);
    }
    for (const t of scene.transforms ?? []) this.drawTransform(t, X, Y, css.font);

    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    for (const c of scene.curves) {
      ctx.strokeStyle = c.color;
      ctx.lineWidth = c.highlighted ? c.width + 1.5 : c.width;
      ctx.setLineDash(c.dash === "dashed" ? [...DASH_PATTERNS.dashed] : c.dash === "dotted" ? [...DASH_PATTERNS.dotted] : []);
      ctx.beginPath();
      for (const s of c.segments) {
        if (s.length === 2) continue;
        ctx.moveTo(X(s[0]), Y(s[1]));
        if (c.smooth && s.length >= 6) {
          // Each vertex becomes the control point of a quadratic from the previous midpoint to the next one; the ends
          // stay where the contour put them.
          for (let i = 2; i < s.length - 2; i += 2) {
            ctx.quadraticCurveTo(X(s[i]), Y(s[i + 1]), X((s[i] + s[i + 2]) / 2), Y((s[i + 1] + s[i + 3]) / 2));
          }
          ctx.lineTo(X(s[s.length - 2]), Y(s[s.length - 1]));
        } else {
          for (let i = 2; i < s.length; i += 2) ctx.lineTo(X(s[i]), Y(s[i + 1]));
        }
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);

    if (scene.tangent) {
      const t = scene.tangent;
      ctx.strokeStyle = t.color;
      ctx.lineWidth = AXIS_WIDTH;
      ctx.beginPath();
      ctx.moveTo(X(xmin), Y(t.y0 + t.slope * (xmin - t.x0)));
      ctx.lineTo(X(xmax), Y(t.y0 + t.slope * (xmax - t.x0)));
      ctx.stroke();
      // Slope triangle Δx, Δy.
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(X(t.x0), Y(t.y0));
      ctx.lineTo(X(t.x0 + t.dx), Y(t.y0));
      ctx.lineTo(X(t.x0 + t.dx), Y(t.y0 + t.slope * t.dx));
      ctx.stroke();
      ctx.setLineDash([]);
    }

    for (const p of scene.points) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(X(p.x), Y(p.y), POINT_RADIUS, 0, 2 * Math.PI);
      ctx.fill();
      if (p.label) {
        ctx.fillStyle = tok("--foreground");
        ctx.font = css.font;
        ctx.textAlign = "left";
        ctx.textBaseline = "bottom";
        ctx.fillText(p.label, X(p.x) + POINT_RADIUS * 2, Y(p.y) - POINT_RADIUS);
      }
    }
  }

  private drawTransform(t: DrawTransform, X: (x: number) => number, Y: (y: number) => number, font: string): void {
    const { ctx } = this;
    ctx.save();
    // Transformed grid: images of x = k and y = k, still parallel and evenly spaced.
    ctx.globalAlpha = TRANSFORM_GRID_OPACITY;
    ctx.strokeStyle = t.color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const g of t.grid) {
      ctx.moveTo(X(g[0]), Y(g[1]));
      ctx.lineTo(X(g[2]), Y(g[3]));
    }
    ctx.stroke();
    // Image of the unit square, shaded by orientation (a singular matrix squashes it to a segment: outline only).
    const p = t.parallelogram;
    ctx.beginPath();
    ctx.moveTo(X(p[0]), Y(p[1]));
    for (let i = 2; i < p.length; i += 2) ctx.lineTo(X(p[i]), Y(p[i + 1]));
    ctx.closePath();
    if (t.orientation !== 0) {
      ctx.globalAlpha = FIELD_OPACITY;
      ctx.fillStyle = t.orientation > 0 ? t.positive : t.negative;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = t.orientation < 0 ? t.negative : t.positive;
    ctx.lineWidth = 1;
    ctx.stroke();
    // Eigen-directions.
    ctx.strokeStyle = t.eigen;
    ctx.lineWidth = EIGEN_WIDTH;
    ctx.setLineDash([...DASH_PATTERNS.dashed]);
    ctx.beginPath();
    for (const l of t.eigenLines) {
      ctx.moveTo(X(l[0]), Y(l[1]));
      ctx.lineTo(X(l[2]), Y(l[3]));
    }
    ctx.stroke();
    ctx.setLineDash([]);
    // Aî and Aĵ.
    ctx.font = font;
    for (const [v, label] of [[t.iHat, "Aî"], [t.jHat, "Aĵ"]] as const) this.arrow(X(0), Y(0), X(v[0]), Y(v[1]), t.arrow, label);
    ctx.restore();
  }

  private arrow(x0: number, y0: number, x1: number, y1: number, color: string, label: string): void {
    const { ctx } = this;
    const len = Math.hypot(x1 - x0, y1 - y0);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = ARROW_WIDTH;
    ctx.lineCap = "round";
    if (len < 1) return;
    const ux = (x1 - x0) / len;
    const uy = (y1 - y0) / len;
    const head = Math.min(ARROW_HEAD, len / 2);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1 - ux * head, y1 - uy * head);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    const spread = head * ARROW_HEAD_SPREAD;
    ctx.lineTo(x1 - ux * head - uy * spread, y1 - uy * head + ux * spread);
    ctx.lineTo(x1 - ux * head + uy * spread, y1 - uy * head - ux * spread);
    ctx.closePath();
    ctx.fill();
    ctx.textAlign = ux >= 0 ? "left" : "right";
    ctx.textBaseline = uy >= 0 ? "top" : "bottom";
    ctx.fillText(label, x1 + ux * head * ARROW_LABEL_OFFSET, y1 + uy * head * ARROW_LABEL_OFFSET);
  }

  /** Tinted layers by mask, so a redraw (hover, trace) does not rebuild the image (Phase 3 review). */
  private readonly layers = new WeakMap<Uint8Array, { color: string; layer: HTMLCanvasElement }>();

  private drawField(f: DrawField, left: number, top: number, w: number, h: number): void {
    const { ctx } = this;
    const cached = this.layers.get(f.data);
    if (cached && cached.color === f.color) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(cached.layer, left, top, w, h);
      return;
    }
    const layer = document.createElement("canvas");
    layer.width = f.width;
    layer.height = f.height;
    const lg = layer.getContext("2d");
    if (!lg) return;
    const img = lg.createImageData(f.width, f.height);
    const [r, g, b] = rgbOf(f.color);
    const alpha = Math.round(FIELD_OPACITY * 255);
    for (let i = 0; i < f.data.length; i++) {
      if (f.data[i] === 1) {
        img.data[4 * i] = r;
        img.data[4 * i + 1] = g;
        img.data[4 * i + 2] = b;
        img.data[4 * i + 3] = alpha;
      }
    }
    lg.putImageData(img, 0, 0);
    this.layers.set(f.data, { color: f.color, layer });
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(layer, left, top, w, h);
  }

  private gridLines(step: number, color: string, width: number, scene: Scene, X: (x: number) => number, Y: (y: number) => number) {
    const { ctx, width: W, height: H } = this;
    const { xmin, xmax, ymin, ymax } = scene.viewport;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (let x = Math.ceil(xmin / step) * step; x <= xmax; x += step) {
      const px = Math.round(X(x)) + 0.5;
      ctx.moveTo(px, 0);
      ctx.lineTo(px, H);
    }
    for (let y = Math.ceil(ymin / step) * step; y <= ymax; y += step) {
      const py = Math.round(Y(y)) + 0.5;
      ctx.moveTo(0, py);
      ctx.lineTo(W, py);
    }
    ctx.stroke();
  }
}

/** Tick label with only the digits the step needs (no 0.30000000000000004). */
export function formatTick(v: number, step: number): string {
  const digits = Math.max(0, -Math.floor(Math.log10(step)));
  if (Math.abs(v) >= 1e6 || (Math.abs(v) < 1e-4 && v !== 0)) return v.toExponential(1);
  return v.toFixed(digits);
}
