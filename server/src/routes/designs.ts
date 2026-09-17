import { Router } from "express";
import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { unlink } from "node:fs/promises";
import os from "node:os";
import multer from "multer";
import sharp from "sharp";
import { Upload } from "@aws-sdk/lib-storage";
import { r2 } from "../lib/r2.js";
import { prisma } from "../lib/prisma.js";
import { auth } from "../lib/middleware.js";
import { pageParams } from "../lib/pagination.js";
import { ensurePrintifyImage } from "../lib/printifyImages.js";
import { findCatalogAccount, usableShopWhere } from "../lib/shopAccess.js";

const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

const router = Router();
const upload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (_req, file, cb) => cb(null, `${randomUUID()}-${file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_")}`),
  }),
  limits: { fileSize: 100 * 1024 * 1024 }, // print files can be large; still bounded
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) return cb(new Error("Unsupported file type"));
    cb(null, true);
  },
});
router.use(auth);

router.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });
  try {
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

    try {
      await new Upload({
        client: r2,
        params: {
          Bucket: process.env.R2_BUCKET!,
          Key: key,
          Body: createReadStream(req.file.path),
          ContentType: req.file.mimetype,
        },
      }).done();
    } catch (err: any) {
      return fail("", `Upload to storage failed: ${err.message}`);
    }

    const fileUrl = `${process.env.R2_PUBLIC_URL}/${key}`;
    const metadata = await sharp(req.file.path).metadata().catch(() => null);
    let thumbUrl: string | null = null;
    try {
      const thumbBuffer = await sharp(req.file.path)
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

    const assetData = {
      thumbUrl,
      sizeBytes: req.file.size,
      width: metadata?.width ?? null,
      height: metadata?.height ?? null,
      mimeType: req.file.mimetype,
    };
    await prisma.designAsset.upsert({
      where: { userId_fileUrl: { userId, fileUrl } },
      create: { userId, fileUrl, ...assetData }, update: assetData,
    });

    let printifyImageId: string;
    try {
      printifyImageId = await ensurePrintifyImage(account, { fileUrl });
    } catch (err: any) {
      return fail(fileUrl, `Printify sync failed: ${err.message}`);
    }
    await prisma.designAsset.update({
      where: { userId_fileUrl: { userId, fileUrl } }, data: { printifyImageId },
    });
    res.json({ ...base, fileUrl, thumbUrl, printifyImageId, uploadStatus: "synced" });
  } finally {
    await unlink(req.file.path).catch(() => {});
  }
});

// The library is user-wide; image IDs are resolved for the destination account
// before creating/updating products. Legacy library IDs are only hints.
router.get("/library", async (req, res) => {
  const userId = (req as any).userId;
  const wantArchived = req.query.archived === "true";
  const search = String(req.query.search ?? "").trim();
  const where = {
    userId,
    archived: wantArchived,
    ...(search ? { OR: [
      { name: { contains: search, mode: "insensitive" as const } },
      { fileUrl: { contains: search, mode: "insensitive" as const } },
    ] } : {}),
  };
  const { skip, take } = pageParams(req, 24);
  const [total, items] = await Promise.all([
    prisma.designAsset.count({ where }),
    prisma.designAsset.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
  ]);
  res.json({ items, total });
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
