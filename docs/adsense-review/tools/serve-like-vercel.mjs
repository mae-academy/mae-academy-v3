// Local approximation of how Vercel resolves a request against vercel.json for the static output:
// redirects -> filesystem -> rewrites (first match) -> 404.html. Same response for every user agent.
// It is NOT Vercel; results must be confirmed on a Vercel preview deployment (see VERIFICATION.md).
// Usage: node serve-like-vercel.mjs <dist/public> <vercel.json> <port>
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const [rootArg, vercelPath, port = "4173"] = process.argv.slice(2);
const root = path.resolve(rootArg);
const cfg = JSON.parse(fs.readFileSync(vercelPath, "utf8"));
const types = { ".html": "text/html; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json" };
const re = (src) => new RegExp("^" + src.replace(/:path\*/g, "(.*)").replace(/:([a-z]+)/gi, "([^/]+)") + "$");
const file = (p) => { const f = path.join(root, decodeURIComponent(p)); return f.startsWith(path.resolve(root)) && fs.existsSync(f) && fs.statSync(f).isFile() ? f : null; };
const send = (res, status, f, extra = {}) => { res.writeHead(status, { "content-type": types[path.extname(f)] ?? "application/octet-stream", ...extra }); fs.createReadStream(f).pipe(res); };

http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const p = url.pathname;
  for (const r of cfg.redirects ?? []) if (!r.has && re(r.source).test(p)) { res.writeHead(r.permanent ? 308 : 307, { location: r.destination }); return res.end(); }
  const direct = file(p);
  if (direct) return send(res, 200, direct);
  for (const r of cfg.rewrites ?? []) {
    if (!re(r.source).test(p)) continue;
    if (r.destination.startsWith("/api/")) { res.writeHead(404); return res.end("no functions locally"); }
    const f = file(r.destination);
    if (f) return send(res, 200, f, { "x-local-rewrite": r.destination });
  }
  send(res, 404, path.join(root, "404.html"));
}).listen(Number(port), () => console.log(`serving ${root} on :${port}`));
