#!/usr/bin/env node
/**
 * Implicit-field timings in a real browser (STEPS.md §7.2): drives the built engine Worker directly (with its strip
 * Workers) and reports the median round trip for the drag and release paths on a 1600×1000 canvas.
 *
 *   pnpm run build && npx vite preview --port 4173 &
 *   MATHCORE_CHROMIUM=/opt/pw-browsers/chromium node scripts/mathcore/bench-browser.cjs [http://localhost:4173]
 *
 * Output: one JSON document on stdout (device, browser, cores, each case with median, max, budget and pass; fields in
 * docs/mathcore/reports/device-results-template.md), a table on stderr. MATHCORE_RUNS sets the runs per case (default 9).
 *
 * MATHCORE_CORES=2 makes the page report 2 logical cores (navigator.hardwareConcurrency), which is what sizes the strip
 * Worker pool; the machine still has all its cores, so this shows the pool a 2-core device would get, not its speed.
 */
const { execSync } = require("node:child_process");
const os = require("node:os");
const { readdirSync } = require("node:fs");
const { join } = require("node:path");
const { chromium } = require("playwright");

const base = process.argv[2] ?? "http://localhost:4173";
const RUNS = Number(process.env.MATHCORE_RUNS ?? 9);
/** STEPS.md §7.2: drag frame and release frame budgets, in milliseconds. */
const BUDGET = { drag: 16, release: 150 };
const worker = readdirSync(join(process.env.MATHCORE_DIST ?? join(__dirname, "../../dist/public"), "assets")).find((f) => f.startsWith("mathcore-engine-worker-"));
if (!worker) throw new Error("Build first: no mathcore-engine-worker chunk in dist/public/assets");

(async () => {
  const browser = await chromium.launch(process.env.MATHCORE_CHROMIUM ? { executablePath: process.env.MATHCORE_CHROMIUM } : {});
  const page = await browser.newPage();
  if (process.env.MATHCORE_CORES) {
    await page.addInitScript((n) => Object.defineProperty(navigator, "hardwareConcurrency", { value: n }), Number(process.env.MATHCORE_CORES));
  }
  await page.goto(base);
  const out = await page.evaluate(async ([url, runs]) => {
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
      for (let k = 0; k < runs; k++) {
        t.drag.push(await ask({ type: "view", view: view("drag") }));
        t.full.push(await ask({ type: "view", view: view("full") }));
      }
      res[name] = { drag: t.drag, release: t.full };
      w.terminate();
    }
    return res;
  }, [`/assets/${worker}`, RUNS]);
  const info = await page.evaluate(() => ({
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    deviceMemoryGB: navigator.deviceMemory ?? null,
    devicePixelRatio: window.devicePixelRatio,
  }));
  const median = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
  const cases = [];
  for (const name of ["reference", "dense"]) {
    for (const kind of ["drag", "release"]) {
      const runs = out[name][kind];
      const m = median(runs);
      const budget = BUDGET[kind];
      cases.push({
        id: `${name}-${kind}`,
        description: `${name === "dense" ? "Dense field sin(x²+y²) < 0" : "Reference field x²+y²+sin3x·cos2y < 9"}, ${kind === "drag" ? "drag frame (400×250 lattice, quarter mask)" : "release frame 1600×1000"}, Worker round trip`,
        unit: "ms",
        comparator: "<=",
        budget,
        median: m,
        max: Math.max(...runs),
        runs: runs.length,
        pass: m <= budget,
      });
    }
  }
  const git = (cmd) => {
    try {
      return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    } catch {
      return null;
    }
  };
  const cpus = os.cpus();
  for (const c of cases) console.error(`${c.pass ? "PASS" : "FAIL"}  ${c.id.padEnd(18)} median ${c.median.toFixed(1).padStart(7)} ms  max ${c.max.toFixed(1).padStart(7)} ms  budget ≤ ${c.budget} ms`);
  console.log(
    JSON.stringify(
      {
        schema: 1,
        kind: "browser",
        date: new Date().toISOString(),
        commit: git("git rev-parse HEAD"),
        device: {
          os: `${os.type()} ${os.release()}`,
          platform: os.platform(),
          arch: os.arch(),
          cpuModel: cpus[0]?.model ?? null,
          logicalCores: cpus.length,
          memoryGB: Math.round((os.totalmem() / 2 ** 30) * 10) / 10,
        },
        browser: { name: "chromium", version: browser.version(), ...info, logicalCoresReported: out.cores, coresOverride: process.env.MATHCORE_CORES ?? null },
        cases,
        passed: cases.filter((c) => c.pass).length,
        failed: cases.filter((c) => !c.pass).length,
      },
      null,
      2,
    ),
  );
  await browser.close();
})();
