import { prisma } from "./prisma.js";
import { decryptToken } from "./crypto.js";
import { printifyJson } from "./printify.js";
import { resolveListingDesigns } from "./printifyImages.js";

// Create is always a draft first; publishing is a separate, explicit step.
export async function createOnPrintify(listing: any, shop: any, opts: { publish: boolean }) {
  const token = decryptToken(shop.account.accessToken);
  const designs = await resolveListingDesigns(listing, shop.account);
  const allVariantIds = (listing.variants as any[]).map((v) => v.id);
  const product = await printifyJson(
    `https://api.printify.com/v1/shops/${shop.printifyShopId}/products.json`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        title: listing.title, description: listing.description, tags: listing.tags,
        blueprint_id: listing.blueprintId, print_provider_id: listing.printProviderId,
        variants: listing.variants, print_areas: buildPrintAreas(designs, allVariantIds),
      }),
    }
  );
  if (!product?.id) throw new Error("Printify create returned no product ID");

  // Persist BEFORE publish, so an Etsy rejection does not orphan the product
  // and a retry updates this draft instead of creating another product.
  await prisma.listing.update({
    where: { id: listing.id },
    data: { printifyProductId: product.id, status: "draft_on_printify", errorMessage: null },
  });
  if (!opts.publish) {
    return { printifyProductId: product.id as string, status: "draft_on_printify" as const };
  }

  await publishToSalesChannel(shop.printifyShopId, token, product.id);
  const lastPublishedAt = new Date();
  await prisma.listing.update({
    where: { id: listing.id },
    data: { status: "published", lastPublishedAt, errorMessage: null },
  });
  return { printifyProductId: product.id as string, status: "published" as const, lastPublishedAt };
}

export async function updateOnPrintify(listing: any, shop: any, opts = { includeDesigns: true }) {
  const token = decryptToken(shop.account.accessToken);
  const url = `https://api.printify.com/v1/shops/${shop.printifyShopId}/products/${listing.printifyProductId}.json`;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const payload: any = {
    title: listing.title, description: listing.description, tags: listing.tags, variants: listing.variants,
  };
  if (opts.includeDesigns) {
    const current = await printifyJson(url, { headers });
    const designs = await resolveListingDesigns(listing, shop.account);
    // Updates need the full remote variant range, including disabled variants.
    payload.print_areas = buildPrintAreas(designs, current.variants.map((v: any) => v.id));
  }
  await printifyJson(url, { method: "PUT", headers, body: JSON.stringify(payload) });
  return { printifyProductId: listing.printifyProductId as string };
}

export async function updateAndPublish(listing: any, shop: any, opts = { includeDesigns: true }) {
  const token = decryptToken(shop.account.accessToken);
  await updateOnPrintify(listing, shop, opts);
  await publishToSalesChannel(shop.printifyShopId, token, listing.printifyProductId);
  const lastPublishedAt = new Date();
  await prisma.listing.update({
    where: { id: listing.id },
    data: { status: "published", lastPublishedAt, errorMessage: null },
  });
  return { printifyProductId: listing.printifyProductId as string, status: "published" as const, lastPublishedAt };
}

export function statusAfterPrintifyDraft(lastPublishedAt: Date | string | null | undefined) {
  return lastPublishedAt ? "out_of_sync" as const : "draft_on_printify" as const;
}

async function publishToSalesChannel(shopId: string, token: string, productId: string) {
  await printifyJson(`https://api.printify.com/v1/shops/${shopId}/products/${productId}/publish.json`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ title: true, description: true, images: false, variants: true, tags: true }),
  });
}

export function buildPrintAreas(designs: any[], allVariantIds: number[]) {
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
