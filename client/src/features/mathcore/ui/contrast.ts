/** WCAG 2.x contrast ratio between two `#RRGGBB` colors (used by the palette test; pure). */
function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
export function luminance(hex: string): number {
  const h = hex.replace("#", "");
  return 0.2126 * channel(parseInt(h.slice(0, 2), 16)) + 0.7152 * channel(parseInt(h.slice(2, 4), 16)) + 0.0722 * channel(parseInt(h.slice(4, 6), 16));
}
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
