import { useState } from "react";
import { ImagePlusIcon, AlertCircleIcon, LoaderIcon, XIcon, PencilIcon } from "lucide-react";
import type { ListingDraft, Design } from "@/pages/CreateListing";
import { DesignDialog } from "./DesignDialog";

interface Props {
  draft: ListingDraft;
  onChange: (patch: Partial<ListingDraft>) => void;
  disabled?: boolean;
  // Called instead of opening the dialog when disabled — lets the parent send
  // the user straight to whatever selection (blueprint/provider) is missing.
  onBlocked?: () => void;
}

// Extras shown as small tiles before collapsing into a "+N" chip. Beyond this
// the strip would wrap into more rows than the title/description column next
// to it is tall, which is what made the card layout jump around.
const MAX_EXTRAS = 7;

export function DesignDropzone({ draft, onChange, disabled, onBlocked }: Props) {
  const [open, setOpen] = useState(false);

  const removeDesign = (index: number) => {
    onChange({ designs: draft.designs.filter((_, i) => i !== index) });
  };

  const handleOpen = () => {
    if (disabled) {
      onBlocked?.();
      return;
    }
    setOpen(true);
  };

  // Defaults (empty variantIds) first, then the color-specific overrides — so
  // the big tile is always the design that actually applies to most variants.
  const ordered = draft.designs
    .map((d, i) => ({ d, i }))
    .sort((a, b) => a.d.variantIds.length - b.d.variantIds.length);
  const [primary, ...extras] = ordered;
  const visible = extras.slice(0, MAX_EXTRAS);
  const hidden = extras.length - visible.length;

  const Tile = ({ d, i, small }: { d: Design; i: number; small?: boolean }) => (
    <div
      onClick={handleOpen}
      className="group relative aspect-square cursor-pointer overflow-hidden rounded-lg border bg-muted"
    >
      <img src={d.thumbUrl ?? d.fileUrl} alt={d.position} className="absolute inset-0 size-full object-scale-down" />

      {/* Edit affordance — the whole thumbnail opens the dialog, this just signals it */}
      <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-colors group-hover:bg-black/40 group-hover:opacity-100 pointer-events-none">
        <PencilIcon className="size-4 text-white" />
      </div>
      {d.uploadStatus === "uploading" && (
        <LoaderIcon className="absolute left-1 top-1 size-4 animate-spin text-white drop-shadow" />
      )}
      {d.uploadStatus === "failed" && (
        <AlertCircleIcon className="absolute left-1 top-1 size-4 text-destructive drop-shadow" />
      )}

      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); removeDesign(i); }}
        className={`absolute right-3 top-3 flex items-center justify-center rounded-full bg-black/60 hover:bg-black/80 cursor-pointer ${small ? "hidden" : "block"}`}
      >
        <XIcon className="size-4 text-white" />
      </button>
    </div>
  );

  return (
    <div className="flex h-full w-full flex-col gap-2 rounded-lg bg-muted p-2">
      {primary && <Tile d={primary.d} i={primary.i} />}

      {visible.length > 0 && (
        <div className="grid grid-cols-6 gap-2">
          {visible.map(({ d, i }) => <Tile key={i} d={d} i={i} small />)}
          {hidden > 0 && (
            <button
              type="button"
              onClick={handleOpen}
              className="flex aspect-square items-center justify-center rounded-lg border border-dashed text-xs font-medium text-muted-foreground hover:border-foreground/40 hover:text-foreground"
            >
              +{hidden}
            </button>
          )}
        </div>
      )}

      {draft.designs.length === 0 && (
        <button
          type="button"
          onClick={handleOpen}
          className={`flex h-full shrink-0 flex-col items-center justify-center p-20 w-full gap-1 rounded-lg border border-dashed text-muted-foreground hover:border-foreground/40 hover:text-foreground ${disabled ? "opacity-50" : ""}`}
        >
          <ImagePlusIcon className="size-5" />
          <span className="text-[10px]">Add</span>
        </button>
      )}

      {open && (
        <DesignDialog
          draft={draft}
          onChange={onChange}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
