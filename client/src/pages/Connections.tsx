import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Field, FieldLabel, FieldContent, FieldError } from "@/components/ui/field";
import { InputGroup, InputGroupInput } from "@/components/ui/input-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PlusIcon, Trash2Icon, StoreIcon, RefreshCwIcon, PlugIcon, CircleAlertIcon } from "lucide-react";
import { toast } from "sonner";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty";
import { Badge } from "@/components/ui/badge";
interface AccountForm {
  label: string;
  accessToken: string;
}

interface Shop {
  id: string;
  title: string;
  salesChannel: string;
  status: string;
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
  custom_integration: "bg-sky-800 text-white",
  etsy: "bg-orange-800 text-white",
  shopify: "bg-emerald-800 text-white",
};

const TOKEN_STATUS_LABEL: Record<string, string> = {
  active: "Active",
  invalid: "Token Invalid",
};
export default function Connections() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [open, setOpen] = useState(false);
  const [resyncingId, setResyncingId] = useState<string | null>(null);

  const { control, handleSubmit, reset, formState } = useForm<AccountForm>({
    defaultValues: { label: "", accessToken: "" },
    mode: "onBlur",
  });

  const fetchAccounts = async () => {
    const { data } = await api.get("/connections");
    setAccounts(data);
  };

  useEffect(() => { fetchAccounts(); }, []);

  const addAccount = async (values: AccountForm) => {
    try {
      await api.post("/connections", values);
      toast.success("Account connected successfully");
      setOpen(false);
      reset();
      fetchAccounts();
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? "Failed to connect account");
    }
  };

  const deleteAccount = async (id: string) => {
    await api.delete(`/connections/${id}`);
    toast.success("Account removed");
    fetchAccounts();
  };

  const resyncAccount = async (id: string) => {
    setResyncingId(id);
    try {
      const { data } = await api.post(`/connections/${id}/resync`);
      const parts = [];
      if (data.addedCount > 0) parts.push(`${data.addedCount} new store(s) found`);
      if (data.missingCount > 0) parts.push(`${data.missingCount} store(s) no longer on Printify`);
      if (data.updatedCount > 0) parts.push(`${data.updatedCount} store(s) updated`);
      toast.success(parts.length > 0 ? parts.join(" · ") : "No changes found");
      fetchAccounts();
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? "Failed to resync");
    } finally {
      setResyncingId(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto justify-center p-8 space-y-6">
      <div className="flex items-center justify-between mb-16">
        <p className="text-3xl font-black flex gap-3 items-center">
          <PlugIcon size="24" />Connections
        </p>
      </div>

      <div className="flex items-center justify-between mb-8">
        <p className="text-xl font-black">Printify Accounts</p>
        <Button className="bg-accent hover:bg-accent/80" onClick={() => setOpen(true)}>
          <PlusIcon className="size-4" />
          Add Account
        </Button>
      </div>

      {accounts.length === 0 ? (
        <Empty className="border bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon"><PlugIcon /></EmptyMedia>
            <EmptyTitle>No Connections</EmptyTitle>
            <EmptyDescription>
              Connect a Printify account to start creating and publishing listings.
            </EmptyDescription>
            <EmptyContent>
              <Button className="bg-accent hover:bg-accent/80" onClick={() => setOpen(true)}>
                <PlusIcon className="size-4" /> Add Account
              </Button>
            </EmptyContent>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-4">
          {accounts.map((account) => (
            <div key={account.id} className="rounded-xl border bg-card p-5 space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                  <p className="text-xl font-bold truncate">{account.label}</p>
                  <Badge className={account.tokenStatus === "active" ? "bg-emerald-800 text-green-100" : "bg-red-900 text-red-100"}>
                    {TOKEN_STATUS_LABEL[account.tokenStatus] ?? account.tokenStatus}
                  </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    Connected {new Date(account.connectedAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="icon"
                    disabled={resyncingId === account.id}
                    onClick={() => resyncAccount(account.id)}
                    title="Resync stores from Printify"
                  >
                    <RefreshCwIcon className={`size-4 ${resyncingId === account.id ? "animate-spin" : ""}`} />
                  </Button>
                  <Button variant="outline" size="icon" onClick={() => deleteAccount(account.id)}>
                    <Trash2Icon className="size-4 text-destructive" />
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {account.shops.map((shop) => (
                  <span
                    key={shop.id}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${SALES_CHANNEL_BADGE_COLOR[shop.salesChannel] ?? "bg-card"} ${shop.status === "missing"
                        ? "border-destructive/50 text-destructive"
                        : "text-muted-foreground"
                      }`}
                  >
                    <StoreIcon className="size-3" />
                    {shop.title} · {SALES_CHANNEL_LABELS[shop.salesChannel] ?? shop.salesChannel}
                    {shop.status === "missing" && " · not found"}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Printify Account</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(addAccount)} className="flex flex-col gap-4 py-2">
            <Controller
              name="label"
              control={control}
              rules={{ required: "Label is required" }}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel>Label</FieldLabel>
                  <FieldContent>
                    <InputGroup>
                      <InputGroupInput placeholder="e.g. Owner A" aria-invalid={fieldState.invalid} {...field} />
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
            <Controller
              name="accessToken"
              control={control}
              rules={{ required: "Personal access token is required" }}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel>Personal Access Token</FieldLabel>
                  <FieldContent>
                    <InputGroup>
                      <InputGroupInput placeholder="Paste your Printify token" aria-invalid={fieldState.invalid} {...field} />
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
                {formState.isSubmitting ? "Connecting..." : "Connect"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
