import { createHmac } from "node:crypto";
import { test, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";

let shops, orders, jobs, calls, transport;
const createJob = async ({ data }) => {
  const job = { id: data.id ?? `job-${jobs.length + 1}`, ...data };
  jobs.push(job);
  return job;
};
const prisma = {
  shop: {
    findMany: async ({ where }) => shops.filter((s) => s.printifyShopId === where.printifyShopId),
    findFirst: async ({ where }) =>
      shops.find((s) => s.id === where.id && s.account.userId === where.account.userId) ?? null,
  },
  order: {
    findFirst: async ({ where }) => orders.find((o) => o.id === where.id) ?? null,
    upsert: async ({ where, create, update }) => {
      const key = where.shopId_printifyOrderId;
      const idx = orders.findIndex((o) => o.shopId === key.shopId && o.printifyOrderId === key.printifyOrderId);
      if (idx === -1) {
        const row = { id: `order-${orders.length + 1}`, ...create };
        orders.push(row);
        return row;
      }
      orders[idx] = { ...orders[idx], ...update };
      return orders[idx];
    },
    update: async ({ where, data }) => {
      const idx = orders.findIndex((o) => o.id === where.id);
      orders[idx] = { ...orders[idx], ...data };
      return orders[idx];
    },
    updateMany: async ({ where, data }) => {
      const idx = orders.findIndex((o) => o.id === where.id);
      if (idx === -1) return { count: 0 };
      orders[idx] = { ...orders[idx], ...data };
      return { count: 1 };
    },
  },
  backgroundJob: {
    create: (...args) => createJob(...args),
    findFirst: async ({ where }) => jobs.find((job) =>
      job.type === where.type
      && job.status === where.status
      && job.payload.shopId === where.AND[0].payload.equals
      && job.payload.reconcile === where.AND[1].payload.equals
    ) ?? null,
  },
};
mock.module(new URL("../dist/lib/prisma.js", import.meta.url).href, { namedExports: { prisma } });
mock.module(new URL("../dist/lib/crypto.js", import.meta.url).href, { namedExports: { decryptToken: (s) => s } });
mock.module(new URL("../dist/lib/middleware.js", import.meta.url).href, {
  namedExports: { auth: (_req, _res, next) => next() },
});
mock.method(globalThis, "fetch", async (url, options = {}) => {
  const call = { url: String(url), method: options.method ?? "GET", body: options.body ? JSON.parse(options.body) : null };
  calls.push(call);
  return transport(call);
});

const { default: ordersRouter, orderJobHandlers } = await import("../dist/routes/orders.js");
const { Prisma } = await import("../dist/generated/prisma/client.js");
const webhookHandler = ordersRouter.stack.find((layer) => layer.route?.path === "/webhook").route.stack[0].handle;

const reply = (body, status = 200) => new Response(JSON.stringify(body), { status });
const shopFixture = (id, printifyShopId = "remote-1") => ({
  id, printifyShopId, account: { id: `acct-${id}`, userId: "user", accessToken: `mock-${id}` },
});
function signedReq(event) {
  const rawBody = Buffer.from(JSON.stringify(event));
  const signature = `sha256=${createHmac("sha256", "test-secret").update(rawBody).digest("hex")}`;
  return { headers: { "x-pfy-signature": signature }, body: event, rawBody };
}
function fakeRes() {
  const res = { statusCode: 200, body: undefined };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (data) => { res.body = data; return res; };
  return res;
}

beforeEach(() => {
  shops = []; orders = []; jobs = []; calls = [];
  transport = (call) => { throw new Error(`Unexpected request: ${call.method} ${call.url}`); };
  process.env.PRINTIFY_WEBHOOK_SECRET = "test-secret";
  delete process.env.PUBLIC_BASE_URL;
  prisma.backgroundJob.create = async ({ data }) => createJob({
    data: { status: data.status ?? "pending", ...data },
  });
});

test("webhook: valid signature enqueues a dedup-keyed sync job", async () => {
  shops = [shopFixture("shop-1")];
  const event = { id: "evt-1", resource: { type: "order", id: "order-9", data: { shop_id: "remote-1" } } };
  const res = fakeRes();
  await webhookHandler(signedReq(event), res);
  assert.deepEqual(res.body, { ok: true });
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].id, "printify:evt-1:shop-1");
  assert.equal(jobs[0].type, "sync_order");
  assert.deepEqual(jobs[0].payload, { shopId: "shop-1", userId: "user", orderId: "order-9" });
});

test("webhook: bad signature is rejected without enqueuing anything", async () => {
  shops = [shopFixture("shop-1")];
  const event = { id: "evt-1", resource: { type: "order", id: "order-9", data: { shop_id: "remote-1" } } };
  const rawBody = Buffer.from(JSON.stringify(event));
  const res = fakeRes();
  await webhookHandler({ headers: { "x-pfy-signature": "sha256=wrong" }, body: event, rawBody }, res);
  assert.equal(res.statusCode, 401);
  assert.equal(jobs.length, 0);
});

test("webhook: duplicate delivery is swallowed instead of erroring", async () => {
  shops = [shopFixture("shop-1")];
  prisma.backgroundJob.create = async () => {
    throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" });
  };
  const event = { id: "evt-1", resource: { type: "order", id: "order-9", data: { shop_id: "remote-1" } } };
  const res = fakeRes();
  await webhookHandler(signedReq(event), res);
  assert.deepEqual(res.body, { ok: true });
});

test("order action: cancel is blocked once the remote order is no longer cancelable", async () => {
  const shop = shopFixture("shop-1");
  orders = [{ id: "order-1", printifyOrderId: "9", shopId: "shop-1", shop, actionStatus: "cancel", errorMessage: null }];
  transport = (call) => call.method === "GET"
    ? reply({ id: "9", status: "in-production" })
    : (() => { throw new Error(`Unexpected request: ${call.method} ${call.url}`); })();
  await orderJobHandlers.order_action({ orderId: "order-1", userId: "user", action: "cancel" });
  assert.equal(orders[0].errorMessage, "Order cannot be canceled from in-production");
  assert.equal(orders[0].actionStatus, null);
  assert.equal(calls.length, 1);
});

test("order action: produce applies the remote result on success", async () => {
  const shop = shopFixture("shop-1");
  orders = [{ id: "order-1", printifyOrderId: "9", shopId: "shop-1", shop, actionStatus: "produce", errorMessage: null }];
  transport = (call) => {
    if (call.method === "GET") return reply({ id: "9", status: "on-hold" });
    if (call.url.endsWith("/send_to_production.json")) return reply({ id: "9", status: "sending-to-production" });
    throw new Error(`Unexpected request: ${call.method} ${call.url}`);
  };
  await orderJobHandlers.order_action({ orderId: "order-1", userId: "user", action: "produce" });
  assert.equal(orders[0].status, "sending-to-production");
  assert.equal(orders[0].actionStatus, null);
});

test("order action: final transient failure releases the order", async () => {
  const shop = shopFixture("shop-1");
  orders = [{ id: "order-1", printifyOrderId: "9", shopId: "shop-1", shop, actionStatus: "produce", errorMessage: null }];
  transport = () => reply({ message: "Unavailable" }, 503);
  await assert.rejects(
    orderJobHandlers.order_action({ orderId: "order-1", userId: "user", action: "produce" }, 5, 5),
    /HTTP 503/,
  );
  assert.equal(orders[0].actionStatus, null);
  assert.match(orders[0].errorMessage, /HTTP 503/);
});

test("reconciliation: a full pass reschedules the next cycle when reconcile is set", async () => {
  shops = [shopFixture("shop-1")];
  transport = () => reply({ data: [{ id: "1", status: "pending", created_at: new Date().toISOString() }], last_page: 1 });
  await orderJobHandlers.sync_shop_orders({ shopId: "shop-1", userId: "user", page: 1, reconcile: true });
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].type, "sync_shop_orders");
  assert.deepEqual(jobs[0].payload, { shopId: "shop-1", userId: "user", page: 1, reconcile: true });
  assert.ok(jobs[0].runAt.getTime() > Date.now() + 5 * 60 * 60_000);
});

test("reconciliation: duplicate setup keeps one pending chain", async () => {
  shops = [shopFixture("shop-1")];
  process.env.PUBLIC_BASE_URL = "https://example.test";
  transport = () => reply([]);
  await orderJobHandlers.setup_order_webhooks({ shopId: "shop-1", userId: "user" });
  await orderJobHandlers.setup_order_webhooks({ shopId: "shop-1", userId: "user" });
  assert.equal(jobs.length, 1);
});

test("reconciliation: a one-off manual sync does not reschedule itself", async () => {
  shops = [shopFixture("shop-1")];
  transport = () => reply({ data: [], last_page: 1 });
  await orderJobHandlers.sync_shop_orders({ shopId: "shop-1", userId: "user", page: 1 });
  assert.equal(jobs.length, 0);
});
