import { createHmac, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { Prisma } from "../generated/prisma/client.js";
import { auth } from "../lib/middleware.js";
import { prisma } from "../lib/prisma.js";
import { decryptToken } from "../lib/crypto.js";
import { newJob, type JobHandler } from "../lib/backgroundJobs.js";
import { pageParams } from "../lib/pagination.js";
import { PrintifyError, printifyJson } from "../lib/printify.js";
import { usableShopWhere } from "../lib/shopAccess.js";

const router = Router();
const ORDER_TOPICS = [
  "order:created",
  "order:updated",
  "order:sent-to-production",
  "order:shipment:created",
  "order:shipment:delivered",
];

const asDate = (value: unknown) => value ? new Date(String(value)) : null;

function orderData(shopId: string, order: any) {
  const address = order.address_to ?? {};
  return {
    shopId,
    printifyOrderId: String(order.id),
    appOrderId: order.app_order_id ? String(order.app_order_id) : null,
    status: String(order.status ?? "unknown"),
    customerName: [address.first_name, address.last_name].filter(Boolean).join(" ") || null,
    customerEmail: address.email ? String(address.email) : null,
    totalPrice: Number(order.total_price ?? 0),
    totalShipping: Number(order.total_shipping ?? 0),
    totalTax: Number(order.total_tax ?? 0),
    addressTo: address,
    lineItems: order.line_items ?? [],
    shipments: order.shipments ?? [],
    metadata: order.metadata ?? {},
    printifyCreatedAt: asDate(order.created_at) ?? new Date(),
    sentToProductionAt: asDate(order.sent_to_production_at),
    fulfilledAt: asDate(order.fulfilled_at),
    syncedAt: new Date(),
    actionStatus: null,
    errorMessage: null,
  };
}

async function upsertOrder(shopId: string, order: any) {
  const data = orderData(shopId, order);
  return prisma.order.upsert({
    where: { shopId_printifyOrderId: { shopId, printifyOrderId: data.printifyOrderId } },
    create: data,
    update: { ...data, actionStatus: undefined, errorMessage: undefined },
  });
}

async function fetchOrder(shop: any, printifyOrderId: string) {
  const order = await printifyJson(
    `https://api.printify.com/v1/shops/${shop.printifyShopId}/orders/${printifyOrderId}.json`,
    { headers: { Authorization: `Bearer ${decryptToken(shop.account.accessToken)}` } },
  );
  await upsertOrder(shop.id, order);
  return order;
}

const RECONCILE_INTERVAL_MS = 6 * 60 * 60_000;

async function enqueueReconcile(shopId: string, userId: string, runAt = new Date()) {
  const existing = await prisma.backgroundJob.findFirst({
    where: {
      type: "sync_shop_orders",
      status: "pending",
      AND: [
        { payload: { path: ["shopId"], equals: shopId } },
        { payload: { path: ["reconcile"], equals: true } },
      ],
    },
  });
  if (existing) return;
  await prisma.backgroundJob.create({
    data: {
      ...newJob("sync_shop_orders", { shopId, userId, page: 1, reconcile: true }, userId),
      runAt,
    },
  });
}

// reconcile:true makes this call chain self-perpetuating: each full pass
// through a shop's pages re-queues page 1 for RECONCILE_INTERVAL_MS later,
// so a missed/blocked webhook is caught within one interval. Started once
// from setupOrderWebhooks; a one-off manual "Sync orders" click (reconcile
// left false) does not spawn a recurring chain.
async function syncShopOrders(shopId: string, userId: string, page = 1, reconcile = false) {
  const shop = await prisma.shop.findFirst({
    where: { id: shopId, account: { userId } },
    include: { account: true },
  });
  if (!shop) return;
  const result = await printifyJson<any>(
    `https://api.printify.com/v1/shops/${shop.printifyShopId}/orders.json?limit=10&page=${page}`,
    { headers: { Authorization: `Bearer ${decryptToken(shop.account.accessToken)}` } },
  );
  for (const order of result.data ?? []) await upsertOrder(shop.id, order);
  if (page < Number(result.last_page ?? page)) {
    await prisma.backgroundJob.create({
      data: newJob("sync_shop_orders", { shopId, userId, page: page + 1, reconcile }, userId),
    });
  } else if (reconcile) {
    await enqueueReconcile(shopId, userId, new Date(Date.now() + RECONCILE_INTERVAL_MS));
  }
}

async function setupOrderWebhooks(shopId: string, userId: string) {
  const baseUrl = process.env.PUBLIC_BASE_URL?.replace(/\/$/, "");
  const secret = process.env.PRINTIFY_WEBHOOK_SECRET;
  if (!baseUrl || !secret) return;
  const shop = await prisma.shop.findFirst({
    where: { id: shopId, account: { userId } },
    include: { account: true },
  });
  if (!shop) return;
  const token = decryptToken(shop.account.accessToken);
  const url = `${baseUrl}/api/orders/webhook`;
  const existing = await printifyJson<any[]>(
    `https://api.printify.com/v1/shops/${shop.printifyShopId}/webhooks.json`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const configured = new Set(existing.filter((hook) => hook.url === url).map((hook) => hook.topic));
  for (const topic of ORDER_TOPICS) {
    if (configured.has(topic)) continue;
    await printifyJson(`https://api.printify.com/v1/shops/${shop.printifyShopId}/webhooks.json`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ topic, url, secret }),
    });
  }
  await enqueueReconcile(shopId, userId);
}

async function runOrderAction(
  orderId: string,
  userId: string,
  action: "produce" | "cancel",
  attempt = 1,
  maxAttempts = 5,
) {
  const local = await prisma.order.findFirst({
    where: { id: orderId, shop: { account: { userId } } },
    include: { shop: { include: { account: true } } },
  });
  if (!local) return;
  try {
    const remote = await fetchOrder(local.shop, local.printifyOrderId);
    if (action === "cancel" && remote.status === "canceled") {
      await prisma.order.update({ where: { id: local.id }, data: { actionStatus: null, errorMessage: null } });
      return;
    }
    if (action === "produce" && ["sending-to-production", "in-production", "partially-fulfilled", "fulfilled"].includes(remote.status)) {
      await prisma.order.update({ where: { id: local.id }, data: { actionStatus: null, errorMessage: null } });
      return;
    }
    if (action === "cancel" && !["on-hold", "payment-not-received"].includes(remote.status)) {
      await prisma.order.update({ where: { id: local.id }, data: { actionStatus: null, errorMessage: `Order cannot be canceled from ${remote.status}` } });
      return;
    }
    if (action === "produce" && remote.status === "canceled") {
      await prisma.order.update({ where: { id: local.id }, data: { actionStatus: null, errorMessage: "Canceled orders cannot be sent to production" } });
      return;
    }
    const endpoint = action === "produce" ? "send_to_production" : "cancel";
    const result = await printifyJson<any>(
      `https://api.printify.com/v1/shops/${local.shop.printifyShopId}/orders/${local.printifyOrderId}/${endpoint}.json`,
      { method: "POST", headers: { Authorization: `Bearer ${decryptToken(local.shop.account.accessToken)}` } },
    );
    if (result?.id) {
      await upsertOrder(local.shopId, result);
      await prisma.order.update({ where: { id: local.id }, data: { actionStatus: null, errorMessage: null } });
    } else await prisma.order.update({
      where: { id: local.id },
      data: { status: action === "produce" ? "sending-to-production" : "canceled", actionStatus: null, errorMessage: null },
    });
  } catch (error) {
    if (error instanceof PrintifyError && (error.status === 429 || error.status >= 500)) {
      if (attempt >= maxAttempts) {
        await prisma.order.updateMany({
          where: { id: local.id },
          data: { actionStatus: null, errorMessage: error.message },
        });
      }
      throw error;
    }
    await prisma.order.updateMany({
      where: { id: local.id },
      data: { actionStatus: null, errorMessage: error instanceof Error ? error.message : String(error) },
    });
  }
}

router.post("/webhook", async (req, res) => {
  const secret = process.env.PRINTIFY_WEBHOOK_SECRET;
  const signature = String(req.headers["x-pfy-signature"] ?? "");
  const rawBody = (req as any).rawBody as Buffer | undefined;
  if (!secret || !rawBody) return res.status(503).json({ error: "Webhook is not configured" });
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  const event = req.body;
  if (!event?.id || event?.resource?.type !== "order" || !event?.resource?.id) return res.json({ ok: true });
  const printifyShopId = String(event.resource.data?.shop_id ?? "");
  if (!printifyShopId) return res.json({ ok: true });
  const shops = await prisma.shop.findMany({
    where: { printifyShopId },
    include: { account: { select: { userId: true } } },
  });
  for (const shop of shops) {
    try {
      await prisma.backgroundJob.create({
        data: {
          id: `printify:${event.id}:${shop.id}`,
          ...newJob("sync_order", { shopId: shop.id, userId: shop.account.userId, orderId: String(event.resource.id) }, shop.account.userId),
        },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
    }
  }
  res.json({ ok: true });
});

router.use(auth);

router.get("/", async (req, res) => {
  const userId = (req as any).userId;
  const shopId = String(req.query.shopId ?? "");
  const status = String(req.query.status ?? "");
  const search = String(req.query.search ?? "").trim();
  const where = {
    shop: { account: { userId } },
    ...(shopId ? { shopId } : {}),
    ...(status ? { status } : {}),
    ...(search ? {
      OR: [
        { customerName: { contains: search, mode: "insensitive" as const } },
        { customerEmail: { contains: search, mode: "insensitive" as const } },
        { printifyOrderId: { contains: search, mode: "insensitive" as const } },
        { appOrderId: { contains: search, mode: "insensitive" as const } },
      ],
    } : {}),
  };
  const { skip, take } = pageParams(req);
  const [total, items] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      include: { shop: { select: { id: true, title: true } } },
      orderBy: { printifyCreatedAt: "desc" },
      skip,
      take,
    }),
  ]);
  res.json({ items, total, webhooksEnabled: Boolean(process.env.PUBLIC_BASE_URL && process.env.PRINTIFY_WEBHOOK_SECRET) });
});

router.post("/sync", async (req, res) => {
  const userId = (req as any).userId;
  const shops = await prisma.shop.findMany({ where: usableShopWhere(userId), select: { id: true } });
  await prisma.backgroundJob.createMany({
    data: shops.flatMap((shop) => [
      newJob("sync_shop_orders", { shopId: shop.id, userId, page: 1 }, userId),
      ...(process.env.PUBLIC_BASE_URL && process.env.PRINTIFY_WEBHOOK_SECRET
        ? [newJob("setup_order_webhooks", { shopId: shop.id, userId }, userId)]
        : []),
    ]),
  });
  res.json({ queued: shops.length, webhooksEnabled: Boolean(process.env.PUBLIC_BASE_URL && process.env.PRINTIFY_WEBHOOK_SECRET) });
});

for (const action of ["send-to-production", "cancel"] as const) {
  router.post(`/:id/${action}`, async (req, res) => {
    const userId = (req as any).userId;
    const order = await prisma.order.findFirst({ where: { id: req.params.id, shop: { account: { userId } } } });
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (order.actionStatus) return res.status(409).json({ error: "An order action is already in progress" });
    const jobAction = action === "send-to-production" ? "produce" : "cancel";
    await prisma.$transaction([
      prisma.order.update({ where: { id: order.id }, data: { actionStatus: jobAction, errorMessage: null } }),
      prisma.backgroundJob.create({ data: newJob("order_action", { orderId: order.id, userId, action: jobAction }, userId) }),
    ]);
    res.json({ ok: true });
  });
}

export const orderJobHandlers: Record<string, JobHandler> = {
  sync_shop_orders: ({ shopId, userId, page, reconcile }) =>
    syncShopOrders(String(shopId), String(userId), Number(page ?? 1), Boolean(reconcile)),
  setup_order_webhooks: ({ shopId, userId }) => setupOrderWebhooks(String(shopId), String(userId)),
  sync_order: async ({ shopId, userId, orderId }) => {
    const shop = await prisma.shop.findFirst({
      where: { id: String(shopId), account: { userId: String(userId) } },
      include: { account: true },
    });
    if (shop) await fetchOrder(shop, String(orderId));
  },
  order_action: ({ orderId, userId, action }, attempt, maxAttempts) => runOrderAction(
    String(orderId), String(userId), action === "cancel" ? "cancel" : "produce", attempt, maxAttempts,
  ),
};

export default router;
