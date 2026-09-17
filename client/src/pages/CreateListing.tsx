import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CalendarClockIcon, ChevronDownIcon, CloudUploadIcon, HardDriveIcon, PlusIcon, SendIcon, SaveIcon, ArrowLeftIcon } from "lucide-react";
import { ListingCard } from "@/components/listing/ListingCard";
import { toast } from "sonner";
import api from "@/lib/api";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { DateTimePicker } from "@/components/DateTimePicker";
import { localDateTime } from "@/lib/utils";

export interface Design {
  position: string;
  variantIds: number[];
  fileUrl: string;
  thumbUrl?: string;
  printifyImageId: string;
  x: number;
  y: number;
  scale: number;
  angle: number;
  uploadStatus: string;
  uploadError?: string;
}

export interface ListingDraft {
  id: string;
  shopId: string;
  blueprintId: number | null;
  blueprintLabel: string;
  printProviderId: number | null;
  printProviderLabel: string;
  title: string;
  description: string;
  tags: string[];
  variants: any[]; // [{ id, price (cents), is_enabled }] — price set per-variant in PricingTable
  designs: Design[];
}

function newDraft(): ListingDraft {
  return {
    id: crypto.randomUUID(),
    shopId: "",
    blueprintId: null,
    blueprintLabel: "",
    printProviderId: null,
    printProviderLabel: "",
    title: "",
    description: "",
    tags: [],
    variants: [],
    designs: [],
  };
}

export default function CreateListing() {
  const navigate = useNavigate();
  const [drafts, setDrafts] = useState<ListingDraft[]>([newDraft()]);
  const [publishing, setPublishing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleAt, setScheduleAt] = useState(() => localDateTime(new Date(Date.now() + 60 * 60_000)));
  const [scheduleMin] = useState(() => localDateTime(new Date(Date.now() + 60_000)));

  const updateDraft = (id: string, patch: Partial<ListingDraft>) => {
    setDrafts((prev) => prev.map((d) => d.id === id ? { ...d, ...patch } : d));
  };

  const addCard = () => setDrafts((prev) => [...prev, newDraft()]);

  const removeCard = (id: string) => {
    // Last remaining card — nothing left to remove it into, so the trash
    // button doubles as a reset instead (fresh id remounts the card, clearing
    // its form/design state too, same as what a successful publish already does).
    if (drafts.length === 1) {
      setDrafts([newDraft()]);
      return;
    }
    setDrafts((prev) => prev.filter((d) => d.id !== id));
  };

  // Structurally required no matter what — these map to non-null DB columns,
  // so even a draft save can't skip them.
  const validateStructure = () => {
    const errors: string[] = [];
    drafts.forEach((d, i) => {
      const label = d.title || `Listing ${i + 1}`;
      if (!d.shopId) errors.push(`${label}: store not selected`);
      if (!d.blueprintId || !d.printProviderId) errors.push(`${label}: blueprint/provider not selected`);
      if (d.variants.length === 0) errors.push(`${label}: no variants selected`);
    });
    return errors;
  };

  const validate = () => {
    const errors = validateStructure();
    drafts.forEach((d, i) => {
      const label = d.title || `Listing ${i + 1}`;
      if (!d.title.trim()) errors.push(`${label}: title is empty`);
      if (d.designs.length === 0) errors.push(`${label}: no design added yet`);
      if (d.variants.some((v) => !v.price || v.price <= 0))
        errors.push(`${label}: some variants are missing a price`);
    });
    return errors;
  };

  const saveAsDraft = async (draftOnPrintify: boolean) => {
    const errors = validateStructure();
    if (errors.length > 0) {
      toast.error(errors.join("\n"));
      return;
    }

    setSaving(true);
    try {
      await api.post("/publish/batch", { listings: drafts, draftOnPrintify });
      toast.success(draftOnPrintify ? "Drafts queued for Printify" : "Saved as local draft");
      setDrafts([newDraft()]);
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    const errors = validate();
    if (errors.length > 0) {
      toast.error(errors.join("\n"));
      return;
    }

    setPublishing(true);
    try {
      const { data: batch } = await api.post("/publish/batch", { listings: drafts });
      await api.post(`/publish/batch/${batch.id}/publish`);
      toast.success("Batch queued successfully!");
      setDrafts([newDraft()]);
    } catch (err: any) {
      const details = err.response?.data?.details as string[] | undefined;
      toast.error(details ? details.join("\n") : "Publish failed");
    } finally {
      setPublishing(false);
    }
  };

  const schedule = async () => {
    const errors = validate();
    if (errors.length > 0) {
      toast.error(errors.join("\n"));
      return;
    }

    setPublishing(true);
    try {
      const { data: batch } = await api.post("/publish/batch", { listings: drafts });
      const ids = batch.listings.map((l: { id: string }) => l.id);
      await api.post("/publish/listings/schedule", { ids, publishAt: new Date(scheduleAt).toISOString() });
      toast.success(`${ids.length} listing(s) scheduled`);
      setScheduleOpen(false);
      setDrafts([newDraft()]);
    } catch (err: any) {
      const details = err.response?.data?.details as string[] | undefined;
      toast.error(details ? details.join("\n") : "Scheduling failed");
    } finally {
      setPublishing(false);
    }
  };

  return (
    <>
      <div className="sticky top-0 z-10 grid grid-cols-3 items-center justify-items-stretch border-b bg-background px-8 py-6">
        <Button variant="ghost" onClick={() => navigate("/products")} className="justify-self-start">
          <ArrowLeftIcon className="size-4" /> Back
        </Button>
        <span className="text-lg font-semibold justify-self-center">
          Create Listing
        </span>
        <div className="flex gap-2 justify-self-end">
          <Button variant="outline" onClick={addCard}>
            <PlusIcon className="size-4" /> Add Listing
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" disabled={saving || publishing} />}>
              <SaveIcon className="size-4" />
              {saving ? "Saving..." : "Save as Draft"}
              <ChevronDownIcon className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48">
              <DropdownMenuItem onClick={() => saveAsDraft(false)}>
                <HardDriveIcon className="size-4" /> Draft Locally
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => saveAsDraft(true)}>
                <CloudUploadIcon className="size-4" /> Draft on Printify
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button disabled={publishing || saving} />}>
              <SendIcon className="size-4" />
              {publishing ? "Publishing..." : "Publish All"}
              <ChevronDownIcon className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48">
              <DropdownMenuItem onClick={publish}>
                <SendIcon className="size-4" /> Publish Now
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setScheduleOpen(true)}>
                <CalendarClockIcon className="size-4" /> Schedule for Later
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Schedule</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <DateTimePicker value={scheduleAt} onChange={setScheduleAt} min={scheduleMin} />
          </div>
          <DialogFooter className="flex items-center justify-between!">
            <p className="text-xs text-muted-foreground">Uses your current timezone.</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setScheduleOpen(false)}>Cancel</Button>
              <Button onClick={schedule} disabled={!scheduleAt || new Date(scheduleAt) < new Date(scheduleMin) || publishing}>Schedule</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="max-w-7xl mx-auto">

        <div className="space-y-6 p-8 pt-8">
          {drafts.map((draft, i) => (
            <ListingCard
              key={draft.id}
              index={i}
              draft={draft}
              onChange={(patch) => updateDraft(draft.id, patch)}
              onRemove={() => removeCard(draft.id)}
            />
          ))}
        </div>
      </div>
    </>
  );
}
