import { useCallback, useEffect, useRef, useState } from "react";
import { CopyIcon, PackageCheckIcon, RefreshCwIcon, SearchIcon, SendIcon, XCircleIcon } from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { PaginationFooter } from "@/components/PaginationFooter";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { money } from "@/lib/utils";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { OrderStatusBadge } from "@/components/OrderStatusBadge";
import { FILTERABLE_ORDER_STATUSES } from "@/lib/orderStatus";
import { ShopFilterSelect } from "@/components/ShopFilterSelect";
import { StatusFilterChips } from "@/components/StatusFilterChips";

interface Shipment {
  carrier?: string;
  number?: string;
  url?: string;
  delivered_at?: string | null;
}

interface Shop {
  id: string;
  title: string;
}

interface Order {
  id: string;
  printifyOrderId: string;
  appOrderId: string | null;
  status: string;
  customerName: string | null;
  customerEmail: string | null;
  totalPrice: number;
  totalShipping: number;
  lineItems: Array<{ quantity?: number; metadata?: { title?: string; variant_label?: string } }>;
  shipments: Shipment[];
  printifyCreatedAt: string;
  actionStatus: string | null;
  errorMessage: string | null;
  shop: { id: string; title: string };
}

export default function Orders() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedShopId, setSelectedShopId] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    api.get("/connections/shops").then(({ data }) => setShops(data));
  }, []);

  // Filters change on separate triggers (a click, a debounce timer, the
  // in-progress-action poll below) that can overlap in flight — without this
  // guard, an older request resolving after a newer one would clobber the
  // newer, correct result.
  const fetchRequestId = useRef(0);
  const fetchOrders = useCallback(async () => {
    const requestId = ++fetchRequestId.current;
    const { data } = await api.get("/orders", {
      params: {
        page, pageSize,
        ...(selectedShopId ? { shopId: selectedShopId } : {}),
        ...(status ? { status } : {}),
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
      },
    });
    if (requestId !== fetchRequestId.current) return;
    setOrders(data.items);
    setTotal(data.total);
    setLoading(false);
  }, [page, pageSize, selectedShopId, status, debouncedSearch]);

  useEffect(() => { void fetchOrders(); }, [fetchOrders]);
  useEffect(() => setPage(1), [selectedShopId, status, debouncedSearch]);
  useEffect(() => {
    if (!orders.some((order) => order.actionStatus)) return;
    const timer = window.setInterval(() => void fetchOrders(), 3000);
    return () => window.clearInterval(timer);
  }, [orders, fetchOrders]);

  const sync = async () => {
    setSyncing(true);
    try {
      const { data } = await api.post("/orders/sync");
      toast.success(`${data.queued} store(s) queued for order sync`);
      window.setTimeout(() => void fetchOrders(), 2000);
    } catch (error: any) {
      toast.error(error.response?.data?.error ?? "Order sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const act = async (order: Order, action: "send-to-production" | "cancel") => {
    try {
      await api.post(`/orders/${order.id}/${action}`);
      toast.success(action === "cancel" ? "Cancellation queued" : "Production queued");
      await fetchOrders();
    } catch (error: any) {
      toast.error(error.response?.data?.error ?? "Order action failed");
    }
  };

  const copyTracking = async (number: string) => {
    try {
      await navigator.clipboard.writeText(number);
      toast.success("Tracking number copied");
    } catch {
      toast.error("Could not copy tracking number");
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-8 space-y-6 overflow-x-hidden">
      <div className="flex items-center justify-between mb-16">
        <p className="text-3xl font-black flex gap-3 items-center"><PackageCheckIcon size="24" />Orders</p>
      </div>
      <div className="flex items-center justify-between mb-8">
        <p className="text-xl font-black">All Orders</p>

        <Button onClick={sync} disabled={syncing} className="shrink-0">
          <RefreshCwIcon className={syncing ? "animate-spin" : ""} /> Sync orders
        </Button>
      </div>
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <InputGroup className="w-full sm:flex-1 sm:min-w-0 bg-card!">
          <InputGroupAddon align="inline-start">
            <SearchIcon className="size-4" />
          </InputGroupAddon>
          <InputGroupInput
            placeholder="Search by customer or order #"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </InputGroup>
        <ShopFilterSelect shops={shops} value={selectedShopId} onChange={setSelectedShopId} className="bg-card!" />
      </div>
      <StatusFilterChips
        statuses={FILTERABLE_ORDER_STATUSES}
        value={status}
        onChange={setStatus}
        renderBadge={(s) => <OrderStatusBadge status={s} />}
      />

      {/* Fixed pixel columns + a matching min-width on the table itself —
          table-fixed alone won't stop columns collapsing on a narrow
          viewport, since it only fixes their *ratio*, not a floor. Wrapping
          in overflow-x-auto lets the table scroll sideways below that width
          instead of squeezing every cell (and wrapping order/customer/
          shipment text into an unreadable, row-overlapping mess). */}
      <div className="border rounded-lg overflow-x-auto">
        <Table className="bg-card table-fixed">
          <colgroup>
            <col className="w-[260px]" />
            <col className="w-[160px]" />
            <col className="w-[100px]" />
            <col className="w-[170px]" />
            <col className="w-[220px]" />
            <col className="w-[220px]" />
          </colgroup>
          <TableHeader>
            <TableRow>
              <TableHead className="p-6">Order</TableHead>
              <TableHead className="p-6">Customer</TableHead>
              <TableHead className="p-6">Total</TableHead>
              <TableHead className="p-6">Status</TableHead>
              <TableHead className="p-6">Shipment</TableHead>
              <TableHead className="p-6">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!loading && orders.length === 0 && (
              <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground">No synced orders yet.</TableCell></TableRow>
            )}
            {orders.map((order) => {
              const canAct = ["on-hold", "payment-not-received"].includes(order.status) && !order.actionStatus;
              return (
                <TableRow key={order.id} className="h-36">
                  <TableCell className="p-6">
                    <p className="font-medium">#{order.appOrderId ?? order.printifyOrderId.slice(-8)}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(order.printifyCreatedAt).toLocaleString()} · {order.lineItems.length} item(s)
                    </p>
                    {order.lineItems[0]?.metadata?.title && (
                      <p className="max-w-56 truncate text-xs text-muted-foreground">{order.lineItems[0].metadata.title}</p>
                    )}
                    <p className="text-xs text-muted-foreground">{order.shop.title}</p>
                  </TableCell>
                  <TableCell className="p-6">
                    <p>{order.customerName ?? "—"}</p>
                    <p className="text-xs text-muted-foreground truncate">{order.customerEmail ?? ""}</p>
                  </TableCell>
                  <TableCell className="p-6">{money(order.totalPrice + order.totalShipping)}</TableCell>
                  <TableCell className="p-6">
                    <OrderStatusBadge status={order.status} />
                    {order.actionStatus && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                        <RefreshCwIcon className="size-3 animate-spin" />
                        {order.actionStatus === "produce" ? "Sending to production…" : "Canceling…"}
                      </p>
                    )}
                    {order.errorMessage && <p className="mt-1 max-w-52 text-xs text-destructive">{order.errorMessage}</p>}
                  </TableCell>
                  <TableCell className="p-6">
                    {order.shipments.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Not shipped yet</p>
                    ) : (
                      <div className="space-y-1.5">
                        {order.shipments.map((shipment, i) => (
                          <div key={i} className="flex gap-1.5 text-xs flex-col">
                            <div className="flex gap-1.5">

                            {/* Nama Ekspedisi menjadi link jika ada URL */}
                            {shipment.url ? (
                              <a
                                href={shipment.url}
                                target="_blank"
                                rel="noreferrer"
                                className="font-medium capitalize hover:underline"
                              >
                                {shipment.carrier ?? "Carrier unknown"}
                              </a>
                            ) : (
                              <span className="font-medium capitalize">
                                {shipment.carrier ?? "Carrier unknown"}
                              </span>
                            )}
                            {shipment.number && (
                              <button
                                type="button"
                                onClick={() => void copyTracking(shipment.number!)}
                                className="text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
                                title="Copy tracking number"
                              >
                                <CopyIcon className="size-3" />
                              </button>
                            )}

                            {/* Tombol Copy ditaruh di sebelah nama ekspedisi */}
                            </div>
                            {/* Status Delivered ditaruh di sebelah tombol copy */}
                            {shipment.delivered_at && (
                              <span className="text-emerald-600 dark:text-emerald-400 font-medium shrink-0">
                                Delivered
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="p-6">
                    <div className="flex justify-between gap-2">
                    <Button size="sm" variant="outline" disabled={!canAct} onClick={() => void act(order, "send-to-production")} className="w-1/2">
                      <SendIcon /> Order
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger render={<Button size="sm" variant="outline" disabled={!canAct} className="text-destructive" />}>
                        <XCircleIcon /> Cancel
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Cancel this Printify order?</AlertDialogTitle>
                          <AlertDialogDescription>This works only before payment/production and cannot be undone.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Keep order</AlertDialogCancel>
                          <AlertDialogAction onClick={() => void act(order, "cancel")}>Cancel order</AlertDialogAction>
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
    </div>
  );
}
