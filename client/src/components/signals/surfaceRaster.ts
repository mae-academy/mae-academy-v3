/**
 * Software Gouraud rasteriser for the complex-surface studio (Canvas 2D, no WebGL).
 * Per-vertex colour parameter τ and Lambert shade are interpolated across every triangle in screen
 * space and resolved per pixel through a 1024-entry spectral LUT — so the colormap is continuous
 * (no per-polygon flat fills, no quantised buckets) and occlusion comes from a z-buffer.
 */
import { SURFACE_SPECTRUM, sampleSpectrum } from "@/lib/spectralPalette";

const LUT_SIZE = 1024;
const LUT_R = new Uint8Array(LUT_SIZE);
const LUT_G = new Uint8Array(LUT_SIZE);
const LUT_B = new Uint8Array(LUT_SIZE);
for (let i = 0; i < LUT_SIZE; i++) {
  const [r, g, b] = sampleSpectrum(SURFACE_SPECTRUM, i / (LUT_SIZE - 1));
  LUT_R[i] = Math.round(r);
  LUT_G[i] = Math.round(g);
  LUT_B[i] = Math.round(b);
}

/** Colour of the spectrum at τ ∈ [0,1] with a Lambert shade factor ∈ [0,1] (same math as the raster inner loop). */
export function spectrumRgb(tau: number, shade = 1): [number, number, number] {
  const idx = Math.max(0, Math.min(LUT_SIZE - 1, Math.round(tau * (LUT_SIZE - 1))));
  const k = 0.6 + 0.4 * Math.max(0, Math.min(1, shade));
  return [Math.round(LUT_R[idx] * k), Math.round(LUT_G[idx] * k), Math.round(LUT_B[idx] * k)];
}

export class SurfaceRaster {
  readonly canvas: HTMLCanvasElement;
  width = 0;
  height = 0;
  private ctx: CanvasRenderingContext2D;
  private image: ImageData | null = null;
  private pixels: Uint32Array = new Uint32Array(0);
  private zbuf: Float32Array = new Float32Array(0);

  constructor() {
    this.canvas = document.createElement("canvas");
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas unavailable");
    this.ctx = ctx;
  }

  resize(width: number, height: number): void {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    if (w === this.width && h === this.height && this.image) return;
    this.width = w;
    this.height = h;
    this.canvas.width = w;
    this.canvas.height = h;
    this.image = this.ctx.createImageData(w, h);
    this.pixels = new Uint32Array(this.image.data.buffer);
    this.zbuf = new Float32Array(w * h);
  }

  clear(): void {
    this.pixels.fill(0);
    this.zbuf.fill(-Infinity);
  }

  /** Uploads the frame and returns the canvas to composite with drawImage. */
  finish(): HTMLCanvasElement {
    if (this.image) this.ctx.putImageData(this.image, 0, 0);
    return this.canvas;
  }

  depthAt(x: number, y: number): number {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix >= this.width || iy >= this.height) return -Infinity;
    return this.zbuf[iy * this.width + ix];
  }

  /**
   * Opaque Gouraud triangle: screen positions in raster pixels, view depth (larger = nearer), colour
   * parameter τ ∈ [0,1] and shade ∈ [0,1] per vertex.
   */
  triangle(
    x0: number, y0: number, z0: number, t0: number, s0: number,
    x1: number, y1: number, z1: number, t1: number, s1: number,
    x2: number, y2: number, z2: number, t2: number, s2: number,
  ): void {
    const W = this.width;
    const H = this.height;
    const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
    const maxX = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2)));
    const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
    const maxY = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)));
    if (minX > maxX || minY > maxY) return;
    const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (Math.abs(area) < 1e-9) return;
    const inv = 1 / area;
    // w1 = (px − x0)·(y2 − y0)·inv − (py − y0)·(x2 − x0)·inv ;  w2 = (py − y0)·(x1 − x0)·inv − (px − x0)·(y1 − y0)·inv
    const a1 = (y2 - y0) * inv; const b1 = -(x2 - x0) * inv;
    const a2 = -(y1 - y0) * inv; const b2 = (x1 - x0) * inv;
    const EPS = -1e-4;
    const pixels = this.pixels;
    const zbuf = this.zbuf;
    const dz1 = z1 - z0; const dz2 = z2 - z0;
    const dt1 = t1 - t0; const dt2 = t2 - t0;
    const ds1 = s1 - s0; const ds2 = s2 - s0;
    for (let y = minY; y <= maxY; y++) {
      const py = y + 0.5 - y0;
      const row = y * W;
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5 - x0;
        const w1 = px * a1 + py * b1;
        const w2 = px * a2 + py * b2;
        const w0 = 1 - w1 - w2;
        if (w0 < EPS || w1 < EPS || w2 < EPS) continue;
        const z = z0 + w1 * dz1 + w2 * dz2;
        const idx = row + x;
        if (z <= zbuf[idx]) continue;
        zbuf[idx] = z;
        let ti = ((t0 + w1 * dt1 + w2 * dt2) * (LUT_SIZE - 1) + 0.5) | 0;
        if (ti < 0) ti = 0; else if (ti > LUT_SIZE - 1) ti = LUT_SIZE - 1;
        let sh = s0 + w1 * ds1 + w2 * ds2;
        if (sh < 0) sh = 0; else if (sh > 1) sh = 1;
        const k = 0.6 + 0.4 * sh;
        pixels[idx] = 0xff000000 | (((LUT_B[ti] * k) | 0) << 16) | (((LUT_G[ti] * k) | 0) << 8) | ((LUT_R[ti] * k) | 0);
      }
    }
  }

  /** Alpha-blended flat triangle, depth-tested (no depth write) against the opaque surface. */
  blendedTriangle(
    x0: number, y0: number, z0: number,
    x1: number, y1: number, z1: number,
    x2: number, y2: number, z2: number,
    rgb: readonly [number, number, number], alpha: number, bias = 0.01,
  ): void {
    const W = this.width;
    const H = this.height;
    const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
    const maxX = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2)));
    const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
    const maxY = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)));
    const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (minX > maxX || minY > maxY || Math.abs(area) < 1e-9) return;
    const inv = 1 / area;
    const a1 = (y2 - y0) * inv; const b1 = -(x2 - x0) * inv;
    const a2 = -(y1 - y0) * inv; const b2 = (x1 - x0) * inv;
    const EPS = -1e-4;
    const pixels = this.pixels;
    const zbuf = this.zbuf;
    const a255 = Math.round(alpha * 255);
    for (let y = minY; y <= maxY; y++) {
      const py = y + 0.5 - y0;
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5 - x0;
        const w1 = px * a1 + py * b1;
        const w2 = px * a2 + py * b2;
        const w0 = 1 - w1 - w2;
        if (w0 < EPS || w1 < EPS || w2 < EPS) continue;
        const idx = y * W + x;
        const z = z0 + w1 * (z1 - z0) + w2 * (z2 - z0);
        if (z < zbuf[idx] - bias) continue;
        this.blendPixel(idx, rgb, alpha, a255);
      }
    }
  }

  /** Depth-tested line (DDA) blended with `alpha`; used for the mesh wireframe and ROC hairlines. */
  line(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, rgb: readonly [number, number, number], alpha: number, bias = 0.02): void {
    const steps = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)));
    if (steps === 0 || steps > 4000) return;
    const a255 = Math.round(alpha * 255);
    for (let i = 0; i <= steps; i++) {
      const f = i / steps;
      const x = Math.floor(x0 + (x1 - x0) * f);
      const y = Math.floor(y0 + (y1 - y0) * f);
      if (x < 0 || y < 0 || x >= this.width || y >= this.height) continue;
      const idx = y * this.width + x;
      if (z0 + (z1 - z0) * f < this.zbuf[idx] - bias) continue;
      this.blendPixel(idx, rgb, alpha, a255);
    }
  }

  private blendPixel(idx: number, rgb: readonly [number, number, number], alpha: number, a255: number): void {
    const p = this.pixels[idx];
    const pa = p >>> 24;
    if (pa === 0) {
      this.pixels[idx] = (a255 << 24) | (rgb[2] << 16) | (rgb[1] << 8) | rgb[0];
      return;
    }
    const inv = 1 - alpha;
    const r = ((p & 0xff) * inv + rgb[0] * alpha) | 0;
    const g = (((p >>> 8) & 0xff) * inv + rgb[1] * alpha) | 0;
    const b = (((p >>> 16) & 0xff) * inv + rgb[2] * alpha) | 0;
    this.pixels[idx] = (pa << 24) | (b << 16) | (g << 8) | r;
  }
}
