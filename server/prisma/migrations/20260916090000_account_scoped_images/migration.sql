CREATE TABLE "PrintifyImage" (
    "printifyAccountId" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "printifyImageId" TEXT NOT NULL,
    CONSTRAINT "PrintifyImage_pkey" PRIMARY KEY ("printifyAccountId", "fileUrl")
);

ALTER TABLE "PrintifyImage" ADD CONSTRAINT "PrintifyImage_printifyAccountId_fkey"
FOREIGN KEY ("printifyAccountId") REFERENCES "PrintifyAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Legacy IDs have no recorded owner. Verify them against the target account
-- on first use instead of assigning them to an assumed account here.
