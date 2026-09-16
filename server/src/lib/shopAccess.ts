import { prisma } from "./prisma.js";

export const usableShopWhere = (userId: string) => ({
  enabled: true,
  status: "active",
  account: { userId, tokenStatus: "active" },
});

export function shopAccessError(shop: any): string | null {
  if (!shop.enabled) return "This store is disabled in Golistee. Enable it from Connections first.";
  if (shop.status !== "active") return "This store is unavailable on Printify. Sync it from Connections first.";
  if (shop.account?.tokenStatus !== "active") return "This store's Printify connection has expired. Reconnect it first.";
  return null;
}

export async function findCatalogAccount(userId: string) {
  return prisma.printifyAccount.findFirst({
    where: {
      userId,
      tokenStatus: "active",
      shops: { some: { enabled: true, status: "active" } },
    },
    orderBy: { connectedAt: "asc" },
  });
}
