/**
 * Part C: contrast, computed from the real token values in client/src/index.css for both themes.
 *  - each of the 8 curve colors: ≥ 3 : 1 against the canvas background (WCAG 1.4.11, graphics);
 *  - the colors are pairwise distinct inside a theme;
 *  - every text/background pair the page uses: ≥ 4.5 : 1 (WCAG 1.4.3, body text).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { contrast } from "./contrast";
import { CURVE_PALETTE } from "./curvePalette";

const css = readFileSync(resolve(__dirname, "../../../index.css"), "utf8");

/** Token → `#RRGGBB` for a theme: every `:root {}` block, then (dark) every `.dark {}` block on top. */
function tokens(theme: "light" | "dark"): Record<string, string> {
  const out: Record<string, string> = {};
  const selectors = theme === "light" ? [":root"] : [":root", ".dark"];
  for (const sel of selectors) {
    const re = new RegExp(`(?:^|\\n)\\s*${sel.replace(".", "\\.")}\\s*\\{([^}]*)\\}`, "g");
    for (const m of css.matchAll(re)) {
      for (const d of m[1].matchAll(/(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) out[d[1]] = d[2];
    }
  }
  return out;
}

/** Text pairs used by mathcore: [foreground token, background token, where]. */
const TEXT_PAIRS: ReadonlyArray<[string, string, string]> = [
  ["--foreground", "--background", "page text"],
  ["--foreground", "--card", "panel text"],
  ["--card-foreground", "--card", "card text"],
  ["--muted-foreground", "--background", "notes on the page"],
  ["--muted-foreground", "--card", "notes in the panel"],
  ["--muted-foreground", "--muted", "notes on a muted surface"],
  ["--cm-number", "--card", "error text in the panel"],
  ["--cm-number", "--background", "error text in a row"],
  ["--cm-keyword", "--card", "badge text"],
  ["--cm-keyword", "--background", "badge text in a row"],
  ["--primary-foreground", "--primary", "active chip / category"],
];

describe.each(["light", "dark"] as const)("%s theme", (theme) => {
  const tok = tokens(theme);

  it("has every token the palette and text pairs need", () => {
    for (const c of CURVE_PALETTE) expect(tok[c.token], c.token).toMatch(/^#/);
    for (const [fg, bg] of TEXT_PAIRS) {
      expect(tok[fg], fg).toMatch(/^#/);
      expect(tok[bg], bg).toMatch(/^#/);
    }
  });

  it("curve colors reach 3 : 1 on the canvas background", () => {
    for (const c of CURVE_PALETTE) {
      const ratio = contrast(tok[c.token], tok["--background"]);
      expect(ratio, `${c.id} on ${theme}: ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(3);
    }
  });

  it("curve colors are distinct", () => {
    const values = CURVE_PALETTE.map((c) => tok[c.token].toLowerCase());
    expect(new Set(values).size).toBe(values.length);
  });

  it("text pairs reach 4.5 : 1", () => {
    for (const [fg, bg, where] of TEXT_PAIRS) {
      const ratio = contrast(tok[fg], tok[bg]);
      expect(ratio, `${where}: ${fg} on ${bg} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("palette", () => {
  it("has 8 colors with unique ids", () => {
    expect(CURVE_PALETTE).toHaveLength(8);
    expect(new Set(CURVE_PALETTE.map((c) => c.id)).size).toBe(8);
  });
});
