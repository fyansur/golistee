import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { auth } from "../lib/middleware.js";

const router = Router();
router.use(auth);

// GET all accounts
router.get("/", async (req, res) => {
  const userId = (req as any).userId;
  const accounts = await prisma.printifyAccount.findMany({
    where: { userId },
    include: { shops: true },
  });
  res.json(accounts);
});

// POST add account
router.post("/", async (req, res) => {
  const userId = (req as any).userId;
  const { label, accessToken } = req.body;

  // Validate token by hitting Printify API
  const response = await fetch("https://api.printify.com/v1/shops.json", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    return res.status(400).json({ error: "Invalid Printify token" });
  }

  const shops = await response.json() as any[];

  const account = await prisma.printifyAccount.create({
    data: {
      userId,
      label,
      accessToken,
      shops: {
        create: shops.map((s: any) => ({
          printifyShopId: String(s.id),
          title: s.title,
          salesChannel: s.sales_channel,
        })),
      },
    },
    include: { shops: true },
  });

  res.json(account);
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

  const response = await fetch("https://api.printify.com/v1/shops.json", {
    headers: { Authorization: `Bearer ${account.accessToken}` },
  });
  if (!response.ok) {
    await prisma.printifyAccount.update({ where: { id: account.id }, data: { tokenStatus: "invalid" } });
    return res.status(400).json({ error: "Printify token is no longer valid" });
  }

  const shops = await response.json() as any[];
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
      })),
    });
  }
  if (missingShops.length > 0) {
    await prisma.shop.updateMany({
      where: { id: { in: missingShops.map((s) => s.id) } },
      data: { status: "missing" },
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
    account: updated,
    addedCount: newShops.length,
    missingCount: missingShops.length,
    updatedCount: renamedShops.length,
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