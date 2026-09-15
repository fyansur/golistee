-- CreateIndex
CREATE INDEX "CuratedBlueprint_userId_idx" ON "CuratedBlueprint"("userId");

-- CreateIndex
CREATE INDEX "Listing_batchId_idx" ON "Listing"("batchId");

-- CreateIndex
CREATE INDEX "Listing_shopId_idx" ON "Listing"("shopId");

-- CreateIndex
CREATE INDEX "ListingDesign_listingId_idx" ON "ListingDesign"("listingId");

-- CreateIndex
CREATE INDEX "PrintifyAccount_userId_idx" ON "PrintifyAccount"("userId");

-- CreateIndex
CREATE INDEX "PublishBatch_userId_idx" ON "PublishBatch"("userId");

-- CreateIndex
CREATE INDEX "Shop_printifyAccountId_idx" ON "Shop"("printifyAccountId");

-- CreateIndex
CREATE INDEX "Template_printifyAccountId_idx" ON "Template"("printifyAccountId");
