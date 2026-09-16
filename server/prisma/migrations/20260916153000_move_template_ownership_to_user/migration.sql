-- Templates are reusable Golistee assets. Preserve existing ownership by
-- mapping each template's former Printify account to its Golistee user.
ALTER TABLE "Template" ADD COLUMN "userId" TEXT;

UPDATE "Template" AS template
SET "userId" = account."userId"
FROM "PrintifyAccount" AS account
WHERE template."printifyAccountId" = account."id";

ALTER TABLE "Template" ALTER COLUMN "userId" SET NOT NULL;

ALTER TABLE "Template" DROP CONSTRAINT "Template_printifyAccountId_fkey";
DROP INDEX IF EXISTS "Template_printifyAccountId_idx";
ALTER TABLE "Template" DROP COLUMN "printifyAccountId";

CREATE INDEX "Template_userId_idx" ON "Template"("userId");
ALTER TABLE "Template" ADD CONSTRAINT "Template_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
