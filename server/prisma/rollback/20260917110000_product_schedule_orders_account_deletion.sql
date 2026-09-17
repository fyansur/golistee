-- Manual rollback only. Order rows and scheduled timestamps are destroyed.
DROP TABLE IF EXISTS "Order";
ALTER TABLE "Listing" DROP COLUMN IF EXISTS "scheduledPublishAt";
ALTER TABLE "User" DROP COLUMN IF EXISTS "deletionScheduledAt";

ALTER TABLE "CuratedBlueprint" DROP CONSTRAINT "CuratedBlueprint_userId_fkey";
ALTER TABLE "CuratedBlueprint" ADD CONSTRAINT "CuratedBlueprint_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PrintifyAccount" DROP CONSTRAINT "PrintifyAccount_userId_fkey";
ALTER TABLE "PrintifyAccount" ADD CONSTRAINT "PrintifyAccount_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Shop" DROP CONSTRAINT "Shop_printifyAccountId_fkey";
ALTER TABLE "Shop" ADD CONSTRAINT "Shop_printifyAccountId_fkey"
  FOREIGN KEY ("printifyAccountId") REFERENCES "PrintifyAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Template" DROP CONSTRAINT "Template_userId_fkey";
ALTER TABLE "Template" ADD CONSTRAINT "Template_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Listing" DROP CONSTRAINT "Listing_shopId_fkey";
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Listing" DROP CONSTRAINT "Listing_batchId_fkey";
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "PublishBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ListingDesign" DROP CONSTRAINT "ListingDesign_listingId_fkey";
ALTER TABLE "ListingDesign" ADD CONSTRAINT "ListingDesign_listingId_fkey"
  FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DesignAsset" DROP CONSTRAINT "DesignAsset_userId_fkey";
ALTER TABLE "DesignAsset" ADD CONSTRAINT "DesignAsset_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
