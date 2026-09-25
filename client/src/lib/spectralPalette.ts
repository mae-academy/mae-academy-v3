/**
 * Platform scientific spectral palette (Turbo-style, brand-aligned): one ramp shared by the 3D
 * |H(s)| / |H(z)| surfaces and the Fourier waterfall harmonics.
 */

/** Surface elevation: deep indigo floor → brand blue → cyan → emerald → amber → orange → crimson peaks. */
export const SURFACE_SPECTRUM = ["#1E1B4B", "#2563EB", "#06B6D4", "#10B981", "#F59E0B", "#EA580C", "#E11D48"] as const;

/** Harmonic ramp: the same progression without the indigo floor (k = 1 starts at royal blue). */
export const HARMONIC_SPECTRUM = SURFACE_SPECTRUM.slice(1) as ReadonlyArray<string>;

export function spectrumCss(stops: ReadonlyArray<string>): string {
  return `linear-gradient(to right, ${stops.join(", ")})`;
}

function rgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

/** Linear interpolation through a hex ramp at t ∈ [0, 1]; returns [r, g, b] (0–255). */
export function sampleSpectrum(stops: ReadonlyArray<string>, t: number): [number, number, number] {
  const c = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(c));
  const f = c - i;
  const a = rgb(stops[i]);
  const b = rgb(stops[i + 1]);
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

export function spectrumHex(stops: ReadonlyArray<string>, t: number): string {
  return `#${sampleSpectrum(stops, t).map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}
