/**
 * End-to-end checks of the Math Core page in a real browser: route and card, lazy loading, parsing in the parse
 * Worker, sliders, links, errors, implicit curves and shading, tracing, RTL, and zero bytes on other routes.
 */
import { expect, test, type Page } from "@playwright/test";
import { readdirSync } from "node:fs";
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

for (const [lng, phrase] of [["ar", "تعريف دائري: c1 → c2 → c1"], ["es", "Definición circular: c1 → c2 → c1"]] as const) {
  test(`engine errors are shown in the reader's language (${lng}), not in English`, async ({ page }) => {
    await page.addInitScript((l) => localStorage.setItem("mae-locale", l), lng);
    await page.goto(link(doc([["c1", "a=b+1"], ["c2", "b=2a"]])));
    await ready(page);
    const errors = page.locator(".mc-error");
    await expect(errors.filter({ hasText: phrase })).toHaveCount(2);
    await expect(errors.filter({ hasText: "Circular definition" })).toHaveCount(0);
  });
}

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

test("implicit fields run on parallel strip Workers and shade correctly across strip borders", async ({ page }) => {
  const strips: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("mathcore-strip-worker")) strips.push(r.url());
  });
  await page.goto(link(doc([["c", "x^2+y^2<4"]])));
  await ready(page);
  const cores = await page.evaluate(() => navigator.hardwareConcurrency);
  await expect(page.locator(".mc-details").first()).toContainText("shaded region", { timeout: 15_000, useInnerText: false });
  if (cores >= 3) expect(strips.length).toBeGreaterThan(0);
  // Inside near the top and bottom of the disc (different strips) and outside; all points off the grid lines.
  const bg = await pixelAt(page, -4.7, -2.7);
  for (const [x, y] of [[0.1, 1.7], [0.1, -1.7], [1.1, 0.3]]) expect(await pixelAt(page, x, y)).not.toEqual(bg);
  expect(await pixelAt(page, 3.1, 2.3)).toEqual(bg);
});

test.describe("Phase 5: 3D linear algebra", () => {
  /** Cheap signature of the whole canvas: sums of the RGB channels on a coarse grid. */
  const signature = (page: Page) =>
    page.evaluate(() => {
      const c = document.querySelector<HTMLCanvasElement>(".mc-canvas");
      const ctx = c?.getContext("2d");
      if (!c || !ctx) return "";
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let s = 0;
      for (let i = 0; i < d.length; i += 4 * 97) s += d[i] * 3 + d[i + 1] * 5 + d[i + 2] * 7;
      return String(s);
    });
  const system3 = "\\begin{cases}x+y+z=3\\\\x-y=0\\\\y-z=0\\end{cases}";

  test("a 3×3 system points to the 3D view; the 3D view draws the planes and the solution", async ({ page }) => {
    await page.goto(link(doc([["s", system3]])));
    await ready(page);
    const panel = page.getByTestId("mc-linalg");
    await expect(panel).toContainText("Turn on the 3D view", { timeout: 15_000 });
    await expect(panel).toContainText("Solution");
    const flat = await signature(page);
    const toggle = page.getByRole("button", { name: "3D view" });
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".mc-note").filter({ hasText: "Drag to orbit" })).toBeVisible();
    await expect(panel).not.toContainText("Turn on the 3D view");
    await expect.poll(() => signature(page)).not.toBe(flat);
    // The mode is saved in the link.
    await expect.poll(() => {
      const g = new URL(page.url()).searchParams.get("g") ?? "";
      return (JSON.parse(LZString.decompressFromEncodedURIComponent(g) ?? "{}") as { view?: { mode?: string } }).view?.mode;
    }).toBe("3d");
  });

  test("dragging and the arrow keys orbit the camera; Reset view fits it again; the camera is shared in the link", async ({ page }) => {
    await page.goto(link(doc([["m", "M=\\begin{bmatrix}2&0&0\\\\0&1&0.5\\\\0&0.5&1\\end{bmatrix}"]], { view: { mode: "3d", grid: true, showSteps: false, locale: "en" } })));
    await ready(page);
    await expect(page.getByTestId("mc-linalg")).toContainText("orientation kept", { timeout: 15_000 });
    await expect.poll(() => signature(page)).not.toBe("0");
    const before = await signature(page);
    const box = await page.locator(".mc-canvas").boundingBox();
    if (!box) throw new Error("no canvas");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 40, { steps: 6 });
    await page.mouse.up();
    await expect.poll(() => signature(page)).not.toBe(before);
    const camera = () => {
      const g = new URL(page.url()).searchParams.get("g") ?? "";
      return (JSON.parse(LZString.decompressFromEncodedURIComponent(g) ?? "{}") as { view?: { camera?: { azimuth: number } } }).view?.camera;
    };
    await expect.poll(camera).toBeDefined();
    const orbited = await signature(page);
    await page.locator(".mc-canvas").focus();
    await page.keyboard.press("ArrowLeft");
    await expect.poll(() => signature(page)).not.toBe(orbited);
    await page.getByRole("button", { name: "Reset view" }).click();
    await expect.poll(camera).toBeUndefined();
  });

  test("ten quick arrow presses all count; a camera in a link is restored", async ({ page }) => {
    const camera = { azimuth: 0.3, elevation: 0.4, distance: 30 };
    await page.goto(link(doc([["m", "M=\\begin{bmatrix}2&0&0\\\\0&1&0\\\\0&0&1\\end{bmatrix}"]], { view: { mode: "3d", grid: true, showSteps: false, locale: "en", camera } })));
    await ready(page);
    await expect(page.getByTestId("mc-linalg")).toBeVisible({ timeout: 15_000 });
    const linkCamera = () => {
      const g = new URL(page.url()).searchParams.get("g") ?? "";
      return (JSON.parse(LZString.decompressFromEncodedURIComponent(g) ?? "{}") as { view?: { camera?: { azimuth: number; distance: number } } }).view?.camera;
    };
    expect(linkCamera()).toEqual(camera);
    await page.locator(".mc-canvas").focus();
    for (let k = 0; k < 10; k++) await page.keyboard.press("ArrowLeft");
    await expect.poll(() => linkCamera()?.azimuth).toBeCloseTo(1.3, 6);
    for (let k = 0; k < 3; k++) await page.keyboard.press("-");
    await expect.poll(() => linkCamera()?.distance).toBeCloseTo(30 * 1.2 ** 3, 6);
  });

  test("rapid keys count from the fitted camera when the link has none", async ({ page }) => {
    await page.goto(link(doc([["m", "M=\\begin{bmatrix}2&0&0\\\\0&1&0\\\\0&0&1\\end{bmatrix}"]], { view: { mode: "3d", grid: true, showSteps: false, locale: "en" } })));
    await ready(page);
    await expect(page.getByTestId("mc-linalg")).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => signature(page)).not.toBe("0");
    await page.locator(".mc-canvas").focus();
    await page.evaluate(async () => {
      const el = document.querySelector<HTMLCanvasElement>(".mc-canvas");
      if (!el) throw new Error("no canvas");
      for (let k = 0; k < 16; k++) {
        el.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));
        await new Promise<void>((r) => setTimeout(r, 1));
      }
    });
    // DEFAULT_CAMERA3.azimuth is 1.1; ArrowRight turns by −0.1 rad.
    await expect.poll(() => {
      const g = new URL(page.url()).searchParams.get("g") ?? "";
      return (JSON.parse(LZString.decompressFromEncodedURIComponent(g) ?? "{}") as { view?: { camera?: { azimuth: number } } }).view?.camera?.azimuth;
    }, { timeout: 10_000 }).toBeCloseTo(1.1 - 1.6, 6);
  });

  // A4: events fired one after another inside the page (no round trip between them), in three rhythms: back to back,
  // one per task, one per animation frame; keys and wheel interleaved. Every step must count.
  for (const rhythm of ["back-to-back", "per task", "per frame", "per 2 ms", "per 7 ms"] as const) {
    test(`rapid keys and wheel ticks all count (${rhythm})`, async ({ page }) => {
      const camera = { azimuth: 0.3, elevation: 0.4, distance: 30 };
      await page.goto(link(doc([["m", "M=\\begin{bmatrix}2&0&0\\\\0&1&0\\\\0&0&1\\end{bmatrix}"]], { view: { mode: "3d", grid: true, showSteps: false, locale: "en", camera } })));
      await ready(page);
      await expect(page.getByTestId("mc-linalg")).toBeVisible({ timeout: 15_000 });
      const linkCamera = () => {
        const g = new URL(page.url()).searchParams.get("g") ?? "";
        return (JSON.parse(LZString.decompressFromEncodedURIComponent(g) ?? "{}") as { view?: { camera?: { azimuth: number; distance: number } } }).view?.camera;
      };
      await page.locator(".mc-canvas").focus();
      // 24 key presses (ArrowLeft: +0.1 rad each) and 12 wheel ticks (deltaY > 0: distance × 1.2 each), interleaved 2:1.
      await page.evaluate(async (mode) => {
        const el = document.querySelector<HTMLCanvasElement>(".mc-canvas");
        if (!el) throw new Error("no canvas");
        const wait = () => (mode === "per 2 ms" ? new Promise<void>((r) => setTimeout(r, 2)) : mode === "per 7 ms" ? new Promise<void>((r) => setTimeout(r, 7)) : mode === "per task" ? new Promise<void>((r) => setTimeout(r, 0)) : mode === "per frame" ? new Promise<void>((r) => requestAnimationFrame(() => r())) : Promise.resolve());
        for (let k = 0; k < 36; k++) {
          if (k % 3 === 2) el.dispatchEvent(new WheelEvent("wheel", { deltaY: 100, bubbles: true, cancelable: true }));
          else el.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true }));
          await wait();
        }
      }, rhythm);
      await expect.poll(() => linkCamera()?.azimuth, { timeout: 10_000 }).toBeCloseTo(0.3 + 24 * 0.1, 6);
      await expect.poll(() => linkCamera()?.distance, { timeout: 10_000 }).toBeCloseTo(30 * 1.2 ** 12, 6);
    });
  }
});

test("a release after a drag reuses the drag frame of the same view; a moved view computes its own", async ({ page }) => {
  const worker = readdirSync("dist/public/assets").find((f) => f.startsWith("mathcore-engine-worker-"));
  if (!worker) throw new Error("build first: no engine Worker chunk in dist/public/assets");
  await page.goto("/");
  const flags = await page.evaluate(async (url) => {
    const w = new Worker(url, { type: "module" });
    let seq = 0;
    const ask = (msg: Record<string, unknown>) =>
      new Promise<Array<{ partial: boolean; reused: boolean }>>((resolve) => {
        const s = ++seq;
        const seen: Array<{ partial: boolean; reused: boolean }> = [];
        w.onmessage = (ev: MessageEvent) => {
          if (ev.data.seq !== s) return;
          seen.push({ partial: !!ev.data.partial, reused: !!ev.data.items?.[0]?.reused });
          if (!ev.data.partial) resolve(seen);
        };
        w.postMessage({ ...msg, seq: s });
      });
    const raw = ["Less", ["Sin", ["Add", ["Power", "x", 2], ["Power", "y", 2]]], 0];
    const viewport = { xmin: -5, xmax: 5, ymin: -3.125, ymax: 3.125, aspect: "equal" };
    const graph = { version: "1.0", viewport, items: [{ id: "a", latex: "L" }], params: {}, view: { mode: "2d", grid: true, showSteps: false, locale: "en" } };
    const view = (quality: string, dx: number) => ({ viewport: { ...viewport, xmin: -5 + dx, xmax: 5 + dx }, width: 800, height: 500, quality });
    await ask({ type: "load", graph, parsed: { L: { ok: true, raw } }, view: view("full", 0) });
    const drag = await ask({ type: "view", view: view("drag", 0.01) });
    const release = await ask({ type: "view", view: view("full", 0.01) });
    const moved = await ask({ type: "view", view: view("full", 0.02) });
    w.terminate();
    return { drag, release, moved };
  }, `/assets/${worker}`);
  // The drag frame itself is computed; the release's preview frame is that same frame; a different view recomputes.
  expect(flags.drag.every((f) => !f.reused)).toBe(true);
  expect(flags.release.find((f) => f.partial)?.reused).toBe(true);
  expect(flags.moved.find((f) => f.partial)?.reused).toBe(false);
});
