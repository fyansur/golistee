import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { auth } from "../lib/middleware.js";
import { fetchCatalogOptionsByCombo, comboKey } from "../lib/catalogOptions.js";
import { pageParams } from "../lib/pagination.js";

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
  const ownedCount = await prisma.shop.count({ where: { id: { in: shopIds }, account: { userId } } });
  if (ownedCount !== shopIds.length) {
    return res.status(403).json({ error: "One or more stores don't belong to this account" });
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
    include: { listings: { include: { designs: true } } },
  });
  res.json(updated);
});

// POST publish batch — always a real publish to the sales channel.
router.post("/batch/:batchId/publish", async (req, res) => {
  const userId = (req as any).userId;
  const batch = await prisma.publishBatch.findFirst({
    where: { id: req.params.batchId, userId },
    include: { listings: { include: { designs: true } } },
  });
  if (!batch) return res.status(404).json({ error: "Batch not found" });

  const errors: string[] = [];
  for (const listing of batch.listings) {
    for (const e of listingPublishErrors(listing)) errors.push(`${listing.title} — ${e}`);
  }

  if (errors.length > 0) {
    return res.status(400).json({ error: "Publish cancelled", details: errors });
  }

  await prisma.publishBatch.update({
    where: { id: batch.id },
    data: { status: "queued" },
  });

  processBatch(batch).catch(console.error);

  res.json({ ok: true, message: "Batch queued" });
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
    batches.flatMap((b) => b.listings).map((l) => ({ blueprintId: l.blueprintId, printProviderId: l.printProviderId, accessToken: l.shop?.account?.accessToken }))
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
    const delRes = await fetch(
      `https://api.printify.com/v1/shops/${listing.shop.printifyShopId}/products/${listing.printifyProductId}.json`,
      { method: "DELETE", headers: { Authorization: `Bearer ${listing.shop.account.accessToken}` } }
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
    include: { designs: true, batch: true },
  });
  if (!listing || listing.batch.userId !== userId) {
    return res.status(404).json({ error: "Listing not found" });
  }
  res.json(listing);
});

// PUT edit a listing — local fields always saved. `publish: true` pushes the
// edit live (creating the product on Printify first if it's never been
// pushed at all). `publish: false` is now also "Save as Draft" — it tries to
// create the product on Printify as unpublished (same as a fresh batch save)
// if it's never touched Printify yet; a listing already live there instead
// drifts to "out of sync" until the next explicit publish.
router.put("/listing/:id", async (req, res) => {
  const userId = (req as any).userId;
  const { title, description, tags, variants, designs, publish } = req.body;

  const listing = await prisma.listing.findUnique({
    where: { id: req.params.id },
    include: { batch: true, shop: { include: { account: true } } },
  });
  if (!listing || listing.batch.userId !== userId) {
    return res.status(404).json({ error: "Listing not found" });
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
    if (listing.printifyProductId) {
      // Already live somewhere — a local-only edit just drifts it out of sync.
      await prisma.listing.update({ where: { id: listing.id }, data: { status: "out_of_sync" } });
    } else {
      // First-ever save — try to draft it on Printify too, same as a fresh
      // batch save; if it's not ready yet, it just stays a local-only draft.
      const freshListing = await prisma.listing.findUnique({ where: { id: listing.id }, include: { designs: true } });
      if (listingDraftErrors(freshListing!).length === 0) {
        try {
          const { printifyProductId, status } = await createOnPrintify(freshListing, listing.shop, { publish: false });
          await prisma.listing.update({ where: { id: listing.id }, data: { status, printifyProductId, errorMessage: null } });
        } catch (err: any) {
          await prisma.listing.update({ where: { id: listing.id }, data: { status: "failed", errorMessage: err.message } });
        }
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

    const token = listing.shop.account.accessToken;
    const payload: any = { title, description: description ?? "", tags: tags ?? [], variants };

    if (includeDesigns) {
      // print_areas must cover every variant Printify has on this product
      // (the full blueprint range), not just the ones we've enabled —
      // Printify treats print coverage and for-sale status as separate
      // things, and rejects the update ("Variants do not match...") if
      // print_areas doesn't cover the full set.
      const currentRes = await fetch(
        `https://api.printify.com/v1/shops/${listing.shop.printifyShopId}/products/${listing.printifyProductId}.json`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const current = await currentRes.json() as any;
      const allVariantIds = current.variants.map((v: any) => v.id);
      payload.print_areas = buildPrintAreas(designs, allVariantIds);
    }

    const putRes = await fetch(
      `https://api.printify.com/v1/shops/${listing.shop.printifyShopId}/products/${listing.printifyProductId}.json`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    const product = await putRes.json() as any;
    if (!putRes.ok) {
      console.error("Printify PUT failed:", JSON.stringify(product));
      throw new Error(product.message ?? JSON.stringify(product.errors ?? product));
    }

    // An explicit Publish always pushes live now.
    await publishToSalesChannel(listing.shop.printifyShopId, token, listing.printifyProductId);

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
    listings.map((l) => ({ blueprintId: l.blueprintId, printProviderId: l.printProviderId, accessToken: l.shop?.account?.accessToken }))
  );
  res.json({
    items: listings.map((l) => summarizeListing(l, catalogByCombo.get(comboKey(l.blueprintId, l.printProviderId)))),
    total,
  });
});

// POST bulk publish — used by the Products page's multi-select toolbar.
router.post("/listings/bulk-publish", async (req, res) => {
  const userId = (req as any).userId;
  const { ids } = req.body as { ids: string[] };
  const listings = await prisma.listing.findMany({
    where: { id: { in: ids }, batch: { userId } },
    include: { designs: true, shop: { include: { account: true } } },
  });

  let published = 0, failed = 0;
  for (const listing of listings) {
    try {
      const errors = listingPublishErrors(listing);
      if (errors.length > 0) throw new Error(errors.join(", "));
      const { printifyProductId, status } = listing.printifyProductId
        ? await updateAndPublish(listing, listing.shop)
        : await createOnPrintify(listing, listing.shop, { publish: true });
      await prisma.listing.update({ where: { id: listing.id }, data: { status, printifyProductId, errorMessage: null } });
      published++;
    } catch (err: any) {
      await prisma.listing.update({ where: { id: listing.id }, data: { status: "failed", errorMessage: err.message } });
      failed++;
    }
  }

  res.json({ ok: true, published, failed });
});

// POST bulk delete
router.post("/listings/bulk-delete", async (req, res) => {
  const userId = (req as any).userId;
  const { ids } = req.body as { ids: string[] };
  const listings = await prisma.listing.findMany({
    where: { id: { in: ids }, batch: { userId } },
    include: { shop: { include: { account: true } } },
  });

  let deleted = 0, failed = 0;
  for (const listing of listings) {
    if (listing.printifyProductId) {
      const delRes = await fetch(
        `https://api.printify.com/v1/shops/${listing.shop.printifyShopId}/products/${listing.printifyProductId}.json`,
        { method: "DELETE", headers: { Authorization: `Bearer ${listing.shop.account.accessToken}` } }
      );
      if (!delRes.ok && delRes.status !== 404) {
        failed++;
        continue; // still live on Printify — don't orphan it by deleting our copy
      }
    }
    await prisma.listingDesign.deleteMany({ where: { listingId: listing.id } });
    await prisma.listing.delete({ where: { id: listing.id } });
    deleted++;
  }

  res.json({ ok: true, deleted, failed });
});

// POST copy selected listings to another store as a draft (both locally and
// on Printify, same rules as Save as Draft) — never auto-publishes, so the
// user can review each copy before it goes live in the new store.
router.post("/listings/bulk-copy", async (req, res) => {
  const userId = (req as any).userId;
  const { ids, targetShopId } = req.body as { ids: string[]; targetShopId: string };

  const targetShop = await prisma.shop.findFirst({ where: { id: targetShopId, account: { userId } }, include: { account: true } });
  if (!targetShop) return res.status(404).json({ error: "Target store not found" });

  const listings = await prisma.listing.findMany({
    where: { id: { in: ids }, batch: { userId } },
    include: { designs: true },
  });

  const batch = await prisma.publishBatch.create({
    data: { userId, shopIds: [targetShopId], total: listings.length },
  });

  let copied = 0, failed = 0, localOnly = 0;
  for (const listing of listings) {
    const copy = await prisma.listing.create({
      data: {
        batchId: batch.id,
        shopId: targetShopId,
        blueprintId: listing.blueprintId,
        blueprintLabel: listing.blueprintLabel,
        printProviderId: listing.printProviderId,
        printProviderLabel: listing.printProviderLabel,
        title: listing.title,
        description: listing.description,
        tags: listing.tags,
        variants: listing.variants as any,
        designs: {
          create: listing.designs.map((d) => ({
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
      localOnly++;
      continue;
    }

    try {
      const { printifyProductId, status } = await createOnPrintify(copy, targetShop, { publish: false });
      await prisma.listing.update({ where: { id: copy.id }, data: { status, printifyProductId } });
      copied++;
    } catch (err: any) {
      await prisma.listing.update({ where: { id: copy.id }, data: { status: "failed", errorMessage: err.message } });
      failed++;
    }
  }

  await prisma.publishBatch.update({ where: { id: batch.id }, data: { status: "done", successCount: copied + localOnly, failedCount: failed } });
  res.json({ ok: true, copied, failed, localOnly });
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

// Creates a listing on Printify for the first time (it has no printifyProductId
// yet). `publish: false` leaves it sitting on Printify as an unpublished
// product ("draft on Printify" — status shows this in Printify's own
// dashboard); `publish: true` also pushes it live to the shop's sales channel.
async function createOnPrintify(listing: any, shop: any, opts: { publish: boolean }) {
  const token = shop.account.accessToken;
  const allVariantIds = (listing.variants as any[]).map((v: any) => v.id);
  const printAreas = buildPrintAreas(listing.designs ?? [], allVariantIds);

  const createRes = await fetch(
    `https://api.printify.com/v1/shops/${shop.printifyShopId}/products.json`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        title: listing.title,
        description: listing.description,
        tags: listing.tags,
        blueprint_id: listing.blueprintId,
        print_provider_id: listing.printProviderId,
        variants: listing.variants,
        print_areas: printAreas,
      }),
    }
  );

  const product = await createRes.json() as any;
  if (!createRes.ok) throw new Error(product.message ?? "Create failed");

  if (opts.publish) {
    await publishToSalesChannel(shop.printifyShopId, token, product.id);
  }

  return { printifyProductId: product.id as string, status: opts.publish ? "published" : "draft_on_printify" };
}

// Updates an already-created Printify product with its current local data and
// publishes it — used by bulk publish for listings that are already "draft
// on Printify" or "out of sync" and just need pushing live.
async function updateAndPublish(listing: any, shop: any) {
  const token = shop.account.accessToken;
  const allVariantIds = (listing.variants as any[]).map((v: any) => v.id);
  const payload = {
    title: listing.title,
    description: listing.description,
    tags: listing.tags,
    variants: listing.variants,
    print_areas: buildPrintAreas(listing.designs ?? [], allVariantIds),
  };

  const putRes = await fetch(
    `https://api.printify.com/v1/shops/${shop.printifyShopId}/products/${listing.printifyProductId}.json`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );
  const product = await putRes.json() as any;
  if (!putRes.ok) throw new Error(product.message ?? "Update failed");

  await publishToSalesChannel(shop.printifyShopId, token, listing.printifyProductId);
  return { printifyProductId: listing.printifyProductId as string, status: "published" };
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

      const { printifyProductId, status } = listing.printifyProductId
        ? await updateAndPublish(listing, shop)
        : await createOnPrintify(listing, shop, { publish: true });
      await prisma.listing.update({ where: { id: listing.id }, data: { status, printifyProductId } });

      await prisma.publishBatch.update({
        where: { id: batch.id },
        data: { successCount: { increment: 1 } },
      });
    } catch (err: any) {
      await prisma.listing.update({
        where: { id: listing.id },
        data: { status: "failed", errorMessage: err.message },
      });
      await prisma.publishBatch.update({
        where: { id: batch.id },
        data: { failedCount: { increment: 1 } },
      });
    }
  }

  await prisma.publishBatch.update({
    where: { id: batch.id },
    data: { status: "done" },
  });
}

// Pushes a product's current data (title/description/images/variants/tags) to
// its connected sales channel (Etsy, Shopify, ...). Printify itself doesn't
// auto-sync this on every edit — a product only actually goes live/updates
// there when this is called.
async function publishToSalesChannel(printifyShopId: string, token: string, productId: string) {
  const res = await fetch(
    `https://api.printify.com/v1/shops/${printifyShopId}/products/${productId}/publish.json`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title: true, description: true, images: false, variants: true, tags: true }),
    }
  );
  if (!res.ok) throw new Error("Publish failed");
}

function buildPrintAreas(designs: any[], allVariantIds: number[]) {
  return designs.map((d) => {
    // empty variantIds = default design: applies to every selected variant
    // except the ones another design already overrides for this position.
    const isDefault = (d.variantIds?.length ?? 0) === 0;
    const overriddenElsewhere = isDefault
      ? designs
        .filter((o) => o !== d && o.position === d.position && (o.variantIds?.length ?? 0) > 0)
        .flatMap((o) => o.variantIds)
      : [];

    return {
      variant_ids: isDefault
        ? allVariantIds.filter((id) => !overriddenElsewhere.includes(id))
        : d.variantIds,
      placeholders: [{
        position: d.position,
        images: [{
          id: d.printifyImageId,
          x: d.x, y: d.y, scale: d.scale, angle: d.angle,
        }],
      }],
    };
  });
}
