import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { auth } from "../lib/middleware.js";
import { printifyJson } from "../lib/printify.js";
import { decryptToken } from "../lib/crypto.js";
import { findCatalogAccount, shopAccessError } from "../lib/shopAccess.js";

const router = Router();
router.use(auth);

// GET print providers for a blueprint
router.get("/providers/:blueprintId", async (req, res) => {
  const userId = (req as any).userId;
  const account = await findCatalogAccount(userId);
  if (!account) return res.status(400).json({ error: "No enabled Printify store connected" });

  const data = await printifyJson(
    `https://api.printify.com/v1/catalog/blueprints/${req.params.blueprintId}/print_providers.json`,
    { headers: { Authorization: `Bearer ${decryptToken(account.accessToken)}` } }
  );
  res.json(data);
});

// GET variants for a blueprint + provider
router.get("/variants/:blueprintId/:providerId", async (req, res) => {
  const userId = (req as any).userId;
  const account = await findCatalogAccount(userId);
  if (!account) return res.status(400).json({ error: "No enabled Printify store connected" });

  const { blueprintId, providerId } = req.params;
  const data = await printifyJson(
    `https://api.printify.com/v1/catalog/blueprints/${blueprintId}/print_providers/${providerId}/variants.json?show-out-of-stock=1`,
    { headers: { Authorization: `Bearer ${decryptToken(account.accessToken)}` } }
  );
  res.json(data);
});

// GET placeholders for a blueprint + provider
router.get("/placeholders/:blueprintId/:providerId", async (req, res) => {
  const userId = (req as any).userId;
  const account = await findCatalogAccount(userId);
  if (!account) return res.status(400).json({ error: "No enabled Printify store connected" });

  const { blueprintId, providerId } = req.params;
  const data = await printifyJson(
    `https://api.printify.com/v1/catalog/blueprints/${blueprintId}/print_providers/${providerId}/variants.json`,
    { headers: { Authorization: `Bearer ${decryptToken(account.accessToken)}` } }
  );

  // Extract unique positions from first variant's placeholders
  const positions = [...new Set(
    (data.variants?.[0]?.placeholders ?? []).map((p: any) => p.position)
  )];

  res.json({ placeholders: positions.map((p) => ({ position: p })) });
});

// GET buyer shipping cost per variant for a blueprint + provider
router.get("/shipping/:blueprintId/:providerId", async (req, res) => {
  const userId = (req as any).userId;
  const account = await findCatalogAccount(userId);
  if (!account) return res.status(400).json({ error: "No enabled Printify store connected" });

  const { blueprintId, providerId } = req.params;
  const data = await printifyJson(
    `https://api.printify.com/v1/catalog/blueprints/${blueprintId}/print_providers/${providerId}/shipping.json`,
    { headers: { Authorization: `Bearer ${decryptToken(account.accessToken)}` } }
  );

  // Simplification: one cost per variant, not split by destination country —
  // last matching profile wins if a variant appears in more than one.
  const costByVariant: Record<number, number> = {};
  for (const profile of data.profiles ?? []) {
    for (const variantId of profile.variant_ids ?? []) {
      costByVariant[variantId] = profile.first_item?.cost ?? 0;
    }
  }
  res.json(costByVariant);
});

// GET production cost per variant — only available once the listing has
// actually been created on Printify (cost isn't exposed by the catalog
// endpoints, only by GET-ing back a real product).
router.get("/cost/:listingId", async (req, res) => {
  const userId = (req as any).userId;
  const listing = await prisma.listing.findUnique({
    where: { id: req.params.listingId },
    include: { batch: true, shop: { include: { account: true } } },
  });
  if (!listing || listing.batch.userId !== userId) {
    return res.status(404).json({ error: "Listing not found" });
  }
  const accessError = shopAccessError(listing.shop);
  if (accessError) return res.status(409).json({ error: accessError });
  if (!listing.printifyProductId) return res.json({});

  const data = await printifyJson(
    `https://api.printify.com/v1/shops/${listing.shop.printifyShopId}/products/${listing.printifyProductId}.json`,
    { headers: { Authorization: `Bearer ${decryptToken(listing.shop.account.accessToken)}` } }
  );
  const costByVariant: Record<number, number> = {};
  for (const v of data.variants ?? []) costByVariant[v.id] = v.cost ?? 0;
  res.json(costByVariant);
});

export default router;
