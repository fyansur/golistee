import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeftIcon, ChevronDownIcon, CircleAlertIcon, CloudUploadIcon, HardDriveIcon, SaveIcon, SendIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import api from "@/lib/api";
import { ListingCardForm } from "@/components/listing/ListingCardForm";
import type { ListingDraft } from "@/pages/CreateListing";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function EditListing() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<ListingDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [shopError, setShopError] = useState<string | null>(null);
  // Blueprint/provider (and template application, since a template carries
  // both) can only be changed while the listing has never touched Printify —
  // once it's live there, its update endpoint won't accept a different one.
  const [hasPrintifyProduct, setHasPrintifyProduct] = useState(false);
  // Tracks the designs array as last loaded/saved — reference-compared against
  // draft.designs at save time so we only resend designs (and trigger a
  // print_areas resync on Printify) when DesignDialog actually replaced it.
  const savedDesigns = useRef<ListingDraft["designs"] | null>(null);

  useEffect(() => {
    api.get(`/publish/listing/${id}`).then(({ data }) => {
      savedDesigns.current = data.designs;
      setHasPrintifyProduct(Boolean(data.printifyProductId));
      setShopError(
        data.shop.account.tokenStatus !== "active"
          ? "This store's Printify connection has expired. Reconnect it from Connections before saving to Printify or publishing."
          : data.shop.status !== "active"
            ? "This store is unavailable on Printify. Sync it from Connections before saving to Printify or publishing."
            : !data.shop.enabled
              ? "This store is disabled in Golistee. Enable it from Connections before saving to Printify or publishing."
              : null
      );
      setDraft({
        id: data.id,
        shopId: data.shopId,
        blueprintId: data.blueprintId,
        blueprintLabel: data.blueprintLabel,
        printProviderId: data.printProviderId,
        printProviderLabel: data.printProviderLabel,
        title: data.title,
        description: data.description,
        tags: data.tags,
        variants: data.variants,
        designs: data.designs,
      });
    }).catch(() => toast.error("Listing not found"));
  }, [id]);

  const save = async (mode: "local" | "printify" | "publish") => {
    if (!draft) return;
    setSaving(true);
    try {
      const designsChanged = draft.designs !== savedDesigns.current;
      const { data } = await api.put(`/publish/listing/${id}`, {
        title: draft.title,
        description: draft.description,
        tags: draft.tags,
        variants: draft.variants,
        ...(designsChanged ? { designs: draft.designs } : {}),
        publish: mode === "publish",
        draftOnPrintify: mode === "printify",
      });
      savedDesigns.current = data.designs;
      setHasPrintifyProduct(Boolean(data.printifyProductId));
      toast.success(
        mode === "publish"
          ? "Listing published"
          : mode === "printify" ? "Saved as draft on Printify" : "Saved as local draft"
      );
      setDraft((prev) => prev && { ...prev, title: data.title, description: data.description, tags: data.tags, variants: data.variants, designs: data.designs });
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? "Update failed");
    } finally {
      setSaving(false);
    }
  };

  if (!draft) return <div className="p-8 text-sm text-muted-foreground">Loading...</div>;

  return (
    <div>
      <div className="sticky top-0 z-10 grid grid-cols-3 items-center justify-items-stretch border-b bg-background px-8 py-6">
        <Button variant="ghost" onClick={() => navigate("/products")} className="justify-self-start">
          <ArrowLeftIcon className="size-4" /> Back
        </Button>
        <span className="text-lg font-semibold justify-self-center">
          Edit Listing
        </span>
        <div className="flex gap-2 justify-self-end">
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" disabled={saving} />}>
              <SaveIcon className="size-4" />
              {saving ? "Saving..." : "Save as Draft"}
              <ChevronDownIcon className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48">
              <DropdownMenuItem onClick={() => save("local")}>
                <HardDriveIcon className="size-4" /> Draft Locally
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => save("printify")} disabled={Boolean(shopError)}>
                <CloudUploadIcon className="size-4" /> Draft on Printify
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button onClick={() => save("publish")} disabled={saving || Boolean(shopError)}>
            <SendIcon className="size-4" />
            {saving ? "Publishing..." : "Publish"}
          </Button>
        </div>
      </div>

      <div className="p-8 pt-8 max-w-7xl mx-auto">
        {shopError && (
          <Alert variant="destructive" className="mb-6">
            <CircleAlertIcon className="size-4" />
            <AlertTitle>Store connection required</AlertTitle>
            <AlertDescription>{shopError} Local drafts are still available.</AlertDescription>
          </Alert>
        )}
        <Card>
          <CardContent>
            <ListingCardForm
              draft={draft}
              onChange={(patch) => setDraft((prev) => prev && { ...prev, ...patch })}
              locked={hasPrintifyProduct}
              storeLocked
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
