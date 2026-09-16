import { prisma } from "./prisma.js";
import { decryptToken } from "./crypto.js";
import { PrintifyError, printifyJson } from "./printify.js";

type Account = { id: string; accessToken: string };
type Design = { fileUrl: string; printifyImageId?: string | null };

// Coalesce simultaneous requests for the same file/account within this worker.
const pending = new Map<string, Promise<string>>();

export function ensurePrintifyImage(account: Account, design: Design): Promise<string> {
  const key = JSON.stringify([account.id, design.fileUrl]);
  const existing = pending.get(key);
  if (existing) return existing;
  const request = resolveImage(account, design).finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}

async function resolveImage(account: Account, design: Design): Promise<string> {
  if (!design.fileUrl) throw new Error("Design has no original file URL");
  const where = { printifyAccountId_fileUrl: { printifyAccountId: account.id, fileUrl: design.fileUrl } };
  const cached = await prisma.printifyImage.findUnique({ where });
  if (cached) return cached.printifyImageId;

  const headers = { Authorization: `Bearer ${decryptToken(account.accessToken)}` };
  let imageId: string | undefined;
  // Existing library/listing IDs predate account tracking. Reuse only after
  // the target account proves it can read the image; never trust the client ID.
  if (design.printifyImageId) {
    try {
      const image = await printifyJson(
        `https://api.printify.com/v1/uploads/${encodeURIComponent(design.printifyImageId)}.json`,
        { headers }
      );
      if (image?.id === design.printifyImageId) imageId = image.id;
    } catch (error) {
      // Authentication, scope, rate-limit and network failures must remain visible.
      if (!(error instanceof PrintifyError) || error.status !== 404) throw error;
    }
  }

  if (!imageId) {
    const image = await printifyJson("https://api.printify.com/v1/uploads/images.json", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        file_name: new URL(design.fileUrl).pathname.split("/").pop() || "design.png",
        url: design.fileUrl,
      }),
    });
    if (!image?.id) throw new Error("Printify upload returned no image ID");
    imageId = image.id;
  }

  const mapped = await prisma.printifyImage.upsert({
    where,
    create: { ...where.printifyAccountId_fileUrl, printifyImageId: imageId! },
    update: { printifyImageId: imageId! },
  });
  return mapped.printifyImageId;
}

export async function resolveListingDesigns(listing: any, account: Account) {
  const designs = [];
  for (const design of listing.designs ?? []) {
    const printifyImageId = await ensurePrintifyImage(account, design);
    if (design.id && design.printifyImageId !== printifyImageId) {
      await prisma.listingDesign.updateMany({
        where: { id: design.id, listingId: listing.id },
        data: { printifyImageId, uploadStatus: "synced", uploadError: null },
      });
    }
    designs.push({ ...design, printifyImageId });
  }
  return designs;
}
