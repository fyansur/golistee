import type { Options, Store } from "express-rate-limit";
import { prisma } from "./prisma.js";

export class PostgresRateLimitStore implements Store {
  localKeys = false;
  private windowMs = 60_000;

  init(options: Options) {
    this.windowMs = options.windowMs;
  }

  async increment(key: string) {
    const resetAt = new Date(Date.now() + this.windowMs);
    const [row] = await prisma.$queryRaw<{ totalHits: number; resetTime: Date }[]>`
      INSERT INTO "RateLimitCounter" ("key", "totalHits", "resetAt")
      VALUES (${key}, 1, ${resetAt})
      ON CONFLICT ("key") DO UPDATE SET
        "totalHits" = CASE
          WHEN "RateLimitCounter"."resetAt" <= CURRENT_TIMESTAMP THEN 1
          ELSE "RateLimitCounter"."totalHits" + 1
        END,
        "resetAt" = CASE
          WHEN "RateLimitCounter"."resetAt" <= CURRENT_TIMESTAMP THEN EXCLUDED."resetAt"
          ELSE "RateLimitCounter"."resetAt"
        END
      RETURNING "totalHits", "resetAt" AS "resetTime"
    `;
    return row;
  }

  async decrement(key: string) {
    await prisma.rateLimitCounter.updateMany({
      where: { key, totalHits: { gt: 0 } },
      data: { totalHits: { decrement: 1 } },
    });
  }

  async resetKey(key: string) {
    await prisma.rateLimitCounter.deleteMany({ where: { key } });
  }
}
