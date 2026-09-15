-- CreateTable
CREATE TABLE "DesignAsset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "name" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "DesignAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DesignAsset_userId_fileUrl_key" ON "DesignAsset"("userId", "fileUrl");

-- AddForeignKey
ALTER TABLE "DesignAsset" ADD CONSTRAINT "DesignAsset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
