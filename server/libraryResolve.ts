import type { Request, Response } from "express";
import { resolveArchivePdfs } from "../api/_lib/library/catalog";

/**
 * POST /api/library/resolve-pdfs   body: { ids: string[] }   ->   { results: Record<id, string | null> }
 * Logic shared with the Vercel function api/library/resolve-pdfs.ts (see api/_lib/library/catalog.ts).
 */
export async function libraryResolveHandler(req: Request, res: Response): Promise<void> {
  const reply = await resolveArchivePdfs(req.body);
  res.status(reply.status).type("application/json").send(reply.body);
}
