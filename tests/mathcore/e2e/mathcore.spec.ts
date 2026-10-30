/**
 * End-to-end checks of the Math Core page in a real browser: route and card, lazy loading, parsing in the parse
 * Worker, sliders, links, errors, implicit curves and shading, tracing, RTL, and zero bytes on other routes.
 */
import { expect, test, type Page } from "@playwright/test";
import LZString from "lz-string";

const link = (graph: unknown) => `/mathcore?g=${LZString.compressToEncodedURIComponent(JSON.stringify(graph))}`;
const doc = (items: Array<[string, string]>, extra: Record<string, unknown> = {}) => ({
  version: "1.0",
  viewport: { xmin: -5, xmax: 5, ymin: -3, ymax: 3 },
  items: items.map(([id, latex]) => ({ id, latex })),
  ...extra,
});

async function ready(page: Page) {
  await page.waitForSelector(".mc-canvas");
  await expect(page.locator(".mc-meta")).toBeVisible({ timeout: 30_000 });
}

/** RGB of the canvas at a world point (reads the backing store, so device pixel ratio is handled). */
async function pixelAt(page: Page, x: number, y: number): Promise<number[]> {
  return page.evaluate(
    ([wx, wy]) => {
      const c = document.querySelector<HTMLCanvasElement>(".mc-canvas");
      if (!c) return [];
      const ctx = c.getContext("2d");
      if (!ctx) return [];
      // Tests that read pixels use the view [-5, 5] × [-3, 3] with free aspect, so this mapping is exact.
      const r = c.getBoundingClientRect();
      const px = Math.round(((wx + 5) / 10) * r.width * (c.width / r.width));
      const py = Math.round(((3 - wy) / 6) * r.height * (c.height / r.height));
      return Array.from(ctx.getImageData(px, py, 1, 1).data.slice(0, 3));
    },
    [x, y],
  );
}

test("the Practical Simulations card opens Math Core", async ({ page }) => {
  await page.goto("/simulations");
  const card = page.locator('a[href="/mathcore"]').first();
  await expect(card).toBeVisible();
  await card.click();
  await expect(page).toHaveURL(/\/mathcore/);
  await ready(page);
});

test("other routes load no mathcore code", async ({ page }) => {
  const loaded: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("mathcore")) loaded.push(r.url());
  });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  expect(loaded).toEqual([]);
});

test("an undefined letter becomes a slider; the keyboard moves it; only dependents are re-evaluated", async ({ page }) => {
  await page.goto(link(doc([["f", "y=a\\sin(x)"], ["g", "y=x^2-3"]])));
  await ready(page);
  await expect(page.locator(".mc-slider-name")).toHaveText(["a"]);
  await page.locator(".mc-range").focus();
  for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowRight");
  await expect(page.locator(".mc-slider-value")).toHaveText("= 2");
  await expect(page.locator(".mc-meta")).toContainText("re-evaluated 1");
});

test("errors are shown at their line: syntax, cycles", async ({ page }) => {
  await page.goto(link(doc([["c1", "a=b+1"], ["c2", "b=2a"], ["bad", "y=x^2+"]])));
  await ready(page);
  const errors = page.locator(".mc-error");
  await expect(errors.filter({ hasText: "Circular definition: c1 → c2 → c1" })).toHaveCount(2);
  await expect(errors.filter({ hasText: "unexpected operator" })).toHaveCount(1);
});

test("retyping a slider line moves the slider (a = 2 → a = 5)", async ({ page }) => {
  await page.goto(link(doc([["a", "a=2"], ["f", "y=ax"]])));
  await ready(page);
  await expect(page.locator(".mc-slider-value")).toHaveText("= 2");
  const field = page.locator("math-field").first();
  await field.focus();
  await page.keyboard.press("End");
  await page.keyboard.press("Backspace");
  await page.keyboard.type("5");
  await expect(page.locator(".mc-slider-value")).toHaveText("= 5", { timeout: 10_000 });
});

test("an inequality is shaded inside and not outside; its description says how much", async ({ page }) => {
  await page.goto(link(doc([["c", "x^2+y^2<4"]], { viewport: { xmin: -5, xmax: 5, ymin: -3, ymax: 3, aspect: "free" } })));
  await ready(page);
  await page.waitForTimeout(500);
  const inside = await pixelAt(page, 0.3, 0.4);
  const outside = await pixelAt(page, 4.2, 2.6);
  expect(inside).not.toEqual(outside);
  await page.locator("details.mc-details summary").first().click();
  await expect(page.locator("details.mc-details p").first()).toContainText("shaded region covers about");
});

test("tracing a curve shows the tangent slope", async ({ page }) => {
  await page.goto(link(doc([["f", "y=x^2"]], { viewport: { xmin: -5, xmax: 5, ymin: -3, ymax: 3, aspect: "free" } })));
  await ready(page);
  const box = await page.locator(".mc-canvas").boundingBox();
  if (!box) throw new Error("no canvas");
  await page.mouse.move(box.x + ((1 + 5) / 10) * box.width, box.y + ((3 - 1) / 6) * box.height);
  await expect(page.locator(".mc-trace")).toContainText("slope f′(x) = 2.0", { timeout: 5000 });
});

test("a corrupt link keeps its address and says so", async ({ page }) => {
  await page.goto("/mathcore?g=garbage");
  await ready(page);
  await expect(page.locator(".mc-notice")).toContainText("not a valid graph");
  await page.waitForTimeout(800);
  expect(new URL(page.url()).search).toBe("?g=garbage");
});

test("Arabic: RTL shell, LTR math", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("mae-locale", "ar"));
  await page.goto("/mathcore");
  await ready(page);
  await expect(page.locator(".mc-page")).toHaveAttribute("dir", "rtl");
  await expect(page.locator(".mc-canvas-wrap")).toHaveAttribute("dir", "ltr");
  await expect(page.locator(".mc-title")).toContainText("رسم");
});

test.describe("Phase 4: 2×2 linear algebra", () => {
  test("a matrix shows det, orientation, closed-form eigenvalues and Gauss-Jordan steps; the canvas shades by orientation", async ({ page }) => {
    await page.goto(link(doc([["m", "M=\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}"]], { view: { mode: "2d", grid: true, showSteps: true, locale: "en" } })));
    await ready(page);
    const panel = page.getByTestId("mc-linalg");
    await expect(panel).toBeVisible({ timeout: 15_000 });
    await expect(panel.locator(".mc-badge")).toHaveText("orientation reversed");
    // KaTeX output: det, the surd and the boxed pivots.
    await expect(panel.locator(".katex").first()).toBeVisible();
    await expect(panel).toContainText("33");
    await expect(panel.locator(".mc-steps[open] .mc-step")).toHaveCount(5);
    await expect(panel.locator(".mc-steps .fbox, .mc-steps .boxpad").first()).toBeAttached();
    // Unit square image: (0,0), (1,3), (3,7), (2,4); its centre (1.5, 3.5) is outside the view, so test (1, 2.2).
    const reversed = await pixelAt(page, 1, 2.2);
    await page.goto(link(doc([["m", "M=\\begin{bmatrix}2&1\\\\1&2\\end{bmatrix}"]])));
    await ready(page);
    await expect(page.getByTestId("mc-linalg").locator(".mc-badge")).toHaveText("orientation kept");
    const kept = await pixelAt(page, 1.5, 1.5);
    const background = await pixelAt(page, -4.6, -2.6);
    // Red-dominant vs blue-dominant tint over the background.
    expect(reversed[0] - reversed[2]).toBeGreaterThan(background[0] - background[2]);
    expect(kept[2] - kept[0]).toBeGreaterThan(background[2] - background[0]);
  });

  test("a singular matrix says so and has no inverse; a slider updates the report", async ({ page }) => {
    await page.goto(link(doc([["m", "M=\\begin{bmatrix}1&2\\\\2&a\\end{bmatrix}"]], { params: { a: { value: 4, min: -10, max: 10, step: 1 } } })));
    await ready(page);
    const panel = page.getByTestId("mc-linalg");
    await expect(panel.locator(".mc-badge")).toHaveText("singular matrix", { timeout: 15_000 });
    await expect(panel).toContainText("No inverse");
    await page.getByRole("slider", { name: /a/ }).first().focus();
    await page.keyboard.press("ArrowRight");
    await expect(panel.locator(".mc-badge")).toHaveText("orientation kept");
    await expect(panel).not.toContainText("No inverse");
  });

  test("A x = b draws both lines and labels the solution; cases and inconsistent systems", async ({ page }) => {
    await page.goto(link(doc([["s", "\\begin{bmatrix}1&1\\\\1&-1\\end{bmatrix}\\begin{bmatrix}x\\\\y\\end{bmatrix}=\\begin{bmatrix}2\\\\0\\end{bmatrix}"]])));
    await ready(page);
    const panel = page.getByTestId("mc-linalg");
    await expect(panel).toContainText("Solution", { timeout: 15_000 });
    await expect(page.locator(".mc-details").first()).toContainText("unique solution x = 1, y = 1", { useInnerText: false });
    await page.goto(link(doc([["s", "\\begin{cases}x+y=1\\\\2x+2y=5\\end{cases}"]])));
    await ready(page);
    await expect(page.getByTestId("mc-linalg")).toContainText("No solution", { timeout: 15_000 });
    await page.goto(link(doc([["s", "\\begin{cases}x^2+y=1\\\\x-y=0\\end{cases}"]])));
    await ready(page);
    await expect(page.locator(".mc-error")).toContainText("not linear");
  });

  test("a named matrix in A x = b follows the matrix line", async ({ page }) => {
    await page.goto(link(doc([["a", "A=\\begin{bmatrix}2&0\\\\0&4\\end{bmatrix}"], ["s", "A\\begin{bmatrix}x\\\\y\\end{bmatrix}=\\begin{bmatrix}2\\\\2\\end{bmatrix}"]])));
    await ready(page);
    await expect(page.getByTestId("mc-linalg")).toHaveCount(2, { timeout: 15_000 });
    await expect(page.getByTestId("mc-linalg").nth(1)).toContainText("Solution");
  });
});
