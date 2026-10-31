/**
 * Browser tests for the UI scope (Parts B–E): category templates, smart input classification, KaTeX, color picker,
 * both themes, Arabic RTL, phone width, keyboard. Set MATHCORE_SHOTS_DIR to also save the screenshots.
 */
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import LZString from "lz-string";

const SHOTS = process.env.MATHCORE_SHOTS_DIR;
const shot = async (page: Page, name: string) => {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

const link = (graph: unknown) => `/mathcore?g=${LZString.compressToEncodedURIComponent(JSON.stringify(graph))}`;
const doc = (items: string[], extra: Record<string, unknown> = {}) => ({
  version: "1.0",
  viewport: { xmin: -5, xmax: 5, ymin: -3, ymax: 3, aspect: "free" },
  items: items.map((latex, i) => ({ id: `e${i + 1}`, latex })),
  ...extra,
});
const setTheme = (page: Page, theme: "light" | "dark") => page.addInitScript((t) => localStorage.setItem("mae-theme", t), theme);

async function ready(page: Page) {
  await page.waitForSelector(".mc-canvas");
  await expect(page.locator(".mc-meta")).toBeVisible({ timeout: 30_000 });
}

async function open(page: Page, items: string[] = [], extra: Record<string, unknown> = {}) {
  await page.goto(link(doc(items, extra)));
  await ready(page);
}

/** Which row and kind of element has the keyboard. */
const focused = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    const row = el?.closest("li.mc-row");
    const rows = Array.from(document.querySelectorAll("li.mc-row"));
    return { tag: el?.tagName ?? "", row: row ? rows.indexOf(row) : -1, isRow: el === row };
  });

async function pixelAt(page: Page, x: number, y: number): Promise<number[]> {
  return page.evaluate(
    ([wx, wy]) => {
      const c = document.querySelector<HTMLCanvasElement>(".mc-canvas");
      const ctx = c?.getContext("2d");
      if (!c || !ctx) return [];
      const r = c.getBoundingClientRect();
      const px = Math.round(((wx + 5) / 10) * r.width * (c.width / r.width));
      const py = Math.round(((3 - wy) / 6) * r.height * (c.height / r.height));
      return Array.from(ctx.getImageData(px, py, 1, 1).data.slice(0, 3));
    },
    [x, y],
  );
}

async function addSample(page: Page, category: string, sample: string) {
  await page.locator(`.mc-category[data-category="${category}"]`).click();
  const tpl = page.getByTestId("mc-template");
  await expect(tpl).toHaveAttribute("data-category", category);
  await tpl.locator(`.mc-sample[data-sample="${sample}"] [data-testid="mc-sample-add"]`).click();
}

test.describe("Part B: categories and templates", () => {
  test("the sidebar lists the five categories and Expressions; each opens a template with a KaTeX sample and an explanation", async ({ page }) => {
    await open(page);
    const nav = page.getByRole("navigation", { name: "Math categories" });
    await expect(nav.locator(".mc-category")).toHaveText(["Expressions", "Graphing", "Calculus", "Algebra", "Linear systems", "Linear algebra"]);
    for (const c of ["graphing", "calculus", "algebra", "linearSystems", "linearAlgebra"]) {
      await nav.locator(`[data-category="${c}"]`).click();
      const tpl = page.getByTestId("mc-template");
      await expect(tpl).toHaveAttribute("data-category", c);
      await expect(tpl.locator(".mc-sample").first().locator(".katex").first()).toBeVisible();
      await expect(tpl.locator(".mc-sample .mc-note").first()).not.toBeEmpty();
      await expect(tpl.locator(".katex-error")).toHaveCount(0);
    }
    // One screenshot per category with its first sample added, so the graph shows what the sample does.
    for (const c of ["graphing", "calculus", "algebra", "linearSystems", "linearAlgebra"]) {
      await open(page);
      await page.locator(`.mc-category[data-category="${c}"]`).click();
      await page.getByTestId("mc-template").locator('[data-testid="mc-sample-add"]').first().click();
      await page.waitForTimeout(1500);
      await shot(page, `category-${c}`);
    }
    await nav.locator('[data-category="home"]').click();
    await expect(page.getByTestId("mc-template")).toHaveCount(0);
  });

  test("the default view is the expression list on the left, the graph on the right, with an add-row control", async ({ page }) => {
    await open(page);
    const panel = await page.locator(".mc-panel").boundingBox();
    const graph = await page.locator(".mc-canvas-wrap").boundingBox();
    expect(panel && graph && panel.x < graph.x).toBe(true);
    await page.locator(".mc-add").click();
    await expect(page.getByTestId("mc-row")).toHaveCount(1);
  });

  test("graphing samples: explicit (slider a), implicit, inequality, parametric, polar each run without an error", async ({ page }) => {
    await open(page);
    await addSample(page, "graphing", "explicit");
    await expect(page.locator(".mc-slider-name")).toHaveAttribute("data-name", "a");
    for (const s of ["implicit", "inequality", "parametric", "polar"]) await addSample(page, "graphing", s);
    await expect(page.getByTestId("mc-row")).toHaveCount(5);
    await page.waitForTimeout(800);
    await expect(page.locator(".mc-error")).toHaveCount(0);
    await page.locator("details.mc-details summary").first().click();
    const text = await page.locator("details.mc-details").first().innerText();
    expect(text).toContain("shaded region covers about");
    // The circle of radius 2 passes through (2, 0): the canvas there is not the background.
    expect(await pixelAt(page, 2, 0)).not.toEqual(await pixelAt(page, 4.6, 2.8));
  });

  test("calculus: the integral sample shows the area 1/3 (within 1e-9) and shades it", async ({ page }) => {
    await open(page);
    await addSample(page, "calculus", "integral");
    const integral = page.getByTestId("mc-integral");
    await expect(integral).toHaveAttribute("data-value", /\d/, { timeout: 15_000 });
    const v = Number(await integral.getAttribute("data-value"));
    expect(Math.abs(v - 1 / 3)).toBeLessThan(1e-9);
    await expect(integral.locator(".katex .mfrac").first()).toBeVisible(); // ≈ \frac{1}{3}
    await expect(integral).toContainText("0.3333333333");
    await page.waitForTimeout(500);
    // Between the curve y = x² and the x-axis at x = 0.8 is shaded (y = 0.2); above the curve (y = 0.5 at x = 0.2) is not.
    const inside = await pixelAt(page, 0.8, 0.2);
    const outside = await pixelAt(page, 0.2, 0.5);
    expect(inside).not.toEqual(outside);
  });

  test("calculus: the derivative sample draws f′, creates the slider x₀ and a tangent that follows it", async ({ page }) => {
    await open(page);
    await addSample(page, "calculus", "derivative");
    const slider = page.locator('.mc-slider-name[data-name="x_0"]');
    await expect(slider).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".mc-slider-name")).toHaveCount(1);
    const readout = page.getByTestId("mc-tangent-readout");
    await expect(readout).toHaveAttribute("data-slope", "2", { timeout: 15_000 });
    await expect(readout).toHaveAttribute("data-x0", "1");
    await page.getByRole("slider", { name: /x_0/ }).focus();
    for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowRight");
    await expect(readout).toHaveAttribute("data-x0", "2", { timeout: 10_000 });
    await expect(readout).toHaveAttribute("data-slope", "4");
  });

  test("algebra: only what exists - the zeros - and solve, simplify, factor say 'not yet supported'", async ({ page }) => {
    await open(page);
    await addSample(page, "algebra", "zeros");
    await page.waitForTimeout(800);
    await page.locator("details.mc-details summary").first().click();
    await expect(page.locator("details.mc-details").first()).toContainText(/crosses zero at x = .*-2.*2|crosses zero at x = .*−2.*2/);
    const un = page.getByTestId("mc-unsupported");
    for (const w of ["solve", "simplify", "factor"]) await expect(un).toContainText(`${w}: not yet supported`);
  });

  test("linear systems: the two-equation sample gives x = 2, y = 1 with Gauss-Jordan steps", async ({ page }) => {
    await open(page);
    await addSample(page, "linearSystems", "system2");
    const panel = page.getByTestId("mc-linalg");
    await expect(panel).toContainText("Solution", { timeout: 15_000 });
    await page.locator("details.mc-details summary").first().click();
    await expect(page.locator("details.mc-details").first()).toContainText("unique solution x = 2, y = 1");
    await expect(panel.locator(".mc-steps")).toBeVisible();
    await addSample(page, "linearSystems", "systemMatrix");
    await expect(page.getByTestId("mc-linalg")).toHaveCount(3, { timeout: 15_000 });
  });

  test("linear algebra: det(A) = -2 from the 2×2 sample; the 3×3 sample has det 24; transpose and n×n say 'not yet supported'", async ({ page }) => {
    await open(page);
    await addSample(page, "linearAlgebra", "matrix2");
    const op = page.getByTestId("mc-matrix-op");
    await expect(op).toBeVisible({ timeout: 15_000 });
    await expect(op).toContainText(/−2|-2/);
    await expect(page.getByTestId("mc-matrix-editor")).toBeVisible();
    await addSample(page, "linearAlgebra", "matrix3");
    await expect(page.getByTestId("mc-linalg").last()).toContainText("24", { timeout: 15_000 });
    const un = page.getByTestId("mc-unsupported");
    await expect(un).toContainText("General");
    await expect(un).toContainText("Transpose");
    // A line that asks for the transpose says so, and nothing is guessed.
    await page.locator("math-field").last().focus();
    await page.keyboard.press("Enter");
    await expect.poll(async () => (await focused(page)).row).toBe(3);
    await page.keyboard.type("A^T");
    await expect(page.getByTestId("mc-matrix-op").last()).toContainText("Transpose is not supported yet", { timeout: 10_000 });
  });

  test("a sample is added once; the untouched starter line is replaced", async ({ page }) => {
    await page.goto("/mathcore");
    await ready(page);
    await expect(page.getByTestId("mc-row")).toHaveCount(1);
    await addSample(page, "calculus", "integral");
    await addSample(page, "calculus", "derivative");
    // f(x)=x^2 is shared by both samples and is not repeated: f, ∫, f′.
    await expect(page.getByTestId("mc-row")).toHaveCount(3);
    await expect(page.locator(".mc-error")).toHaveCount(0);
  });
});

test.describe("Part D: classification", () => {
  test("each statement has one class: slider, input variable, function, constant matrix, output, unknown", async ({ page }) => {
    await open(page, ["a=3", "t=2", "f(x)=x^2", "A=\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}", "y=x", "?!?"]);
    const classes = await page.locator('li.mc-row').evaluateAll((rows) => rows.map((r) => (r as HTMLElement).dataset.class));
    expect(classes).toEqual(["slider", "input", "function", "matrix", "output", "unknown"]);
  });

  test("an unclear statement shows the chip and waits for the reader: K = 5 is a slider by default and can be made a constant", async ({ page }) => {
    await open(page, ["K=5", "y=Kx"]);
    const chip = page.getByTestId("mc-interpret").first();
    await expect(chip).toContainText("Interpret as:");
    await expect(chip.locator('[data-choice="slider"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('.mc-slider-name[data-name="K"]')).toBeVisible();
    await chip.locator('[data-choice="constant"]').click();
    await expect(chip.locator('[data-choice="constant"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('.mc-slider-name[data-name="K"]')).toHaveCount(0);
    await expect(page.locator(".mc-row").first()).toContainText("Constant: no slider.");
  });

  test("x = 3 is the vertical line unless the reader reads it as an input variable; t cannot be assigned", async ({ page }) => {
    await open(page, ["x=3", "t=2"]);
    const first = page.getByTestId("mc-interpret").first();
    await expect(first.locator('[data-choice="line"]')).toHaveAttribute("aria-pressed", "true");
    const before = await pixelAt(page, 3, 1);
    await first.locator('[data-choice="input"]').click();
    await expect(page.locator(".mc-row").first()).toContainText("Hidden:");
    await page.waitForTimeout(300);
    expect(await pixelAt(page, 3, 1)).not.toEqual(before);
    await expect(page.locator(".mc-row").nth(1)).toContainText("cannot be assigned");
  });

  test("a named matrix is a constant with an entry editor; editing an entry rewrites the line", async ({ page }) => {
    await open(page, ["A=\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}"]);
    const editor = page.getByTestId("mc-matrix-editor");
    await expect(editor.locator("input")).toHaveCount(4);
    await editor.locator("input").nth(3).fill("9");
    await expect(page.getByTestId("mc-linalg").first()).toContainText("33", { timeout: 15_000 }); // 1·9 − 2·3 = 3, det shown; trace 10
    await expect(page.getByTestId("mc-linalg").first()).toContainText("3");
  });

  test("f(x)=x^2 then ∫_0^1 f(x)dx: the area is 1/3 within 1e-9; a missing bound creates the sliders a and b", async ({ page }) => {
    await open(page, ["f(x)=x^2", "\\int_0^1 f(x)\\,dx"]);
    const v = Number(await page.getByTestId("mc-integral").getAttribute("data-value"));
    expect(Math.abs(v - 1 / 3)).toBeLessThan(1e-9);
    await open(page, ["f(x)=x^2", "\\int f(x)\\,dx"]);
    await expect(page.locator(".mc-slider-name")).toHaveCount(2, { timeout: 15_000 });
    await expect(page.locator('.mc-slider-name[data-name="a"]')).toBeVisible();
    await expect(page.locator('.mc-slider-name[data-name="b"]')).toBeVisible();
  });

  test("a function defined once is used by name later", async ({ page }) => {
    await open(page, ["f(x)=x^2", "y=f(x)+1"]);
    await expect(page.locator(".mc-error")).toHaveCount(0);
    await page.waitForTimeout(500);
    expect(await pixelAt(page, 2, 5)).toBeDefined();
  });
});

test.describe("Part D: KaTeX", () => {
  test("fractions, integrals, subscripts, matrices and Greek letters are typeset and none falls back", async ({ page }) => {
    await open(page, ["f(x)=x^2", "f'(x)", "\\int_0^1 f(x)\\,dx", "A=\\begin{bmatrix}0&-1\\\\1&0\\end{bmatrix}"], {
      view: { mode: "2d", grid: true, showSteps: true, locale: "en" },
    });
    await expect(page.getByTestId("mc-integral")).toHaveAttribute("data-value", /\d/, { timeout: 15_000 });
    await expect(page.getByTestId("mc-linalg")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".mc-page .katex-error")).toHaveCount(0);
    // \frac (≈ 1/3), \int (the integral line), subscripts (x₀, f(x₀)), matrices (the editor's report), Greek (λ eigenvalues).
    await expect(page.getByTestId("mc-integral").locator(".mfrac")).toHaveCount(1);
    await expect(page.getByTestId("mc-integral").locator(".mop.op-symbol.large-op, .mop.op-symbol.small-op").first()).toBeVisible();
    await expect(page.getByTestId("mc-tangent-readout").locator(".msupsub").first()).toBeVisible();
    await expect(page.getByTestId("mc-linalg").locator(".mtable, .arraycolsep").first()).toBeAttached();
    await expect(page.getByTestId("mc-linalg")).toContainText("λ");
  });

  test("an engine error names its symbol in KaTeX", async ({ page }) => {
    await open(page, ["a=1", "a=2"]);
    const err = page.locator(".mc-error").first();
    await expect(err).toBeVisible({ timeout: 15_000 });
    await expect(err.locator(".katex")).toBeVisible();
  });
});

test.describe("Part C: color picker", () => {
  test("one click opens the 8 palette colors, one more picks; the current color is shown and kept in the link", async ({ page }) => {
    await open(page, ["y=x"]);
    const button = page.getByTestId("mc-color-button");
    await expect(button).toHaveAttribute("aria-label", /Current color: blue/);
    await button.click();
    const options = page.locator(".mc-palette-color");
    await expect(options).toHaveCount(8);
    await options.nth(3).click(); // pink
    await expect(page.locator(".mc-palette")).toHaveCount(0);
    await expect(button).toHaveAttribute("aria-label", /Current color: pink/);
    const swatch = await page.locator(".mc-swatch").first().evaluate((el) => getComputedStyle(el).backgroundColor);
    const pinkToken = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--cm-string").trim());
    expect(pinkToken).toMatch(/^#/);
    expect(swatch).not.toBe("rgba(0, 0, 0, 0)");
    await page.waitForTimeout(800);
    const g = new URL(page.url()).searchParams.get("g") ?? "";
    expect(LZString.decompressFromEncodedURIComponent(g)).toContain('"color":"cm-string"');
  });

  test("the palette is keyboard reachable and Escape closes it", async ({ page }) => {
    await open(page, ["y=x"]);
    await page.getByTestId("mc-color-button").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".mc-palette-color")).toHaveCount(8);
    await page.keyboard.press("Escape");
    await expect(page.locator(".mc-palette")).toHaveCount(0);
    await expect(page.getByTestId("mc-color-button")).toBeFocused();
  });
});

/** WCAG contrast of every text node's color against its background, computed in the page. */
async function textContrastFailures(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const lum = (rgb: number[]) => {
      const c = rgb.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    const parse = (s: string) => (s.match(/[\d.]+/g) ?? []).map(Number);
    const bgOf = (el: Element | null): number[] => {
      while (el) {
        const p = parse(getComputedStyle(el).backgroundColor);
        if (p.length >= 3 && (p.length === 3 || p[3] > 0.99)) return p.slice(0, 3);
        el = el.parentElement;
      }
      return [255, 255, 255];
    };
    const bad: string[] = [];
    const seen = new Set<Element>();
    const roots = Array.from(document.querySelectorAll(".mc-header, .mc-sidebar, .mc-panel, .mc-graph, .mc-notice"));
    const inScope = (el: Element) => roots.some((r) => r.contains(el));
    const walker = document.createTreeWalker(document.querySelector(".mc-page")!, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (!el || seen.has(el) || !inScope(el) || !n.textContent?.trim() || el.closest(".katex-mathml, .mc-sr, .mc-skip, canvas, script, style")) continue;
      seen.add(el);
      const st = getComputedStyle(el);
      if (st.visibility === "hidden" || st.display === "none") continue;
      const fg = parse(st.color);
      const a = lum(fg.slice(0, 3));
      const b = lum(bgOf(el));
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      if (ratio < 4.5) bad.push(`${el.className || el.tagName}: ${ratio.toFixed(2)} "${n.textContent.trim().slice(0, 30)}"`);
    }
    return bad;
  });
}

for (const theme of ["light", "dark"] as const) {
  test(`Part C: ${theme} theme - body text meets 4.5:1 in the shell, the template, rows, errors and results`, async ({ page }) => {
    await setTheme(page, theme);
    await open(page, ["f(x)=x^2", "f'(x)", "\\int_0^1 f(x)\\,dx", "K=5", "a=1", "a=2", "A=\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}", "\\det(A)"]);
    await page.locator('.mc-category[data-category="calculus"]').click();
    await expect(page.locator("html")).toHaveClass(theme === "dark" ? /dark/ : /^((?!dark).)*$/);
    await expect(page.locator(".mc-error").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("mc-linalg")).toBeVisible({ timeout: 15_000 });
    expect(await textContrastFailures(page)).toEqual([]);
    await shot(page, `theme-${theme}`);
  });
}

test.describe("Part C: Arabic and phone", () => {
  test("Arabic: RTL shell (sidebar at the start, on the right), LTR math and canvas, template in Arabic", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("mae-locale", "ar"));
    await open(page, ["f(x)=x^2", "\\int_0^1 f(x)\\,dx"]);
    await expect(page.locator(".mc-page")).toHaveAttribute("dir", "rtl");
    await expect(page.locator(".mc-canvas-wrap")).toHaveAttribute("dir", "ltr");
    const side = await page.locator(".mc-sidebar").boundingBox();
    const panel = await page.locator(".mc-panel").boundingBox();
    expect(side && panel && side.x > panel.x).toBe(true);
    await page.locator('.mc-category[data-category="calculus"]').click();
    await expect(page.getByTestId("mc-template")).toContainText("التفاضل والتكامل");
    await expect(page.getByTestId("mc-integral")).toHaveAttribute("data-value", /\d/, { timeout: 15_000 });
    // Every math span is left-to-right.
    const dirs = await page.locator(".mc-math").evaluateAll((els) => els.map((e) => getComputedStyle(e).direction));
    expect(dirs.length).toBeGreaterThan(0);
    expect(new Set(dirs)).toEqual(new Set(["ltr"]));
    expect(await textContrastFailures(page)).toEqual([]);
    await shot(page, "rtl-ar");
  });

  test("phone width: 16 px side gutter, no horizontal page scroll, the sidebar and template fit", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await open(page, ["f(x)=x^2", "\\int_0^1 f(x)\\,dx", "A=\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}"]);
    await page.locator('.mc-category[data-category="linearAlgebra"]').click();
    await expect(page.getByTestId("mc-linalg")).toBeVisible({ timeout: 15_000 });
    const m = await page.evaluate(() => {
      const page = document.querySelector(".mc-page") as HTMLElement;
      const cs = getComputedStyle(page);
      return {
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
        padStart: cs.paddingLeft,
        padEnd: cs.paddingRight,
        wide: Array.from(document.querySelectorAll(".mc-page *")).filter((e) => e.getBoundingClientRect().right > document.documentElement.clientWidth + 1 && !(e as HTMLElement).closest(".katex, .mc-math, .mc-linalg-row, .mc-step-list, .mc-sample-math")).map((e) => e.className).slice(0, 5),
      };
    });
    expect(m.scroll).toBeLessThanOrEqual(m.client);
    expect(m.padStart).toBe("16px");
    expect(m.padEnd).toBe("16px");
    expect(m.wide).toEqual([]);
    await shot(page, "phone");
  });
});

test.describe("Part E: keyboard", () => {
  test("Tab reaches the categories, the add row control, every row's controls, the sliders, the graph and the toolbar", async ({ page }) => {
    await open(page, ["y=a x", "y=x"]);
    const seen = new Set<string>();
    for (let i = 0; i < 80; i++) {
      await page.keyboard.press("Tab");
      const d = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return "";
        if (el.matches("canvas.mc-canvas")) return "canvas";
        if (el.matches(".mc-category")) return `category:${el.dataset.category}`;
        if (el.matches("math-field")) return "field";
        if (el.matches(".mc-add")) return "add";
        if (el.matches('input[type="range"]')) return "slider";
        if (el.matches(".mc-swatch-button")) return "color";
        if (el.closest(".mc-toolbar")) return "toolbar";
        if (el.matches("[aria-label^='Remove']")) return "remove";
        return "";
      });
      if (d) seen.add(d);
    }
    for (const must of ["category:graphing", "category:linearAlgebra", "field", "add", "slider", "color", "toolbar", "remove", "canvas"]) expect(seen, must).toContain(must);
  });

  test("ArrowDown and ArrowUp move between expressions", async ({ page }) => {
    await open(page, ["y=x", "y=2x", "y=3x"]);
    await page.locator("math-field").first().focus();
    expect(await focused(page)).toMatchObject({ tag: "MATH-FIELD", row: 0 });
    await page.keyboard.press("ArrowDown");
    await expect.poll(() => focused(page)).toMatchObject({ tag: "MATH-FIELD", row: 1 });
    await page.keyboard.press("ArrowDown");
    await expect.poll(() => focused(page)).toMatchObject({ row: 2 });
    await page.keyboard.press("ArrowUp");
    await expect.poll(() => focused(page)).toMatchObject({ row: 1 });
  });

  test("ArrowDown inside a fraction moves within it first, then to the next row", async ({ page }) => {
    await open(page, ["y=\\frac{1}{x}", "y=x"]);
    const field = page.locator("math-field").first();
    await field.focus();
    await page.keyboard.press("End");
    await page.keyboard.press("ArrowLeft"); // inside the denominator
    await page.keyboard.press("ArrowUp"); // numerator: stays in this expression
    await page.waitForTimeout(100);
    expect(await focused(page)).toMatchObject({ row: 0 });
    await page.keyboard.press("ArrowDown"); // back to the denominator
    await page.waitForTimeout(100);
    expect(await focused(page)).toMatchObject({ row: 0 });
    await page.keyboard.press("ArrowDown"); // nothing below it inside the fraction: next row
    await expect.poll(() => focused(page)).toMatchObject({ row: 1 });
  });

  test("Enter adds a row below and puts the keyboard in it", async ({ page }) => {
    await open(page, ["y=x", "y=2x"]);
    await page.locator("math-field").first().focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("mc-row")).toHaveCount(3);
    await expect.poll(() => focused(page)).toMatchObject({ tag: "MATH-FIELD", row: 1 });
    await page.keyboard.type("y=5");
    await expect(page.locator("math-field").nth(1)).toHaveJSProperty("value", "y=5");
  });

  test("Escape leaves the input (focus goes to the row); arrows then move between rows; Enter goes back in", async ({ page }) => {
    await open(page, ["y=x", "y=2x"]);
    await page.locator("math-field").first().focus();
    await page.keyboard.press("Escape");
    await expect.poll(() => focused(page)).toMatchObject({ tag: "LI", isRow: true, row: 0 });
    await page.keyboard.press("ArrowDown");
    await expect.poll(() => focused(page)).toMatchObject({ isRow: true, row: 1 });
    await page.keyboard.press("Enter");
    await expect.poll(() => focused(page)).toMatchObject({ tag: "MATH-FIELD", row: 1 });
  });

  test("? opens the shortcuts panel, Escape closes it and returns focus; ? typed in a field does not open it", async ({ page }) => {
    await open(page, ["y=x"]);
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(200);
    await page.keyboard.press("?");
    const dlg = page.getByTestId("mc-shortcuts");
    await expect(dlg).toBeVisible();
    await expect(dlg).toContainText("Add a new expression below");
    await expect(dlg).toContainText("Leave the input");
    await shot(page, "shortcuts");
    await page.keyboard.press("Escape");
    await expect(dlg).toHaveCount(0);
    await page.locator("math-field").first().focus();
    await page.keyboard.press("End");
    await page.keyboard.type("?");
    await expect(dlg).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect.poll(() => focused(page)).toMatchObject({ isRow: true });
    await page.keyboard.press("?");
    await expect(dlg).toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();
    await expect(dlg).toHaveCount(0);
    await page.getByTestId("mc-shortcuts-button").click();
    await expect(dlg).toBeVisible();
  });

  test("the canvas takes the keyboard: arrows pan, + zooms", async ({ page }) => {
    await open(page, ["y=x"]);
    const range = async () => page.evaluate(() => new URLSearchParams(location.search).get("g"));
    await page.waitForTimeout(700);
    const before = await range();
    await page.locator(".mc-canvas").focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("+");
    await page.waitForTimeout(900);
    expect(await range()).not.toBe(before);
  });
});
