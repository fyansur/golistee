/*
  Warnings:

  - You are about to drop the column `blueprintId` on the `PublishBatch` table. All the data in the column will be lost.
  - You are about to drop the column `blueprintLabel` on the `PublishBatch` table. All the data in the column will be lost.
  - You are about to drop the column `printProviderId` on the `PublishBatch` table. All the data in the column will be lost.
  - You are about to drop the column `printProviderLabel` on the `PublishBatch` table. All the data in the column will be lost.
  - You are about to drop the column `shopId` on the `PublishBatch` table. All the data in the column will be lost.
  - Added the required column `blueprintId` to the `Listing` table without a default value. This is not possible if the table is not empty.
  - Added the required column `blueprintLabel` to the `Listing` table without a default value. This is not possible if the table is not empty.
  - Added the required column `printProviderId` to the `Listing` table without a default value. This is not possible if the table is not empty.
  - Added the required column `printProviderLabel` to the `Listing` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `PublishBatch` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "PublishBatch" DROP CONSTRAINT "PublishBatch_shopId_fkey";

-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "blueprintId" INTEGER NOT NULL,
ADD COLUMN     "blueprintLabel" TEXT NOT NULL,
ADD COLUMN     "printProviderId" INTEGER NOT NULL,
ADD COLUMN     "printProviderLabel" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "PublishBatch" DROP COLUMN "blueprintId",
DROP COLUMN "blueprintLabel",
DROP COLUMN "printProviderId",
DROP COLUMN "printProviderLabel",
DROP COLUMN "shopId",
ADD COLUMN     "shopIds" TEXT[],
ADD COLUMN     "userId" TEXT NOT NULL;
