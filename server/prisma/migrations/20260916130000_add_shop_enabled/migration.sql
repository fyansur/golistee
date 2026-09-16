ALTER TABLE "Shop" ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT true;

CREATE UNIQUE INDEX "Shop_printifyAccountId_printifyShopId_key"
ON "Shop"("printifyAccountId", "printifyShopId");
