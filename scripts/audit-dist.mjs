#!/usr/bin/env node
/**
 * Production asset leak scan. Run after `pnpm build`:  node scripts/audit-dist.mjs   (or `pnpm audit:dist`)
 *   1. no source maps anywhere in dist/
 *   2. none of the proprietary engine signatures appear in dist/public/assets/*.js
 *   3. no server-only secret from the build environment (or .env) is present in dist/public
 *      (VITE_* values are inlined by Vite by design: they are reported as warnings, never as safe)
 * Exit code 1 on any finding in (1)-(3) that is not a warning.
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const dist = join(root, "dist");
const assets = join(dist, "public", "assets");

/** Engine entry points that must only exist server-side (names are minified away in the bundle, so each group also lists message strings). */
const SIGNATURES = {
  PLC: ["accumulatedMs", "advanceAsyncTimers", "SCAN_WATCHDOG", "LogoCpu"],
  Circuit: ["analogNewtonMna", "MeshSolver", "mnaSolver", "NodalSolver"],
  Logic: ["kmapSolver", "idealLogicEngine", "desLogicCore"],
  Signals: ["fourierEngine", "laplaceEngine", "zTransformEngine", "convolutionEngine"],
  "Control/Power": ["generateFlawlessRootLocus", "ackermannPolePlacement", "simulateControlledRectifier"],
  "Code/Arduino": ["cppTrace", "arduinoCompiler", "containerRegistry"],
  "Engine message strings": [
    "Pole placement is unavailable", "Enter one desired pole", "Feedback activity exceeded the event budget", "Output contention: direct driver tie",
    "No prime implicant covers", "Singular MNA matrix", "Division by zero in X(jω)", "Missing terminating quote", "Expected a polynomial in",
  ],
};

const walk = (dir) => (existsSync(dir) ? readdirSync(dir).flatMap((name) => { const p = join(dir, name); return statSync(p).isDirectory() ? walk(p) : [p]; }) : []);
const files = walk(dist);
const scripts = walk(assets).filter((f) => f.endsWith(".js"));
if (scripts.length === 0) { console.error("audit-dist: no built assets found; run `pnpm build` first"); process.exit(2); }

let failed = false;
const report = (ok, label, detail = "") => { if (!ok) failed = true; console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`); };

// 1. source maps
const maps = files.filter((f) => f.endsWith(".map"));
const mapRefs = scripts.filter((f) => /\/\/# sourceMappingURL=/.test(readFileSync(f, "utf8")));
report(maps.length === 0 && mapRefs.length === 0, `source maps: ${maps.length} .map files, ${mapRefs.length} sourceMappingURL references`);

// 2. engine signatures
const texts = scripts.map((f) => [f, readFileSync(f, "utf8")]);
for (const [group, needles] of Object.entries(SIGNATURES)) {
  const hits = needles.flatMap((needle) => texts.filter(([, text]) => text.includes(needle)).map(([file]) => `${needle} in ${file.split("/").pop()}`));
  report(hits.length === 0, `${group}: ${needles.length} signatures, ${hits.length} hits`, hits.join("; "));
}

// 3. secrets from the environment / .env
const env = { ...(existsSync(join(root, ".env")) ? Object.fromEntries(readFileSync(join(root, ".env"), "utf8").split("\n").map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^['"]|['"]$/g, "")])) : {}), ...process.env };
const SECRET_NAME = /(KEY|TOKEN|SECRET|PASSWORD|PRIVATE)/i;
const publicAssets = walk(join(dist, "public"));
const warnings = [];
for (const [name, value] of Object.entries(env)) {
  if (!SECRET_NAME.test(name) || value.length < 16) continue;
  const leaked = publicAssets.filter((f) => /\.(js|css|html|json|txt|map)$/.test(f) && readFileSync(f, "utf8").includes(value));
  if (leaked.length === 0) { report(true, `secret ${name}: absent from dist/public`); continue; }
  if (name.startsWith("VITE_")) { warnings.push(name); console.log(`WARN  ${name}: inlined into ${leaked.map((f) => f.split("/").pop()).join(", ")} (VITE_* variables are public by design; rotate/proxy it if it is billable)`); }
  else report(false, `secret ${name}: LEAKED into dist/public`, leaked.map((f) => f.split("/").pop()).join(", "));
}

console.log(failed ? "\nAUDIT FAILED" : `\nAUDIT PASSED${warnings.length ? ` (${warnings.length} warning${warnings.length > 1 ? "s" : ""})` : ""}`);
process.exit(failed ? 1 : 0);
