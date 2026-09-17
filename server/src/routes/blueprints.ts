import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { auth } from "../lib/middleware.js";
import { pageParams } from "../lib/pagination.js";
import { printifyJson } from "../lib/printify.js";
import { decryptToken } from "../lib/crypto.js";
import { findCatalogAccount } from "../lib/shopAccess.js";

const router = Router();
router.use(auth);
const CATALOG_CACHE_MS = 15 * 60_000;
let catalogCache: { expiresAt: number; items: any[] } | null = null;

// GET user's curated pool
router.get("/", async (req, res) => {
  const userId = (req as any).userId;
  const { skip, take } = pageParams(req, 12);

  const [total, blueprints] = await Promise.all([
    prisma.curatedBlueprint.count({ where: { userId } }),
    prisma.curatedBlueprint.findMany({ where: { userId }, orderBy: { addedAt: "desc" }, skip, take }),
  ]);
  res.json({ items: blueprints, total });
});

// GET just the curated blueprint ids — a cheap, unpaginated membership-check
// list for the "already in pool?" logic (marquee + search dialog), decoupled
// from the paginated pool above so adding something already in the pool but
// not on the currently-loaded page doesn't 400 as a false "not in pool".
router.get("/ids", async (req, res) => {
  const userId = (req as any).userId;
  const blueprints = await prisma.curatedBlueprint.findMany({
    where: { userId },
    select: { blueprintId: true },
  });
  res.json(blueprints.map((b) => b.blueprintId));
});

// GET search from Printify catalog (pakai token akun pertama user)
router.get("/search", async (req, res) => {
  const userId = (req as any).userId;
  const account = await findCatalogAccount(userId);
  if (!account) return res.status(400).json({ error: "No enabled Printify store connected" });

  if (!catalogCache || catalogCache.expiresAt <= Date.now()) {
    const items = await printifyJson<any[]>("https://api.printify.com/v1/catalog/blueprints.json", {
      headers: { Authorization: `Bearer ${decryptToken(account.accessToken)}` },
    });
    catalogCache = { expiresAt: Date.now() + CATALOG_CACHE_MS, items };
  }
  const query = String(req.query.q ?? "").trim().toLowerCase();
  const items = query
    ? catalogCache.items.filter((blueprint) =>
      [blueprint.title, blueprint.brand, blueprint.model]
        .some((value) => String(value ?? "").toLowerCase().includes(query))
    )
    : catalogCache.items;
  res.json(items);
});

// POST add blueprint to pool
router.post("/", async (req, res) => {
  const userId = (req as any).userId;
  const { blueprintId, brand, model, title, images } = req.body;

  const existing = await prisma.curatedBlueprint.findFirst({
    where: { userId, blueprintId },
  });
  if (existing) return res.status(400).json({ error: "Already in pool" });

  const blueprint = await prisma.curatedBlueprint.create({
    data: { userId, blueprintId, brand, model, title, images },
  });
  res.json(blueprint);
});

// DELETE from pool
router.delete("/:id", async (req, res) => {
  const userId = (req as any).userId;
  await prisma.curatedBlueprint.deleteMany({
    where: { id: req.params.id, userId },
  });
  res.json({ ok: true });
});

export default router;
