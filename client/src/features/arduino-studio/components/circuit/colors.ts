const clamp = (n: number): number => Math.max(0, Math.min(255, Math.round(n)));

function parse(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

/** Linear mix of two #rrggbb colours (t = 0 -> a, t = 1 -> b). */
export function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const to = (x: number, y: number): string => clamp(x + (y - x) * t).toString(16).padStart(2, "0");
  return `#${to(ar, br)}${to(ag, bg)}${to(ab, bb)}`;
}

/** Scales brightness: f < 1 darkens, f > 1 lightens toward white. */
export const shade = (hex: string, f: number): string => (f <= 1 ? mixHex("#000000", hex, f) : mixHex(hex, "#ffffff", f - 1));
