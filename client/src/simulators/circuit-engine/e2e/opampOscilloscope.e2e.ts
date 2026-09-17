/**
 * Headless end-to-end check of the op-amp fix, through the real app in a real browser: the example
 * schematic is loaded via the `?project=` deep link (the same `loadCircuitDocument` path the
 * Examples modal uses), the live SPICE worker runs ngspice.wasm, and the oscilloscope's own samples
 * and rendered canvas are both inspected.
 *
 * Run against a dev server (`pnpm dev`):
 *   npx tsx client/src/simulators/circuit-engine/e2e/opampOscilloscope.e2e.ts [baseUrl]
 *
 * Screenshots land in client/src/simulators/circuit-engine/test-artifacts/.
 */

import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, type Browser, type Page } from "@playwright/test";

interface SamplePoint {
  time: number;
  value: number;
}

interface ReadingSnapshot {
  status: string;
  samples?: SamplePoint[];
}

type ReadingsWindow = Window & { __MAE_SPICE_READINGS__?: Record<string, ReadingSnapshot> };

const BASE_URL = process.argv[2] ?? "http://localhost:3000";
// The Electrical Circuits workspace, which mounts circuit-engine's V3Home.
const SIMULATOR_PATH = "/simulations/circuit-lab/workspace";
// Served by Vite from the client root; held in variables so tsc does not try to resolve them.
const EXAMPLES_MODULE = "/src/simulators/circuit-engine/examples/index.ts";
const NAD_MODULE = "/src/simulators/circuit-engine/models/nadFormat.ts";
const ARTIFACTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../test-artifacts");

const results: Array<{ name: string; pass: boolean; detail: string }> = [];

function check(name: string, pass: boolean, detail: string): void {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}  —  ${detail}`);
}

function valueAt(samples: SamplePoint[], at: number): number {
  for (let i = 1; i < samples.length; i += 1) {
    if (samples[i].time >= at) {
      const span = samples[i].time - samples[i - 1].time;
      if (!(span > 0)) return samples[i].value;
      return samples[i - 1].value + ((at - samples[i - 1].time) / span) * (samples[i].value - samples[i - 1].value);
    }
  }
  return samples[samples.length - 1]?.value ?? Number.NaN;
}

function linearFit(points: SamplePoint[]): { slope: number; maxResidual: number } {
  const n = points.length;
  const meanT = points.reduce((sum, p) => sum + p.time, 0) / n;
  const meanV = points.reduce((sum, p) => sum + p.value, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (const p of points) {
    sxy += (p.time - meanT) * (p.value - meanV);
    sxx += (p.time - meanT) ** 2;
  }
  const slope = sxy / sxx;
  const intercept = meanV - slope * meanT;
  return { slope, maxResidual: Math.max(...points.map(p => Math.abs(p.value - (slope * p.time + intercept)))) };
}

/** Builds the `?project=` deep link for an example inside the page, using the app's own modules. */
async function openExample(page: Page, exampleExport: string): Promise<void> {
  await page.goto(`${BASE_URL}${SIMULATOR_PATH}`, { waitUntil: "domcontentloaded" });
  const project = await page.evaluate(async ({ name, examplesUrl, nadUrl }) => {
    const examples = (await import(/* @vite-ignore */ examplesUrl)) as Record<string, { schematic: { components: unknown[]; wires: unknown[] } }>;
    const nad = (await import(/* @vite-ignore */ nadUrl)) as {
      createNadDocument: (input: { components: unknown[]; wires: unknown[]; texts: unknown[] }) => unknown;
      compressProjectState: (document: unknown) => string;
    };
    const example = examples[name];
    return nad.compressProjectState(nad.createNadDocument({ components: example.schematic.components, wires: example.schematic.wires, texts: [] }));
  }, { name: exampleExport, examplesUrl: EXAMPLES_MODULE, nadUrl: NAD_MODULE });
  await page.goto(`${BASE_URL}${SIMULATOR_PATH}?project=${project}`, { waitUntil: "domcontentloaded" });
}

/** Waits for the SPICE bridge to publish ready readings for the given scope channels. */
async function waitForScope(page: Page, keys: string[]): Promise<Record<string, SamplePoint[]>> {
  await page.waitForFunction(
    (wanted: string[]) => {
      const readings = (window as ReadingsWindow).__MAE_SPICE_READINGS__;
      return Boolean(readings) && wanted.every(key => readings![key]?.status === "ready" && (readings![key]?.samples?.length ?? 0) > 100);
    },
    keys,
    { timeout: 90_000, polling: 250 }
  );
  return page.evaluate((wanted: string[]) => {
    const readings = (window as ReadingsWindow).__MAE_SPICE_READINGS__ ?? {};
    return Object.fromEntries(wanted.map(key => [key, readings[key]?.samples ?? []]));
  }, keys);
}

/**
 * Reads the rendered CH1 trace straight off the oscilloscope canvas: for each pixel column, the
 * mean row of pixels matching the channel colour, mapped back through the scope's own
 * time/div and volt/div into (seconds, volts).
 */
async function canvasTrace(page: Page, scopeId: string, rgb: [number, number, number], timeDiv: number, voltDiv: number): Promise<SamplePoint[]> {
  return page.evaluate(
    ({ id, color, tDiv, vDiv }) => {
      const canvas = document.querySelector<HTMLCanvasElement>(`canvas[data-scope-id="${id}"]`);
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return [];
      const { width, height } = canvas;
      const data = ctx.getImageData(0, 0, width, height).data;
      const points: Array<{ time: number; value: number }> = [];
      for (let x = 0; x < width; x += 1) {
        let sum = 0;
        let count = 0;
        for (let y = 0; y < height; y += 1) {
          const i = (y * width + x) * 4;
          if (Math.abs(data[i] - color[0]) < 40 && Math.abs(data[i + 1] - color[1]) < 40 && Math.abs(data[i + 2] - color[2]) < 40) {
            sum += y;
            count += 1;
          }
        }
        if (count === 0) continue;
        const row = sum / count;
        points.push({ time: (x / width) * tDiv * 10, value: ((height / 2 - row) / (height / 8)) * vDiv });
      }
      return points;
    },
    { id: scopeId, color: rgb, tDiv: timeDiv, vDiv: voltDiv }
  );
}

async function screenshotScope(page: Page, scopeId: string, file: string): Promise<void> {
  const canvas = page.locator(`canvas[data-scope-id="${scopeId}"]`).first();
  await canvas.scrollIntoViewIfNeeded();
  // Two frames for the canvas effect to repaint with the final samples.
  await page.waitForTimeout(500);
  await canvas.screenshot({ path: path.join(ARTIFACTS, file) });
  check(`${file} captured`, true, path.join(ARTIFACTS, file));
}

async function integrator(page: Page): Promise<void> {
  await openExample(page, "OPAMP_IDEAL_INTEGRATOR");
  const traces = await waitForScope(page, ["osc1:ch1", "osc1:ch2"]);
  const ramp = traces["osc1:ch1"];
  const integratorOut = traces["osc1:ch2"];

  const span = ramp[ramp.length - 1].time - ramp[0].time;
  check("integrator: transient window is 100 ms", Math.abs(span - 0.1) < 1e-3, `${(span * 1e3).toFixed(2)} ms`);
  check("integrator: starts from rest", Math.abs(valueAt(ramp, 0)) < 0.05, `V(0) = ${valueAt(ramp, 0).toFixed(4)} V`);

  const at10 = valueAt(ramp, 0.01);
  check("integrator: CH1 = +20 V ± 0.2 V at t = 10 ms", Math.abs(at10 - 20) <= 0.2, `V(10 ms) = ${at10.toFixed(4)} V`);
  const u1At10 = valueAt(integratorOut, 0.01);
  check("integrator: CH2 = −20 V ± 0.2 V at t = 10 ms", Math.abs(u1At10 + 20) <= 0.2, `V(10 ms) = ${u1At10.toFixed(4)} V`);

  for (const ms of [2.5, 5, 7.5]) {
    const v = valueAt(ramp, ms / 1000);
    check(`integrator: CH1 = ${2 * ms} V at ${ms} ms`, Math.abs(v - 2 * ms) <= 2 * ms * 0.01, `${v.toFixed(4)} V`);
  }

  const linearWindow = ramp.filter(p => p.time >= 0.0005 && p.time <= 0.0145);
  const fit = linearFit(linearWindow);
  check("integrator: slope = 2.000 V/ms ± 1%", Math.abs(fit.slope - 2000) <= 20, `${(fit.slope / 1000).toFixed(5)} V/ms over ${linearWindow.length} samples`);
  check("integrator: strictly linear (max residual < 50 mV)", fit.maxResidual < 0.05, `max residual ${(fit.maxResidual * 1e3).toFixed(3)} mV`);

  // The A = 10 bug's exponential, 20(1 − e^(−t/11 ms)), reads 7.30 V at 5 ms where the ramp reads 10 V.
  const lag = 20 * (1 - Math.exp(-0.005 / 0.011));
  check("integrator: rejects the old τ = 11 ms exponential", Math.abs(valueAt(ramp, 0.005) - lag) > 1.5, `ramp ${valueAt(ramp, 0.005).toFixed(3)} V vs lag ${lag.toFixed(3)} V at 5 ms`);
  check("integrator: clips at the +30 V rail", Math.abs(valueAt(ramp, 0.05) - 30) < 0.1, `V(50 ms) = ${valueAt(ramp, 0.05).toFixed(4)} V`);

  // What the student actually sees: the ramp as drawn on the canvas (CH1 red, 10 V/div, 10 ms/div).
  const drawn = await canvasTrace(page, "osc1", [0xef, 0x44, 0x44], 0.01, 10);
  const drawnRamp = drawn.filter(p => p.time > 0.001 && p.time < 0.013);
  if (drawnRamp.length >= 5) {
    const drawnFit = linearFit(drawnRamp);
    check("integrator canvas: rendered ramp slope ≈ 2 V/ms", Math.abs(drawnFit.slope - 2000) <= 200, `${(drawnFit.slope / 1000).toFixed(3)} V/ms from ${drawnRamp.length} pixel columns`);
    check("integrator canvas: rendered ramp is straight (≤ 1.5 px)", drawnFit.maxResidual <= 1.5 * (80 / 160), `max residual ${drawnFit.maxResidual.toFixed(3)} V`);
    const drawnAt10 = valueAt(drawn, 0.01);
    check("integrator canvas: trace at 10 ms ≈ +20 V (±1 px)", Math.abs(drawnAt10 - 20) <= 1, `${drawnAt10.toFixed(2)} V`);
  } else {
    check("integrator canvas: CH1 trace pixels found", false, `${drawnRamp.length} columns`);
  }
  await screenshotScope(page, "osc1", "opamp-integrator-fixed.png");
}

async function comparator(page: Page): Promise<void> {
  await openExample(page, "OPAMP_COMPARATOR");
  const traces = await waitForScope(page, ["osc1:ch1", "osc1:ch2"]);
  const input = traces["osc1:ch1"];
  const output = traces["osc1:ch2"];
  const high = output.filter((_, i) => input[i]?.value > 2.5);
  const low = output.filter((_, i) => input[i]?.value < 1.5);
  const highOk = high.length > 0 && high.every(p => Math.abs(p.value - 12) < 0.05);
  const lowOk = low.length > 0 && low.every(p => Math.abs(p.value + 12) < 0.05);
  check("comparator: +12 V whenever V_in > 2.5 V", highOk, `${high.length} samples, min ${Math.min(...high.map(p => p.value)).toFixed(4)} V`);
  check("comparator: −12 V whenever V_in < 1.5 V", lowOk, `${low.length} samples, max ${Math.max(...low.map(p => p.value)).toFixed(4)} V`);
  const rising = output.findIndex((p, i) => i > 0 && output[i - 1].value < 0 && p.value > 0);
  const risingAt = rising > 0 ? output[rising].time : Number.NaN;
  // First upward crossing of the 2 V reference by 5·sin(2π·50·t): t = asin(0.4)/(2π·50) = 1.309 ms.
  check("comparator: switches HIGH at the 2 V crossing (1.309 ms)", Math.abs(risingAt - 0.001309) < 0.00015, `${(risingAt * 1e3).toFixed(3)} ms`);
  await screenshotScope(page, "osc1", "opamp-comparator.png");
}

async function differentiator(page: Page): Promise<void> {
  await openExample(page, "OPAMP_DIFFERENTIATOR");
  const traces = await waitForScope(page, ["osc1:ch2"]);
  const output = traces["osc1:ch2"];
  // 250 Hz triangle from its trough: rising 0–2 ms (V_out = −1 V), falling 2–4 ms (+1 V).
  for (const [ms, expected] of [[9, -1], [11, 1], [13, -1], [15, 1]] as const) {
    const v = valueAt(output, ms / 1000);
    check(`differentiator: ${expected > 0 ? "+" : "−"}1 V at ${ms} ms`, Math.abs(v - expected) < 0.05, `${v.toFixed(4)} V`);
  }
  await screenshotScope(page, "osc1", "opamp-differentiator.png");
}

async function main(): Promise<void> {
  mkdirSync(ARTIFACTS, { recursive: true });
  let browser: Browser | undefined;
  try {
    // The locally installed Chrome, so no separate Playwright browser download is needed.
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    page.on("pageerror", error => console.log(`[pageerror] ${error.message}`));
    page.on("console", message => {
      if (message.type() === "error") console.log(`[console.error] ${message.text()}`);
    });

    await integrator(page);
    await comparator(page);
    await differentiator(page);
  } catch (error) {
    check("e2e run completed", false, error instanceof Error ? error.message : String(error));
  } finally {
    await browser?.close();
  }

  const failed = results.filter(result => !result.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exitCode = failed.length === 0 ? 0 : 1;
}

void main();
