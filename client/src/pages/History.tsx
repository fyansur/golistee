import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { HistoryIcon, ChevronDownIcon } from "lucide-react";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { LISTING_STATUS } from "@/lib/listingStatus";
import { PaginationFooter } from "@/components/PaginationFooter";

interface Shop {
  id: string;
  title: string;
}

interface Account {
  id: string;
  label: string;
  shops: Shop[];
}

interface BatchListing {
  id: string;
  title: string;
  blueprintLabel: string;
  printProviderLabel: string;
  thumbnail: string | null;
  thumbnailColor: string | null;
  status: string;
  variantSummary: string | null;
}

interface Batch {
  id: string;
  status: string;
  total: number;
  successCount: number;
  failedCount: number;
  createdAt: string;
  listings: BatchListing[];
}
const BATCH_STATUS_BADGE_COLOR: Record<string, string> = {
  done: "dark:bg-sky-500",
  queued: "dark:bg-amber-700",
  pending: "dark:bg-amber-700",
  failed: "dark:bg-red-900",
};

const BATCH_STATUS_LABELS: Record<string, string> = {
  done: "Success",
  queued: "Queued",
  pending: "Pending",
  failed: "Failed",
};

export default function History() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedShopIds, setSelectedShopIds] = useState<Set<string>>(new Set());
  const [batches, setBatches] = useState<Batch[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    api.get("/connections").then(({ data }) => setAccounts(data));
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

  const shops = accounts.flatMap((a) => a.shops);

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

      {shops.length > 0 && (
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
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${selectedShopIds.has(s.id)
                  ? "bg-accent text-primary-foreground border-accent"
                  : "bg-card text-muted-foreground hover:bg-muted"
                }`}
            >
              {s.title}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <></>
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
                    <p className="text-sm text-muted-foreground">
                      {b.successCount} published · {b.failedCount} failed · {b.total} total
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Badge className={`${BATCH_STATUS_BADGE_COLOR[b.status] ?? "bg-emerald-500"} text-white`}>{BATCH_STATUS_LABELS[b.status] ?? b.status}</Badge>
                    <ChevronDownIcon
                      className={`size-5 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
                    />
                  </div>
                </div>

                {expanded && (
                  <div className="border-t divide-y">
                    {b.listings.length === 0 ? (
                      <p className="p-5 text-sm text-muted-foreground">No listings in this batch.</p>
                    ) : (
                      b.listings.map((l) => {
                        const status = LISTING_STATUS[l.status] ?? { label: l.status, dot: "bg-muted-foreground" };
                        const title = l.title || "Untitled";
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
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className={`size-2 rounded-full ${status.dot}`} />
                              <span className="text-sm">{status.label}</span>
                            </div>
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
