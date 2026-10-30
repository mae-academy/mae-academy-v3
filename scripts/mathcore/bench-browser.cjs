#!/usr/bin/env node
/**
 * Implicit-field timings in a real browser (STEPS.md §7.2): drives the built engine Worker directly (with its strip
 * Workers) and reports the median round trip for the drag and release paths on a 1600×1000 canvas.
 *
 *   pnpm run build && npx vite preview --port 4173 &
 *   MATHCORE_CHROMIUM=/opt/pw-browsers/chromium node scripts/mathcore/bench-browser.cjs [http://localhost:4173]
 */
const { readdirSync } = require("node:fs");
const { join } = require("node:path");
const { chromium } = require("playwright");

const base = process.argv[2] ?? "http://localhost:4173";
const worker = readdirSync(join(__dirname, "../../dist/public/assets")).find((f) => f.startsWith("mathcore-engine-worker-"));
if (!worker) throw new Error("Build first: no mathcore-engine-worker chunk in dist/public/assets");

(async () => {
  const browser = await chromium.launch(process.env.MATHCORE_CHROMIUM ? { executablePath: process.env.MATHCORE_CHROMIUM } : {});
  const page = await browser.newPage();
  await page.goto(base);
  const out = await page.evaluate(async (url) => {
    const cases = {
      reference: ["Less", ["Add", ["Power", "x", 2], ["Power", "y", 2], ["Multiply", ["Sin", ["Multiply", 3, "x"]], ["Cos", ["Multiply", 2, "y"]]]], 9],
      dense: ["Less", ["Sin", ["Add", ["Power", "x", 2], ["Power", "y", 2]]], 0],
    };
    const res = { cores: navigator.hardwareConcurrency };
    for (const [name, raw] of Object.entries(cases)) {
      const w = new Worker(url, { type: "module" });
      let seq = 0;
      const ask = (msg) =>
        new Promise((resolve) => {
          const s = ++seq;
          const t0 = performance.now();
          w.onmessage = (ev) => {
            if (ev.data.seq === s && !ev.data.partial) resolve(performance.now() - t0);
          };
          w.postMessage({ ...msg, seq: s });
        });
      const viewport = { xmin: -5, xmax: 5, ymin: -3.125, ymax: 3.125, aspect: "equal" };
      const graph = { version: "1.0", viewport, items: [{ id: "a", latex: "L" }], params: {}, view: { mode: "2d", grid: true, showSteps: false, locale: "en" } };
      const view = (quality) => ({ viewport, width: 1600, height: 1000, quality });
      await ask({ type: "load", graph, parsed: { L: { ok: true, raw } }, view: view("full") });
      const t = { drag: [], full: [] };
      for (let k = 0; k < 9; k++) {
        t.drag.push(await ask({ type: "view", view: view("drag") }));
        t.full.push(await ask({ type: "view", view: view("full") }));
      }
      const med = (a) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)].toFixed(1);
      res[name] = { dragMs: med(t.drag), releaseMs: med(t.full) };
      w.terminate();
    }
    return res;
  }, `/assets/${worker}`);
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
})();
