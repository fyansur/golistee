import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { auth } from "../lib/middleware.js";
import { encryptToken, decryptToken } from "../lib/crypto.js";
import { printifyFetch } from "../lib/printify.js";
import { usableShopWhere } from "../lib/shopAccess.js";

const router = Router();
router.use(auth);

// Never send the (encrypted) token to the client — it has no use for it,
// and there's no reason to put even the encrypted form on the wire.
const withoutToken = <T extends { accessToken: string }>({ accessToken, ...rest }: T) => rest;

async function fetchPrintifyShops(accessToken: string) {
  const response = await printifyFetch("https://api.printify.com/v1/shops.json", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return null;
  return response.json() as Promise<any[]>;
}

// GET all accounts
router.get("/", async (req, res) => {
  const userId = (req as any).userId;
  const accounts = await prisma.printifyAccount.findMany({
    where: { userId },
    include: { shops: { include: { _count: { select: { listings: true } } } } },
  });
  res.json(accounts.map((account) => {
    const safeAccount = withoutToken(account);
    return {
      ...safeAccount,
      shops: account.shops.map(({ _count, ...shop }) => ({
        ...shop,
        listingCount: _count.listings,
      })),
    };
  }));
});

// Every operational store picker consumes this endpoint. Connections and
// historical filters intentionally use GET / instead so they can still show
// disabled/missing stores that own existing data.
router.get("/shops", async (req, res) => {
  const userId = (req as any).userId;
  const shops = await prisma.shop.findMany({
    where: usableShopWhere(userId),
    select: { id: true, title: true, salesChannel: true, printifyAccountId: true, account: { select: { label: true } } },
    orderBy: [{ account: { connectedAt: "asc" } }, { title: "asc" }],
  });
  res.json(shops.map(({ account, ...shop }) => ({ ...shop, accountLabel: account.label })));
});

// Validate a token and preview its shops without persisting it. The client
// keeps the token only in form memory until the user confirms their selection.
router.post("/discover", async (req, res) => {
  const accessToken = String(req.body.accessToken ?? "").trim();
  if (!accessToken) return res.status(400).json({ error: "Personal access token is required" });
  const shops = await fetchPrintifyShops(accessToken);
  if (!shops) return res.status(400).json({ error: "Invalid Printify token" });
  res.json(shops.map((shop) => ({
    printifyShopId: String(shop.id),
    title: shop.title,
    salesChannel: shop.sales_channel,
  })));
});

// POST add account with the user's explicit initial store selection.
router.post("/", async (req, res) => {
  const userId = (req as any).userId;
  const label = String(req.body.label ?? "").trim();
  const accessToken = String(req.body.accessToken ?? "").trim();
  const enabledPrintifyShopIds: string[] = [...new Set<string>(
    Array.isArray(req.body.enabledPrintifyShopIds)
      ? req.body.enabledPrintifyShopIds.map(String)
      : []
  )];

  if (!label) return res.status(400).json({ error: "Label is required" });
  if (!accessToken) return res.status(400).json({ error: "Personal access token is required" });
  if (enabledPrintifyShopIds.length === 0) {
    return res.status(400).json({ error: "Select at least one store" });
  }

  // Revalidate at commit time; the preview may be stale and client-provided
  // shop IDs must never be trusted by themselves.
  const shops = await fetchPrintifyShops(accessToken);
  if (!shops) return res.status(400).json({ error: "Invalid Printify token" });
  const availableIds = new Set(shops.map((shop) => String(shop.id)));
  if (enabledPrintifyShopIds.some((id) => !availableIds.has(id))) {
    return res.status(400).json({ error: "One or more selected stores are no longer available" });
  }
  const enabledIds = new Set(enabledPrintifyShopIds);

  const account = await prisma.printifyAccount.create({
    data: {
      userId,
      label,
      accessToken: encryptToken(accessToken),
      shops: {
        create: shops.map((s: any) => ({
          printifyShopId: String(s.id),
          title: s.title,
          salesChannel: s.sales_channel,
          enabled: enabledIds.has(String(s.id)),
        })),
      },
    },
    include: { shops: true },
  });

  res.json(withoutToken(account));
});

// Replace the account's enabled-store selection. Missing stores remain visible
// in Manage Stores but cannot be selected until a later sync finds them again.
router.patch("/:id/shops", async (req, res) => {
  const userId = (req as any).userId;
  const enabledShopIds: string[] = [...new Set<string>(
    Array.isArray(req.body.enabledShopIds) ? req.body.enabledShopIds.map(String) : []
  )];
  const account = await prisma.printifyAccount.findFirst({
    where: { id: req.params.id, userId },
    include: { shops: true },
  });
  if (!account) return res.status(404).json({ error: "Account not found" });

  const shopById = new Map(account.shops.map((shop) => [shop.id, shop]));
  if (enabledShopIds.some((id) => !shopById.has(id))) {
    return res.status(400).json({ error: "One or more stores don't belong to this account" });
  }
  if (enabledShopIds.some((id) => shopById.get(id)!.status !== "active")) {
    return res.status(400).json({ error: "Unavailable stores cannot be enabled" });
  }

  await prisma.$transaction([
    prisma.shop.updateMany({ where: { printifyAccountId: account.id }, data: { enabled: false } }),
    prisma.shop.updateMany({
      where: { printifyAccountId: account.id, id: { in: enabledShopIds }, status: "active" },
      data: { enabled: true },
    }),
  ]);
  const updated = await prisma.printifyAccount.findUnique({
    where: { id: account.id }, include: { shops: { orderBy: { title: "asc" } } },
  });
  res.json(withoutToken(updated!));
});

// POST resync an account's shops from Printify — picks up shops the user
// added on Printify after first connecting here.
router.post("/:id/resync", async (req, res) => {
  const userId = (req as any).userId;
  const account = await prisma.printifyAccount.findFirst({
    where: { id: req.params.id, userId },
    include: { shops: true },
  });
  if (!account) return res.status(404).json({ error: "Account not found" });

  const shops = await fetchPrintifyShops(decryptToken(account.accessToken));
  if (!shops) {
    await prisma.printifyAccount.update({ where: { id: account.id }, data: { tokenStatus: "invalid" } });
    return res.status(400).json({ error: "Printify token is no longer valid" });
  }
  const shopById = new Map(shops.map((s: any) => [String(s.id), s]));
  const currentIds = new Set(shops.map((s: any) => String(s.id)));
  const existingIds = new Set(account.shops.map((s) => s.printifyShopId));

  const newShops = shops.filter((s) => !existingIds.has(String(s.id)));
  // Shops we know about that Printify no longer returns — flagged, not
  // deleted, since local Listings may still point at them.
  const missingShops = account.shops.filter((s) => !currentIds.has(s.printifyShopId) && s.status !== "missing");
  // Shops that were flagged missing but have since reappeared on Printify.
  const reappearedShops = account.shops.filter((s) => currentIds.has(s.printifyShopId) && s.status === "missing");
  // Shops still present on both sides, but renamed (or sales channel
  // changed) on Printify since we last synced — previously this loop only
  // ever added/flagged shops, never picked up a plain rename.
  const renamedShops = account.shops.filter((s) => {
    const fresh = shopById.get(s.printifyShopId);
    return fresh && (fresh.title !== s.title || fresh.sales_channel !== s.salesChannel);
  });

  if (newShops.length > 0) {
    await prisma.shop.createMany({
      data: newShops.map((s) => ({
        printifyAccountId: account.id,
        printifyShopId: String(s.id),
        title: s.title,
        salesChannel: s.sales_channel,
        enabled: false,
      })),
    });
  }
  if (missingShops.length > 0) {
    await prisma.shop.updateMany({
      where: { id: { in: missingShops.map((s) => s.id) } },
      data: { status: "missing", enabled: false },
    });
  }
  if (reappearedShops.length > 0) {
    await prisma.shop.updateMany({
      where: { id: { in: reappearedShops.map((s) => s.id) } },
      data: { status: "active" },
    });
  }
  for (const s of renamedShops) {
    const fresh = shopById.get(s.printifyShopId)!;
    await prisma.shop.update({ where: { id: s.id }, data: { title: fresh.title, salesChannel: fresh.sales_channel } });
  }

  if (account.tokenStatus !== "active") {
    await prisma.printifyAccount.update({ where: { id: account.id }, data: { tokenStatus: "active" } });
  }

  const updated = await prisma.printifyAccount.findUnique({
    where: { id: account.id },
    include: { shops: true },
  });
  res.json({
    account: withoutToken(updated!),
    addedCount: newShops.length,
    missingCount: missingShops.length,
    updatedCount: renamedShops.length,
    reappearedCount: reappearedShops.length,
  });
});

// DELETE account
router.delete("/:id", async (req, res) => {
  const userId = (req as any).userId;
  await prisma.printifyAccount.deleteMany({
    where: { id: req.params.id, userId },
  });
  res.json({ ok: true });
});

export default router;
