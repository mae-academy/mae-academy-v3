/**
 * Renderer interface (ADR-10) and the only v1 implementation: CPU Canvas 2D (ADR-4, ADR-7). No WebGL.
 * Colors and the label font come from the design tokens in client/src/index.css, read at draw time, so the theme
 * (light/dark) is always current and no color is written in this file.
 */
import { DASH_PATTERNS, FIELD_OPACITY } from "@shared/mathcore/constants";
import type { Viewport } from "@shared/mathcore/ir/types";

export interface DrawCurve {
  segments: readonly Float64Array[];
  color: string;
  width: number;
  dash?: "solid" | "dashed" | "dotted";
  highlighted?: boolean;
}

/** Inequality shading: a mask (1 = inside) stretched over the view, tinted with the item color. */
export interface DrawField {
  width: number;
  height: number;
  data: Uint8Array;
  color: string;
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

export interface Scene {
  viewport: Viewport;
  grid: boolean;
  curves: DrawCurve[];
  fields?: DrawField[];
  points: DrawPoint[];
  tangent?: DrawTangent | null;
}

export interface Renderer {
  resize(width: number, height: number, pixelRatio: number): void;
  draw(scene: Scene): void;
}

/** Curve palette: design-token names (index.css); item styles may also name a token. */
export const PALETTE_TOKENS = ["--slider-blue", "--slider-red", "--slider-violet", "--foreground", "--muted-foreground"] as const;

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

    for (const f of scene.fields ?? []) this.drawField(f);

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
        for (let i = 2; i < s.length; i += 2) ctx.lineTo(X(s[i]), Y(s[i + 1]));
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

  /** Tinted layers by mask, so a redraw (hover, trace) does not rebuild the image (Phase 3 review). */
  private readonly layers = new WeakMap<Uint8Array, { color: string; layer: HTMLCanvasElement }>();

  private drawField(f: DrawField): void {
    const { ctx } = this;
    const cached = this.layers.get(f.data);
    if (cached && cached.color === f.color) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(cached.layer, 0, 0, this.width, this.height);
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
    ctx.drawImage(layer, 0, 0, this.width, this.height);
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
