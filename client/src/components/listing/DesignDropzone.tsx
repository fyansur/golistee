import { useState } from "react";
import { ImagePlusIcon, AlertCircleIcon, LoaderIcon, XIcon, PencilIcon } from "lucide-react";
import type { ListingDraft } from "@/pages/CreateListing";
import { DesignDialog } from "./DesignDialog";

interface Props {
  draft: ListingDraft;
  onChange: (patch: Partial<ListingDraft>) => void;
  disabled?: boolean;
  // Called instead of opening the dialog when disabled — lets the parent send
  // the user straight to whatever selection (blueprint/provider) is missing.
  onBlocked?: () => void;
}

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

  return (
    <div className="flex flex-wrap gap-2 h-full w-full bg-muted rounded-lg">
      {draft.designs.map((d, i) => (
        <div
          key={i}
          onClick={handleOpen}
          className="group relative w-full aspect-square shrink-0 cursor-pointer rounded-lg overflow-hidden border bg-muted"
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
            <AlertCircleIcon
              className="absolute left-1 top-1 size-4 text-destructive drop-shadow"
            />
          )}

          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); removeDesign(i); }}
            className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-black/60 hover:bg-black/80"
          >
            <XIcon className="size-2.5 text-white" />
          </button>
        </div>
      ))}

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
