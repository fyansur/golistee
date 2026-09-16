import { useEffect, useMemo, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Field, FieldLabel, FieldContent, FieldError } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import {
  PlusIcon, Trash2Icon, StoreIcon, RefreshCwIcon, PlugIcon,
  CircleAlertIcon, Settings2Icon, ArrowLeftIcon, SearchIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty";
import { Badge } from "@/components/ui/badge";

interface AccountForm {
  label: string;
  accessToken: string;
}

interface Shop {
  id: string;
  printifyShopId: string;
  title: string;
  salesChannel: string;
  status: string;
  enabled: boolean;
}

interface DiscoveredShop {
  printifyShopId: string;
  title: string;
  salesChannel: string;
}

interface Account {
  id: string;
  label: string;
  tokenStatus: string;
  connectedAt: string;
  shops: Shop[];
}

const SALES_CHANNEL_LABELS: Record<string, string> = {
  custom_integration: "API",
  etsy: "Etsy",
  shopify: "Shopify",
};

const SALES_CHANNEL_BADGE_COLOR: Record<string, string> = {
  custom_integration: "bg-sky-800 text-white border-sky-700",
  etsy: "bg-orange-800 text-white border-orange-700",
  shopify: "bg-emerald-800 text-white border-emerald-700",
};

const TOKEN_STATUS_LABEL: Record<string, string> = {
  active: "Active",
  invalid: "Token Invalid",
};

export default function Connections() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [open, setOpen] = useState(false);
  const [connectionStep, setConnectionStep] = useState<"credentials" | "stores">("credentials");
  const [pendingConnection, setPendingConnection] = useState<AccountForm | null>(null);
  const [discoveredShops, setDiscoveredShops] = useState<DiscoveredShop[]>([]);
  const [selectedDiscoveredIds, setSelectedDiscoveredIds] = useState<Set<string>>(new Set());
  const [connecting, setConnecting] = useState(false);
  const [resyncingId, setResyncingId] = useState<string | null>(null);
  const [managingAccountId, setManagingAccountId] = useState<string | null>(null);
  const [managedShopIds, setManagedShopIds] = useState<Set<string>>(new Set());
  const [storeSearch, setStoreSearch] = useState("");
  const [savingStores, setSavingStores] = useState(false);

  const { control, handleSubmit, reset, formState } = useForm<AccountForm>({
    defaultValues: { label: "", accessToken: "" },
    mode: "onBlur",
  });

  const managingAccount = useMemo(
    () => accounts.find((account) => account.id === managingAccountId) ?? null,
    [accounts, managingAccountId]
  );
  const filteredManagedShops = useMemo(() => {
    const query = storeSearch.trim().toLowerCase();
    if (!query) return managingAccount?.shops ?? [];
    return (managingAccount?.shops ?? []).filter((shop) =>
      shop.title.toLowerCase().includes(query)
      || (SALES_CHANNEL_LABELS[shop.salesChannel] ?? shop.salesChannel).toLowerCase().includes(query)
    );
  }, [managingAccount, storeSearch]);

  const fetchAccounts = async () => {
    const { data } = await api.get("/connections");
    setAccounts(data);
    return data as Account[];
  };

  useEffect(() => { fetchAccounts(); }, []);

  const resetConnectionDialog = () => {
    reset();
    setConnectionStep("credentials");
    setPendingConnection(null);
    setDiscoveredShops([]);
    setSelectedDiscoveredIds(new Set());
    setConnecting(false);
  };

  const discoverAccount = async (values: AccountForm) => {
    try {
      const { data } = await api.post("/connections/discover", { accessToken: values.accessToken });
      if (data.length === 0) {
        toast.error("This Printify account has no stores");
        return;
      }
      setPendingConnection(values);
      setDiscoveredShops(data);
      setSelectedDiscoveredIds(new Set(data.map((shop: DiscoveredShop) => shop.printifyShopId)));
      setConnectionStep("stores");
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? "Failed to validate token");
    }
  };

  const connectAccount = async () => {
    if (!pendingConnection || selectedDiscoveredIds.size === 0) return;
    setConnecting(true);
    try {
      await api.post("/connections", {
        ...pendingConnection,
        enabledPrintifyShopIds: [...selectedDiscoveredIds],
      });
      toast.success("Account connected successfully");
      setOpen(false);
      resetConnectionDialog();
      await fetchAccounts();
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? "Failed to connect account");
    } finally {
      setConnecting(false);
    }
  };

  const deleteAccount = async (id: string) => {
    try {
      await api.delete(`/connections/${id}`);
      toast.success("Account removed");
      await fetchAccounts();
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? "Failed to remove account");
    }
  };

  const resyncAccount = async (id: string) => {
    setResyncingId(id);
    try {
      const { data } = await api.post(`/connections/${id}/resync`);
      const parts = [];
      if (data.addedCount > 0) parts.push(`${data.addedCount} new store(s) found`);
      if (data.missingCount > 0) parts.push(`${data.missingCount} store(s) unavailable`);
      if (data.updatedCount > 0) parts.push(`${data.updatedCount} store(s) updated`);
      if (data.reappearedCount > 0) parts.push(`${data.reappearedCount} store(s) available again`);
      toast.success(parts.length > 0 ? parts.join(" · ") : "No changes found");
      await fetchAccounts();
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? "Failed to sync stores");
    } finally {
      setResyncingId(null);
    }
  };

  const openManageStores = (account: Account) => {
    setStoreSearch("");
    setManagingAccountId(account.id);
    setManagedShopIds(new Set(account.shops.filter((shop) => shop.enabled).map((shop) => shop.id)));
  };

  const saveManagedStores = async () => {
    if (!managingAccount) return;
    setSavingStores(true);
    try {
      await api.patch(`/connections/${managingAccount.id}/shops`, {
        enabledShopIds: [...managedShopIds],
      });
      toast.success("Store selection updated");
      setManagingAccountId(null);
      await fetchAccounts();
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? "Failed to update stores");
    } finally {
      setSavingStores(false);
    }
  };

  const toggleDiscovered = (id: string) => {
    setSelectedDiscoveredIds((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleManaged = (shop: Shop) => {
    if (shop.status !== "active") return;
    setManagedShopIds((current) => {
      const next = new Set(current);
      next.has(shop.id) ? next.delete(shop.id) : next.add(shop.id);
      return next;
    });
  };

  return (
    <div className="max-w-7xl mx-auto justify-center p-8 space-y-6">
      <div className="flex items-center justify-between mb-16">
        <p className="text-3xl font-black flex gap-3 items-center"><PlugIcon size="24" />Connections</p>
      </div>

      <div className="flex items-center justify-between mb-8">
        <p className="text-xl font-black">Printify Accounts</p>
        <Button className="bg-accent hover:bg-accent/80" onClick={() => setOpen(true)}>
          <PlusIcon className="size-4" /> Add Account
        </Button>
      </div>

      {accounts.length === 0 ? (
        <Empty className="border bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon"><PlugIcon /></EmptyMedia>
            <EmptyTitle>No Connections</EmptyTitle>
            <EmptyDescription>Connect a Printify account to start creating and publishing listings.</EmptyDescription>
            <EmptyContent>
              <Button className="bg-accent hover:bg-accent/80" onClick={() => setOpen(true)}>
                <PlusIcon className="size-4" /> Add Account
              </Button>
            </EmptyContent>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-4">
          {accounts.map((account) => {
            const enabledShops = account.shops.filter((shop) => shop.enabled && shop.status === "active");
            return (
              <div key={account.id} className="rounded-xl border bg-card p-5 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <p className="text-xl font-bold truncate">{account.label}</p>
                      <Badge className={account.tokenStatus === "active" ? "bg-emerald-800 text-green-100" : "bg-red-900 text-red-100"}>
                        {TOKEN_STATUS_LABEL[account.tokenStatus] ?? account.tokenStatus}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      Connected {new Date(account.connectedAt).toLocaleDateString()} · {enabledShops.length} of {account.shops.length} stores enabled
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button variant="outline" onClick={() => openManageStores(account)}>
                      <Settings2Icon className="size-4" /> Manage stores
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      disabled={resyncingId === account.id}
                      onClick={() => resyncAccount(account.id)}
                      title="Sync stores from Printify"
                    >
                      <RefreshCwIcon className={`size-4 ${resyncingId === account.id ? "animate-spin" : ""}`} />
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => deleteAccount(account.id)} title="Disconnect account">
                      <Trash2Icon className="size-4 text-destructive" />
                    </Button>
                  </div>
                </div>

                {enabledShops.length > 0 ? (
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {enabledShops.map((shop) => (
                      <div
                        key={shop.id}
                        className={`flex min-w-0 items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${SALES_CHANNEL_BADGE_COLOR[shop.salesChannel] ?? "bg-muted/40"}`}
                      >
                        <StoreIcon className="size-3.5 shrink-0" />
                        <span className="truncate">{shop.title}</span>
                        <span className="ml-auto shrink-0 opacity-75">{SALES_CHANNEL_LABELS[shop.salesChannel] ?? shop.salesChannel}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    No stores are enabled. Use Manage stores to make a store available to Golistee.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) resetConnectionDialog(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{connectionStep === "credentials" ? "Add Printify Account" : "Choose stores"}</DialogTitle>
            <DialogDescription>
              {connectionStep === "credentials"
                ? "Validate your token, then choose which stores Golistee can use."
                : "Only selected stores will appear in listing and copy destinations."}
            </DialogDescription>
          </DialogHeader>

          {connectionStep === "credentials" ? (
            <form onSubmit={handleSubmit(discoverAccount)} className="flex flex-col gap-4 py-2">
              <Controller
                name="label"
                control={control}
                rules={{ required: "Label is required" }}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel>Label</FieldLabel>
                    <FieldContent>
                      <InputGroup><InputGroupInput placeholder="e.g. Owner A" aria-invalid={fieldState.invalid} {...field} /></InputGroup>
                      {fieldState.invalid && (
                        <Alert className="mt-1 flex p-2 rounded-md text-destructive bg-destructive/10 border-destructive/10">
                          <CircleAlertIcon className="size-4" />
                          <AlertDescription><FieldError errors={[fieldState.error]} /></AlertDescription>
                        </Alert>
                      )}
                    </FieldContent>
                  </Field>
                )}
              />
              <Controller
                name="accessToken"
                control={control}
                rules={{ required: "Personal access token is required" }}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel>Personal Access Token</FieldLabel>
                    <FieldContent>
                      <InputGroup>
                        <InputGroupInput type="password" autoComplete="off" placeholder="Paste your Printify token" aria-invalid={fieldState.invalid} {...field} />
                      </InputGroup>
                      {fieldState.invalid && (
                        <Alert className="mt-1 flex p-2 rounded-md text-destructive bg-destructive/10 border-destructive/10">
                          <CircleAlertIcon className="size-4" />
                          <AlertDescription><FieldError errors={[fieldState.error]} /></AlertDescription>
                        </Alert>
                      )}
                    </FieldContent>
                  </Field>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={formState.isSubmitting}>
                  {formState.isSubmitting ? "Validating..." : "Continue"}
                </Button>
              </DialogFooter>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                {discoveredShops.map((shop) => (
                  <div
                    key={shop.printifyShopId}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 hover:bg-muted/50"
                    onClick={() => toggleDiscovered(shop.printifyShopId)}
                  >
                    <Checkbox checked={selectedDiscoveredIds.has(shop.printifyShopId)} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{shop.title}</p>
                      <p className="text-xs text-muted-foreground">{SALES_CHANNEL_LABELS[shop.salesChannel] ?? shop.salesChannel}</p>
                    </div>
                  </div>
                ))}
              </div>
              {selectedDiscoveredIds.size === 0 && <p className="text-sm text-destructive">Select at least one store to connect.</p>}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setConnectionStep("credentials")}>
                  <ArrowLeftIcon className="size-4" /> Back
                </Button>
                <Button onClick={connectAccount} disabled={connecting || selectedDiscoveredIds.size === 0}>
                  {connecting ? "Connecting..." : `Connect ${selectedDiscoveredIds.size} store${selectedDiscoveredIds.size === 1 ? "" : "s"}`}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(managingAccountId)} onOpenChange={(next) => { if (!next) { setManagingAccountId(null); setStoreSearch(""); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Manage stores</DialogTitle>
            <DialogDescription>
              Existing products and history remain visible when a store is disabled. Remote actions stay unavailable until it is enabled again.
            </DialogDescription>
          </DialogHeader>
          <InputGroup>
            <InputGroupAddon><SearchIcon className="size-4" /></InputGroupAddon>
            <InputGroupInput
              value={storeSearch}
              onChange={(event) => setStoreSearch(event.target.value)}
              placeholder="Search stores..."
              aria-label="Search stores"
            />
          </InputGroup>
          <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
            {filteredManagedShops.map((shop) => {
              const missing = shop.status !== "active";
              return (
                <div
                  key={shop.id}
                  className={`flex items-center gap-3 rounded-lg border p-3 ${missing ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-muted/50"}`}
                  onClick={() => toggleManaged(shop)}
                >
                  <Checkbox checked={managedShopIds.has(shop.id)} disabled={missing} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium">{shop.title}</p>
                      {missing && <Badge variant="destructive">Unavailable</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">{SALES_CHANNEL_LABELS[shop.salesChannel] ?? shop.salesChannel}</p>
                  </div>
                </div>
              );
            })}
            {filteredManagedShops.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">No stores found</p>
            )}
          </div>
          {managedShopIds.size === 0 && (
            <Alert>
              <CircleAlertIcon className="size-4" />
              <AlertDescription>No store will be available for new drafts, publishing, or copy destinations.</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setManagingAccountId(null)}>Cancel</Button>
            <Button onClick={saveManagedStores} disabled={savingStores}>
              {savingStores ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
