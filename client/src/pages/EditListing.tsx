import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeftIcon, SaveIcon, SendIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import api from "@/lib/api";
import { ListingCardForm } from "@/components/listing/ListingCardForm";
import type { ListingDraft } from "@/pages/CreateListing";

export default function EditListing() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<ListingDraft | null>(null);
  const [saving, setSaving] = useState(false);
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

  const save = async (publish: boolean) => {
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
        publish,
      });
      savedDesigns.current = data.designs;
      setHasPrintifyProduct(Boolean(data.printifyProductId));
      toast.success(publish ? "Listing published" : "Draft saved");
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
      <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-background px-8 py-6">
        <Button variant="ghost" onClick={() => navigate("/products")}>
          <ArrowLeftIcon className="size-4" /> Back
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => save(false)} disabled={saving}>
            <SaveIcon className="size-4" />
            {saving ? "Saving..." : "Save as Draft"}
          </Button>
          <Button onClick={() => save(true)} disabled={saving}>
            <SendIcon className="size-4" />
            {saving ? "Publishing..." : "Publish"}
          </Button>
        </div>
      </div>

      <div className="p-8 pt-8">
        <Card>
          <CardContent>
            <ListingCardForm
              draft={draft}
              onChange={(patch) => setDraft((prev) => prev && { ...prev, ...patch })}
              locked={hasPrintifyProduct}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}