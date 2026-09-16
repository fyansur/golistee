import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { HistoryIcon, ChevronDownIcon, UnplugIcon } from "lucide-react";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { PaginationFooter } from "@/components/PaginationFooter";
import { ListingStatusBadge } from "@/components/ListingStatusBadge";

interface Shop {
  id: string;
  title: string;
  enabled: boolean;
  status: string;
  listingCount: number;
}

interface Account {
  id: string;
  label: string;
  tokenStatus: string;
  shops: Shop[];
}

interface BatchListing {
  id: string;
  title: string;
  shop: string;
  shopEnabled: boolean;
  shopStatus: string;
  accountTokenStatus: string;
  blueprintLabel: string;
  printProviderLabel: string;
  thumbnail: string | null;
  thumbnailColor: string | null;
  status: string;
  variantSummary: string | null;
}

interface Batch {
  id: string;
  total: number;
  createdAt: string;
  listings: BatchListing[];
}

function batchStatusCounts(batch: Batch) {
  const counts = new Map<string, number>();
  for (const listing of batch.listings) {
    counts.set(listing.status, (counts.get(listing.status) ?? 0) + 1);
  }
  return [...counts.entries()];
}

function BatchCardSkeleton() {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center justify-between p-5">
        <div className="space-y-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-56" />
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Skeleton className="size-5 rounded-sm" />
        </div>
      </div>
    </div>
  );
}

function ShopChipsSkeleton() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {["w-16", "w-20", "w-24", "w-14"].map((w, i) => (
        <Skeleton key={i} className={`h-6 rounded-full ${w}`} />
      ))}
    </div>
  );
}

export default function History() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [selectedShopIds, setSelectedShopIds] = useState<Set<string>>(new Set());
  const [batches, setBatches] = useState<Batch[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    api.get("/connections").then(({ data }) => setAccounts(data)).finally(() => setAccountsLoading(false));
  }, []);

  useEffect(() => {
    setLoading(true);
    api
      .get("/publish/history", {
        params: { page, pageSize, ...(selectedShopIds.size ? { shopId: [...selectedShopIds].join(",") } : {}) },
      })
      .then(({ data }) => { setBatches(data.items); setTotal(data.total); })
      .finally(() => setLoading(false));
  }, [selectedShopIds, page, pageSize]);

  useEffect(() => setPage(1), [selectedShopIds, pageSize]);

  const toggleShop = (id: string) =>
    setSelectedShopIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleExpand = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const shops = accounts.flatMap((a) => a.shops).filter((shop) => shop.listingCount > 0);

  const shopAvailability = (shop: Shop, account: Account) => {
    if (account.tokenStatus !== "active") return "Connection expired";
    if (shop.status !== "active") return "Unavailable";
    return null;
  };

  return (
    <div className="max-w-7xl mx-auto justify-center p-8 space-y-6">
      <div className="flex items-center justify-between mb-16">
        <p className="text-3xl font-black flex gap-3 items-center">
          <HistoryIcon size="24" />Publishing History
        </p>
      </div>

      <div className="flex items-center justify-between mb-8">
        <p className="text-xl font-black">Batches</p>
      </div>

      {accountsLoading ? (
        <ShopChipsSkeleton />
      ) : shops.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedShopIds(new Set())}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${selectedShopIds.size === 0
                ? "bg-accent text-primary-foreground border-accent"
                : "bg-card text-muted-foreground hover:bg-muted"
              }`}
          >
            All shops
          </button>
          {shops.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => toggleShop(s.id)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${selectedShopIds.has(s.id)
                  ? "bg-accent text-primary-foreground border-accent"
                  : "bg-card text-muted-foreground hover:bg-muted"
                }`}
            >
              {s.title}
              {!s.enabled && <UnplugIcon className="size-3.5" aria-label="Store disabled" />}
              {(() => {
                const account = accounts.find((candidate) => candidate.shops.some((shop) => shop.id === s.id));
                const availability = account ? shopAvailability(s, account) : null;
                return availability ? ` · ${availability}` : "";
              })()}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => <BatchCardSkeleton key={i} />)}
        </div>
      ) : batches.length === 0 ? (
        <Empty className="border bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon"><HistoryIcon /></EmptyMedia>
            <EmptyTitle>No Batches Yet</EmptyTitle>
            <EmptyDescription>Nothing has been published yet.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-4">
          {batches.map((b) => {
            const expanded = expandedIds.has(b.id);
            return (
              <div key={b.id} className="rounded-xl border bg-card overflow-hidden">
                <div
                  className="flex items-center justify-between p-5 cursor-pointer"
                  onClick={() => toggleExpand(b.id)}
                >
                  <div>
                    <p className="font-bold">
                      {new Date(b.createdAt).toLocaleString("en-US", { timeZone: "Asia/Jakarta" })}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {batchStatusCounts(b).map(([status, count]) => (
                        <ListingStatusBadge key={status} status={status} count={count} />
                      ))}
                      <Badge variant="outline" className="h-6 rounded-full px-2.5 text-muted-foreground">
                        {b.total} total
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <ChevronDownIcon
                      className={`size-5 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
                    />
                  </div>
                </div>

                {expanded && (
                  <div className="border-t divide-y">
                    {b.listings.length === 0 ? (
                      <p className="p-5 text-sm text-muted-foreground">No listings in this batch, or they have been deleted.</p>
                    ) : (
                      b.listings.map((l) => {
                        const title = l.title || "Untitled";
                        const availability = l.accountTokenStatus !== "active"
                          ? "Connection expired"
                          : l.shopStatus !== "active"
                            ? "Unavailable"
                            : null;
                        return (
                          <div key={l.id} className="flex items-center gap-3 p-4">
                            <div
                              className={`size-16 rounded-lg p-2 border shrink-0 overflow-hidden ${l.thumbnailColor ? "" : "bg-muted"}`}
                              style={l.thumbnailColor ? { backgroundColor: "#000" } : undefined}
                            >
                              {l.thumbnail && (
                                <img src={l.thumbnail} alt={title} className="size-full object-contain" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold truncate">{title}</p>
                              <p className="text-xs text-muted-foreground truncate">
                                {l.blueprintLabel} · {l.printProviderLabel}
                              </p>
                              {l.variantSummary && (
                                <p className="text-xs text-muted-foreground truncate">{l.variantSummary}</p>
                              )}
                              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                                <span>{l.shop}</span>
                                {!l.shopEnabled && !availability && <UnplugIcon className="size-4" aria-label="Store disabled" />}
                                {availability && <Badge variant="destructive">{availability}</Badge>}
                              </div>
                            </div>
                            <ListingStatusBadge status={l.status} className="shrink-0" />
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <PaginationFooter page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} />
    </div>
  );
}
