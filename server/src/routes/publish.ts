import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { auth } from "../lib/middleware.js";
import { fetchCatalogOptionsByCombo, comboKey } from "../lib/catalogOptions.js";
import { pageParams } from "../lib/pagination.js";
import { printifyFetch } from "../lib/printify.js";
import { decryptToken } from "../lib/crypto.js";
import { createOnPrintify, statusAfterPrintifyDraft, updateAndPublish, updateOnPrintify } from "../lib/listingPublish.js";
import { shopAccessError, usableShopWhere } from "../lib/shopAccess.js";

const router = Router();
router.use(auth);

// POST create batch + listings. `draftOnPrintify: true` (Save as Draft)
// additionally tries to create each ready-enough listing on Printify as an
// unpublished product — one missing title/blueprint/variants just stays a
// local-only draft until it has enough to qualify.
router.post("/batch", async (req, res) => {
  const userId = (req as any).userId;
  const { listings, draftOnPrintify } = req.body;

  const shopIds = [...new Set(listings.map((l: any) => l.shopId))] as string[];
  const usableCount = await prisma.shop.count({ where: { id: { in: shopIds }, ...usableShopWhere(userId) } });
  if (usableCount !== shopIds.length) {
    return res.status(409).json({ error: "One or more stores are disabled or unavailable. Enable them from Connections first." });
  }

  const batch = await prisma.publishBatch.create({
    data: {
      userId,
      shopIds,
      total: listings.length,
      listings: {
        create: listings.map((l: any) => ({
          shopId: l.shopId,
          blueprintId: l.blueprintId,
          blueprintLabel: l.blueprintLabel,
          printProviderId: l.printProviderId,
          printProviderLabel: l.printProviderLabel,
          title: l.title,
          description: l.description ?? "",
          tags: l.tags ?? [],
          variants: l.variants,
          designs: {
            create: (l.designs ?? []).map((d: any) => ({
              position: d.position,
              variantIds: d.variantIds ?? [],
              fileUrl: d.fileUrl,
              thumbUrl: d.thumbUrl ?? null,
              printifyImageId: d.printifyImageId,
              x: d.x ?? 0.5,
              y: d.y ?? 0.5,
              scale: d.scale ?? 1,
              angle: d.angle ?? 0,
              uploadStatus: d.uploadStatus ?? "synced",
            })),
          },
        })),
      },
    },
    include: { listings: { include: { designs: true, shop: { include: { account: true } } } } },
  });

  if (draftOnPrintify) {
    for (const listing of batch.listings) {
      if (listingDraftErrors(listing).length > 0) continue;
      try {
        const { printifyProductId, status } = await createOnPrintify(listing, listing.shop, { publish: false });
        await prisma.listing.update({ where: { id: listing.id }, data: { status, printifyProductId } });
      } catch (err: any) {
        await prisma.listing.update({ where: { id: listing.id }, data: { status: "failed", errorMessage: err.message } });
      }
    }
  }

  const updated = await prisma.publishBatch.findUnique({
    where: { id: batch.id },
    include: { listings: { include: { designs: true, shop: { include: { account: true } } } } },
  });
  res.json(updated);
});

// POST publish batch — always a real publish to the sales channel.
router.post("/batch/:batchId/publish", async (req, res) => {
  const userId = (req as any).userId;
  const batch = await prisma.publishBatch.findFirst({
    where: { id: req.params.batchId, userId },
    include: { listings: { include: { designs: true, shop: { include: { account: true } } } } },
  });
  if (!batch) return res.status(404).json({ error: "Batch not found" });

  const errors: string[] = [];
  for (const listing of batch.listings) {
    const accessError = shopAccessError(listing.shop);
    if (accessError) errors.push(`${listing.title} — ${accessError}`);
    for (const e of listingPublishErrors(listing)) errors.push(`${listing.title} — ${e}`);
  }

  if (errors.length > 0) {
    return res.status(400).json({ error: "Publish cancelled", details: errors });
  }

  processBatch(batch).catch(console.error);

  res.json({ ok: true, message: "Batch publish started" });
});

// GET history — scoped to the logged-in user's own batches, optionally
// filtered by one or more shopIds (comma-separated, matches Products' own
// shop filter). Each batch's listings come back summarized the same way as
// GET /listings, so the history page can show the same card content.
router.get("/history", async (req, res) => {
  const userId = (req as any).userId;
  const { shopId } = req.query;
  const shopIds = shopId ? String(shopId).split(",").filter(Boolean) : [];
  const where = { userId, ...(shopIds.length ? { shopIds: { hasSome: shopIds } } : {}) };
  const { skip, take } = pageParams(req);

  const [total, batches] = await Promise.all([
    prisma.publishBatch.count({ where }),
    prisma.publishBatch.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { listings: { include: { designs: true, shop: { include: { account: true } } } } },
      skip, take,
    }),
  ]);

  const catalogByCombo = await fetchCatalogOptionsByCombo(
    batches.flatMap((b) => b.listings).map((l) => ({ blueprintId: l.blueprintId, printProviderId: l.printProviderId, accessToken: l.shop?.account?.accessToken ? decryptToken(l.shop.account.accessToken) : "" }))
  );
  res.json({
    items: batches.map((b) => ({
      ...b,
      listings: b.listings.map((l) => summarizeListing(l, catalogByCombo.get(comboKey(l.blueprintId, l.printProviderId)))),
    })),
    total,
  });
});

// DELETE a listing — removes it on Printify (and its sales channel) first if
// it's live there, then locally.
router.delete("/listing/:id", async (req, res) => {
  const userId = (req as any).userId;
  const listing = await prisma.listing.findUnique({
    where: { id: req.params.id },
    include: { batch: true, shop: { include: { account: true } } },
  });
  if (!listing || listing.batch.userId !== userId) {
    return res.status(404).json({ error: "Listing not found" });
  }

  if (listing.printifyProductId) {
    const accessError = shopAccessError(listing.shop);
    if (accessError) return res.status(409).json({ error: accessError });
    const delRes = await printifyFetch(
      `https://api.printify.com/v1/shops/${listing.shop.printifyShopId}/products/${listing.printifyProductId}.json`,
      { method: "DELETE", headers: { Authorization: `Bearer ${decryptToken(listing.shop.account.accessToken)}` } }
    );
    if (!delRes.ok && delRes.status !== 404) {
      const body = await delRes.json().catch(() => ({}));
      return res.status(502).json({ error: body.message ?? "Failed to delete product on Printify" });
    }
  }

  await prisma.listingDesign.deleteMany({ where: { listingId: listing.id } });
  await prisma.listing.delete({ where: { id: listing.id } });
  res.json({ ok: true });
});

// GET a single listing for editing (with its designs)
router.get("/listing/:id", async (req, res) => {
  const userId = (req as any).userId;
  const listing = await prisma.listing.findUnique({
    where: { id: req.params.id },
    include: {
      designs: true,
      batch: true,
      shop: {
        select: {
          id: true, title: true, enabled: true, status: true,
          account: { select: { tokenStatus: true } },
        },
      },
    },
  });
  if (!listing || listing.batch.userId !== userId) {
    return res.status(404).json({ error: "Listing not found" });
  }
  res.json(listing);
});

// PUT edit a listing. `publish: true` pushes live; otherwise
// `draftOnPrintify: true` creates/updates the Printify draft without touching
// the sales channel, while false/omitted saves only to our database.
router.put("/listing/:id", async (req, res) => {
  const userId = (req as any).userId;
  const { title, description, tags, variants, designs, publish } = req.body;
  const draftOnPrintify = req.body.draftOnPrintify === true;

  const listing = await prisma.listing.findUnique({
    where: { id: req.params.id },
    include: { batch: true, shop: { include: { account: true } } },
  });
  if (!listing || listing.batch.userId !== userId) {
    return res.status(404).json({ error: "Listing not found" });
  }
  if (publish || draftOnPrintify) {
    const accessError = shopAccessError(listing.shop);
    if (accessError) return res.status(409).json({ error: accessError });
  }

  const includeDesigns = Array.isArray(designs);
  if (includeDesigns) {
    await prisma.listingDesign.deleteMany({ where: { listingId: listing.id } });
    await prisma.listingDesign.createMany({
      data: designs.map((d: any) => ({
        listingId: listing.id,
        position: d.position,
        variantIds: d.variantIds ?? [],
        fileUrl: d.fileUrl,
        thumbUrl: d.thumbUrl ?? null,
        printifyImageId: d.printifyImageId,
        x: d.x ?? 0.5,
        y: d.y ?? 0.5,
        scale: d.scale ?? 1,
        angle: d.angle ?? 0,
        uploadStatus: d.uploadStatus ?? "synced",
      })),
    });
  }

  await prisma.listing.update({
    where: { id: listing.id },
    data: { title, description: description ?? "", tags: tags ?? [], variants },
  });

  if (!publish) {
    const freshListing = await prisma.listing.findUnique({ where: { id: listing.id }, include: { designs: true } });
    if (!draftOnPrintify) {
      await prisma.listing.update({
        where: { id: listing.id },
        data: { status: listing.printifyProductId ? "out_of_sync" : "draft", errorMessage: null },
      });
    } else if (listingDraftErrors(freshListing!).length === 0) {
      try {
        if (listing.printifyProductId) {
          await updateOnPrintify(freshListing, listing.shop, { includeDesigns });
          await prisma.listing.update({
            where: { id: listing.id },
            data: {
              status: statusAfterPrintifyDraft(listing.lastPublishedAt),
              errorMessage: null,
            },
          });
        } else {
          const { printifyProductId, status } = await createOnPrintify(freshListing, listing.shop, { publish: false });
          await prisma.listing.update({ where: { id: listing.id }, data: { status, printifyProductId, errorMessage: null } });
        }
      } catch (err: any) {
        await prisma.listing.update({ where: { id: listing.id }, data: { status: "failed", errorMessage: err.message } });
      }
    }
    const updated = await prisma.listing.findUnique({ where: { id: listing.id }, include: { designs: true } });
    return res.json(updated);
  }

  const freshListing = await prisma.listing.findUnique({ where: { id: listing.id }, include: { designs: true } });

  try {
    if (!listing.printifyProductId) {
      // Never touched Printify — this is its first publish, same path a
      // fresh batch-publish takes.
      const validationErrors = listingPublishErrors(freshListing!);
      if (validationErrors.length > 0) {
        return res.status(400).json({ error: `Cannot publish: ${validationErrors.join(", ")}` });
      }
      const { printifyProductId, status } = await createOnPrintify(freshListing, listing.shop, { publish: true });
      const updated = await prisma.listing.update({
        where: { id: listing.id },
        data: { status, printifyProductId, errorMessage: null },
        include: { designs: true },
      });
      return res.json(updated);
    }

    await updateAndPublish(freshListing, listing.shop, { includeDesigns });

    const updated = await prisma.listing.update({
      where: { id: listing.id },
      data: { status: "published", errorMessage: null },
      include: { designs: true },
    });
    res.json(updated);
  } catch (err: any) {
    await prisma.listing.update({ where: { id: listing.id }, data: { status: "failed", errorMessage: err.message } });
    res.status(500).json({ error: err.message });
  }
});

// GET the products list — our own Listing rows are the source of truth,
// not Printify's live shop data.
router.get("/listings", async (req, res) => {
  const userId = (req as any).userId;
  const { shopId } = req.query;
  const shopIds = shopId ? String(shopId).split(",").filter(Boolean) : [];
  const where = { batch: { userId }, ...(shopIds.length ? { shopId: { in: shopIds } } : {}) };
  const { skip, take } = pageParams(req);

  const [total, listings] = await Promise.all([
    prisma.listing.count({ where }),
    prisma.listing.findMany({
      where,
      include: { designs: true, shop: { include: { account: true } } },
      orderBy: { createdAt: "desc" },
      skip, take,
    }),
  ]);

  const catalogByCombo = await fetchCatalogOptionsByCombo(
    listings.map((l) => ({ blueprintId: l.blueprintId, printProviderId: l.printProviderId, accessToken: l.shop?.account?.accessToken ? decryptToken(l.shop.account.accessToken) : "" }))
  );
  res.json({
    items: listings.map((l) => summarizeListing(l, catalogByCombo.get(comboKey(l.blueprintId, l.printProviderId)))),
    total,
  });
});

// POST bulk publish — used by the Products page's multi-select toolbar.
// Backgrounded like /batch/:batchId/publish: a real selection can be dozens
// of sequential Printify round-trips, which would otherwise hold the HTTP
// request open for minutes. The client sees per-row status update on its
// next fetch instead of an exact count in the response.
router.post("/listings/bulk-publish", async (req, res) => {
  const userId = (req as any).userId;
  const { ids } = req.body as { ids: string[] };
  const listings = await prisma.listing.findMany({
    where: { id: { in: ids }, batch: { userId } },
    include: { designs: true, shop: { include: { account: true } } },
  });

  if (listings.length !== new Set(ids).size) {
    return res.status(404).json({ error: "One or more products were not found" });
  }
  const blocked = listings.find((listing) => shopAccessError(listing.shop));
  if (blocked) return res.status(409).json({ error: shopAccessError(blocked.shop) });

  res.json({ ok: true, queued: listings.length });
  processBulkPublish(listings).catch(console.error);
});

// POST bulk delete — same backgrounding rationale as bulk-publish.
router.post("/listings/bulk-delete", async (req, res) => {
  const userId = (req as any).userId;
  const { ids } = req.body as { ids: string[] };
  const listings = await prisma.listing.findMany({
    where: { id: { in: ids }, batch: { userId } },
    include: { shop: { include: { account: true } } },
  });

  if (listings.length !== new Set(ids).size) {
    return res.status(404).json({ error: "One or more products were not found" });
  }
  const blocked = listings.find((listing) => listing.printifyProductId && shopAccessError(listing.shop));
  if (blocked) return res.status(409).json({ error: shopAccessError(blocked.shop) });

  res.json({ ok: true, queued: listings.length });
  processBulkDelete(listings).catch(console.error);
});

// POST copy selected listings to another store as a draft (both locally and
// on Printify, same rules as Save as Draft) — never auto-publishes, so the
// user can review each copy before it goes live in the new store.
// Backgrounded for the same reason as bulk-publish/bulk-delete — the caller
// gets the new batch id back immediately and can watch it on the History page.
router.post("/listings/bulk-copy", async (req, res) => {
  const userId = (req as any).userId;
  const { ids, targetShopId } = req.body as { ids: string[]; targetShopId: string };

  const targetShop = await prisma.shop.findFirst({
    where: { id: targetShopId, ...usableShopWhere(userId) },
    include: { account: true },
  });
  if (!targetShop) return res.status(409).json({ error: "Target store is disabled or unavailable" });

  const listings = await prisma.listing.findMany({
    where: { id: { in: ids }, batch: { userId } },
    include: { designs: true },
  });
  if (listings.length !== new Set(ids).size) {
    return res.status(404).json({ error: "One or more products were not found" });
  }

  const batch = await prisma.publishBatch.create({
    data: { userId, shopIds: [targetShopId], total: listings.length },
  });

  res.json({ ok: true, queued: listings.length, batchId: batch.id });
  processBulkCopy(listings, targetShop, batch.id).catch(console.error);
});

export default router;

// Deterministic, non-white swatch color for a variant — real garment color
// isn't stored locally (Listing.variants only has {id, price, is_enabled}),
// so this just needs to contrast against a light/white design, not be exact.
function swatchColor(variantId: number): string {
  const hue = (variantId * 137) % 360; // golden-angle spread, avoids clustering
  return `hsl(${hue}, 45%, 55%)`;
}

// Reduces a Listing row down to what the products table needs.
function summarizeListing(l: any, catalogOptions?: Map<number, { color: string; size: string }>) {
  const variants = l.variants as any[];
  const enabledVariants = variants.filter((v) => v.is_enabled).length;
  const firstVariant = variants.find((v) => v.is_enabled) ?? variants[0];

  // Listing.variants only ever stores {id, price, is_enabled} — color/size
  // per id comes from Printify's catalog (see fetchCatalogOptions), so this
  // is only available when that lookup succeeded for this blueprint/provider.
  let variantSummary: string | null = null;
  if (catalogOptions) {
    const colors = new Set<string>();
    const sizes = new Set<string>();
    for (const v of variants) {
      const opt = catalogOptions.get(v.id);
      if (opt) { colors.add(opt.color); sizes.add(opt.size); }
    }
    if (colors.size > 0 || sizes.size > 0) {
      variantSummary = `${colors.size} color${colors.size === 1 ? "" : "s"} · ${sizes.size} size${sizes.size === 1 ? "" : "s"} · Total ${variants.length} variants`;
    }
  }

  // The design shown is whichever one actually prints on the first variant:
  // an explicit override for it if one exists, else the position's default.
  const candidates = (l.designs as any[]).filter(
    (d) => d.variantIds.length === 0 || d.variantIds.includes(firstVariant?.id)
  );
  const design =
    candidates.find((d) => d.variantIds.length > 0 && d.position === "front") ??
    candidates.find((d) => d.variantIds.length > 0) ??
    candidates.find((d) => d.position === "front") ??
    candidates[0] ??
    l.designs[0];

  return {
    id: l.id,
    title: l.title,
    shop: l.shop.title,
    shopId: l.shop.id,
    shopEnabled: l.shop.enabled,
    shopStatus: l.shop.status,
    accountTokenStatus: l.shop.account.tokenStatus,
    blueprintLabel: l.blueprintLabel,
    printProviderLabel: l.printProviderLabel,
    thumbnail: design?.thumbUrl ?? design?.fileUrl ?? null,
    thumbnailColor: firstVariant ? swatchColor(firstVariant.id) : null,
    totalVariants: variants.length,
    enabledVariants,
    status: l.status as string,
    errorMessage: l.errorMessage as string | null,
    hasPrintifyProduct: Boolean(l.printifyProductId),
    // Not tracked locally and Printify's product API doesn't report it either
    // — would need order aggregation (GET /shops/:id/orders.json) to make real.
    sales: 0,
    variantSummary,
  };
}


// What Printify itself needs just to create the product (even unpublished) —
// title, blueprint/provider, and at least one variant. Designs/print_areas
// are NOT required to create a product on Printify, only to actually publish
// it (see listingPublishErrors) — so a "Save as Draft" can go out with no
// design yet, but a real Publish can't.
function listingDraftErrors(listing: any): string[] {
  const errors: string[] = [];
  if (!listing.shopId) errors.push("store not selected");
  if (!listing.title?.trim()) errors.push("title is empty");
  if (!listing.blueprintId || !listing.printProviderId) errors.push("blueprint/provider not selected");
  if (!listing.variants || listing.variants.length === 0) errors.push("no variants selected");
  return errors;
}

// A listing's designs/tags requirements before it can be published for real.
function listingPublishErrors(listing: any): string[] {
  const errors: string[] = [...listingDraftErrors(listing)];
  if (listing.designs.length === 0) {
    errors.push("no designs");
    return errors;
  }
  for (const design of listing.designs) {
    if (design.uploadStatus !== "synced") errors.push("design not synced");
  }
  if (listing.tags.length > 13) errors.push(`${listing.tags.length} tags (max 13)`);
  return errors;
}

// --- Background worker ---
async function processBatch(batch: any) {
  for (const listing of batch.listings) {
    try {
      await prisma.listing.update({ where: { id: listing.id }, data: { status: "creating" } });

      const shop = await prisma.shop.findUnique({
        where: { id: listing.shopId },
        include: { account: true },
      });
      if (!shop) throw new Error("Shop not found");
      const accessError = shopAccessError(shop);
      if (accessError) throw new Error(accessError);

      const { printifyProductId, status } = listing.printifyProductId
        ? await updateAndPublish(listing, shop)
        : await createOnPrintify(listing, shop, { publish: true });
      await prisma.listing.update({ where: { id: listing.id }, data: { status, printifyProductId } });

    } catch (err: any) {
      await prisma.listing.update({
        where: { id: listing.id },
        data: { status: "failed", errorMessage: err.message },
      });
    }
  }
}

// Backs POST /listings/bulk-publish — each item gets its own try/catch so one
// failure (or a printifyFetch timeout) can't abort the rest of the selection.
async function processBulkPublish(listings: any[]) {
  for (const listing of listings) {
    try {
      const accessError = shopAccessError(listing.shop);
      if (accessError) throw new Error(accessError);
      const errors = listingPublishErrors(listing);
      if (errors.length > 0) throw new Error(errors.join(", "));
      await prisma.listing.update({ where: { id: listing.id }, data: { status: "creating" } });
      const { printifyProductId, status } = listing.printifyProductId
        ? await updateAndPublish(listing, listing.shop)
        : await createOnPrintify(listing, listing.shop, { publish: true });
      await prisma.listing.update({ where: { id: listing.id }, data: { status, printifyProductId, errorMessage: null } });
    } catch (err: any) {
      await prisma.listing.update({ where: { id: listing.id }, data: { status: "failed", errorMessage: err.message } });
    }
  }
}

// Backs POST /listings/bulk-delete — same per-item isolation as above.
async function processBulkDelete(listings: any[]) {
  for (const listing of listings) {
    try {
      if (listing.printifyProductId) {
        const accessError = shopAccessError(listing.shop);
        if (accessError) throw new Error(accessError);
        const delRes = await printifyFetch(
          `https://api.printify.com/v1/shops/${listing.shop.printifyShopId}/products/${listing.printifyProductId}.json`,
          { method: "DELETE", headers: { Authorization: `Bearer ${decryptToken(listing.shop.account.accessToken)}` } }
        );
        if (!delRes.ok && delRes.status !== 404) continue; // still live on Printify — don't orphan it by deleting our copy
      }
      await prisma.listingDesign.deleteMany({ where: { listingId: listing.id } });
      await prisma.listing.delete({ where: { id: listing.id } });
    } catch (err) {
      console.error(`Bulk delete failed for listing ${listing.id}:`, err);
    }
  }
}

// Backs POST /listings/bulk-copy — the outer try/catch covers the copy's own
// creation failing (not just the later Printify call), since that step can
// no longer fail the whole HTTP request the way it used to when this ran
// synchronously.
async function processBulkCopy(listings: any[], targetShop: any, batchId: string) {
  for (const listing of listings) {
    try {
      const copy = await prisma.listing.create({
        data: {
          batchId,
          shopId: targetShop.id,
          blueprintId: listing.blueprintId,
          blueprintLabel: listing.blueprintLabel,
          printProviderId: listing.printProviderId,
          printProviderLabel: listing.printProviderLabel,
          title: listing.title,
          description: listing.description,
          tags: listing.tags,
          variants: listing.variants as any,
          designs: {
            create: listing.designs.map((d: any) => ({
              position: d.position,
              variantIds: d.variantIds,
              fileUrl: d.fileUrl,
              thumbUrl: d.thumbUrl,
              printifyImageId: d.printifyImageId,
              x: d.x, y: d.y, scale: d.scale, angle: d.angle,
              uploadStatus: d.uploadStatus,
            })),
          },
        },
        include: { designs: true },
      });

      // Not ready for even a draft on Printify (e.g. no title) — the copy
      // still exists, just as a local-only draft, same as Save as Draft.
      if (listingDraftErrors(copy).length > 0) {
        continue;
      }

      try {
        const { printifyProductId, status } = await createOnPrintify(copy, targetShop, { publish: false });
        await prisma.listing.update({ where: { id: copy.id }, data: { status, printifyProductId } });
      } catch (err: any) {
        await prisma.listing.update({ where: { id: copy.id }, data: { status: "failed", errorMessage: err.message } });
      }
    } catch (err) {
      console.error(`Bulk copy failed for listing ${listing.id}:`, err);
    }
  }
}
