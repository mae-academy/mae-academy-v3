import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import "dotenv/config";
import { generateCircuitAnalysis } from "./aiService";
import { featuredHandler, isFeaturedUrl, warmFeatured } from "./featured";
import { createThumbHandler } from "./pdfThumb";
import { pdfCheckHandler, pdfDownloadHandler, pdfProxyHandler } from "./pdfProxy";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);
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
