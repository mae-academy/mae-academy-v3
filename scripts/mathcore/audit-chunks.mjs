#!/usr/bin/env node
/**
 * Mathcore chunk-size audit (PLAN.md §6.2). Run after `pnpm build`:  pnpm run audit:chunks
 *   1. the engine chunk (mathcore-engine-*.js) is at most 80 KB gzip
 *   2. the Compute Engine chunk (mathcore-compute-*.js) is measured and reported, never capped
 *   3. mathcore code costs 0 bytes on other routes: index.html does not reference a mathcore-* chunk,
 *      and no other chunk statically imports one (dynamic import() from the router is allowed)
 * Naming contract: every mathcore chunk is emitted as assets/mathcore-<part>-<hash>.js (manualChunks in Phase 1).
 * Until a mathcore chunk exists it reports "no mathcore chunk" and passes. Exit code 1 on any failure.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const root = new URL("../..", import.meta.url).pathname;
const pub = join(root, "dist", "public");
const assets = join(pub, "assets");
const ENGINE_LIMIT_KB = 80;

if (!existsSync(assets)) {
  console.error(`audit:chunks: ${assets} not found; run pnpm build first`);
  process.exit(1);
}

const kb = (bytes) => (bytes / 1024).toFixed(1);
const gzipKb = (file) => gzipSync(readFileSync(join(assets, file)), { level: 9 }).length / 1024;
const isMathcore = (file) => file.startsWith("mathcore-");

const chunks = readdirSync(assets).filter((f) => f.endsWith(".js"));
const failures = [];

// Static imports only: `from"./x.js"` and bare `import"./x.js"`. `import("./x.js")` is lazy and not matched.
const staticImports = (file) => {
  const src = readFileSync(join(assets, file), "utf8");
  const out = new Set();
  for (const re of [/\bfrom\s*["']\.\/([^"']+\.js)["']/g, /\bimport\s*["']\.\/([^"']+\.js)["']/g]) {
    for (const m of src.matchAll(re)) out.add(m[1]);
  }
  return out;
};

// 1–2. sizes
const mathcore = chunks.filter(isMathcore);
if (mathcore.length === 0) {
  console.log("audit:chunks: no mathcore chunk (expected until Phase 1 adds the route)");
} else {
  for (const file of mathcore) {
    const size = gzipKb(file);
    if (file.startsWith("mathcore-engine-")) {
      const ok = size <= ENGINE_LIMIT_KB;
      console.log(`  ${ok ? "ok  " : "FAIL"} ${file}: ${size.toFixed(1)} KB gzip (limit ${ENGINE_LIMIT_KB} KB)`);
      if (!ok) failures.push(`${file} is ${size.toFixed(1)} KB gzip, over ${ENGINE_LIMIT_KB} KB`);
    } else {
      console.log(`  info ${file}: ${size.toFixed(1)} KB gzip (reported, not capped)`);
    }
  }
  if (!mathcore.some((f) => f.startsWith("mathcore-engine-"))) {
    console.log("  info no mathcore-engine-*.js chunk; engine size not checked");
  }
}

// 3. zero bytes on other routes
const html = existsSync(join(pub, "index.html")) ? readFileSync(join(pub, "index.html"), "utf8") : "";
for (const m of html.matchAll(/assets\/(mathcore-[^"']+\.js)/g)) {
  failures.push(`index.html references ${m[1]} (loaded on every route)`);
}
for (const file of chunks.filter((f) => !isMathcore(f))) {
  for (const dep of staticImports(file)) {
    if (isMathcore(dep)) failures.push(`${file} statically imports ${dep}`);
  }
}

const total = chunks.reduce((sum, f) => sum + readFileSync(join(assets, f)).length, 0);
console.log(`audit:chunks: ${chunks.length} JS chunks, ${kb(total)} KB raw, ${mathcore.length} mathcore`);
if (failures.length) {
  for (const f of failures) console.error(`  FAIL ${f}`);
  process.exit(1);
}
console.log("audit:chunks: PASS");
