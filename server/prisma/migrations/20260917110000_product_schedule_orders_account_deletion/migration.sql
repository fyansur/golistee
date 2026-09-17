-- Expand product scheduling, local Printify order state, and delayed deletion.
ALTER TABLE "User" ADD COLUMN "deletionScheduledAt" TIMESTAMPTZ;
ALTER TABLE "Listing" ADD COLUMN "scheduledPublishAt" TIMESTAMPTZ;

CREATE TABLE "Order" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "printifyOrderId" TEXT NOT NULL,
  "appOrderId" TEXT,
  "status" TEXT NOT NULL,
  "customerName" TEXT,
  "customerEmail" TEXT,
  "totalPrice" INTEGER NOT NULL DEFAULT 0,
  "totalShipping" INTEGER NOT NULL DEFAULT 0,
  "totalTax" INTEGER NOT NULL DEFAULT 0,
  "addressTo" JSONB NOT NULL,
  "lineItems" JSONB NOT NULL,
  "shipments" JSONB NOT NULL,
  "metadata" JSONB NOT NULL,
  "printifyCreatedAt" TIMESTAMPTZ NOT NULL,
  "sentToProductionAt" TIMESTAMPTZ,
  "fulfilledAt" TIMESTAMPTZ,
  "syncedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actionStatus" TEXT,
  "errorMessage" TEXT,
  CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Order_shopId_printifyOrderId_key" ON "Order"("shopId", "printifyOrderId");
CREATE INDEX "Order_shopId_printifyCreatedAt_idx" ON "Order"("shopId", "printifyCreatedAt");
CREATE INDEX "Order_status_printifyCreatedAt_idx" ON "Order"("status", "printifyCreatedAt");

ALTER TABLE "Order" ADD CONSTRAINT "Order_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- User-owned records must be removable by the delayed account purge.
ALTER TABLE "CuratedBlueprint" DROP CONSTRAINT "CuratedBlueprint_userId_fkey";
ALTER TABLE "CuratedBlueprint" ADD CONSTRAINT "CuratedBlueprint_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PrintifyAccount" DROP CONSTRAINT "PrintifyAccount_userId_fkey";
ALTER TABLE "PrintifyAccount" ADD CONSTRAINT "PrintifyAccount_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Shop" DROP CONSTRAINT "Shop_printifyAccountId_fkey";
ALTER TABLE "Shop" ADD CONSTRAINT "Shop_printifyAccountId_fkey"
  FOREIGN KEY ("printifyAccountId") REFERENCES "PrintifyAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Template" DROP CONSTRAINT "Template_userId_fkey";
ALTER TABLE "Template" ADD CONSTRAINT "Template_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Listing" DROP CONSTRAINT "Listing_shopId_fkey";
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Listing" DROP CONSTRAINT "Listing_batchId_fkey";
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "PublishBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ListingDesign" DROP CONSTRAINT "ListingDesign_listingId_fkey";
ALTER TABLE "ListingDesign" ADD CONSTRAINT "ListingDesign_listingId_fkey"
  FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DesignAsset" DROP CONSTRAINT "DesignAsset_userId_fkey";
ALTER TABLE "DesignAsset" ADD CONSTRAINT "DesignAsset_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
