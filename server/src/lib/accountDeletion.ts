import { DeleteObjectsCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { prisma } from "./prisma.js";
import { r2 } from "./r2.js";
import { decryptToken } from "./crypto.js";
import { printifyFetch, printifyJson } from "./printify.js";
import type { JobHandler } from "./backgroundJobs.js";

async function deleteStoredFiles(userId: string) {
  const bucket = process.env.R2_BUCKET;
  if (!bucket) return;
  while (true) {
    const page = await r2.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: `designs/${userId}/`,
      MaxKeys: 1000,
    }));
    const objects = (page.Contents ?? []).flatMap((object) => object.Key ? [{ Key: object.Key }] : []);
    if (objects.length === 0) return;
    await r2.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objects, Quiet: true } }));
  }
}

async function removeOrderWebhooks(userId: string) {
  const baseUrl = process.env.PUBLIC_BASE_URL?.replace(/\/$/, "");
  if (!baseUrl) return;
  const webhookUrl = `${baseUrl}/api/orders/webhook`;
  const host = new URL(webhookUrl).host;
  const shops = await prisma.shop.findMany({
    where: { account: { userId } },
    include: { account: true },
  });
  for (const shop of shops) {
    try {
      const token = decryptToken(shop.account.accessToken);
      const hooks = await printifyJson<any[]>(
        `https://api.printify.com/v1/shops/${shop.printifyShopId}/webhooks.json`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      for (const hook of hooks.filter((candidate) => candidate.url === webhookUrl)) {
        await printifyFetch(
          `https://api.printify.com/v1/shops/${shop.printifyShopId}/webhooks/${hook.id}.json?host=${encodeURIComponent(host)}`,
          { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
        );
      }
    } catch (error) {
      console.error(`Could not remove Printify webhooks for shop ${shop.id}:`, error);
    }
  }
}

async function deleteAccount(userId: string, scheduledAt: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { deletionScheduledAt: true },
  });
  if (!user?.deletionScheduledAt || user.deletionScheduledAt.toISOString() !== scheduledAt) return;
  if (user.deletionScheduledAt.getTime() > Date.now()) throw new Error("Account deletion ran before its due time");
  await removeOrderWebhooks(userId);
  await deleteStoredFiles(userId);
  await prisma.user.deleteMany({ where: { id: userId, deletionScheduledAt: user.deletionScheduledAt } });
}

export const accountJobHandlers: Record<string, JobHandler> = {
  delete_account: ({ userId, scheduledAt }) => deleteAccount(String(userId), String(scheduledAt)),
};
