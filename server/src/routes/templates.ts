import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { auth } from "../lib/middleware.js";
import { fetchCatalogOptionsByCombo, comboKey } from "../lib/catalogOptions.js";
import { pageParams } from "../lib/pagination.js";
import { decryptToken } from "../lib/crypto.js";
import { findCatalogAccount } from "../lib/shopAccess.js";

const router = Router();
router.use(auth);

// GET all templates owned by the logged-in Golistee user.
router.get("/", async (req, res) => {
  const userId = (req as any).userId;
  const where = { userId };
  const { skip, take } = pageParams(req);

  const [total, templates, catalogAccount] = await Promise.all([
    prisma.template.count({ where }),
    prisma.template.findMany({ where, skip, take }),
    findCatalogAccount(userId),
  ]);

  // Template.variants only ever stores {id, price, is_enabled} — color/size
  // per id (for the swatch dots + "N colors · M sizes" summary on the card)
  // comes from Printify's catalog, same as the products list.
  const catalogByCombo = catalogAccount
    ? await fetchCatalogOptionsByCombo(
      templates.map((t) => ({
        blueprintId: t.blueprintId,
        printProviderId: t.printProviderId,
        accessToken: decryptToken(catalogAccount.accessToken),
      }))
    )
    : new Map();
  res.json({
    items: templates.map((t) => {
      const catalog = catalogByCombo.get(comboKey(t.blueprintId, t.printProviderId));
      const variantOptions = catalog
        ? (t.variants as any[])
          .map((v) => ({ id: v.id, ...catalog.get(v.id) }))
          .filter((v): v is { id: number; color: string; size: string } => Boolean(v.color))
        : [];
      return { ...t, variantOptions };
    }),
    total,
  });
});

// GET a single template for editing
router.get("/:id", async (req, res) => {
  const userId = (req as any).userId;
  const template = await prisma.template.findFirst({ where: { id: req.params.id, userId } });
  if (!template) return res.status(404).json({ error: "Not found" });
  res.json(template);
});

// POST create template
router.post("/", async (req, res) => {
  const userId = (req as any).userId;
  const { name, blueprintId, blueprintLabel, printProviderId, printProviderLabel, variants, description } = req.body;

  const template = await prisma.template.create({
    data: { userId, name, blueprintId, blueprintLabel, printProviderId, printProviderLabel, variants, description },
  });
  res.json(template);
});

// PUT update template — blueprint/provider can change too; the client
// resets variants to [] whenever either changes, since stored variant ids
// are specific to the old catalog combo and wouldn't mean anything under a
// new one.
router.put("/:id", async (req, res) => {
  const userId = (req as any).userId;
  const { name, description, variants, blueprintId, blueprintLabel, printProviderId, printProviderLabel } = req.body;

  const existing = await prisma.template.findFirst({ where: { id: req.params.id, userId } });
  if (!existing) return res.status(404).json({ error: "Not found" });

  const template = await prisma.template.update({
    where: { id: req.params.id },
    data: { name, description, variants, blueprintId, blueprintLabel, printProviderId, printProviderLabel },
  });
  res.json(template);
});

// DELETE template
router.delete("/:id", async (req, res) => {
  const userId = (req as any).userId;
  const existing = await prisma.template.findFirst({ where: { id: req.params.id, userId } });
  if (!existing) return res.status(404).json({ error: "Not found" });

  await prisma.template.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

export default router;
