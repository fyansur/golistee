import { Router } from "express";
import multer from "multer";
import sharp from "sharp";
import { Upload } from "@aws-sdk/lib-storage";
import { r2 } from "../lib/r2.js";
import { prisma } from "../lib/prisma.js";
import { auth } from "../lib/middleware.js";
import { pageParams } from "../lib/pagination.js";
import { ensurePrintifyImage } from "../lib/printifyImages.js";
import { findCatalogAccount, usableShopWhere } from "../lib/shopAccess.js";

// Mirrors the client's own fileNameOf() (MyFiles.tsx) — recovers a display
// name from the upload key when no explicit DesignAsset.name is set.
const fileNameOf = (url: string) => (url.split("/").pop() ?? "").replace(/^\d+-/, "");

const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // print files can be large; still bounded
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) return cb(new Error("Unsupported file type"));
    cb(null, true);
  },
});
router.use(auth);

router.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });

  const userId = (req as any).userId;
  const { position, x, y, scale, angle, variantIds, shopId } = req.body;
  const shop = shopId ? await prisma.shop.findFirst({
    where: { id: shopId, ...usableShopWhere(userId) }, include: { account: true },
  }) : null;
  if (shopId && !shop) return res.status(409).json({ error: "Store is disabled or unavailable" });
  const account = shop?.account ?? await findCatalogAccount(userId);
  if (!account) return res.status(400).json({ error: "No enabled Printify store connected" });
  const base = {
    position,
    x: Number(x), y: Number(y), scale: Number(scale), angle: Number(angle),
    variantIds: JSON.parse(variantIds ?? "[]"),
  };
  const fail = (fileUrl: string, uploadError: string) =>
    res.json({ ...base, fileUrl, thumbUrl: null, printifyImageId: null, uploadStatus: "failed", uploadError });

  const safeName = req.file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_");
  const timestamp = Date.now();
  const key = `designs/${userId}/${timestamp}-${safeName}`;

  // Upload to R2
  try {
    await new Upload({
      client: r2,
      params: {
        Bucket: process.env.R2_BUCKET!,
        Key: key,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
      },
    }).done();
  } catch (err: any) {
    return fail("", `Upload to storage failed: ${err.message}`);
  }

  const fileUrl = `${process.env.R2_PUBLIC_URL}/${key}`;

  // Thumbnail for the reuse-design gallery — best-effort, falls back to the
  // full image client-side if it fails (never blocks the actual upload).
  let thumbUrl: string | null = null;
  try {
    const thumbBuffer = await sharp(req.file.buffer)
      .resize(300, 300, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 70 })
      .toBuffer();
    const thumbKey = `designs/${userId}/thumb-${timestamp}-${safeName.replace(/\.[^.]+$/, "")}.webp`;
    await new Upload({
      client: r2,
      params: { Bucket: process.env.R2_BUCKET!, Key: thumbKey, Body: thumbBuffer, ContentType: "image/webp" },
    }).done();
    thumbUrl = `${process.env.R2_PUBLIC_URL}/${thumbKey}`;
  } catch (err: any) {
    console.error("Thumbnail generation failed:", err.message);
  }

  // Track the original file even if the subsequent Printify sync fails.
  await prisma.designAsset.upsert({
    where: { userId_fileUrl: { userId, fileUrl } },
    create: { userId, fileUrl, thumbUrl }, update: { thumbUrl },
  });
  let printifyImageId: string;
  try {
    printifyImageId = await ensurePrintifyImage(account, { fileUrl });
    await prisma.designAsset.update({
      where: { userId_fileUrl: { userId, fileUrl } }, data: { printifyImageId },
    });
  } catch (err: any) {
    return fail(fileUrl, `Printify sync failed: ${err.message}`);
  }
  res.json({ ...base, fileUrl, thumbUrl, printifyImageId, uploadStatus: "synced" });
});

// The library is user-wide; image IDs are resolved for the destination account
// before creating/updating products. Legacy library IDs are only hints.
router.get("/library", async (req, res) => {
  const userId = (req as any).userId;
  const [designs, assets] = await Promise.all([
    prisma.listingDesign.findMany({
      where: { uploadStatus: "synced", listing: { batch: { userId } } },
      select: { fileUrl: true, thumbUrl: true, printifyImageId: true },
      distinct: ["fileUrl"],
      orderBy: { listing: { batch: { createdAt: "desc" } } },
      take: 200,
    }),
    prisma.designAsset.findMany({ where: { userId } }),
  ]);

  const assetByUrl = new Map(assets.map((a) => [a.fileUrl, a]));
  const seen = new Set(designs.map((d) => d.fileUrl));

  // A file uploaded straight from "My files" was never placed on a listing,
  // so it has no ListingDesign row — its DesignAsset row (see PATCH below,
  // which creates one on upload) is the only place it's recorded at all.
  const standalone = assets
    .filter((a) => !seen.has(a.fileUrl))
    .map((a) => ({ fileUrl: a.fileUrl, thumbUrl: a.thumbUrl, printifyImageId: a.printifyImageId }));

  const wantArchived = req.query.archived === "true";
  const search = String(req.query.search ?? "").trim().toLowerCase();
  let merged = [...designs, ...standalone]
    .map((d) => {
      const asset = assetByUrl.get(d.fileUrl);
      return { ...d, name: asset?.name ?? null, archived: asset?.archived ?? false };
    })
    .filter((d) => d.archived === wantArchived);
  if (search) {
    merged = merged.filter((d) => (d.name ?? fileNameOf(d.fileUrl)).toLowerCase().includes(search));
  }

  // Merges two separately-sourced lists (see above), so this can't be a
  // single paginated SQL query — slice the merged result instead. Still
  // spares the client from receiving/rendering everything at once, which is
  // what actually matters here (each item triggers an image-dimension probe).
  const { skip, take } = pageParams(req, 24);
  res.json({ items: merged.slice(skip, skip + take), total: merged.length });
});

// PATCH rename/archive a file, or (fileUrl + thumbUrl/printifyImageId together)
// register a standalone upload that has no ListingDesign row to back it.
router.patch("/library", async (req, res) => {
  const userId = (req as any).userId;
  const { fileUrl, name, archived, thumbUrl, printifyImageId } = req.body;
  if (!fileUrl) return res.status(400).json({ error: "fileUrl is required" });

  const data: any = {};
  if (name !== undefined) data.name = name;
  if (archived !== undefined) data.archived = archived;
  if (thumbUrl !== undefined) data.thumbUrl = thumbUrl;
  if (printifyImageId !== undefined) data.printifyImageId = printifyImageId;

  const asset = await prisma.designAsset.upsert({
    where: { userId_fileUrl: { userId, fileUrl } },
    create: { userId, fileUrl, ...data },
    update: data,
  });
  res.json(asset);
});

export default router;
