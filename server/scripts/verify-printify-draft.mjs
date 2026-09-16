// Run from server/ using the same TSX runtime as the app:
// node --import tsx scripts/verify-printify-draft.mjs <listing-id>
// Add --create-test-draft to make a clearly named draft copy for API verification.
// Without that flag, this only reads an existing remote draft. Never publishes.
import "dotenv/config";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma.ts";
import { decryptToken } from "../src/lib/crypto.ts";
import { createOnPrintify } from "../src/lib/listingPublish.ts";
import { printifyJson } from "../src/lib/printify.ts";

const listingId = process.argv[2];
if (!listingId) throw new Error("Pass the exact local listing ID to verify as a draft");
const realFetch = globalThis.fetch;
const requests = [];
try {
  let listing = await prisma.listing.findUnique({
    where: { id: listingId }, include: { designs: true, batch: true, shop: { include: { account: true } } },
  });
  assert.ok(listing, "Listing not found");
  const createTest = process.argv.includes("--create-test-draft");
  if (!createTest) assert.equal(listing.status, "draft_on_printify", "Read-only verification requires a saved draft");
  const shopPath = `/v1/shops/${listing.shop.printifyShopId}/products`;
  const expectedAuth = `Bearer ${decryptToken(listing.shop.account.accessToken)}`;
  let creates = 0;
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input));
    const method = options.method ?? "GET";
    const imageRead = method === "GET" && /^\/v1\/uploads\/[^/]+\.json$/.test(url.pathname);
    const imageUpload = method === "POST" && url.pathname === "/v1/uploads/images.json";
    const productRead = method === "GET" && url.pathname.startsWith(`${shopPath}/`) && url.pathname.endsWith(".json") && !url.pathname.endsWith("/publish.json");
    const productCreate = method === "POST" && url.pathname === `${shopPath}.json`;
    assert.equal(url.origin, "https://api.printify.com");
    assert.ok(imageRead || imageUpload || productRead || productCreate, `Blocked non-draft request: ${method} ${url.pathname}`);
    assert.equal(options.headers?.Authorization, expectedAuth, "Wrong account token");
    if (productCreate) assert.equal(++creates, 1, "Only one product create is permitted");
    const response = await realFetch(input, { ...options, redirect: "error" });
    requests.push({ method, path: url.pathname, status: response.status });
    console.log(JSON.stringify(requests.at(-1)));
    return response;
  };
  if (createTest) {
    const source = listing;
    const batch = await prisma.publishBatch.create({
      data: {
        userId: source.batch.userId, shopIds: [source.shopId], total: 1,
        listings: { create: {
          shopId: source.shopId, title: `API draft test ${source.title}`.slice(0, 140),
          blueprintId: source.blueprintId, blueprintLabel: source.blueprintLabel,
          printProviderId: source.printProviderId, printProviderLabel: source.printProviderLabel,
          description: source.description, tags: source.tags, variants: source.variants,
          designs: { create: source.designs.map((d) => ({
            position: d.position, variantIds: d.variantIds, fileUrl: d.fileUrl,
            thumbUrl: d.thumbUrl, printifyImageId: d.printifyImageId,
            x: d.x, y: d.y, scale: d.scale, angle: d.angle, uploadStatus: d.uploadStatus,
          })) },
        } },
      },
      include: { listings: { include: { designs: true, shop: { include: { account: true } } } } },
    });
    listing = batch.listings[0];
    console.log(JSON.stringify({ testListingId: listing.id, title: listing.title }));
    try {
      await createOnPrintify(listing, listing.shop, { publish: false });
    } catch (error) {
      await prisma.listing.update({ where: { id: listing.id }, data: { status: "failed", errorMessage: error.message } });
      throw error;
    }
  }
  const saved = await prisma.listing.findUnique({ where: { id: listing.id }, include: { designs: true } });
  assert.ok(saved.printifyProductId, "Remote product ID must be persisted");
  const remote = await printifyJson(`https://api.printify.com${shopPath}/${saved.printifyProductId}.json`, {
    headers: { Authorization: expectedAuth },
  });
  assert.equal(String(remote.shop_id), String(listing.shop.printifyShopId));
  // Printify documents visible as default true, even before publication.
  // Check sales-channel references and publishing lock instead, and enforce
  // the allowlist above so this script cannot submit any publish request.
  const external = Array.isArray(remote.external) ? remote.external : [remote.external];
  assert.ok(!external.some((e) => e?.id || e?.handle), "Product has a sales-channel reference");
  assert.equal(remote.is_locked, false, "Product is locked for publishing");
  const remoteImages = new Set(remote.print_areas.flatMap((a) => a.placeholders.flatMap((p) => p.images.map((i) => i.id))));
  for (const design of saved.designs) assert.ok(remoteImages.has(design.printifyImageId), "Resolved design missing from remote product");
  console.log(JSON.stringify({
    verified: true, account: listing.shop.account.label, shop: listing.shop.title,
    listingId: saved.id, productId: saved.printifyProductId, localStatus: saved.status,
    remoteVisible: remote.visible, salesChannelLinked: false, designCount: saved.designs.length,
    publishRequests: requests.filter((r) => r.path.endsWith("/publish.json")).length,
  }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Draft verification failed");
  process.exitCode = 1;
} finally {
  globalThis.fetch = realFetch;
  await prisma.$disconnect();
}
