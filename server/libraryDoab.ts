import type { Request, Response } from "express";
import { doabItem, doabSearch } from "../api/_lib/library/catalog";

// Logic shared with the Vercel functions api/library/doab.ts and api/library/doab-item.ts (see api/_lib/library/catalog.ts).

/** GET /api/library/doab?query=&limit=&offset= */
export async function libraryDoabHandler(req: Request, res: Response): Promise<void> {
  const reply = await doabSearch({ query: req.query.query, limit: req.query.limit, offset: req.query.offset });
  res.status(reply.status).type("application/json").send(reply.body);
}

/** GET /api/library/doab-item?handle=20.500.12854/130855 */
export async function libraryDoabItemHandler(req: Request, res: Response): Promise<void> {
  const reply = await doabItem(req.query.handle);
  res.status(reply.status).type("application/json").send(reply.body);
}
