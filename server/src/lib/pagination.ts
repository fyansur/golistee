import type { Request } from "express";

// Shared page/pageSize query-param parsing for list endpoints. 1-indexed
// page, capped pageSize to keep a client from requesting an unbounded page.
export function pageParams(req: Request, defaultSize = 10) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.max(1, Math.min(100, Number(req.query.pageSize) || defaultSize));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}
