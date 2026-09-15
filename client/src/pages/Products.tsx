import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Package, PlusIcon, PaintbrushIcon, Trash2Icon, Box, SendIcon, CopyIcon } from "lucide-react";
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
import { useNavigate } from "react-router-dom";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty";
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

interface Product {
  id: string;
  title: string;
  shop: string;
  blueprintLabel: string;
  printProviderLabel: string;
  thumbnail: string | null;
  thumbnailColor: string | null;
  totalVariants: number;
  enabledVariants: number;
  status: string;
  errorMessage: string | null;
  hasPrintifyProduct: boolean;
  sales: number;
  variantSummary: string | null;
}

export default function Products() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedShopIds, setSelectedShopIds] = useState<Set<string>>(new Set());
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [copyTargetShop, setCopyTargetShop] = useState("");

  useEffect(() => {
    api.get("/connections").then(({ data }) => setAccounts(data));
  }, []);

  const fetchProducts = () => {
    setLoading(true);
    api
      .get("/publish/listings", {
        params: { page, pageSize, ...(selectedShopIds.size ? { shopId: [...selectedShopIds].join(",") } : {}) },
      })
      .then(({ data }) => { setProducts(data.items); setTotal(data.total); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchProducts(); }, [selectedShopIds, page, pageSize]);
  useEffect(() => setPage(1), [selectedShopIds, pageSize]);
  useEffect(() => setSelectedIds(new Set()), [selectedShopIds]);

  const toggleShop = (id: string) =>
    setSelectedShopIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

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

  const shops = accounts.flatMap((a) => a.shops);

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

      {shops.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedShopIds(new Set())}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${selectedShopIds.size === 0
                ? "bg-accent text-primary-foreground border-accent"
                : "bg-transparent text-muted-foreground hover:bg-muted"
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
                  : "bg-transparent text-muted-foreground hover:bg-muted"
                }`}
            >
              {s.title}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading products…</p>
      ) : products.length === 0 ? (
        <Empty className="border bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon"><Box /></EmptyMedia>
            <EmptyTitle>No Products</EmptyTitle>
            <EmptyDescription>
              You currently have no products listed. Start adding products to see them here.
            </EmptyDescription>
            <EmptyContent>
              <Button onClick={() => navigate("/create")}>Start Adding Products</Button>
            </EmptyContent>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="border rounded-lg overflow-hidden">
            <Table className="table-fixed bg-card">
              {/* Column widths are fixed here, independent of what each row
                  renders — the selected-state header collapses 4 columns into
                  one colSpan cell, which would otherwise reflow every column
                  (table-auto sizes off each row's actual content) every time
                  a checkbox is toggled. */}
              <colgroup>
                <col className="w-10" />
                <col className="w-[80%]" />
                <col className="w-[15%]" />
                <col className="w-[15%]" />
                <col className="w-[10%]" />
              </colgroup>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4 py-4">
                    <Checkbox
                      checked={allSelected}
                      indeterminate={selectedIds.size > 0 && !allSelected}
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  {selectedIds.size > 0 ? (
                    <TableHead colSpan={4}>
                      <div className="flex items-center gap-3 justify-between w-full">
                        <span className="text-sm font-medium">{selectedIds.size}/{products.length}</span>
                        <button
                          type="button"
                          onClick={() => setSelectedIds(new Set())}
                          className="text-sm underline text-muted-foreground hover:text-foreground"
                        >
                          Deselect all
                        </button>
                        <div className="ml-auto flex items-center gap-2">
                          <Button size="sm" variant="outline" onClick={bulkPublish} disabled={bulkBusy} className="font-medium text-xs">
                            <SendIcon className="size-3" /> Publish
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setCopyDialogOpen(true)} disabled={bulkBusy} className="font-medium text-xs">
                            <CopyIcon className="size-3" /> Copy to other store
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger render={
                              <Button size="sm" variant="outline" className="text-destructive border-destructive hover:text-destructive font-medium text-xs" disabled={bulkBusy} />
                            }>
                              <Trash2Icon className="size-3" /> Delete
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
                      <TableHead>Product</TableHead>
                      <TableHead>Shop</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-center"/>
                    </>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((p) => {
                  const status = LISTING_STATUS[p.status] ?? { label: p.status, dot: "bg-muted-foreground" };
                  const title = p.title || "Untitled";
                  return (
                    <TableRow key={p.id} data-state={selectedIds.has(p.id) ? "selected" : undefined} className="h-36 ">  
                      <TableCell className="pl-4">
                        <Checkbox checked={selectedIds.has(p.id)} onCheckedChange={() => toggleSelect(p.id)} />
                      </TableCell>
                      <TableCell>
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

                      <TableCell className="truncate">{p.shop}</TableCell>

                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <span className={`size-2 rounded-full ${status.dot}`} />
                          <span>{status.label}</span>
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="flex items-center gap-1 justify-center text-muted-foreground">
                          <Button variant="ghost" size="icon" className="size-8" onClick={() => navigate(`/products/${p.id}`)}>
                            <PaintbrushIcon className="size-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger render={<Button variant="ghost" size="icon" className="size-8" />}>
                              <Trash2Icon className="size-4 text-destructive" />
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy to Other Store</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-1">
            <Label>Target store</Label>
            <Select value={copyTargetShop} onValueChange={(v) => setCopyTargetShop(v ?? "")}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a store...">
                  {copyTargetShop ? shops.find((s) => s.id === copyTargetShop)?.title : "Select a store..."}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectGroup key={a.id}>
                    <SelectLabel>{a.label}</SelectLabel>
                    {a.shops.map((s) => (
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
    </div>
  );
}
