import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Package, PlusIcon, Trash2Icon, Box, SendIcon, CopyIcon, UnplugIcon, CalendarClockIcon, SearchIcon, Pencil } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "react-router-dom";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { PaginationFooter } from "@/components/PaginationFooter";
import { Badge } from "@/components/ui/badge";
import { ListingStatusBadge } from "@/components/ListingStatusBadge";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { localDateTime } from "@/lib/utils";
import { FILTERABLE_STATUSES } from "@/lib/listingStatus";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { ShopFilterSelect } from "@/components/ShopFilterSelect";
import { StatusFilterChips } from "@/components/StatusFilterChips";

function ProductRowSkeleton() {
  return (
    <TableRow className="h-36">
      <TableCell className="pl-4">
        <Skeleton className="size-4 rounded-sm" />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-3">
          <Skeleton className="size-20 rounded-lg shrink-0" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/4" />
          </div>
        </div>
      </TableCell>
      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
      <TableCell><Skeleton className="h-4 w-14" /></TableCell>
      <TableCell>
        <div className="flex items-center gap-1 justify-center">
          <Skeleton className="size-8 rounded-md" />
          <Skeleton className="size-8 rounded-md" />
        </div>
      </TableCell>
    </TableRow>
  );
}

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

interface OperationalShop {
  id: string;
  title: string;
  printifyAccountId: string;
  accountLabel: string;
}

interface Product {
  id: string;
  title: string;
  shop: string;
  shopId: string;
  shopEnabled: boolean;
  shopStatus: string;
  accountTokenStatus: string;
  blueprintLabel: string;
  printProviderLabel: string;
  thumbnail: string | null;
  thumbnailColor: string | null;
  totalVariants: number;
  enabledVariants: number;
  status: string;
  errorMessage: string | null;
  hasPrintifyProduct: boolean;
  unitsSold: number;
  variantSummary: string | null;
  scheduledPublishAt: string | null;
}


export default function Products() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [operationalShops, setOperationalShops] = useState<OperationalShop[]>([]);
  const [selectedShopId, setSelectedShopId] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [copyTargetShop, setCopyTargetShop] = useState("");
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [scheduleAt, setScheduleAt] = useState(() => localDateTime(new Date(Date.now() + 60 * 60_000)));
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);

  useEffect(() => {
    api.get("/connections").then(({ data }) => setAccounts(data));
    api.get("/connections/shops").then(({ data }) => setOperationalShops(data));
  }, []);

  // Filters change on separate triggers (a click, a debounce timer) that can
  // overlap in flight — without this guard, an older request resolving after
  // a newer one would clobber the newer, correct result.
  const fetchRequestId = useRef(0);
  const fetchProducts = () => {
    const requestId = ++fetchRequestId.current;
    setLoading(true);
    api
      .get("/publish/listings", {
        params: {
          page, pageSize,
          ...(selectedShopId ? { shopId: selectedShopId } : {}),
          ...(selectedStatus ? { status: selectedStatus } : {}),
          ...(debouncedSearch ? { search: debouncedSearch } : {}),
        },
      })
      .then(({ data }) => {
        if (requestId !== fetchRequestId.current) return;
        setProducts(data.items); setTotal(data.total);
      })
      .finally(() => { if (requestId === fetchRequestId.current) setLoading(false); });
  };

  useEffect(() => { fetchProducts(); }, [selectedShopId, selectedStatus, debouncedSearch, page, pageSize]);
  useEffect(() => setPage(1), [selectedShopId, selectedStatus, debouncedSearch, pageSize]);
  useEffect(() => setSelectedIds(new Set()), [selectedShopId, selectedStatus, debouncedSearch]);

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const allSelected = products.length > 0 && selectedIds.size === products.length;
  const toggleSelectAll = () => setSelectedIds(allSelected ? new Set() : new Set(products.map((p) => p.id)));

  const deleteProduct = async (id: string) => {
    try {
      await api.delete(`/publish/listing/${id}`);
      toast.success("Product deleted");
      fetchProducts();
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? "Failed to delete product");
    }
  };

  // Bulk actions run in the background on the server now (a real selection
  // can be dozens of sequential Printify calls) — the response is just an
  // acknowledgment, not a final count. Status per row catches up on refetch.
  const bulkPublish = async () => {
    setBulkBusy(true);
    try {
      const { data } = await api.post("/publish/listings/bulk-publish", { ids: [...selectedIds] });
      toast.success(`${data.queued} product(s) queued for publishing`);
      setSelectedIds(new Set());
      fetchProducts();
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? "Bulk publish failed");
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkDelete = async () => {
    setBulkBusy(true);
    try {
      const { data } = await api.post("/publish/listings/bulk-delete", { ids: [...selectedIds] });
      toast.success(`${data.queued} product(s) queued for deletion`);
      setSelectedIds(new Set());
      fetchProducts();
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? "Bulk delete failed");
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkCopy = async () => {
    if (!copyTargetShop) return;
    setBulkBusy(true);
    try {
      const { data } = await api.post("/publish/listings/bulk-copy", { ids: [...selectedIds], targetShopId: copyTargetShop });
      toast.success(`${data.queued} product(s) queued to copy as draft`);
      setCopyDialogOpen(false);
      setCopyTargetShop("");
      setSelectedIds(new Set());
      fetchProducts();
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? "Copy failed");
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkSchedule = async () => {
    setBulkBusy(true);
    try {
      const { data } = await api.post("/publish/listings/schedule", {
        ids: [...selectedIds], publishAt: new Date(scheduleAt).toISOString(),
      });
      toast.success(`${data.scheduled} product(s) scheduled`);
      setScheduleDialogOpen(false);
      setSelectedIds(new Set());
      fetchProducts();
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? "Scheduling failed");
    } finally {
      setBulkBusy(false);
    }
  };

  const cancelSchedule = async () => {
    setBulkBusy(true);
    try {
      const { data } = await api.post("/publish/listings/cancel-schedule", { ids: [...selectedIds] });
      toast.success(`${data.canceled} schedule(s) canceled`);
      setSelectedIds(new Set());
      fetchProducts();
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? "Could not cancel schedule");
    } finally {
      setBulkBusy(false);
    }
  };

  const shops = accounts.flatMap((a) => a.shops).filter((shop) => shop.listingCount > 0);
  const selectedProducts = products.filter((product) => selectedIds.has(product.id));
  const selectedPublishBlocked = selectedProducts.some((product) =>
    !product.shopEnabled || product.shopStatus !== "active" || product.accountTokenStatus !== "active"
  );
  const selectedDeleteBlocked = selectedProducts.some((product) =>
    product.hasPrintifyProduct && (!product.shopEnabled || product.shopStatus !== "active" || product.accountTokenStatus !== "active")
  );
  const selectedOperationBlocked = selectedProducts.some((product) =>
    ["queued", "draft_queued", "creating", "scheduled"].includes(product.status)
  );
  const allSelectedScheduled = selectedProducts.length > 0 && selectedProducts.every((product) => product.status === "scheduled");

  const productAvailability = (product: Product) => {
    if (product.accountTokenStatus !== "active") return "Connection expired";
    if (product.shopStatus !== "active") return "Unavailable";
    return null;
  };

  return (
    <div className="max-w-7xl mx-auto justify-center p-8 space-y-6">
      <div className="flex items-center justify-between mb-16">
        <p className="text-3xl font-black flex gap-3 items-center">
          <Package size="24" />Products
        </p>
      </div>
      <div className="flex items-center justify-between mb-8">
        <p className="text-xl font-black">All Products</p>
        <Button className="bg-accent hover:bg-accent/80" onClick={() => navigate("/create")}>
          <PlusIcon className="size-4" />
          List Products
        </Button>
      </div>

      <div className="flex flex-row items-center gap-2">
      <InputGroup className="w-full bg-card!">
        <InputGroupAddon align="inline-start">
          <SearchIcon className="size-4" />
        </InputGroupAddon>
        <InputGroupInput
          placeholder="Search by title"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </InputGroup>
      <ShopFilterSelect shops={shops} value={selectedShopId} onChange={setSelectedShopId} className="bg-card!" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusFilterChips
          statuses={FILTERABLE_STATUSES}
          value={selectedStatus}
          onChange={setSelectedStatus}
          renderBadge={(s) => <ListingStatusBadge status={s} />}
        />
      </div>

      {loading ? (
        <div className="border rounded-lg overflow-hidden">
          <Table className="table-fixed bg-card">
            <colgroup>
              <col className="w-10" />
              <col />
              <col className="w-32" />
              <col className="w-36" />
              <col className="w-28" />
              <col className="w-24" />
            </colgroup>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4 py-4" />
                <TableHead>Product</TableHead>
                <TableHead>Shop</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Sales</TableHead>
                <TableHead className="text-center" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 5 }).map((_, i) => <ProductRowSkeleton key={i} />)}
            </TableBody>
          </Table>
        </div>
      ) : products.length === 0 ? (
        <Empty className="border bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon"><Box /></EmptyMedia>
            <EmptyTitle>No Products</EmptyTitle>
            <EmptyDescription>
              You currently have no products listed. Start adding products to see them here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="border rounded-lg overflow-hidden">
            <Table className="table-fixed bg-card">
              <colgroup>
                <col className="w-[3%]" />
                <col className="w-[40%]"/>
                <col className="w-[15%]" />
                <col className="w-[10%]" />
                <col className="w-[15%]" />
                <col/>
              </colgroup>
              <TableHeader>
                <TableRow className="bg-card">
                  <TableHead className="p-6 py-10">
                    <Checkbox
                      checked={allSelected}
                      indeterminate={selectedIds.size > 0 && !allSelected}
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  {selectedIds.size > 0 ? (
                    <TableHead colSpan={5} className="p-6">
                      <div className="flex items-center gap-3 justify-between w-full">
                        <span className="text-sm font-medium">{selectedIds.size}/{products.length}</span>
                        <div className="ml-auto flex items-center gap-2">
                          <Button variant="outline" onClick={bulkPublish} disabled={bulkBusy || selectedPublishBlocked || selectedOperationBlocked} title={selectedPublishBlocked ? "Enable every selected product's store before publishing" : undefined} className="font-medium text-xs">
                            <SendIcon className="size-4" /> Publish
                          </Button>
                          {allSelectedScheduled ? (
                            <Button variant="outline" onClick={cancelSchedule} disabled={bulkBusy} className="font-medium text-xs">
                              <CalendarClockIcon className="size-4" /> Cancel schedule
                            </Button>
                          ) : (
                            <Button variant="outline" onClick={() => setScheduleDialogOpen(true)} disabled={bulkBusy || selectedPublishBlocked || selectedOperationBlocked} className="font-medium text-xs">
                              <CalendarClockIcon className="size-4" /> Schedule
                            </Button>
                          )}
                          <Button variant="outline" onClick={() => setCopyDialogOpen(true)} disabled={bulkBusy} className="font-medium text-xs">
                            <CopyIcon className="size-4" /> Copy as a draft
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger render={
                              <Button variant="outline" className="text-destructive border-destructive hover:text-destructive font-medium text-xs" disabled={bulkBusy || selectedDeleteBlocked} title={selectedDeleteBlocked ? "Enable stores before deleting products from Printify" : undefined} />
                            }>
                              <Trash2Icon className="size-4" /> Delete
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete {selectedIds.size} product(s)?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This deletes each selected product from Golistee, and from Printify and its
                                  connected sales channel (e.g. Etsy) if it's live there. This cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={bulkDelete}>Delete</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </TableHead>
                  ) : (
                    <>
                      <TableHead className="p-6 font-bold">Product</TableHead>
                      <TableHead className="p-6 font-bold">Shop</TableHead>
                      <TableHead className="p-6 font-bold">Sales</TableHead>
                      <TableHead className="p-6 font-bold">Status</TableHead>
                      <TableHead className="p-6 font-bold"/>
                    </>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((p) => {
                  const title = p.title || "Untitled";
                  const availability = productAvailability(p);
                  return (
                    <TableRow key={p.id} data-state={selectedIds.has(p.id) ? "selected" : undefined} className="h-36">  
                      <TableCell className="p-6">
                        <Checkbox checked={selectedIds.has(p.id)} onCheckedChange={() => toggleSelect(p.id)} />
                      </TableCell>
                      <TableCell className="p-6">
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`size-20 rounded-lg p-2 border shrink-0 overflow-hidden ${p.thumbnailColor ? "" : "bg-muted"}`}
                            style={p.thumbnailColor ? { backgroundColor: "#000" } : undefined}
                          >
                            {p.thumbnail && (
                              <img src={p.thumbnail} alt={title} className="size-full object-contain" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold truncate">{title}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {p.printProviderLabel} · {p.blueprintLabel}
                            </p>
                            {p.variantSummary && (
                              <p className="text-xs text-muted-foreground truncate">{p.variantSummary}</p>
                            )}
                            {p.status === "failed" && p.errorMessage && (
                              <p className="text-xs text-destructive truncate">{p.errorMessage}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="p-6">
                        <div className="flex min-w-0 flex-col items-start gap-1">
                          <span className="max-w-full truncate">{p.shop}</span>
                          {!p.shopEnabled && !availability && <UnplugIcon className="size-4 text-muted-foreground" aria-label="Store disabled" />}
                          {availability && <Badge variant="destructive">{availability}</Badge>}
                        </div>
                      </TableCell>

                      <TableCell className="p-6">
                        <p className="font-medium">{p.unitsSold} sold</p>
                      </TableCell>

                      <TableCell className="p-6">
                        <ListingStatusBadge status={p.status} />
                        {p.scheduledPublishAt && (
                          <p className="mt-1 text-xs text-muted-foreground">{new Date(p.scheduledPublishAt).toLocaleString()}</p>
                        )}
                      </TableCell>

                      <TableCell className="p-6">
                        <div className="flex items-center gap-2 justify-end text-muted-foreground">
                          <Button variant="outline" size="sm" onClick={() => navigate(`/products/${p.id}`)}>
                            <Pencil className="size-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger render={<Button variant="outline" size="sm" className="text-destructive" disabled={p.hasPrintifyProduct && (!p.shopEnabled || p.shopStatus !== "active" || p.accountTokenStatus !== "active")} title={p.hasPrintifyProduct && (!p.shopEnabled || p.shopStatus !== "active" || p.accountTokenStatus !== "active") ? "Enable this store before deleting the product from Printify" : undefined} />}>
                              <Trash2Icon className="size-4" />
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete product?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {p.hasPrintifyProduct
                                    ? `This deletes "${title}" from Golistee, Printify, and its connected sales channel (e.g. Etsy). This cannot be undone.`
                                    : `This removes "${title}" from Golistee. This cannot be undone.`}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deleteProduct(p.id)}>
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <PaginationFooter page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} />
        </>
      )}

      <Dialog open={copyDialogOpen} onOpenChange={(o) => { setCopyDialogOpen(o); if (!o) setCopyTargetShop(""); }}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Copy to Other Shop</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-1">
            <Label>Target store</Label>
            <Select value={copyTargetShop} onValueChange={(v) => setCopyTargetShop(v ?? "")}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a store...">
                  {copyTargetShop ? operationalShops.find((s) => s.id === copyTargetShop)?.title : "Select a store..."}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {[...new Set(operationalShops.map((shop) => shop.accountLabel))].map((accountLabel) => (
                  <SelectGroup key={accountLabel}>
                    <SelectLabel>{accountLabel}</SelectLabel>
                    {operationalShops.filter((shop) => shop.accountLabel === accountLabel).map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCopyDialogOpen(false)}>Cancel</Button>
            <Button onClick={bulkCopy} disabled={!copyTargetShop || bulkBusy}>
              {bulkBusy ? "Copying..." : `Copy ${selectedIds.size} as Draft`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader><DialogTitle>Schedule publishing</DialogTitle></DialogHeader>
          <div className="space-y-1">
            <Label htmlFor="publish-at">Publish {selectedIds.size} product(s) at</Label>
            <Input
              id="publish-at"
              type="datetime-local"
              value={scheduleAt}
              min={localDateTime(new Date(Date.now() + 60_000))}
              onChange={(event) => setScheduleAt(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">Uses your current timezone.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleDialogOpen(false)}>Cancel</Button>
            <Button onClick={bulkSchedule} disabled={!scheduleAt || bulkBusy}>Schedule</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
