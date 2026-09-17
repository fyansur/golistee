import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { auth } from "../lib/middleware.js";
import { fetchCatalogOptionsByCombo, comboKey } from "../lib/catalogOptions.js";
import { pageParams } from "../lib/pagination.js";
import { PrintifyError, printifyFetch } from "../lib/printify.js";
import { decryptToken } from "../lib/crypto.js";
import { createOnPrintify, statusAfterPrintifyDraft, updateAndPublish, updateOnPrintify } from "../lib/listingPublish.js";
import { shopAccessError, usableShopWhere } from "../lib/shopAccess.js";
import { newJob, type JobHandler } from "../lib/backgroundJobs.js";

const router = Router();
router.use(auth);
const MAX_BATCH_SIZE = 100;

function requestIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const ids = [...new Set(value.map(String))];
  return ids.length > 0 && ids.length <= MAX_BATCH_SIZE ? ids : null;
}

// POST create batch + listings. `draftOnPrintify: true` (Save as Draft)
// additionally tries to create each ready-enough listing on Printify as an
// unpublished product — one missing title/blueprint/variants just stays a
// local-only draft until it has enough to qualify.
router.post("/batch", async (req, res) => {
  const userId = (req as any).userId;
  const { listings, draftOnPrintify } = req.body;
  if (!Array.isArray(listings) || listings.length === 0 || listings.length > MAX_BATCH_SIZE) {
    return res.status(400).json({ error: `A batch must contain 1-${MAX_BATCH_SIZE} products` });
  }

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
    const ids = batch.listings.filter((listing) => listingDraftErrors(listing).length === 0).map(({ id }) => id);
    if (ids.length > 0) {
      await prisma.$transaction([
        prisma.listing.updateMany({ where: { id: { in: ids } }, data: { status: "draft_queued", errorMessage: null } }),
        prisma.backgroundJob.createMany({ data: ids.map((id) => newJob("create_draft", { id }, userId)) }),
      ]);
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
  if (batch.listings.some((listing) => ["queued", "draft_queued", "creating", "scheduled"].includes(listing.status))) {
    return res.status(409).json({ error: "One or more products already have an operation in progress" });
  }

  const errors: string[] = [];
  for (const listing of batch.listings) {
    const accessError = shopAccessError(listing.shop);
    if (accessError) errors.push(`${listing.title} — ${accessError}`);
    for (const e of listingPublishErrors(listing)) errors.push(`${listing.title} — ${e}`);
  }

  if (errors.length > 0) {
    return res.status(400).json({ error: "Publish cancelled", details: errors });
  }

  const ids = batch.listings.map(({ id }) => id);
  await prisma.$transaction([
    prisma.listing.updateMany({
      where: { batchId: batch.id, status: { notIn: ["queued", "draft_queued", "creating", "scheduled"] } },
      data: { status: "queued", errorMessage: null },
    }),
    prisma.backgroundJob.createMany({ data: ids.map((id) => newJob("publish_listing", { id }, userId)) }),
  ]);

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
    if (["queued", "draft_queued", "creating", "scheduled"].includes(listing.status)) {
      return res.status(409).json({ error: "This product already has an operation in progress" });
    }
  }

  const includeDesigns = Array.isArray(designs);
  await prisma.$transaction(async (tx) => {
    if (includeDesigns) {
      await tx.listingDesign.deleteMany({ where: { listingId: listing.id } });
      await tx.listingDesign.createMany({
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
    await tx.listing.update({
      where: { id: listing.id },
      data: { title, description: description ?? "", tags: tags ?? [], variants },
    });
  });

  if (!publish) {
    const freshListing = await prisma.listing.findUnique({ where: { id: listing.id }, include: { designs: true } });
    if (!draftOnPrintify) {
      await prisma.listing.update({
        where: { id: listing.id },
        data: {
          status: listing.status === "scheduled"
            ? "scheduled"
            : listing.printifyProductId ? "out_of_sync" : "draft",
          errorMessage: null,
        },
      });
    } else if (listingDraftErrors(freshListing!).length === 0) {
      await prisma.$transaction([
        prisma.listing.update({
          where: { id: listing.id },
          data: { status: "draft_queued", errorMessage: null },
        }),
        prisma.backgroundJob.create({ data: newJob("create_draft", { id: listing.id }, userId) }),
      ]);
    }
    const updated = await prisma.listing.findUnique({ where: { id: listing.id }, include: { designs: true } });
    return res.json(updated);
  }

  const freshListing = await prisma.listing.findUnique({ where: { id: listing.id }, include: { designs: true } });
  const validationErrors = listingPublishErrors(freshListing!);
  if (validationErrors.length > 0) {
    return res.status(400).json({ error: `Cannot publish: ${validationErrors.join(", ")}` });
  }

  await prisma.$transaction([
    prisma.listing.update({
      where: { id: listing.id },
      data: { status: "queued", errorMessage: null },
    }),
    prisma.backgroundJob.create({ data: newJob("publish_listing", { id: listing.id }, userId) }),
  ]);
  const updated = await prisma.listing.findUnique({ where: { id: listing.id }, include: { designs: true } });
  res.json(updated);
});

// GET the products list — our own Listing rows are the source of truth,
// not Printify's live shop data.
router.get("/listings", async (req, res) => {
  const userId = (req as any).userId;
  const { shopId, status, search } = req.query;
  const shopIds = shopId ? String(shopId).split(",").filter(Boolean) : [];
  const where = {
    batch: { userId },
    ...(shopIds.length ? { shopId: { in: shopIds } } : {}),
    ...(status ? { status: String(status) } : {}),
    ...(search ? { title: { contains: String(search), mode: "insensitive" as const } } : {}),
  };
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
  const sales = await fetchSalesByProduct(listings);
  res.json({
    items: listings.map((l) => summarizeListing(l, catalogByCombo.get(comboKey(l.blueprintId, l.printProviderId)), sales)),
    total,
  });
});

// Sums each listing's Order.lineItems across its shop's orders — a line
// item's product_id matches Listing.printifyProductId. Canceled orders don't
// count as sales. One query for the whole page rather than one per listing.
async function fetchSalesByProduct(listings: { shopId: string; printifyProductId: string | null }[]) {
  const productIds = [...new Set(listings.flatMap((l) => l.printifyProductId ? [l.printifyProductId] : []))];
  const sales = new Map<string, number>();
  if (productIds.length === 0) return sales;
  const shopIds = [...new Set(listings.map((l) => l.shopId))];

  const rows = await prisma.$queryRaw<{ shopId: string; productId: string; unitsSold: bigint }[]>`
    SELECT o."shopId" as "shopId", item->>'product_id' as "productId",
      SUM((item->>'quantity')::int) as "unitsSold"
    FROM "Order" o
    CROSS JOIN LATERAL jsonb_array_elements(o."lineItems") AS item
    WHERE o.status != 'canceled'
      AND o."shopId" = ANY(${shopIds})
      AND item->>'product_id' = ANY(${productIds})
    GROUP BY o."shopId", item->>'product_id'
  `;
  for (const row of rows) {
    sales.set(`${row.shopId}:${row.productId}`, Number(row.unitsSold));
  }
  return sales;
}

router.post("/listings/schedule", async (req, res) => {
  const userId = (req as any).userId;
  const ids = requestIds(req.body.ids);
  const publishAt = new Date(String(req.body.publishAt ?? ""));
  if (!ids) return res.status(400).json({ error: `Select 1-${MAX_BATCH_SIZE} products` });
  if (!Number.isFinite(publishAt.getTime()) || publishAt.getTime() < Date.now() + 60_000) {
    return res.status(400).json({ error: "Schedule at least 1 minute in the future" });
  }

  const listings = await prisma.listing.findMany({
    where: { id: { in: ids }, batch: { userId } },
    include: { designs: true, shop: { include: { account: true } } },
  });
  if (listings.length !== ids.length) return res.status(404).json({ error: "One or more products were not found" });
  const blocked = listings.find((listing) => shopAccessError(listing.shop));
  if (blocked) return res.status(409).json({ error: shopAccessError(blocked.shop) });
  if (listings.some((listing) => ["queued", "draft_queued", "creating", "scheduled"].includes(listing.status))) {
    return res.status(409).json({ error: "One or more products already have an operation in progress" });
  }
  const errors = listings.flatMap((listing) =>
    listingPublishErrors(listing).map((error) => `${listing.title || "Untitled"} — ${error}`)
  );
  if (errors.length > 0) return res.status(400).json({ error: "Cannot schedule publishing", details: errors });

  const scheduledAt = publishAt.toISOString();
  await prisma.$transaction([
    prisma.listing.updateMany({
      where: { id: { in: ids } },
      data: { status: "scheduled", scheduledPublishAt: publishAt, errorMessage: null },
    }),
    prisma.backgroundJob.createMany({
      data: ids.map((id) => ({
        ...newJob("publish_listing", { id, scheduledAt }, userId),
        runAt: publishAt,
      })),
    }),
  ]);
  res.json({ ok: true, scheduled: ids.length, publishAt: scheduledAt });
});

router.post("/listings/cancel-schedule", async (req, res) => {
  const userId = (req as any).userId;
  const ids = requestIds(req.body.ids);
  if (!ids) return res.status(400).json({ error: `Select 1-${MAX_BATCH_SIZE} products` });
  const listings = await prisma.listing.findMany({
    where: { id: { in: ids }, batch: { userId }, status: "scheduled" },
    select: { id: true, printifyProductId: true, lastPublishedAt: true, scheduledPublishAt: true },
  });
  if (listings.length !== ids.length) return res.status(409).json({ error: "One or more products are not scheduled" });

  await prisma.$transaction(async (tx) => {
    await tx.backgroundJob.deleteMany({
      where: {
        type: "publish_listing",
        status: "pending",
        OR: listings.map((listing) => ({
          payload: { equals: { id: listing.id, scheduledAt: listing.scheduledPublishAt!.toISOString() } },
        })),
      },
    });
    for (const listing of listings) {
      await tx.listing.update({
        where: { id: listing.id },
        data: {
          status: listing.printifyProductId
            ? listing.lastPublishedAt ? "out_of_sync" : "draft_on_printify"
            : "draft",
          scheduledPublishAt: null,
        },
      });
    }
  });
  res.json({ ok: true, canceled: listings.length });
});

// POST bulk publish — used by the Products page's multi-select toolbar.
// Backgrounded like /batch/:batchId/publish: a real selection can be dozens
// of sequential Printify round-trips, which would otherwise hold the HTTP
// request open for minutes. The client sees per-row status update on its
// next fetch instead of an exact count in the response.
router.post("/listings/bulk-publish", async (req, res) => {
  const userId = (req as any).userId;
  const ids = requestIds(req.body.ids);
  if (!ids) return res.status(400).json({ error: `Select 1-${MAX_BATCH_SIZE} products` });
  const listings = await prisma.listing.findMany({
    where: { id: { in: ids }, batch: { userId } },
    include: { designs: true, shop: { include: { account: true } } },
  });

  if (listings.length !== new Set(ids).size) {
    return res.status(404).json({ error: "One or more products were not found" });
  }
  const blocked = listings.find((listing) => shopAccessError(listing.shop));
  if (blocked) return res.status(409).json({ error: shopAccessError(blocked.shop) });
  if (listings.some((listing) => ["queued", "draft_queued", "creating", "scheduled"].includes(listing.status))) {
    return res.status(409).json({ error: "One or more products already have an operation in progress" });
  }

  await prisma.$transaction([
    prisma.listing.updateMany({
      where: { id: { in: ids }, status: { notIn: ["queued", "creating", "scheduled"] } },
      data: { status: "queued", errorMessage: null },
    }),
    prisma.backgroundJob.createMany({ data: ids.map((id) => newJob("publish_listing", { id }, userId)) }),
  ]);
  res.json({ ok: true, queued: listings.length });
});

// POST bulk delete — same backgrounding rationale as bulk-publish.
router.post("/listings/bulk-delete", async (req, res) => {
  const userId = (req as any).userId;
  const ids = requestIds(req.body.ids);
  if (!ids) return res.status(400).json({ error: `Select 1-${MAX_BATCH_SIZE} products` });
  const listings = await prisma.listing.findMany({
    where: { id: { in: ids }, batch: { userId } },
    include: { shop: { include: { account: true } } },
  });

  if (listings.length !== new Set(ids).size) {
    return res.status(404).json({ error: "One or more products were not found" });
  }
  const blocked = listings.find((listing) => listing.printifyProductId && shopAccessError(listing.shop));
  if (blocked) return res.status(409).json({ error: shopAccessError(blocked.shop) });

  await prisma.backgroundJob.createMany({ data: ids.map((id) => newJob("delete_listing", { id }, userId)) });
  res.json({ ok: true, queued: listings.length });
});

// POST copy selected listings to another store as a draft (both locally and
// on Printify, same rules as Save as Draft) — never auto-publishes, so the
// user can review each copy before it goes live in the new store.
// Backgrounded for the same reason as bulk-publish/bulk-delete — the caller
// gets the new batch id back immediately and can watch it on the History page.
router.post("/listings/bulk-copy", async (req, res) => {
  const userId = (req as any).userId;
  const ids = requestIds(req.body.ids);
  const targetShopId = String(req.body.targetShopId ?? "");
  if (!ids) return res.status(400).json({ error: `Select 1-${MAX_BATCH_SIZE} products` });

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

  const batch = await prisma.$transaction(async (tx) => {
    const created = await tx.publishBatch.create({
      data: { userId, shopIds: [targetShopId], total: listings.length },
    });
    await tx.backgroundJob.createMany({
      data: ids.map((id) => newJob("copy_listing", { id, targetShopId, batchId: created.id }, userId)),
    });
    return created;
  });

  res.json({ ok: true, queued: listings.length, batchId: batch.id });
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
function summarizeListing(
  l: any,
  catalogOptions?: Map<number, { color: string; size: string }>,
  sales?: Map<string, number>,
) {
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
    scheduledPublishAt: l.scheduledPublishAt as Date | null,
    errorMessage: l.errorMessage as string | null,
    hasPrintifyProduct: Boolean(l.printifyProductId),
    // Units sold, aggregated from synced Order.lineItems (see
    // fetchSalesByProduct) — 0 until orders have been synced at least once.
    unitsSold: sales?.get(`${l.shop.id}:${l.printifyProductId}`) ?? 0,
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

// --- Durable background worker handlers ---
const staleListingClaim = () => new Date(Date.now() - 15 * 60_000);
const retryablePrintifyError = (error: unknown) =>
  error instanceof PrintifyError && (error.status === 429 || error.status >= 500);

async function claimListing(
  id: string,
  queuedStatus: "queued" | "draft_queued" | "scheduled",
  scheduledAt?: string,
) {
  const staleBefore = staleListingClaim();
  const previous = await prisma.listing.findUnique({
    where: { id },
    select: { status: true, processingStartedAt: true, printifyProductId: true, scheduledPublishAt: true },
  });
  if (!previous) return null;
  if (queuedStatus === "scheduled" && previous.scheduledPublishAt?.toISOString() !== scheduledAt) return null;

  const claimed = await prisma.listing.updateMany({
    where: {
      id,
      ...(queuedStatus === "scheduled" ? { scheduledPublishAt: new Date(scheduledAt!) } : {}),
      OR: [
        { status: queuedStatus },
        { status: "creating", processingStartedAt: { lt: staleBefore } },
      ],
    },
    data: { status: "creating", processingStartedAt: new Date() },
  });
  if (claimed.count === 0) return null;

  return {
    ambiguousCreate:
      previous.status === "creating" &&
      previous.processingStartedAt !== null &&
      previous.processingStartedAt < staleBefore &&
      !previous.printifyProductId,
  };
}

async function processBulkPublish(
  ids: string[],
  queuedStatus: "queued" | "scheduled" = "queued",
  scheduledAt?: string,
  attempt = 1,
  maxAttempts = 5,
) {
  for (const id of ids) {
    const claim = await claimListing(id, queuedStatus, scheduledAt);
    if (!claim) continue;
    if (claim.ambiguousCreate) {
      await prisma.listing.update({
        where: { id },
        data: {
          status: "failed",
          errorMessage: "Printify create was interrupted; verify the remote product before retrying",
          processingStartedAt: null,
          scheduledPublishAt: null,
        },
      });
      continue;
    }

    try {
      const listing = await prisma.listing.findUnique({
        where: { id },
        include: { designs: true, shop: { include: { account: true } } },
      });
      if (!listing) continue;
      const accessError = shopAccessError(listing.shop);
      if (accessError) throw new Error(accessError);
      const errors = listingPublishErrors(listing);
      if (errors.length > 0) throw new Error(errors.join(", "));
      const { printifyProductId, status } = listing.printifyProductId
        ? await updateAndPublish(listing, listing.shop)
        : await createOnPrintify(listing, listing.shop, { publish: true });
      await prisma.listing.update({
        where: { id },
        data: {
          status, printifyProductId, errorMessage: null,
          processingStartedAt: null, scheduledPublishAt: null,
        },
      });
    } catch (err: any) {
      const current = await prisma.listing.findUnique({ where: { id }, select: { printifyProductId: true } });
      if (current?.printifyProductId && retryablePrintifyError(err)) {
        await prisma.listing.update({
          where: { id },
          data: attempt >= maxAttempts
            ? { status: "failed", errorMessage: err.message, processingStartedAt: null, scheduledPublishAt: null }
            : { status: queuedStatus, errorMessage: err.message, processingStartedAt: null },
        });
        throw err;
      }
      await prisma.listing.updateMany({
        where: { id },
        data: { status: "failed", errorMessage: err.message, processingStartedAt: null, scheduledPublishAt: null },
      });
    }
  }
}

async function processDrafts(ids: string[], attempt = 1, maxAttempts = 5) {
  for (const id of ids) {
    const claim = await claimListing(id, "draft_queued");
    if (!claim) continue;
    if (claim.ambiguousCreate) {
      await prisma.listing.update({
        where: { id },
        data: {
          status: "failed",
          errorMessage: "Printify create was interrupted; verify the remote product before retrying",
          processingStartedAt: null,
        },
      });
      continue;
    }

    try {
      const listing = await prisma.listing.findUnique({
        where: { id },
        include: { designs: true, shop: { include: { account: true } } },
      });
      if (!listing) continue;
      const accessError = shopAccessError(listing.shop);
      if (accessError) throw new Error(accessError);
      if (listingDraftErrors(listing).length > 0) throw new Error(listingDraftErrors(listing).join(", "));

      if (listing.printifyProductId) {
        await updateOnPrintify(listing, listing.shop);
        await prisma.listing.update({
          where: { id },
          data: { status: statusAfterPrintifyDraft(listing.lastPublishedAt), errorMessage: null, processingStartedAt: null },
        });
      } else {
        const { printifyProductId, status } = await createOnPrintify(listing, listing.shop, { publish: false });
        await prisma.listing.update({
          where: { id },
          data: { status, printifyProductId, errorMessage: null, processingStartedAt: null },
        });
      }
    } catch (err: any) {
      const current = await prisma.listing.findUnique({ where: { id }, select: { printifyProductId: true } });
      if (current?.printifyProductId && retryablePrintifyError(err)) {
        await prisma.listing.update({
          where: { id },
          data: {
            status: attempt >= maxAttempts ? "failed" : "draft_queued",
            errorMessage: err.message,
            processingStartedAt: null,
          },
        });
        throw err;
      }
      await prisma.listing.updateMany({
        where: { id },
        data: { status: "failed", errorMessage: err.message, processingStartedAt: null },
      });
    }
  }
}

async function processBulkDelete(ids: string[]) {
  const errors: string[] = [];
  for (const id of ids) {
    const listing = await prisma.listing.findUnique({
      where: { id },
      include: { shop: { include: { account: true } } },
    });
    if (!listing) continue;
    try {
      if (listing.printifyProductId) {
        const accessError = shopAccessError(listing.shop);
        if (accessError) throw new Error(accessError);
        const delRes = await printifyFetch(
          `https://api.printify.com/v1/shops/${listing.shop.printifyShopId}/products/${listing.printifyProductId}.json`,
          { method: "DELETE", headers: { Authorization: `Bearer ${decryptToken(listing.shop.account.accessToken)}` } }
        );
        if (!delRes.ok && delRes.status !== 404) {
          throw new PrintifyError(delRes.status, "Failed to delete product on Printify");
        }
      }
      await prisma.listingDesign.deleteMany({ where: { listingId: id } });
      await prisma.listing.delete({ where: { id } });
    } catch (err) {
      if (retryablePrintifyError(err)) {
        errors.push(`${id}: ${err instanceof Error ? err.message : String(err)}`);
      } else {
        await prisma.listing.updateMany({
          where: { id },
          data: { status: "failed", errorMessage: err instanceof Error ? err.message : String(err) },
        });
      }
    }
  }
  if (errors.length > 0) throw new Error(`Bulk delete incomplete: ${errors.join("; ")}`);
}

async function processBulkCopy(ids: string[], targetShopId: string, batchId: string) {
  const targetShop = await prisma.shop.findUnique({ where: { id: targetShopId }, include: { account: true } });
  if (!targetShop) throw new Error("Target shop not found");

  const errors: string[] = [];
  for (const id of ids) {
    const listing = await prisma.listing.findUnique({ where: { id }, include: { designs: true } });
    if (!listing) continue;
    try {
      const existing = await prisma.listing.findUnique({
        where: { batchId_copiedFromListingId: { batchId, copiedFromListingId: listing.id } },
      });
      if (existing) continue;
      const copy = await prisma.listing.create({
        data: {
          batchId,
          copiedFromListingId: listing.id,
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

      if (listingDraftErrors(copy).length > 0) continue;
      try {
        const { printifyProductId, status } = await createOnPrintify(copy, targetShop, { publish: false });
        await prisma.listing.update({ where: { id: copy.id }, data: { status, printifyProductId } });
      } catch (err: any) {
        await prisma.listing.update({ where: { id: copy.id }, data: { status: "failed", errorMessage: err.message } });
      }
    } catch (err) {
      errors.push(`${listing.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (errors.length > 0) throw new Error(`Bulk copy incomplete: ${errors.join("; ")}`);
}

export const publishJobHandlers: Record<string, JobHandler> = {
  publish_listing: ({ id, scheduledAt }, attempt, maxAttempts) => processBulkPublish(
    [String(id)], scheduledAt ? "scheduled" : "queued", scheduledAt ? String(scheduledAt) : undefined,
    attempt, maxAttempts,
  ),
  create_draft: ({ id }, attempt, maxAttempts) => processDrafts([String(id)], attempt, maxAttempts),
  delete_listing: ({ id }) => processBulkDelete([String(id)]),
  copy_listing: ({ id, targetShopId, batchId }) => processBulkCopy(
    [String(id)], String(targetShopId), String(batchId)
  ),
};
