import type { NextFunction, Request, Response } from "express";

/**
 * Error middleware for the chat route's JSON parser: body-parser answers oversized or malformed bodies with an HTML
 * page, so this turns them into the same `{ error }` JSON every other chat failure uses. Nothing internal is leaked.
 */
export function chatBodyErrorHandler(error: unknown, _req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) return next(error);
  const type = (error as { type?: unknown } | null)?.type;
  if (type === "entity.too.large") {
    res.status(413).json({ error: "That request is too large. PDFs are limited to 50 MB and text files to 200 KB." });
    return;
  }
  if (typeof type === "string" && /^(entity\.parse\.failed|entity\.verify\.failed|encoding\.unsupported|charset\.unsupported|request\.aborted|request\.size\.invalid|stream\.encoding\.set)$/.test(type)) {
    res.status(400).json({ error: "The request body is not valid JSON." });
    return;
  }
  console.error("MAE AI chat body error:", error instanceof Error ? error.name : "unknown");
  res.status(500).json({ error: "Internal error." });
}
