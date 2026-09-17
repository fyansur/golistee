-- Match Prisma's @default(now()) contract for jobs inserted outside Prisma.
ALTER TABLE "BackgroundJob" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
