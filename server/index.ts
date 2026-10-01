import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import "dotenv/config";
import { generateCircuitAnalysis } from "./aiService";
import { libraryCoverHandler } from "./libraryCover";
import { libraryDoabHandler, libraryDoabItemHandler } from "./libraryDoab";
import { libraryResolveHandler } from "./libraryResolve";
import { featuredHandler, isFeaturedUrl, warmFeatured } from "./featured";
import { createThumbHandler } from "./pdfThumb";
import { handleEvaluate } from "../api/_lib/plc/handler";
import { handleLogoEvaluate } from "../api/_lib/plc/logo/handler";
import { handleSolve } from "../api/_lib/circuit/handler";
import { handleLogic } from "../api/_lib/logic/handler";
import { handleSignals } from "../api/_lib/signals/handler";
import { handleControl } from "../api/_lib/control/handler";
import { expressGuard } from "../api/_lib/security/node-adapter";
import type { Tier } from "../api/_lib/security/ratelimit";
import { pdfCheckHandler, pdfDownloadHandler, pdfProxyHandler } from "./pdfProxy";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Every /api route passes the origin check and a per-IP rate limit. Covers, thumbnails and PDF
  // range requests fire once per visible card or page, so they get a higher tier than the rest.
  const tierFor = (path: string): Tier =>
    path.startsWith("/plc/")
      ? "plc"
      : path.startsWith("/circuit/")
        ? "circuit"
        : path.startsWith("/logic/")
        ? "logic"
        : path.startsWith("/signals/")
        ? "signals"
        : path.startsWith("/control/")
        ? "control"
        : /^\/(pdf-thumb|pdf-proxy|pdf-download|library\/cover)/.test(path)
        ? "assets"
        : "general";
  app.use("/api", expressGuard(tierFor));

  // Same web-standard handler Vercel runs for api/plc/evaluate.ts; mounted ahead of the global
  // JSON parser so the handler sees the raw body and applies its own (larger) size limit.
  app.post("/api/plc/evaluate", express.text({ type: "*/*", limit: "512kb" }), async (req, res) => {
    const response = await handleEvaluate(
      new Request("http://localhost/api/plc/evaluate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: typeof req.body === "string" ? req.body : "",
      }),
    );
    res.status(response.status).type("application/json").send(await response.text());
  });
  // LOGO! engine: same web-standard handler as api/plc/logo/evaluate.ts.
  app.post("/api/plc/logo/evaluate", express.text({ type: "*/*", limit: "256kb" }), async (req, res) => {
    const response = await handleLogoEvaluate(
      new Request("http://localhost/api/plc/logo/evaluate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: typeof req.body === "string" ? req.body : "",
      }),
    );
    res.status(response.status).type("application/json").send(await response.text());
  });
  // Circuit solver: same web-standard handler as api/circuit/solve.ts.
  app.post("/api/circuit/solve", express.text({ type: "*/*", limit: "768kb" }), async (req, res) => {
    const response = await handleSolve(
      new Request("http://localhost/api/circuit/solve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: typeof req.body === "string" ? req.body : "",
      }),
    );
    res.status(response.status).type("application/json").send(await response.text());
  });
  // Digital Logic engine: same web-standard handler as api/logic/solve.ts.
  app.post("/api/logic/solve", express.text({ type: "*/*", limit: "384kb" }), async (req, res) => {
    const response = await handleLogic(
      new Request("http://localhost/api/logic/solve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: typeof req.body === "string" ? req.body : "",
      }),
    );
    res.status(response.status).type("application/json").send(await response.text());
  });
  // Signals & Systems engines: same web-standard handler as api/signals/transform.ts.
  app.post("/api/signals/transform", express.text({ type: "*/*", limit: "384kb" }), async (req, res) => {
    const response = await handleSignals(
      new Request("http://localhost/api/signals/transform", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: typeof req.body === "string" ? req.body : "",
      }),
    );
    res.status(response.status).type("application/json").send(await response.text());
  });
  // Control systems & power electronics: same web-standard handler as api/control/solve.ts.
  app.post("/api/control/solve", express.text({ type: "*/*", limit: "384kb" }), async (req, res) => {
    const response = await handleControl(
      new Request("http://localhost/api/control/solve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: typeof req.body === "string" ? req.body : "",
      }),
    );
    res.status(response.status).type("application/json").send(await response.text());
  });
  app.use(express.json());

  app.post("/api/ai/analyze", async (req, res) => {
    const prompt = typeof req.body?.prompt === "string" ? req.body.prompt : "";
    if (!prompt.trim()) {
      res.status(400).json({ error: "prompt must be a non-empty string." });
      return;
    }
    try {
      const result = await generateCircuitAnalysis(prompt);
      res.json({ result });
    } catch (error) {
      console.error("Circuit analysis route failed:", error);
      res.status(502).json({ error: error instanceof Error ? error.message : "Circuit analysis failed." });
    }
  });

  app.get("/api/pdf-proxy", pdfProxyHandler);
  app.get("/api/pdf-download", pdfDownloadHandler);
  app.post("/api/check-pdfs", pdfCheckHandler);
  app.get("/api/research/featured", featuredHandler);
  app.post("/api/library/resolve-pdfs", libraryResolveHandler);
  app.get("/api/library/cover", libraryCoverHandler);
  app.get("/api/library/doab", libraryDoabHandler);
  app.get("/api/library/doab-item", libraryDoabItemHandler);
  app.get("/api/pdf-thumb", createThumbHandler(isFeaturedUrl));

  // Unknown API routes must never fall through to the SPA index.html (renders <NotFound /> inside iframes).
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  // Serve static files from dist/public in production
  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  app.use(express.static(staticPath));

  // Handle client-side routing - serve index.html for all routes
  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });

  const port = process.env.PORT || 5000;

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    void warmFeatured();
  });
}

startServer().catch(console.error);
