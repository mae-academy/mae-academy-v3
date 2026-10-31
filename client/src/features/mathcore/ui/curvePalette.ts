/**
 * The 8 curve colors (Part C): design tokens from client/src/index.css, no new colors. Each token is checked by
 * curvePalette.test.ts against the page background in BOTH themes (WCAG 1.4.11: 3 : 1 for graphics). The item style
 * stores the token name without `--` (schema: "a design-token name"); the renderer resolves it per theme.
 */
export interface CurveColor {
  /** Token name as stored in `item.style.color`. */
  id: string;
  /** CSS custom property that holds the color in both themes. */
  token: string;
  /** i18n key under `palette.`. */
  name: string;
}

export const CURVE_PALETTE: readonly CurveColor[] = [
  { id: "slider-blue", token: "--slider-blue", name: "blue" },
  { id: "slider-red", token: "--slider-red", name: "red" },
  { id: "slider-violet", token: "--slider-violet", name: "violet" },
  { id: "cm-string", token: "--cm-string", name: "pink" },
  { id: "cm-meta", token: "--cm-meta", name: "sky" },
  { id: "cm-function", token: "--cm-function", name: "indigo" },
  { id: "foreground", token: "--foreground", name: "ink" },
  { id: "muted-foreground", token: "--muted-foreground", name: "gray" },
];

/** The color a line gets when the reader has not picked one: by position, cycling through the palette. */
export function defaultColorId(index: number): string {
  return CURVE_PALETTE[index % CURVE_PALETTE.length].id;
}

/** The palette entry for a stored style color, or undefined for a custom color (for example an imported `#RRGGBB`). */
export function paletteEntry(id: string | undefined, index: number): CurveColor | undefined {
  const wanted = id ?? defaultColorId(index);
  return CURVE_PALETTE.find((c) => c.id === wanted || c.token === wanted);
}
