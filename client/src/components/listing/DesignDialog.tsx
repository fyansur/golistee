import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  ChevronRightIcon, UploadCloudIcon, XIcon, ChevronLeftIcon, AlertTriangleIcon, SearchIcon,
  AlignHorizontalJustifyStart, AlignHorizontalJustifyCenter, AlignHorizontalJustifyEnd,
  AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd,
  LayoutGridIcon, ListIcon, ImagesIcon,
} from "lucide-react";
import api from "@/lib/api";
import type { Design, ListingDraft } from "@/pages/CreateListing";

// Printify recommends 300 DPI print files. We don't get the print area's real
// physical size from their API, but their own pixel-based placeholder size IS
// the reference: if the design's native pixels, packed into (placeholder px *
// current scale), fall short of that reference, it'll look soft/pixelated when
// printed — same math Printify's own editor uses for its resolution warning.
function effectiveDpi(imgWidth: number, scale: number, placeholderWidthPx: number): number | null {
  if (!imgWidth || !scale || !placeholderWidthPx) return null;
  return Math.round(300 * (imgWidth / (placeholderWidthPx * scale)));
}

// Print area pixel size can differ a lot between sizes of the same blueprint
// (confirmed: a size S placeholder came back 3461px wide, size L's is 4200px —
// same aspect ratio, so x/y/scale positioning is unaffected, but DPI is not,
// since it depends on the absolute pixel count). Printify itself references
// the largest size's print area for its DPI warning, so we do the same —
// across every variant of the blueprint, not just the ones this design covers.
function maxPlaceholderWidth(allVariants: Variant[], pos: string): number | null {
  const widths = allVariants
    .map((v) => v.placeholders.find((p) => p.position === pos)?.width)
    .filter((w): w is number => !!w);
  return widths.length ? Math.max(...widths) : null;
}

interface Variant {
  id: number;
  options: { color: string; size: string };
  placeholders: { position: string; width: number; height: number }[];
}

interface DesignEntry {
  position: string;
  file: File | null; // null = already-confirmed design, carried over for editing — no re-upload unless replaced
  preview: string;
  variantIds: number[]; // empty = default (all selected)
  x: number;
  y: number;
  scale: number;
  angle: number;
  imgWidth: number; // natural pixel size of the uploaded image — used only for its aspect ratio (imgHeight/imgWidth)
  imgHeight: number;
  fileUrl?: string; // set when file is null — the already-uploaded image, reused on confirm instead of re-uploading
  thumbUrl?: string;
  printifyImageId?: string;
}

const loadImageSize = (url: string) =>
  new Promise<{ w: number; h: number }>((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = url;
  });

// Checkerboard behind library thumbnails so transparent PNGs read clearly.
const CHECKERBOARD_BG: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(45deg, #00000010 25%, transparent 25%), linear-gradient(-45deg, #00000010 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #00000010 75%), linear-gradient(-45deg, transparent 75%, #00000010 75%)",
  backgroundSize: "12px 12px",
  backgroundPosition: "0 0, 0 6px, 6px -6px, -6px 0px",
};

// Uploaded key is `${timestamp}-${safeName}` — drop the numeric prefix for display/search.
const fileNameOf = (url: string) => (url.split("/").pop() ?? "").replace(/^\d+-/, "");

// Printify's variants.json doesn't return hex codes, only title strings (e.g.
// "Heather Grey") — so we map common apparel color names ourselves. Anything
// not listed falls through to the CSS engine (works for plain names like
// "Red", "Black", "Navy") and finally to grey if that fails too.
const COLOR_HEX: Record<string, string> = {
  "heather grey": "#9a9a9a", "heather gray": "#9a9a9a",
  "sport grey": "#a8a8a8", "sport gray": "#a8a8a8",
  "dark heather": "#5a5a5a", "dark grey heather": "#5a5a5a", "dark heather grey": "#5a5a5a",
  "ash grey": "#b6b6b6", "ash gray": "#b6b6b6",
  "vintage black": "#1c1c1c", "solid black": "#0a0a0a", "solid white": "#f9f9f9",
  "military green": "#4b5320", "forest green": "#1e3d2b", "kelly green": "#2e8b57",
  "royal blue": "#1e3a8a", "navy blue": "#1b2a4a", "heather navy": "#2a3a5c",
  "true royal": "#1e40af", "light blue": "#a9c9e8", "carolina blue": "#7ba7d9",
  "hot pink": "#e91e8c", "light pink": "#f3b6c6", "heather pink": "#e8a5bb",
  "cardinal red": "#a3123a", "true red": "#c8102e",
  natural: "#e6dcc6", sand: "#d8c9a3", cream: "#f2e8d5", ivory: "#e7ceb5",

  // Comfort Colors garment-dyed chart
  amethyst: "#9595d2", banana: "#f1e6b2", bay: "#94a596", berry: "#7e4966",
  blossom: "#f8bed6", "blue jean": "#647692", "blue spruce": "#3e5d58",
  boysenberry: "#521739", brick: "#8a1538", "bright salmon": "#ff6d6a",
  "burnt orange": "#ff6900", butter: "#f5e1a4",
  "chalky mint": "#5cb8b2", chambray: "#bdd6e6", chili: "#893c47",
  "china blue": "#002855", citrine: "#f4da40", citrus: "#ffc27b",
  clay: "#a60a3d", crimson: "#a4123f", crunchberry: "#ef4a81", cumin: "#b66c6d",
  denim: "#425563", emerald: "#00685e",
  espresso: "#553c36", fern: "#445a3e", "flo blue": "#5576d1", granite: "#7c878e",
  grape: "#211551", graphite: "#1d252d", grass: "#1b806d", grey: "#716e6a",
  heliconia: "#ce0f69", hemp: "#1c4220", hydrangea: "#a7bcd6",
  "ice blue": "#5b7f95", "island green": "#00957a", khaki: "#a09074",
  "lagoon blue": "#05c3de", "light green": "#5c7f71", melon: "#fa9370",
  midnight: "#1b365d", moss: "#22372b", mustard: "#f2cd00", "mystic blue": "#5c88da",
  navy: "#0c2340", "neon blue": "#385e9d", "neon pink": "#f04e98",
  "neon red orange": "#ff585d", ocean: "#6e80a9", orchid: "#c7b2de",
  paprika: "#ce0037", peachy: "#edab9c", peony: "#f67599", pepper: "#4e4b48",
  periwinkle: "#485cc7", "royal caribe": "#0082ba", sage: "#3e4827",
  sandstone: "#a69f88", sapphire: "#007dba", seafoam: "#487a7b", smoke: "#8c8985",
  "true navy": "#041e43", vineyard: "#672146", violet: "#7474c1",
  "washed denim": "#6787b7", watermelon: "#f4364c", wine: "#51284f", yam: "#be531c",
};

export function colorToHex(name: string): string {
  const key = name.trim().toLowerCase();
  if (COLOR_HEX[key]) return COLOR_HEX[key];
  const probe = document.createElement("div").style;
  probe.color = "";
  probe.color = key; // valid CSS keywords (red, black, navy, ...) resolve here
  return probe.color ? key : "#cccccc";
}

interface Props {
  draft: ListingDraft;
  onChange: (patch: Partial<ListingDraft>) => void;
  onClose: () => void;
}

export function DesignDialog({ draft, onChange, onClose }: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const printAreaRef = useRef<HTMLDivElement>(null); // the actual print box — x/y/scale are relative to this, not the whole canvas
  const designElRef = useRef<HTMLDivElement>(null); // the design's own box on canvas — used to tell if a click landed on it
  const dragging = useRef(false);
  const resizing = useRef<{ startScale: number; centerX: number; centerY: number; startDist: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [variants, setVariants] = useState<Variant[]>([]);
  const [positions, setPositions] = useState<string[]>([]);
  const [position, setPosition] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set(draft.variants.map((v: any) => v.id)));
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [showVariantPicker, setShowVariantPicker] = useState(false);
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [focused, setFocused] = useState(false); // design clicked on canvas — shows its outline + resize dots
  const [dragActive, setDragActive] = useState(false); // true only while a move-drag is in progress — gates the snap guide lines

  // Design state
  const [designs, setDesigns] = useState<DesignEntry[]>([]);
  const [activeColor, setActiveColor] = useState<string | null>(null); // null = default
  const [overrideMode, setOverrideMode] = useState(false); // toggle: editing a color-specific design
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ index: number; total: number; percent: number } | null>(null);

  // Library — every design this user has ever uploaded, for reusing one instead
  // of re-uploading the same file.
  const [library, setLibrary] = useState<{ fileUrl: string; thumbUrl: string | null; printifyImageId: string }[]>([]);
  const [librarySearch, setLibrarySearch] = useState("");
  const [librarySort, setLibrarySort] = useState<"recent" | "name">("recent");
  const [libraryView, setLibraryView] = useState<"grid" | "list">("grid");
  const [libraryOpen, setLibraryOpen] = useState(true);
  // Original pixel dimensions aren't stored — loaded lazily per item, same as
  // the DPI check below does for placed designs.
  const [libraryDims, setLibraryDims] = useState<Record<string, { w: number; h: number }>>({});
  useEffect(() => {
    // This is a reuse-a-design gallery, not the paginated My Files page —
    // pull a generous page size so it still shows everything for a normal user.
    api.get("/designs/library", { params: { pageSize: 100 } }).then(({ data }) => {
      setLibrary(data.items);
      data.items.forEach((item: { fileUrl: string }) => {
        loadImageSize(item.fileUrl).then(({ w, h }) => {
          setLibraryDims((prev) => ({ ...prev, [item.fileUrl]: { w, h } }));
        });
      });
    });
  }, []);
  const filteredLibrary = library.filter((item) =>
    fileNameOf(item.fileUrl).toLowerCase().includes(librarySearch.toLowerCase())
  );
  // The API already orders recent-first; only "Name" needs an actual client sort.
  const sortedLibrary = librarySort === "name"
    ? [...filteredLibrary].sort((a, b) => fileNameOf(a.fileUrl).localeCompare(fileNameOf(b.fileUrl)))
    : filteredLibrary;

  // Switching which design is active (position/color context) unfocuses whatever
  // was focused before — focus is earned by clicking the design on canvas again.
  useEffect(() => { setFocused(false); }, [position, activeColor, overrideMode]);

  useEffect(() => {
    api.get(`/listings/variants/${draft.blueprintId}/${draft.printProviderId}`).then(({ data }) => {
      const fetched: Variant[] = data.variants ?? [];
      setVariants(fetched);
      // nothing chosen yet (fresh manual draft) — default to every variant selected
      const initialSelected = draft.variants.length === 0
        ? new Set(fetched.map((v) => v.id))
        : new Set(draft.variants.map((v: any) => v.id));
      if (draft.variants.length === 0) setSelected(initialSelected);
      // Preview the first selected variant's color right away instead of the
      // canvas defaulting to plain gray — same "just previews it" behavior as
      // clicking a swatch, so it doesn't force override mode on its own.
      setActiveColor(fetched.find((v) => initialSelected.has(v.id))?.options.color ?? null);
      const pos = [...new Set(
        (data.variants?.[0]?.placeholders ?? []).map((p: any) => p.position)
      )] as string[];
      setPositions(pos);
      if (pos.length) setPosition(pos.find((p) => p.toLowerCase() === "front") ?? pos[0]);

      // Reopening this dialog ("Edit") should resume editing what's already
      // confirmed, not start blank — hydrate them as pass-through entries (no
      // File, so confirm() won't re-upload unless the file is actually replaced).
      // A design whose variantIds cover every selected variant was "default"
      // (no color override) — mark it back to [] so the rest of this component's
      // default/override logic (keyed on variantIds.length === 0) still works.
      // Failed uploads are left out — pass them through untouched on confirm
      // instead of silently relabeling a null printifyImageId as "synced".
      const editable = draft.designs.filter((d) => d.uploadStatus !== "failed");
      setDesigns(editable.map((d) => ({
        position: d.position,
        file: null,
        preview: d.fileUrl,
        variantIds: d.variantIds.length === initialSelected.size && d.variantIds.every((id) => initialSelected.has(id))
          ? []
          : d.variantIds,
        x: d.x, y: d.y, scale: d.scale, angle: d.angle,
        imgWidth: 0, imgHeight: 0, // filled in below once the image loads
        fileUrl: d.fileUrl,
        thumbUrl: d.thumbUrl,
        printifyImageId: d.printifyImageId,
      })));
      editable.forEach((d) => {
        loadImageSize(d.fileUrl).then(({ w, h }) => {
          setDesigns((prev) => prev.map((x) =>
            x.fileUrl === d.fileUrl && x.position === d.position ? { ...x, imgWidth: w, imgHeight: h } : x
          ));
        });
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.blueprintId, draft.printProviderId]);

  // Unique colors from selected variants
  const selectedVariants = variants.filter((v) => selected.has(v.id));
  const uniqueColors = [...new Set(selectedVariants.map((v) => v.options.color))];

  // Selecting a color just previews it — only flip to override mode automatically
  // when that color already has one, so clicking a swatch never blanks the canvas.
  useEffect(() => {
    if (activeColor === null) { setOverrideMode(false); return; }
    setOverrideMode(designs.some((d) =>
      d.position === position && d.variantIds.length > 0 && variants
        .filter((v) => d.variantIds.includes(v.id))
        .some((v) => v.options.color === activeColor)
    ));
  }, [activeColor, position, designs, variants]);

  // Active design for current position: the color override while override mode
  // is on, otherwise the default design shared by all colors.
  const activeDesign = overrideMode
    ? designs.find((d) => d.position === position && d.variantIds.length > 0 && variants
        .filter((v) => d.variantIds.includes(v.id))
        .some((v) => v.options.color === activeColor))
    : designs.find((d) => d.position === position && d.variantIds.length === 0);

  // Delete the focused design with the Del/Backspace key — ignored while typing
  // in an input (Scale/Rotate/Position fields also use Backspace to edit text).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!focused || !activeDesign) return;
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (e.target instanceof HTMLInputElement) return;
      setDesigns((prev) => prev.filter((d) => d !== activeDesign));
      setFocused(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focused, activeDesign]);

  // Print area aspect ratio from placeholder
  const placeholder = position
    ? variants[0]?.placeholders.find((p) => p.position === position)
    : null;
  const printRatio = placeholder ? placeholder.height / placeholder.width : 1;
  const printAreaBoxStyle: React.CSSProperties = {
    width: `min(60cqw, ${(60 / printRatio).toFixed(4)}cqh)`,
    aspectRatio: `1 / ${printRatio}`,
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
  };

  // Geometry derived from the active design — fraction of the print area's own
  // width/height the image currently spans, at its current scale.
  // Per Printify's own docs: "scale" IS the image width as a fraction of the
  // print area placeholder's width — scale=1 fills the placeholder width fully.
  // It has nothing to do with the uploaded file's native pixel size.
  const widthFrac = activeDesign ? activeDesign.scale : 0;
  const heightFrac = activeDesign && placeholder && activeDesign.imgWidth
    ? activeDesign.scale * (activeDesign.imgHeight / activeDesign.imgWidth) * (placeholder.width / placeholder.height)
    : 0;

  // Snap guide lines — only while actively dragging, and only when x/y landed
  // exactly on one of the snap targets set in onMouseMove below (center, or an
  // edge of the print area).
  const verticalGuideAt = dragActive && activeDesign
    ? activeDesign.x === 0.5 ? 0.5 : activeDesign.x === widthFrac / 2 ? 0 : activeDesign.x === 1 - widthFrac / 2 ? 1 : null
    : null;
  const horizontalGuideAt = dragActive && activeDesign
    ? activeDesign.y === 0.5 ? 0.5 : activeDesign.y === heightFrac / 2 ? 0 : activeDesign.y === 1 - heightFrac / 2 ? 1 : null
    : null;

  // Canvas drag — move or corner-resize
  const onMouseDown = (e: React.MouseEvent) => {
    // Only start a move (and show the outline + resize dots) when the grab
    // actually started on the design itself — not anywhere on the canvas.
    const clickedDesign = !!(designElRef.current && e.target instanceof Node && designElRef.current.contains(e.target));
    dragging.current = clickedDesign;
    setFocused(clickedDesign);
    setDragActive(clickedDesign);
  };
  const onMouseUp = () => { dragging.current = false; resizing.current = null; setDragActive(false); };
  const onMouseMove = (e: React.MouseEvent) => {
    if (resizing.current) {
      const { startScale, centerX, centerY, startDist } = resizing.current;
      const dist = Math.hypot(e.clientX - centerX, e.clientY - centerY);
      const nextScale = Math.max(0.05, startScale * (dist / (startDist || 1)));
      setDesigns((prev) => prev.map((d) => (d === activeDesign ? { ...d, scale: nextScale } : d)));
      return;
    }
    if (!dragging.current || !printAreaRef.current || !activeDesign) return;
    // Printify's x/y are fractions of the print area's own box, not the whole canvas.
    const rect = printAreaRef.current.getBoundingClientRect();
    let nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    let ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    // Snap to center and to the print area's edges when close enough.
    const SNAP = 0.02;
    if (Math.abs(nx - 0.5) < SNAP) nx = 0.5;
    else if (Math.abs(nx - widthFrac / 2) < SNAP) nx = widthFrac / 2;
    else if (Math.abs(nx - (1 - widthFrac / 2)) < SNAP) nx = 1 - widthFrac / 2;
    if (Math.abs(ny - 0.5) < SNAP) ny = 0.5;
    else if (Math.abs(ny - heightFrac / 2) < SNAP) ny = heightFrac / 2;
    else if (Math.abs(ny - (1 - heightFrac / 2)) < SNAP) ny = 1 - heightFrac / 2;
    setDesigns((prev) => prev.map((d) => (d === activeDesign ? { ...d, x: nx, y: ny } : d)));
  };

  // Corner handle drag — resize around the image's own center, scale ∝ distance from center.
  const onCornerMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!printAreaRef.current || !activeDesign) return;
    const rect = printAreaRef.current.getBoundingClientRect();
    const centerX = rect.left + activeDesign.x * rect.width;
    const centerY = rect.top + activeDesign.y * rect.height;
    resizing.current = {
      startScale: activeDesign.scale,
      centerX,
      centerY,
      startDist: Math.hypot(e.clientX - centerX, e.clientY - centerY),
    };
  };

  // Places an image as the design for the current position/color context —
  // replacing whatever design already occupies that same slot. Shared by a
  // fresh upload and reusing an already-uploaded image from the library.
  const placeDesign = (entry: Pick<DesignEntry, "file" | "preview" | "imgWidth" | "imgHeight" | "fileUrl" | "thumbUrl" | "printifyImageId">) => {
    const variantIds = overrideMode
      ? variants.filter((v) => v.options.color === activeColor).map((v) => v.id)
      : [];

    setDesigns((prev) => {
      const filtered = prev.filter((d) => {
        if (d.position !== position) return true;
        if (!overrideMode) return d.variantIds.length !== 0;
        return !variants.filter((v) => d.variantIds.includes(v.id)).some((v) => v.options.color === activeColor);
      });
      return [...filtered, { position, variantIds, x: 0.5, y: 0.5, scale: 1, angle: 0, ...entry }];
    });
    setPropertiesOpen(true);
    setFocused(true); // freshly placed design starts focused, ready to position
  };

  // File drop/select
  const handleFile = async (file: File) => {
    const preview = URL.createObjectURL(file);
    const { w, h } = await loadImageSize(preview);
    placeDesign({ file, preview, imgWidth: w, imgHeight: h });
  };

  // Reuse an already-uploaded design from the library — same placement, no re-upload.
  // Canvas preview/placement always uses the full-res fileUrl, never the thumbnail.
  const reuseDesign = async (item: { fileUrl: string; thumbUrl: string | null; printifyImageId: string }) => {
    const { w, h } = await loadImageSize(item.fileUrl);
    placeDesign({
      file: null, preview: item.fileUrl, imgWidth: w, imgHeight: h,
      fileUrl: item.fileUrl, thumbUrl: item.thumbUrl ?? undefined, printifyImageId: item.printifyImageId,
    });
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const removeDesign = (index: number) => {
    setDesigns((prev) => prev.filter((_, i) => i !== index));
  };

  // Variant selection helpers — checking on a color that wasn't selected
  // before follows it on the canvas immediately, same as clicking its swatch.
  const toggleOne = (v: Variant) => {
    const next = new Set(selected);
    const wasSelected = next.has(v.id);
    wasSelected ? next.delete(v.id) : next.add(v.id);
    setSelected(next);
    if (!wasSelected && !selectedVariants.some((x) => x.options.color === v.options.color)) {
      setActiveColor(v.options.color);
    }
  };

  const toggleGroup = (ids: number[], color?: string) => {
    const next = new Set(selected);
    const allSelected = ids.every((id) => next.has(id));
    ids.forEach((id) => allSelected ? next.delete(id) : next.add(id));
    setSelected(next);
    if (!allSelected && color && !selectedVariants.some((v) => v.options.color === color)) {
      setActiveColor(color);
    }
  };

  const toggleAll = () => {
    if (selected.size === variants.length) setSelected(new Set());
    else setSelected(new Set(variants.map((v) => v.id)));
  };

  const byColor = variants.reduce((acc, v) => {
    const c = v.options.color;
    if (!acc[c]) acc[c] = [];
    acc[c].push(v);
    return acc;
  }, {} as Record<string, Variant[]>);

  const bySize = variants.reduce((acc, v) => {
    const s = v.options.size;
    if (!acc[s]) acc[s] = [];
    acc[s].push(v);
    return acc;
  }, {} as Record<string, Variant[]>);

  const TreeGroup = ({ label, ids, swatch, children }: { label: string; ids: number[]; swatch?: string; children: React.ReactNode }) => {
    const allChecked = ids.every((id) => selected.has(id));
    const someChecked = ids.some((id) => selected.has(id));
    // Only the color tab's groups are unambiguously a single color (swatch is
    // only passed there) — the size tab's groups span every color, so there's
    // no one color to follow the canvas to.
    const color = swatch ? label : undefined;
    return (
      <Collapsible
        open={openGroups[label] ?? false}
        onOpenChange={(v) => setOpenGroups((prev) => ({ ...prev, [label]: v }))}
      >
        <div className="flex items-center gap-2 py-2 px-3 hover:bg-muted rounded">
          <Checkbox
            checked={allChecked}
            indeterminate={someChecked && !allChecked}
            onCheckedChange={() => toggleGroup(ids, color)}
            onClick={(e) => e.stopPropagation()}
          />
          <CollapsibleTrigger className="flex-1 flex items-center gap-2 justify-between text-sm text-left">
            <span className="flex items-center gap-2 min-w-0">
              {swatch && <span className="inline-block size-3 rounded-full border shrink-0" style={{ backgroundColor: swatch }} />}
              <span className="truncate">{label}</span>
            </span>
            <ChevronRightIcon className="size-3 shrink-0 transition-transform data-[state=open]:rotate-90" />
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>{children}</CollapsibleContent>
      </Collapsible>
    );
  };

  // Upload all designs and confirm
  const confirm = async () => {
    if (designs.length === 0) return;
    setUploading(true);
    const toUpload = designs.filter((d) => d.file);
    let uploadedCount = 0;
    try {
      // `designs` is the full desired set — existing ones hydrated on open plus
      // whatever was added/replaced/removed this session — so this replaces
      // draft.designs wholesale rather than appending on top of it.
      const resolved: Design[] = [];
      for (const d of designs) {
        // Keep an empty variantIds empty — the server's buildPrintAreas reads
        // that as "default, minus whatever's overridden elsewhere". Expanding
        // it to the full selected list here (the actual bug) made every default
        // design claim the overridden variants too, stomping the override.
        if (!d.file) {
          // Unchanged file — just carry it over with whatever got edited (position/
          // scale/rotate/variants), no need to re-upload the same image again.
          resolved.push({
            position: d.position, variantIds: d.variantIds,
            fileUrl: d.fileUrl!, thumbUrl: d.thumbUrl, printifyImageId: d.printifyImageId!,
            x: d.x, y: d.y, scale: d.scale, angle: d.angle,
            uploadStatus: "synced",
          });
          continue;
        }
        setUploadProgress({ index: uploadedCount + 1, total: toUpload.length, percent: 0 });
        const form = new FormData();
        form.append("file", d.file);
        form.append("position", d.position);
        form.append("x", String(d.x));
        form.append("y", String(d.y));
        form.append("scale", String(d.scale));
        form.append("angle", String(d.angle));
        form.append("variantIds", JSON.stringify(d.variantIds));
        const { data } = await api.post("/designs/upload", form, {
          headers: { "Content-Type": "multipart/form-data" },
          onUploadProgress: (e) => {
            const percent = e.total ? Math.round((e.loaded / e.total) * 100) : 0;
            setUploadProgress((prev) => prev && { ...prev, percent });
          },
        });
        // Register it in the library the moment it's uploaded, not only once
        // the listing itself gets saved — closing this dialog without saving,
        // or saving the listing but never publishing/save-as-draft, would
        // otherwise leave the file sitting on R2/Printify with no DB row
        // anywhere (ListingDesign only gets created on batch-publish), making
        // it untrackable and invisible in My files.
        if (data.uploadStatus === "synced") {
          await api.patch("/designs/library", {
            fileUrl: data.fileUrl,
            thumbUrl: data.thumbUrl,
            printifyImageId: data.printifyImageId,
          });
        }
        resolved.push(data);
        uploadedCount++;
      }
      const failedOnes = draft.designs.filter((d) => d.uploadStatus === "failed");
      onChange({ designs: [...failedOnes, ...resolved], variants: [...selected].map((id) => {
        // keep the price/enabled state already set for this variant (e.g. in the
        // pricing table); only brand new variant ids get a fresh 0 default.
        return draft.variants.find((v: any) => v.id === id) ?? { id, price: 0, is_enabled: true };
      })});
      onClose();
    } catch {
      alert("Upload failed");
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="w-screen min-w-7xl p-0 overflow-hidden">
        <div className="flex h-[780px]">

          {/* Library — reuse a previously uploaded design instead of re-uploading */}
          {libraryOpen ? (
            <div className="w-72 shrink-0 border-r flex flex-col">
              <div className="flex items-center justify-between p-4 border-b">
                <p className="font-semibold text-sm">My library</p>
                <Button variant="ghost" size="icon" onClick={() => setLibraryOpen(false)} title="Collapse library">
                  <XIcon className="size-4" />
                </Button>
              </div>
              <div className="p-4 space-y-3 border-b">
                <InputGroup>
                  <InputGroupAddon align="inline-start">
                    <SearchIcon className="size-4" />
                  </InputGroupAddon>
                  <InputGroupInput
                    placeholder="Search library"
                    value={librarySearch}
                    onChange={(e) => setLibrarySearch(e.target.value)}
                  />
                </InputGroup>
                <div className="flex items-center gap-2">
                  <Select value={librarySort} onValueChange={(v) => setLibrarySort(v as "recent" | "name")}>
                    <SelectTrigger size="sm" className="flex-1">
                      <SelectValue>
                        {librarySort === "recent" ? "Recently added" : "Name (A–Z)"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="recent">Recently added</SelectItem>
                      <SelectItem value="name">Name (A–Z)</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex border rounded-md overflow-hidden shrink-0">
                    <Button
                      type="button" size="icon" className="rounded-none size-8"
                      variant={libraryView === "grid" ? "secondary" : "ghost"}
                      onClick={() => setLibraryView("grid")} title="Grid view"
                    >
                      <LayoutGridIcon className="size-4" />
                    </Button>
                    <Button
                      type="button" size="icon" className="rounded-none size-8"
                      variant={libraryView === "list" ? "secondary" : "ghost"}
                      onClick={() => setLibraryView("list")} title="List view"
                    >
                      <ListIcon className="size-4" />
                    </Button>
                  </div>
                </div>
              </div>
              <ScrollArea className="flex-1">
                {sortedLibrary.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    {library.length === 0 ? "No uploads yet" : "No matches"}
                  </p>
                ) : libraryView === "grid" ? (
                  <div className="p-4 grid grid-cols-2 gap-3">
                    {sortedLibrary.map((item) => (
                      <button
                        key={item.fileUrl}
                        type="button"
                        onClick={() => reuseDesign(item)}
                        className="text-left rounded-md overflow-hidden border hover:ring-2 hover:ring-primary"
                      >
                        <div className="aspect-square" style={CHECKERBOARD_BG}>
                          <img src={item.thumbUrl ?? item.fileUrl} alt="" className="size-full object-contain" loading="lazy" />
                        </div>
                        <div className="p-2">
                          <p className="text-xs font-medium truncate">{fileNameOf(item.fileUrl)}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {libraryDims[item.fileUrl] ? `${libraryDims[item.fileUrl].w}px × ${libraryDims[item.fileUrl].h}px` : "…"}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="p-2">
                    {sortedLibrary.map((item) => (
                      <button
                        key={item.fileUrl}
                        type="button"
                        onClick={() => reuseDesign(item)}
                        className="flex items-center gap-2 w-full p-2 rounded-md hover:bg-muted text-left"
                      >
                        <div className="size-10 rounded shrink-0 overflow-hidden" style={CHECKERBOARD_BG}>
                          <img src={item.thumbUrl ?? item.fileUrl} alt="" className="size-full object-contain" loading="lazy" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">{fileNameOf(item.fileUrl)}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {libraryDims[item.fileUrl] ? `${libraryDims[item.fileUrl].w}px × ${libraryDims[item.fileUrl].h}px` : "…"}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          ) : (
            <div className="w-10 shrink-0 border-r flex flex-col items-center py-3">
              <Button variant="ghost" size="icon" onClick={() => setLibraryOpen(true)} title="Open library">
                <ImagesIcon className="size-4" />
              </Button>
            </div>
          )}

          {/* Left — canvas */}
          <div className="flex-1 flex flex-col p-8 space-y-5 border-r min-w-0">
            {/* Position tabs */}
            {positions.length > 1 && (
              <div className="flex gap-2">
                {positions.map((p) => (
                  <Button
                    key={p}
                    size="sm"
                    variant={position === p ? "default" : "outline"}
                    onClick={() => setPosition(p)}
                    className="capitalize"
                  >
                    {p}
                  </Button>
                ))}
              </div>
            )}

            {/* Canvas */}
            <div
              ref={canvasRef}
              className="flex-1 bg-muted rounded-lg overflow-hidden select-none relative flex items-center justify-center"
              style={{ containerType: "size", ...(activeColor ? { backgroundColor: colorToHex(activeColor) } : {}) }}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseUp}
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
            >
              {/* Print area box geometry — shared by the measuring div below and the border
                  overlay drawn after it, so both line up exactly.
                  Width is capped by BOTH container width and height (via cqw/cqh) so a
                  tall/narrow print area doesn't overflow the canvas top/bottom. */}
              {position && (
                <div
                  ref={printAreaRef}
                  className="absolute pointer-events-none"
                  style={printAreaBoxStyle}
                >
                  {activeDesign && (
                    <div
                      ref={designElRef}
                      // pointer-events-auto: the print-area box above is pointer-events-none, and
                      // that's inherited — without this, the resize handles below are unclickable.
                      className={`absolute select-none pointer-events-auto cursor-grab active:cursor-grabbing ${focused ? "outline outline-2 outline-primary" : ""}`}
                      style={{
                        left: `${activeDesign.x * 100}%`,
                        top: `${activeDesign.y * 100}%`,
                        // scale IS the fraction of the print area's width (Printify's own definition)
                        width: `${widthFrac * 100}%`,
                        transform: `translate(-50%, -50%) rotate(${activeDesign.angle}deg)`,
                      }}
                    >
                      <img
                        src={activeDesign.preview}
                        alt="design"
                        draggable={false}
                        className="w-full h-auto block pointer-events-none select-none"
                      />
                      {/* Corner + edge handles — only shown once the design itself has been clicked */}
                      {focused && [
                        { x: 0, y: 0, cursor: "nwse-resize" },
                        { x: 1, y: 0, cursor: "nesw-resize" },
                        { x: 0, y: 1, cursor: "nesw-resize" },
                        { x: 1, y: 1, cursor: "nwse-resize" },
                        { x: 0.5, y: 0, cursor: "ns-resize" },
                        { x: 0.5, y: 1, cursor: "ns-resize" },
                        { x: 0, y: 0.5, cursor: "ew-resize" },
                        { x: 1, y: 0.5, cursor: "ew-resize" },
                      ].map((c, i) => (
                        <div
                          key={i}
                          onMouseDown={onCornerMouseDown}
                          className="absolute size-3 bg-background border-2 border-primary rounded-sm"
                          style={{
                            left: `${c.x * 100}%`,
                            top: `${c.y * 100}%`,
                            transform: "translate(-50%, -50%)",
                            cursor: c.cursor,
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Snap guide lines — imaginary center/edge lines shown only while dragging */}
              {position && (verticalGuideAt !== null || horizontalGuideAt !== null) && (
                <div className="absolute pointer-events-none" style={printAreaBoxStyle}>
                  {verticalGuideAt !== null && (
                    <div className="absolute inset-y-0 w-px bg-red-500" style={{ left: `${verticalGuideAt * 100}%` }} />
                  )}
                  {horizontalGuideAt !== null && (
                    <div className="absolute inset-x-0 h-px bg-red-500" style={{ top: `${horizontalGuideAt * 100}%` }} />
                  )}
                </div>
              )}

              {/* Border painted as a later sibling — always on top of the design, so
                  it's always visible even when the design overflows the print area. */}
              {position && (
                <div
                  className="absolute border-2 border-dashed border-muted-foreground/70 pointer-events-none"
                  style={printAreaBoxStyle}
                />
              )}

              {!activeDesign && (
                <div
                  className="flex flex-col items-center gap-2 text-muted-foreground cursor-pointer"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <UploadCloudIcon className="size-8" />
                  <p className="text-sm">
                    {overrideMode
                      ? `Drop a specific design for ${activeColor}`
                      : "Drop design or click to upload"}
                  </p>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
              />
            </div>

            {uploadProgress && (
              <div className="flex items-center gap-2">
                <Progress value={uploadProgress.percent} className="flex-1" />
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {uploadProgress.percent < 100
                    ? `Uploading ${uploadProgress.index}/${uploadProgress.total} — ${uploadProgress.percent}%`
                    : `Processing ${uploadProgress.index}/${uploadProgress.total}…`}
                </span>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                className="ml-auto"
                disabled={designs.length === 0 || selected.size === 0 || uploading}
                onClick={confirm}
              >
                {uploading ? "Uploading..." : `Save Product`}
              </Button>
            </div>
          </div>

          {/* Right panel */}
          <div className="w-96 flex flex-col shrink-0">
            {!showVariantPicker ? (
              // Default panel
              <div className="flex flex-col h-full">
                <div className="p-5 border-b">
                  <p className="font-semibold text-sm">{draft.blueprintLabel}</p>
                  <p className="text-xs text-muted-foreground">{draft.printProviderLabel}</p>
                </div>

                <div className="p-5 space-y-5 flex-1">
                  {/* Variants section */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">Variants</p>
                      <Button size="sm" variant="outline" onClick={() => setShowVariantPicker(true)}>
                        Select variants
                      </Button>
                    </div>

                    {/* Color swatches */}
                    {uniqueColors.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {uniqueColors.map((color) => (
                          <button
                            key={color}
                            title={color}
                            onClick={() => setActiveColor(activeColor === color ? null : color)}
                            className={`size-7 rounded-full border-2 transition-all ${
                              activeColor === color
                                ? "border-primary scale-110"
                                : "border-muted-foreground/30"
                            }`}
                            style={{ backgroundColor: colorToHex(color) }}
                          />
                        ))}
                      </div>
                    )}

                    {/* Override toggle */}
                    {activeColor && (
                      <div className="flex items-center justify-between gap-2">
                        <Label htmlFor="override-toggle" className="text-xs font-normal">
                          Make a specific design for {activeColor}
                        </Label>
                        <Switch
                          id="override-toggle"
                          checked={overrideMode}
                          onCheckedChange={(checked) => {
                            // Turning off doesn't just hide the override — it must delete
                            // it, otherwise switching color/position and back re-derives
                            // overrideMode=true from the leftover design (the actual bug).
                            if (!checked && activeDesign) {
                              setDesigns((prev) => prev.filter((d) => d !== activeDesign));
                            }
                            setOverrideMode(checked);
                          }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Designs list — only the ones that belong to the current position tab.
                      Clicking a card switches canvas context to it and expands its own
                      layer properties (scale/rotate/position) inline, right below it. */}
                  {(() => {
                    // Only the design relevant to the current color context: the
                    // override while one's active, otherwise the default — never both.
                    const positionDesigns = designs
                      .map((d, i) => ({ d, i }))
                      .filter(({ d }) => d.position === position && d === activeDesign);
                    if (positionDesigns.length === 0) return null;

                    return (
                      <div className="space-y-3">
                        <p className="text-sm font-medium">Designs</p>
                        {positionDesigns.map(({ d, i }) => {
                          const isActive = d === activeDesign;
                          const isOpen = isActive && propertiesOpen;
                          const colorName = d.variantIds.length > 0
                            ? variants.find((v) => d.variantIds.includes(v.id))?.options.color
                            : null;
                          const leftPct = (d.x - widthFrac / 2) * 100;
                          const topPct = (d.y - heightFrac / 2) * 100;
                          const update = (patch: Partial<DesignEntry>) =>
                            setDesigns((prev) => prev.map((x) => (x === d ? { ...x, ...patch } : x)));
                          const dpiPlaceholderWidth = maxPlaceholderWidth(variants, d.position);
                          const dpi = dpiPlaceholderWidth ? effectiveDpi(d.imgWidth, d.scale, dpiPlaceholderWidth) : null;

                          return (
                            <div key={i} className={`border rounded-lg overflow-hidden ${isActive ? "border-foreground/20" : ""}`}>
                              <div
                                className={`flex items-center gap-3 p-3 cursor-pointer hover:bg-muted ${isActive ? "bg-muted/60" : ""}`}
                                onClick={() => {
                                  if (isActive && propertiesOpen) { setPropertiesOpen(false); return; }
                                  if (colorName) {
                                    setActiveColor(colorName);
                                    setOverrideMode(true);
                                  } else {
                                    setActiveColor(null);
                                    setOverrideMode(false);
                                  }
                                  setPropertiesOpen(true);
                                }}
                              >
                                <img src={d.preview} alt="" className="size-12 object-cover rounded" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium truncate">{d.file ? d.file.name : d.fileUrl?.split("/").pop()}</p>
                                  <p className="text-xs text-muted-foreground capitalize flex items-center gap-1">
                                    {d.position}
                                    {colorName ? (
                                      <>
                                        {" · "}
                                        <span className="inline-block size-2.5 rounded-full border shrink-0" style={{ backgroundColor: colorToHex(colorName) }} />
                                        {colorName}
                                      </>
                                    ) : " · default"}
                                  </p>
                                  {dpi !== null && (
                                    <p className={`text-[11px] flex items-center gap-1 ${
                                      dpi < 150 ? "text-destructive" : dpi < 300 ? "text-amber-600" : "text-muted-foreground"
                                    }`}>
                                      {dpi < 300 && <AlertTriangleIcon className="size-3 shrink-0" />}
                                      {dpi} DPI
                                      {dpi < 150 ? " — will likely print blurry" : dpi < 300 ? " — below Printify's 300 DPI recommendation" : ""}
                                    </p>
                                  )}
                                </div>
                                <ChevronRightIcon className={`size-4 text-muted-foreground shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                                <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); removeDesign(i); }}>
                                  <XIcon className="size-3" />
                                </Button>
                              </div>

                              {/* Layer properties — Printify's own API fields (x, y, scale, angle) only,
                                  no invented inches/DPI since Printify doesn't expose real print area size. */}
                              {isOpen && placeholder && (
                                <div className="p-3 pt-3 border-t space-y-3" onClick={(e) => e.stopPropagation()}>
                                  <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                      <Label className="text-xs">Scale</Label>
                                      <div className="relative">
                                        <Input type="number" step="1" min="1" value={(d.scale * 100).toFixed(2)}
                                          onChange={(e) => update({ scale: Number(e.target.value) / 100 })}
                                        />
                                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                                      </div>
                                    </div>
                                    <div className="space-y-1">
                                      <Label className="text-xs">Rotate</Label>
                                      <div className="relative">
                                        <Input type="number" step="1" value={d.angle}
                                          onChange={(e) => update({ angle: Number(e.target.value) })}
                                        />
                                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">deg</span>
                                      </div>
                                    </div>
                                    <div className="space-y-1">
                                      <Label className="text-xs">Position left</Label>
                                      <div className="relative">
                                        <Input type="number" step="0.1" value={leftPct.toFixed(2)}
                                          onChange={(e) => update({ x: Number(e.target.value) / 100 + widthFrac / 2 })}
                                        />
                                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                                      </div>
                                    </div>
                                    <div className="space-y-1">
                                      <Label className="text-xs">Position top</Label>
                                      <div className="relative">
                                        <Input type="number" step="0.1" value={topPct.toFixed(2)}
                                          onChange={(e) => update({ y: Number(e.target.value) / 100 + heightFrac / 2 })}
                                        />
                                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex gap-2">
                                    <div className="flex border rounded-md overflow-hidden">
                                      <Button type="button" size="icon" variant="ghost" className="rounded-none" title="Align left"
                                        onClick={() => update({ x: widthFrac / 2 })}
                                      ><AlignHorizontalJustifyStart className="size-4" /></Button>
                                      <Button type="button" size="icon" variant="ghost" className="rounded-none" title="Center horizontally"
                                        onClick={() => update({ x: 0.5 })}
                                      ><AlignHorizontalJustifyCenter className="size-4" /></Button>
                                      <Button type="button" size="icon" variant="ghost" className="rounded-none" title="Align right"
                                        onClick={() => update({ x: 1 - widthFrac / 2 })}
                                      ><AlignHorizontalJustifyEnd className="size-4" /></Button>
                                    </div>
                                    <div className="flex border rounded-md overflow-hidden">
                                      <Button type="button" size="icon" variant="ghost" className="rounded-none" title="Align top"
                                        onClick={() => update({ y: heightFrac / 2 })}
                                      ><AlignVerticalJustifyStart className="size-4" /></Button>
                                      <Button type="button" size="icon" variant="ghost" className="rounded-none" title="Center vertically"
                                        onClick={() => update({ y: 0.5 })}
                                      ><AlignVerticalJustifyCenter className="size-4" /></Button>
                                      <Button type="button" size="icon" variant="ghost" className="rounded-none" title="Align bottom"
                                        onClick={() => update({ y: 1 - heightFrac / 2 })}
                                      ><AlignVerticalJustifyEnd className="size-4" /></Button>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              </div>
            ) : (
              // Variant picker panel
              <div className="flex flex-col h-full">
                <div className="p-5 border-b flex items-center gap-3">
                  <Button variant="ghost" size="icon" onClick={() => setShowVariantPicker(false)}>
                    <ChevronLeftIcon className="size-4" />
                  </Button>
                  <p className="font-medium text-sm">Select variants</p>
                </div>
                <div className="px-5 py-3 border-b">
                  <div className="flex items-center gap-2 cursor-pointer" onClick={toggleAll}>
                    <Checkbox checked={selected.size === variants.length && variants.length > 0} />
                    <span className="text-sm">Select all ({variants.length})</span>
                  </div>
                </div>
                <Tabs defaultValue="color" className="flex-1 flex flex-col overflow-hidden">
                  <TabsList className="mx-5 mt-3 shrink-0">
                    <TabsTrigger value="color" className="flex-1">Color</TabsTrigger>
                    <TabsTrigger value="size" className="flex-1">Size</TabsTrigger>
                  </TabsList>
                  <TabsContent value="color" className="flex-1 overflow-hidden mt-3">
                    <ScrollArea className="h-full px-3">
                      {Object.entries(byColor).map(([color, vars]) => (
                        <TreeGroup key={color} label={color} ids={vars.map((v) => v.id)} swatch={colorToHex(color)}>
                          {vars.map((v) => (
                            <div
                              key={v.id}
                              className="flex items-center gap-2 py-1.5 px-3 pl-9 hover:bg-muted rounded cursor-pointer"
                              onClick={() => toggleOne(v)}
                            >
                              <Checkbox checked={selected.has(v.id)} />
                              <span className="text-sm">{v.options.size}</span>
                            </div>
                          ))}
                        </TreeGroup>
                      ))}
                    </ScrollArea>
                  </TabsContent>
                  <TabsContent value="size" className="flex-1 overflow-hidden mt-3">
                    <ScrollArea className="h-full px-3">
                      {Object.entries(bySize).map(([size, vars]) => (
                        <TreeGroup key={size} label={size} ids={vars.map((v) => v.id)}>
                          {vars.map((v) => (
                            <div
                              key={v.id}
                              className="flex items-center gap-2 py-1.5 px-3 pl-9 hover:bg-muted rounded cursor-pointer"
                              onClick={() => toggleOne(v)}
                            >
                              <Checkbox checked={selected.has(v.id)} />
                              <span className="inline-block size-3 rounded-full border shrink-0" style={{ backgroundColor: colorToHex(v.options.color) }} />
                              <span className="text-sm">{v.options.color}</span>
                            </div>
                          ))}
                        </TreeGroup>
                      ))}
                    </ScrollArea>
                  </TabsContent>
                </Tabs>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}