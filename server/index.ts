import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import "dotenv/config";
import { generateCircuitAnalysis } from "./aiService";

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

  const port = process.env.PORT || 3000;

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
