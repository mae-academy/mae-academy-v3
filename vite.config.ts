/// <reference types="vitest/config" />
import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin, type ViteDevServer } from "vite";
import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";

// =============================================================================
// Manus Debug Collector - Vite Plugin
// Writes browser logs directly to files, trimmed when exceeding size limit
// =============================================================================

const PROJECT_ROOT = import.meta.dirname;
const LOG_DIR = path.join(PROJECT_ROOT, ".manus-logs");
const MAX_LOG_SIZE_BYTES = 1 * 1024 * 1024; // 1MB per log file
const TRIM_TARGET_BYTES = Math.floor(MAX_LOG_SIZE_BYTES * 0.6); // Trim to 60% to avoid constant re-trimming

type LogSource = "browserConsole" | "networkRequests" | "sessionReplay";

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function trimLogFile(logPath: string, maxSize: number) {
  try {
    if (!fs.existsSync(logPath) || fs.statSync(logPath).size <= maxSize) {
      return;
    }

    const lines = fs.readFileSync(logPath, "utf-8").split("\n");
    const keptLines: string[] = [];
    let keptBytes = 0;

    // Keep newest lines (from end) that fit within 60% of maxSize
    const targetSize = TRIM_TARGET_BYTES;
    for (let i = lines.length - 1; i >= 0; i--) {
      const lineBytes = Buffer.byteLength(`${lines[i]}\n`, "utf-8");
      if (keptBytes + lineBytes > targetSize) break;
      keptLines.unshift(lines[i]);
      keptBytes += lineBytes;
    }

    fs.writeFileSync(logPath, keptLines.join("\n"), "utf-8");
  } catch {
    /* ignore trim errors */
  }
}

function writeToLogFile(source: LogSource, entries: unknown[]) {
  if (entries.length === 0) return;

  ensureLogDir();
  const logPath = path.join(LOG_DIR, `${source}.log`);

  // Format entries with timestamps
  const lines = entries.map(entry => {
    const ts = new Date().toISOString();
    return `[${ts}] ${JSON.stringify(entry)}`;
  });

  // Append to log file
  fs.appendFileSync(logPath, `${lines.join("\n")}\n`, "utf-8");

  // Trim if exceeds max size
  trimLogFile(logPath, MAX_LOG_SIZE_BYTES);
}

/**
 * Vite plugin to collect browser debug logs
 * - POST /__manus__/logs: Browser sends logs, written directly to files
 * - Files: browserConsole.log, networkRequests.log, sessionReplay.log
 * - Auto-trimmed when exceeding 1MB (keeps newest entries)
 */
function vitePluginManusDebugCollector(): Plugin {
  return {
    name: "manus-debug-collector",

    transformIndexHtml(html) {
      if (process.env.NODE_ENV === "production") {
        return html;
      }
      return {
        html,
        tags: [
          {
            tag: "script",
            attrs: {
              src: "/__manus__/debug-collector.js",
              defer: true,
            },
            injectTo: "head",
          },
        ],
      };
    },

    configureServer(server: ViteDevServer) {
      // POST /__manus__/logs: Browser sends logs (written directly to files)
      server.middlewares.use("/__manus__/logs", (req, res, next) => {
        if (req.method !== "POST") {
          return next();
        }

        const handlePayload = (payload: any) => {
          // Write logs directly to files
          if (payload.consoleLogs?.length > 0) {
            writeToLogFile("browserConsole", payload.consoleLogs);
          }
          if (payload.networkRequests?.length > 0) {
            writeToLogFile("networkRequests", payload.networkRequests);
          }
          if (payload.sessionEvents?.length > 0) {
            writeToLogFile("sessionReplay", payload.sessionEvents);
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        };

        const reqBody = (req as { body?: unknown }).body;
        if (reqBody && typeof reqBody === "object") {
          try {
            handlePayload(reqBody);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
          return;
        }

        let body = "";
        req.on("data", chunk => {
          body += chunk.toString();
        });

        req.on("end", () => {
          try {
            const payload = JSON.parse(body);
            handlePayload(payload);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
        });
      });
    },
  };
}

function vitePluginStorageProxy(): Plugin {
  return {
    name: "manus-storage-proxy",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/manus-storage", async (req, res) => {
        const key = req.url?.replace(/^\//, "");
        if (!key) {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end("Missing storage key");
          return;
        }

        const forgeBaseUrl = (process.env.BUILT_IN_FORGE_API_URL || "").replace(
          /\/+$/,
          ""
        );
        const forgeKey = process.env.BUILT_IN_FORGE_API_KEY;

        if (!forgeBaseUrl || !forgeKey) {
          res.writeHead(500, { "Content-Type": "text/plain" });
          res.end("Storage proxy not configured");
          return;
        }

        try {
          const forgeUrl = new URL(
            "v1/storage/presign/get",
            forgeBaseUrl + "/"
          );
          forgeUrl.searchParams.set("path", key);

          const forgeResp = await fetch(forgeUrl, {
            headers: { Authorization: `Bearer ${forgeKey}` },
          });

          if (!forgeResp.ok) {
            res.writeHead(502, { "Content-Type": "text/plain" });
            res.end("Storage backend error");
            return;
          }

          const { url } = (await forgeResp.json()) as { url: string };
          if (!url) {
            res.writeHead(502, { "Content-Type": "text/plain" });
            res.end("Empty signed URL");
            return;
          }

          res.writeHead(307, { Location: url, "Cache-Control": "no-store" });
          res.end();
        } catch {
          res.writeHead(502, { "Content-Type": "text/plain" });
          res.end("Storage proxy error");
        }
      });
    },
  };
}

/**
 * Serves api/plc/evaluate and api/plc/logo/evaluate inside `pnpm dev`, so the serverless engine works without the Express
 * server or the Vercel CLI. The engine is loaded through Vite's SSR loader (hot-reloads on edit)
 * and stays server-side: the client only ever sees the fetch to /api/plc/evaluate.
 */
function vitePluginPlcApi(): Plugin {
  return {
    name: "plc-api-dev",
    apply: "serve",
    configureServer(server: ViteDevServer) {
      for (const route of ["/api/plc/evaluate", "/api/plc/logo/evaluate"]) server.middlewares.use(route, async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.setHeader("allow", "POST");
          res.end();
          return;
        }
        try {
          const chunks: Buffer[] = [];
          let size = 0;
          for await (const chunk of req) {
            size += (chunk as Buffer).length;
            if (size > 1024 * 1024) break;
            chunks.push(chunk as Buffer);
          }
          const { POST } = await server.ssrLoadModule(path.resolve(PROJECT_ROOT, `api${route.slice(4)}.ts`));
          const { toWebRequest } = await server.ssrLoadModule(path.resolve(PROJECT_ROOT, "api/_lib/security/node-adapter.ts"));
          // POST is the guarded handler: origin check + rate limit run here exactly as on Vercel.
          const response: Response = await POST(toWebRequest(req, `http://localhost${route}`, Buffer.concat(chunks)));
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(await response.text());
        } catch (error) {
          server.config.logger.error(`plc-api-dev: ${error instanceof Error ? error.message : String(error)}`);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: "Internal error" }));
        }
      });
    },
  };
}

/**
 * Serves api/circuit/solve inside `pnpm dev`, so the serverless circuit solver works without the Express
 * server or the Vercel CLI. The engine is loaded through Vite's SSR loader (hot-reloads on edit)
 * and stays server-side: the client only ever sees the fetch to /api/circuit/solve.
 */
function vitePluginCircuitApi(): Plugin {
  return {
    name: "circuit-api-dev",
    apply: "serve",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/api/circuit/solve", async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.setHeader("allow", "POST");
          res.end();
          return;
        }
        try {
          const chunks: Buffer[] = [];
          let size = 0;
          for await (const chunk of req) {
            size += (chunk as Buffer).length;
            if (size > 768 * 1024) break;
            chunks.push(chunk as Buffer);
          }
          const { POST } = await server.ssrLoadModule(path.resolve(PROJECT_ROOT, "api/circuit/solve.ts"));
          const { toWebRequest } = await server.ssrLoadModule(path.resolve(PROJECT_ROOT, "api/_lib/security/node-adapter.ts"));
          // POST is the guarded handler: origin check + rate limit run here exactly as on Vercel.
          const response: Response = await POST(toWebRequest(req, "http://localhost/api/circuit/solve", Buffer.concat(chunks)));
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(await response.text());
        } catch (error) {
          server.config.logger.error(`circuit-api-dev: ${error instanceof Error ? error.message : String(error)}`);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: "Internal error" }));
        }
      });
    },
  };
}

/**
 * Serves api/logic/solve inside `pnpm dev`, so the serverless digital logic engine works without the Express
 * server or the Vercel CLI. The engine is loaded through Vite's SSR loader (hot-reloads on edit)
 * and stays server-side: the client only ever sees the fetch to /api/logic/solve.
 */
function vitePluginLogicApi(): Plugin {
  return {
    name: "logic-api-dev",
    apply: "serve",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/api/logic/solve", async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.setHeader("allow", "POST");
          res.end();
          return;
        }
        try {
          const chunks: Buffer[] = [];
          let size = 0;
          for await (const chunk of req) {
            size += (chunk as Buffer).length;
            if (size > 768 * 1024) break;
            chunks.push(chunk as Buffer);
          }
          const { POST } = await server.ssrLoadModule(path.resolve(PROJECT_ROOT, "api/logic/solve.ts"));
          const { toWebRequest } = await server.ssrLoadModule(path.resolve(PROJECT_ROOT, "api/_lib/security/node-adapter.ts"));
          // POST is the guarded handler: origin check + rate limit run here exactly as on Vercel.
          const response: Response = await POST(toWebRequest(req, "http://localhost/api/logic/solve", Buffer.concat(chunks)));
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(await response.text());
        } catch (error) {
          server.config.logger.error(`logic-api-dev: ${error instanceof Error ? error.message : String(error)}`);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: "Internal error" }));
        }
      });
    },
  };
}

/**
 * Serves api/signals/transform inside `pnpm dev`, so the serverless signals & systems engine works without the Express
 * server or the Vercel CLI. The engine is loaded through Vite's SSR loader (hot-reloads on edit)
 * and stays server-side: the client only ever sees the fetch to /api/signals/transform.
 */
function vitePluginSignalsApi(): Plugin {
  return {
    name: "signals-api-dev",
    apply: "serve",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/api/signals/transform", async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.setHeader("allow", "POST");
          res.end();
          return;
        }
        try {
          const chunks: Buffer[] = [];
          let size = 0;
          for await (const chunk of req) {
            size += (chunk as Buffer).length;
            if (size > 768 * 1024) break;
            chunks.push(chunk as Buffer);
          }
          const { POST } = await server.ssrLoadModule(path.resolve(PROJECT_ROOT, "api/signals/transform.ts"));
          const { toWebRequest } = await server.ssrLoadModule(path.resolve(PROJECT_ROOT, "api/_lib/security/node-adapter.ts"));
          // POST is the guarded handler: origin check + rate limit run here exactly as on Vercel.
          const response: Response = await POST(toWebRequest(req, "http://localhost/api/signals/transform", Buffer.concat(chunks)));
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(await response.text());
        } catch (error) {
          server.config.logger.error(`signals-api-dev: ${error instanceof Error ? error.message : String(error)}`);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: "Internal error" }));
        }
      });
    },
  };
}

/**
 * Serves api/control/solve inside `pnpm dev`, so the serverless control and power-electronics engines works without the Express
 * server or the Vercel CLI. The engine is loaded through Vite's SSR loader (hot-reloads on edit)
 * and stays server-side: the client only ever sees the fetch to /api/control/solve.
 */
function vitePluginControlApi(): Plugin {
  return {
    name: "control-api-dev",
    apply: "serve",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/api/control/solve", async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.setHeader("allow", "POST");
          res.end();
          return;
        }
        try {
          const chunks: Buffer[] = [];
          let size = 0;
          for await (const chunk of req) {
            size += (chunk as Buffer).length;
            if (size > 768 * 1024) break;
            chunks.push(chunk as Buffer);
          }
          const { POST } = await server.ssrLoadModule(path.resolve(PROJECT_ROOT, "api/control/solve.ts"));
          const { toWebRequest } = await server.ssrLoadModule(path.resolve(PROJECT_ROOT, "api/_lib/security/node-adapter.ts"));
          // POST is the guarded handler: origin check + rate limit run here exactly as on Vercel.
          const response: Response = await POST(toWebRequest(req, "http://localhost/api/control/solve", Buffer.concat(chunks)));
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(await response.text());
        } catch (error) {
          server.config.logger.error(`control-api-dev: ${error instanceof Error ? error.message : String(error)}`);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: "Internal error" }));
        }
      });
    },
  };
}

/**
 * Serves api/code/process inside `pnpm dev`, so the serverless Arduino compiler and C/C++ trace preprocessors works without the Express
 * server or the Vercel CLI. The engine is loaded through Vite's SSR loader (hot-reloads on edit)
 * and stays server-side: the client only ever sees the fetch to /api/code/process.
 */
function vitePluginCodeApi(): Plugin {
  return {
    name: "code-api-dev",
    apply: "serve",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/api/code/process", async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.setHeader("allow", "POST");
          res.end();
          return;
        }
        try {
          const chunks: Buffer[] = [];
          let size = 0;
          for await (const chunk of req) {
            size += (chunk as Buffer).length;
            if (size > 768 * 1024) break;
            chunks.push(chunk as Buffer);
          }
          const { POST } = await server.ssrLoadModule(path.resolve(PROJECT_ROOT, "api/code/process.ts"));
          const { toWebRequest } = await server.ssrLoadModule(path.resolve(PROJECT_ROOT, "api/_lib/security/node-adapter.ts"));
          // POST is the guarded handler: origin check + rate limit run here exactly as on Vercel.
          const response: Response = await POST(toWebRequest(req, "http://localhost/api/code/process", Buffer.concat(chunks)));
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(await response.text());
        } catch (error) {
          server.config.logger.error(`code-api-dev: ${error instanceof Error ? error.message : String(error)}`);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: "Internal error" }));
        }
      });
    },
  };
}

const plugins = [
  react(),
  tailwindcss(),
  jsxLocPlugin(),
  // The Manus runtime inlines a ~370 kB React bundle into index.html. It is a host-editing aid, so it only runs in dev.
  { ...vitePluginManusRuntime(), apply: "serve" as const },
  vitePluginManusDebugCollector(),
  vitePluginStorageProxy(),
  vitePluginPlcApi(),
  vitePluginCircuitApi(),
  vitePluginLogicApi(),
  vitePluginSignalsApi(),
  vitePluginControlApi(),
  vitePluginCodeApi(),
];

export default defineConfig({
  plugins,
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: [
      {
        find: "@",
        replacement: path.resolve(import.meta.dirname, "client", "src"),
      },
      {
        find: "@shared",
        replacement: path.resolve(import.meta.dirname, "shared"),
      },
      {
        find: "@assets",
        replacement: path.resolve(import.meta.dirname, "attached_assets"),
      },
      // JSCPP's printf dependency does `require("stream").Stream` / `util.inspect` purely for an
      // instanceof check and the rare %o specifier; Vite's default browser externalization of
      // these Node built-ins throws the moment either is touched, breaking every printf() call.
      {
        find: /^stream$/,
        replacement: path.resolve(
          import.meta.dirname,
          "client",
          "src",
          "shims",
          "nodeStreamShim.ts"
        ),
      },
      {
        find: /^util$/,
        replacement: path.resolve(
          import.meta.dirname,
          "client",
          "src",
          "shims",
          "nodeUtilShim.ts"
        ),
      },
    ],
  },
  test: {
    // root is ./client; the serverless engine lives beside it in ./api
    include: ["**/*.{test,spec}.?(c|m)[jt]s?(x)", "../api/**/*.test.ts", "../shared/**/*.test.ts", "../server/**/*.test.ts", "../tests/**/*.test.ts"],
    setupFiles: [path.resolve(import.meta.dirname, "client/src/test/i18nSetup.ts")],
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        /**
         * Manual chunk strategy for MAE Academy:
         *
         * Goals:
         * 1. Stable, long-lived vendor caches — libraries with slow churn get
         *    their own chunk so a single app code change doesn't bust them.
         * 2. Heavy simulator deps (math, charting, animation) isolated from the
         *    main bundle so they load in parallel with app code.
         * 3. Avoid cascade loading — SimulationDetail imports all studio
         *    components eagerly, so they land in one chunk; tab switching is
         *    synchronous (no per-tool lazy cascade).
         */
        // Math Core chunks keep Rollup's natural split (forcing them with manualChunks would hoist shared helpers into
        // them); only their file names change, to mathcore-ui-*, so the chunk-size audit can find and measure them.
        chunkFileNames(chunk) {
          const ids = chunk.moduleIds.filter((m) => !m.startsWith("\0"));
          const isMathcore = (m: string) => m.includes("/client/src/features/mathcore/") || m.includes("/shared/mathcore/");
          const entry = chunk.facadeModuleId ?? "";
          if ((entry && isMathcore(entry)) || (ids.length > 0 && ids.every(isMathcore))) return "assets/mathcore-ui-[hash].js";
          return "assets/[name]-[hash].js";
        },
        manualChunks(id) {
          // ── Core React runtime ─────────────────────────────────────────
          if (
            id.includes("node_modules/react/") ||
            id.includes("node_modules/react-dom/") ||
            id.includes("node_modules/react-i18next") ||
            id.includes("node_modules/scheduler/") ||
            id.includes("commonjsHelpers") ||
            id.includes("node_modules/framer-motion") ||
            id.includes("node_modules/motion-") ||
            id.includes("node_modules/wouter")
          ) {
            return "vendor-react";
          }
          // ── Animation & routing (shared across all pages) ──────────────
          // ── Icon library ───────────────────────────────────────────────
          if (id.includes("node_modules/lucide-react")) {
            return "vendor-icons";
          }
          // ── Math / signal processing (heavy — simulator-only) ──────────
          if (
            id.includes("node_modules/mathjs") ||
            id.includes("node_modules/numeric") ||
            id.includes("node_modules/ml-matrix") ||
            id.includes("node_modules/complex.js")
          ) {
            return "vendor-math";
          }
          // ── Charting / plotting (heavy — simulator-only) ───────────────
          if (
            id.includes("node_modules/plotly.js") ||
            id.includes("node_modules/chart.js") ||
            id.includes("node_modules/d3") ||
            id.includes("node_modules/recharts")
          ) {
            return "vendor-charts";
          }
          // ── KaTeX (shared by every simulator's labels; cached across tools) ──
          if (!id.endsWith(".css") && (id.includes("node_modules/katex") || id.includes("node_modules/react-katex"))) {
            return "katex-vendor";
          }
          // ── Monaco Editor (extremely heavy — code studio only) ─────────
          if (id.includes("node_modules/monaco-editor")) {
            return "vendor-monaco";
          }
          // ── i18n runtime ───────────────────────────────────────────────
          if (id.includes("node_modules/i18next")) {
            return "vendor-i18n";
          }
          // Let Rollup split everything else automatically
          return undefined;
        },
      },
    },
    // Increase threshold — simulator chunks with bundled math/plot libs are
    // intentionally large; 1200 kB prevents spurious warnings.
    chunkSizeWarningLimit: 1200,
  },

  optimizeDeps: {
    // Pyodide is loaded from the jsdelivr CDN at runtime (see pythonEngine.ts); the npm package
    // is types-only here, and pre-bundling it would make Vite try to parse its Node-only assets.
    exclude: ["pyodide"],
  },
  // The ngspice worker is constructed with { type: "module" }; Vite's default worker format is iife.
  worker: {
    format: "es",
    rollupOptions: {
      output: {
        // Compute Engine is imported lazily inside the mathcore Worker; name it for the chunk-size audit.
        manualChunks(id) {
          return id.includes("node_modules/@cortex-js/compute-engine") ? "mathcore-compute" : undefined;
        },
      },
    },
  },
  server: {
    port: 3000,
    strictPort: true, // Fail or alert instead of auto-incrementing to 3001/3002
    host: true,
    allowedHosts: true,
    fs: {
      strict: true,
      allow: [path.resolve(import.meta.dirname)],
      deny: ["**/.*"],
    },
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
    },
  },
});
