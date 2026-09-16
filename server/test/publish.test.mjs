import { test, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";

let mappings, rows, calls, designUpdates, transport;
const keyOf = (where) => JSON.stringify(where.printifyAccountId_fileUrl);
const prisma = {
  printifyImage: {
    findUnique: async ({ where }) => mappings.get(keyOf(where)) ?? null,
    upsert: async ({ where, create, update }) => {
      const value = mappings.has(keyOf(where)) ? { ...mappings.get(keyOf(where)), ...update } : create;
      mappings.set(keyOf(where), value);
      return value;
    },
  },
  listing: {
    update: async ({ where, data }) => {
      rows.set(where.id, { ...rows.get(where.id), ...data });
      return rows.get(where.id);
    },
  },
  listingDesign: { updateMany: async (args) => { designUpdates.push(args); return { count: 1 }; } },
};
mock.module(new URL("../dist/lib/prisma.js", import.meta.url).href, { namedExports: { prisma } });
mock.module(new URL("../dist/lib/crypto.js", import.meta.url).href, { namedExports: { decryptToken: (s) => s } });
mock.method(globalThis, "fetch", async (url, options = {}) => {
  const call = { url: String(url), method: options.method ?? "GET", token: options.headers?.Authorization, body: options.body ? JSON.parse(options.body) : null };
  calls.push(call);
  return transport(call);
});
mock.module(new URL("../dist/lib/middleware.js", import.meta.url).href, { namedExports: { auth: (_req, _res, next) => next() } });
const { default: publishRouter } = await import("../dist/routes/publish.js");
const { ensurePrintifyImage } = await import("../dist/lib/printifyImages.js");
const { createOnPrintify, updateAndPublish } = await import("../dist/lib/listingPublish.js");
const { printifyJson } = await import("../dist/lib/printify.js");
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status });
const account = (id) => ({ id, accessToken: `mock-${id}` });
const shop = (id) => ({ id: `shop-${id}`, printifyShopId: `remote-${id}`, account: account(id) });
const design = () => ({ id: "design", position: "front", fileUrl: "https://example.invalid/art.png", printifyImageId: "image-a", variantIds: [], x: .5, y: .5, scale: 1, angle: 0, uploadStatus: "synced" });
const listing = () => ({ id: "listing", title: "Test", description: "", tags: [], blueprintId: 1, printProviderId: 2, variants: [{ id: 1, price: 2500, is_enabled: true }], designs: [design()] });

beforeEach(() => {
  mappings = new Map(); rows = new Map(); calls = []; designUpdates = [];
  transport = (call) => { throw new Error(`Unexpected request: ${call.method} ${call.url}`); };
});

test("cross-account draft uploads the original into B and sends B's image and token", async () => {
  transport = (c) => {
    assert.equal(c.token, "Bearer mock-b");
    if (c.url.endsWith("/uploads/image-a.json")) return reply({}, 404);
    if (c.url.endsWith("/uploads/images.json")) {
      assert.equal(c.body.url, design().fileUrl);
      return reply({ id: "image-b" });
    }
    if (c.url.endsWith("/shops/remote-b/products.json")) {
      assert.equal(c.body.print_areas[0].placeholders[0].images[0].id, "image-b");
      return reply({ id: "product-b" });
    }
    throw new Error("Unexpected request (including publish)");
  };
  const result = await createOnPrintify(listing(), shop("b"), { publish: false });
  assert.equal(result.status, "draft_on_printify");
  assert.equal(rows.get("listing").printifyProductId, "product-b");
  assert.equal(designUpdates[0].data.printifyImageId, "image-b");
  assert.equal(calls.length, 3);
});

test("legacy image in the same account is verified and reused without uploading", async () => {
  transport = () => reply({ id: "image-a" });
  assert.equal(await ensurePrintifyImage(account("a"), design()), "image-a");
  assert.equal(await ensurePrintifyImage(account("a"), design()), "image-a");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "GET");
});

test("mapping is isolated by account and concurrent uses only upload once", async () => {
  transport = (c) => c.method === "GET" ? reply({}, 404) : reply({ id: c.token === "Bearer mock-a" ? "image-a" : "image-b" });
  const ids = await Promise.all([
    ensurePrintifyImage(account("a"), design()),
    ensurePrintifyImage(account("b"), design()),
    ensurePrintifyImage(account("b"), design()),
  ]);
  assert.deepEqual(ids, ["image-a", "image-b", "image-b"]);
  assert.equal(calls.filter((c) => c.method === "POST").length, 2);
  assert.equal(mappings.size, 2);
});

for (const status of [401, 403, 429, 500]) {
  test(`image lookup HTTP ${status} is preserved; it does not trigger an upload`, async () => {
    transport = () => reply({ message: "Rejected", errors: { reason: "Specific reason" } }, status);
    await assert.rejects(ensurePrintifyImage(account("b"), design()), (err) => err.status === status && err.message.includes("Specific reason"));
    assert.equal(calls.length, 1);
    assert.equal(mappings.size, 0);
  });
}

test("failed upload is not cached and a later attempt can recover", async () => {
  transport = (c) => c.method === "GET" ? reply({}, 404) : reply({ message: "Upload failed" }, 422);
  await assert.rejects(ensurePrintifyImage(account("b"), design()), /Upload failed/);
  assert.equal(mappings.size, 0);
  transport = (c) => c.method === "GET" ? reply({}, 404) : reply({ id: "image-b" });
  assert.equal(await ensurePrintifyImage(account("b"), design()), "image-b");
});

test("publish rejection preserves product ID and retry updates instead of creating", async () => {
  let rejectPublish = true;
  transport = (c) => {
    if (c.url.endsWith("/uploads/image-a.json")) return reply({ id: "image-a" });
    if (c.url.endsWith("/products.json")) return reply({ id: "product-a" });
    if (c.url.endsWith("/publish.json")) {
      assert.equal(rows.get("listing").printifyProductId, "product-a");
      return rejectPublish ? reply({ message: "Operation failed", errors: { reason: "Etsy rejected the request" } }, 422) : reply({});
    }
    if (c.url.endsWith("/products/product-a.json")) return reply({ variants: [{ id: 1 }, { id: 2 }] });
    throw new Error("Unexpected request");
  };
  await assert.rejects(createOnPrintify(listing(), shop("a"), { publish: true }), /Etsy rejected the request/);
  assert.equal(rows.get("listing").status, "draft_on_printify");
  rejectPublish = false;
  await updateAndPublish({ ...listing(), ...rows.get("listing") }, shop("a"));
  assert.equal(calls.filter((c) => c.method === "POST" && c.url.endsWith("/products.json")).length, 1);
  const update = calls.find((c) => c.method === "PUT");
  assert.deepEqual(update.body.print_areas[0].variant_ids, [1, 2]);
});

test("update resolves designs with target account and preserves placement/overrides", async () => {
  const l = { ...listing(), printifyProductId: "product-b" };
  l.designs.push({ ...design(), id: "override", variantIds: [2], scale: .7, x: .2 });
  transport = (c) => {
    assert.equal(c.token, "Bearer mock-b");
    if (c.url.endsWith("/uploads/image-a.json")) return reply({}, 404);
    if (c.url.endsWith("/uploads/images.json")) return reply({ id: "image-b" });
    return reply({ variants: [{ id: 1 }, { id: 2 }, { id: 3 }] });
  };
  await updateAndPublish(l, shop("b"));
  const areas = calls.find((c) => c.method === "PUT").body.print_areas;
  assert.deepEqual(areas[0].variant_ids, [1, 3]);
  assert.deepEqual(areas[1].variant_ids, [2]);
  assert.equal(areas[1].placeholders[0].images[0].scale, .7);
  assert.equal(areas[1].placeholders[0].images[0].id, "image-b");
  assert.equal(calls.filter((c) => c.url.endsWith("/uploads/images.json")).length, 1);
});

test("metadata-only edit does not replace remote print areas", async () => {
  transport = () => reply({});
  await updateAndPublish({ ...listing(), printifyProductId: "product-a" }, shop("a"), { includeDesigns: false });
  assert.deepEqual(calls.map((c) => c.method), ["PUT", "POST"]);
  assert.equal(calls[0].body.print_areas, undefined);
});

test("Printify errors retain method, endpoint, HTTP status and nested details", async () => {
  transport = () => reply({ message: "Operation failed.", errors: { reason: "Image not found", code: 8201 } }, 400);
  await assert.rejects(printifyJson("https://api.printify.com/v1/shops/b/products.json", { method: "POST" }), /POST .*products.json.*HTTP 400.*Image not found/);
});


test("bulk-copy route saves a draft using the destination account's image", async () => {
  const target = shop("b");
  let finish;
  const completed = new Promise((resolve) => { finish = resolve; });
  let copied;
  prisma.shop = { findFirst: async ({ where }) => {
    assert.equal(where.id, target.id);
    assert.equal(where.account.userId, "user");
    return target;
  } };
  prisma.listing.findMany = async () => [listing()];
  prisma.listing.create = async ({ data }) => {
    copied = { ...data, id: "copy", designs: data.designs.create.map((d) => ({ ...d, id: "copy-design" })) };
    return copied;
  };
  prisma.publishBatch = { create: async () => ({ id: "batch" }), update: async ({ data }) => { finish(data); return data; } };
  transport = (c) => {
    assert.equal(c.token, "Bearer mock-b");
    if (c.url.endsWith("/uploads/image-a.json")) return reply({}, 404);
    if (c.url.endsWith("/uploads/images.json")) return reply({ id: "image-b" });
    if (c.url.endsWith("/shops/remote-b/products.json")) {
      assert.equal(c.body.print_areas[0].placeholders[0].images[0].id, "image-b");
      return reply({ id: "copy-product" });
    }
    throw new Error("Unexpected request, including publish");
  };
  const handler = publishRouter.stack.find((layer) => layer.route?.path === "/listings/bulk-copy").route.stack[0].handle;
  let response;
  await handler({ userId: "user", body: { ids: ["listing"], targetShopId: target.id } }, { json: (data) => { response = data; } });
  const batch = await completed;
  assert.equal(response.queued, 1);
  assert.equal(copied.shopId, target.id);
  assert.equal(rows.get("copy").status, "draft_on_printify");
  assert.equal(batch.successCount, 1);
  assert.equal(batch.failedCount, 0);
  assert.equal(calls.some((c) => c.url.endsWith("/publish.json")), false);
});
