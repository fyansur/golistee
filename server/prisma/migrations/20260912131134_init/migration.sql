-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CuratedBlueprint" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "blueprintId" INTEGER NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "images" JSONB NOT NULL,
    "addedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CuratedBlueprint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrintifyAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "tokenStatus" TEXT NOT NULL DEFAULT 'active',
    "connectedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrintifyAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL,
    "printifyAccountId" TEXT NOT NULL,
    "printifyShopId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "salesChannel" TEXT NOT NULL,

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL,
    "printifyAccountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "blueprintId" INTEGER NOT NULL,
    "blueprintLabel" TEXT NOT NULL,
    "printProviderId" INTEGER NOT NULL,
    "printProviderLabel" TEXT NOT NULL,
    "variants" JSONB NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublishBatch" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "blueprintId" INTEGER NOT NULL,
    "blueprintLabel" TEXT NOT NULL,
    "printProviderId" INTEGER NOT NULL,
    "printProviderLabel" TEXT NOT NULL,
    "total" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublishBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "tags" TEXT[],
    "variants" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "errorMessage" TEXT,
    "printifyProductId" TEXT,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingDesign" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "position" TEXT,
    "variantIds" INTEGER[],
    "fileUrl" TEXT NOT NULL,
    "printifyImageId" TEXT,
    "localBackupPath" TEXT,
    "x" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "y" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "scale" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "angle" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "uploadStatus" TEXT NOT NULL DEFAULT 'uploading',
    "uploadError" TEXT,

    CONSTRAINT "ListingDesign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- AddForeignKey
ALTER TABLE "CuratedBlueprint" ADD CONSTRAINT "CuratedBlueprint_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintifyAccount" ADD CONSTRAINT "PrintifyAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shop" ADD CONSTRAINT "Shop_printifyAccountId_fkey" FOREIGN KEY ("printifyAccountId") REFERENCES "PrintifyAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Template" ADD CONSTRAINT "Template_printifyAccountId_fkey" FOREIGN KEY ("printifyAccountId") REFERENCES "PrintifyAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishBatch" ADD CONSTRAINT "PublishBatch_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "PublishBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingDesign" ADD CONSTRAINT "ListingDesign_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
