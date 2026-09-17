import { useCallback, useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { PaginationFooter } from "@/components/PaginationFooter";
import {
  SearchIcon, UploadCloudIcon, ChevronLeftIcon, ChevronRightIcon,
  FilesIcon, ArchiveIcon, DownloadIcon, Folder,
} from "lucide-react";

interface FileItem {
  fileUrl: string;
  thumbUrl: string | null;
  printifyImageId: string | null;
  name: string | null;
  archived: boolean;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  mimeType: string | null;
}

// Uploaded key is `designs/{userId}/{timestamp}-{safeName}` — no separate
// filename/date columns exist, both are recovered straight from the URL.
const fileNameOf = (url: string) => (url.split("/").pop() ?? "").replace(/^\d+-/, "");
const uploadedAtOf = (url: string) => {
  const m = url.match(/\/(\d{10,})-/);
  return m ? new Date(Number(m[1])) : null;
};
const extOf = (url: string) => (url.split(".").pop() ?? "").toUpperCase().split("?")[0];
const displayNameOf = (item: FileItem) => item.name ?? fileNameOf(item.fileUrl);

const loadImageSize = (url: string) =>
  new Promise<{ w: number; h: number }>((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 0, h: 0 });
    img.src = url;
  });

const CHECKERBOARD_BG: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(45deg, #00000010 25%, transparent 25%), linear-gradient(-45deg, #00000010 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #00000010 75%), linear-gradient(-45deg, transparent 75%, #00000010 75%)",
  backgroundSize: "12px 12px",
  backgroundPosition: "0 0, 0 6px, 6px -6px, -6px 0px",
};

function FileCardSkeleton() {
  return (
    <div className="rounded-lg overflow-hidden border bg-card">
      <div className="aspect-square p-8">
        <Skeleton className="size-full" />
      </div>
      <div className="p-3 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}

export default function MyFiles() {
  const [items, setItems] = useState<FileItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(24);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filter, setFilter] = useState<"active" | "archived">("active");
  const [dims, setDims] = useState<Record<string, { w: number; h: number }>>({});
  const [sizes, setSizes] = useState<Record<string, number>>({});
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [uploadQueue, setUploadQueue] = useState<{ name: string; percent: number }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadedDimensions = useRef(new Set<string>());
  const loadedSizes = useRef(new Set<string>());

  // Debounced so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => setPage(1), [filter, debouncedSearch, pageSize]);

  const fetchLibrary = useCallback(() => {
    setLoading(true);
    api
      .get("/designs/library", {
        params: {
          page, pageSize,
          ...(filter === "archived" ? { archived: "true" } : {}),
          ...(debouncedSearch ? { search: debouncedSearch } : {}),
        },
      })
      .then(({ data }: { data: { items: FileItem[]; total: number } }) => {
        setItems(data.items);
        setTotal(data.total);
        data.items.forEach((item) => {
          if (item.width == null && !loadedDimensions.current.has(item.fileUrl)) {
            loadedDimensions.current.add(item.fileUrl);
            loadImageSize(item.fileUrl).then((d) => setDims((prev) => ({ ...prev, [item.fileUrl]: d })));
          }
        });
      })
      .finally(() => setLoading(false));
  }, [debouncedSearch, filter, page, pageSize]);

  useEffect(fetchLibrary, [fetchLibrary]);

  const current = openIndex != null ? items[openIndex] : null;

  useEffect(() => {
    if (!current) return;
    setRenaming(false);
    setNameDraft(displayNameOf(current));
    if (current.sizeBytes == null && !loadedSizes.current.has(current.fileUrl)) {
      loadedSizes.current.add(current.fileUrl);
      fetch(current.fileUrl, { method: "HEAD" })
        .then((res) => {
          const len = res.headers.get("content-length");
          if (len) setSizes((prev) => ({ ...prev, [current.fileUrl]: Number(len) }));
        })
        .catch(() => loadedSizes.current.delete(current.fileUrl));
    }
  }, [current]);

  const saveName = async () => {
    if (!current) return;
    const trimmed = nameDraft.trim();
    await api.patch("/designs/library", { fileUrl: current.fileUrl, name: trimmed || null });
    setItems((prev) => prev.map((i) => (i.fileUrl === current.fileUrl ? { ...i, name: trimmed || null } : i)));
    setRenaming(false);
  };

  const toggleArchive = async () => {
    if (!current) return;
    await api.patch("/designs/library", { fileUrl: current.fileUrl, archived: !current.archived });
    setItems((prev) => prev.filter((i) => i.fileUrl !== current.fileUrl));
    setOpenIndex(null);
    toast.success(current.archived ? "File unarchived" : "File archived");
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const fileArr = Array.from(files);
    setUploadQueue(fileArr.map((f) => ({ name: f.name, percent: 0 })));

    const results = [];
    for (const [i, file] of fileArr.entries()) {
      try {
        const form = new FormData();
        form.append("file", file);
        const { data } = await api.post("/designs/upload", form, {
          onUploadProgress: (e) => {
            const percent = e.total ? Math.round((e.loaded / e.total) * 100) : 0;
            setUploadQueue((prev) => prev.map((q, qi) => (qi === i ? { ...q, percent } : q)));
          },
        });
        results.push(data);
      } catch {
        results.push({ uploadStatus: "failed" });
      }
    }
    const failed = results.filter((r) => r.uploadStatus !== "synced");
    if (failed.length > 0) toast.error(`${failed.length} of ${results.length} file(s) failed to upload`);
    if (failed.length < results.length) {
      toast.success(results.length - failed.length > 1 ? "Files uploaded" : "File uploaded");
    }
    setUploadQueue([]);
    fetchLibrary();
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const dimsOf = (item: FileItem) => item.width != null && item.height != null
    ? { w: item.width, h: item.height }
    : dims[item.fileUrl];

  return (
    <div className="max-w-7xl mx-auto p-8 space-y-6">
      <div className="flex items-center justify-between mb-16">
        <p className="text-3xl font-black flex gap-3 items-center">
          <Folder size="24" />Files
        </p>
      </div>
      <div className="flex items-center justify-between mb-8">
        <p className="text-xl font-black">Library</p>
        <Button className="bg-accent hover:bg-accent/80" onClick={() => fileInputRef.current?.click()}>
          <UploadCloudIcon className="size-4" /> New Upload
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => handleUpload(e.target.files)}
        />
      </div>

      {uploadQueue.length > 0 && (
        <div className="border rounded-lg bg-card p-4 space-y-3">
          {uploadQueue.map((q, i) => (
            <div key={i} className="flex items-center gap-3">
              <p className="text-sm truncate w-48 shrink-0">{q.name}</p>
              <Progress value={q.percent} className="flex-1" />
              <span className="text-xs text-muted-foreground w-24 shrink-0 text-right">
                {q.percent < 100 ? `${q.percent}%` : "Processing…"}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <InputGroup className="flex-1 bg-card!">
          <InputGroupAddon align="inline-start">
            <SearchIcon className="size-4" />
          </InputGroupAddon>
          <InputGroupInput
            placeholder="Search by name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </InputGroup>
        <Select value={filter} onValueChange={(v) => setFilter(v as "active" | "archived")}>
          <SelectTrigger className="w-44 bg-card!">
            <SelectValue>{filter === "active" ? "All uploads" : "Archived"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">All uploads</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <FileCardSkeleton key={i} />)}
        </div>
      ) : items.length === 0 ? (
        <Empty className="border bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon"><FilesIcon /></EmptyMedia>
            <EmptyTitle>No files</EmptyTitle>
            <EmptyDescription>
              {debouncedSearch ? "No files match your search." : "Upload a design to get started."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid grid-cols-4 gap-4">
          {items.map((item, i) => (
            <button
              key={item.fileUrl}
              type="button"
              onClick={() => setOpenIndex(i)}
              className="text-left rounded-lg overflow-hidden border hover:border-primary/50 bg-card cursor-pointer"
            >
              <div className="aspect-square p-8" style={CHECKERBOARD_BG}>
                <img src={item.thumbUrl ?? item.fileUrl} alt="" className="size-full object-contain" loading="lazy" />
              </div>
              <div className="p-3">
                <p className="text-sm font-medium truncate">{displayNameOf(item)}</p>
                <p className="text-xs text-muted-foreground">
                  {dimsOf(item) ? `${dimsOf(item).w}px × ${dimsOf(item).h}px` : "…"}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      <PaginationFooter
        page={page} pageSize={pageSize} total={total}
        onPageChange={setPage} onPageSizeChange={setPageSize}
        pageSizes={[24, 48, 96]}
      />

      <Dialog open={current != null} onOpenChange={(open) => !open && setOpenIndex(null)}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden">
          {current && (
            <div className="p-6 space-y-4 min-w-0">
              <div className="flex items-center justify-between">
                <p className="font-semibold">{displayNameOf(current)}</p>
              </div>

              <div className="relative">
                {items.length > 1 && (
                  <>
                    <Button
                      variant="outline" size="icon"
                      className="absolute left-2 top-1/2 -translate-y-1/2 z-10 rounded-full bg-background"
                      onClick={() => setOpenIndex((i) => (i! - 1 + items.length) % items.length)}
                    >
                      <ChevronLeftIcon className="size-4" />
                    </Button>
                    <Button
                      variant="outline" size="icon"
                      className="absolute right-2 top-1/2 -translate-y-1/2 z-10 rounded-full bg-background"
                      onClick={() => setOpenIndex((i) => (i! + 1) % items.length)}
                    >
                      <ChevronRightIcon className="size-4" />
                    </Button>
                  </>
                )}
                <div className="h-96 flex items-center justify-center rounded-md" style={CHECKERBOARD_BG}>
                  <img src={current.fileUrl} alt="" className="max-h-full max-w-full object-contain" />
                </div>
              </div>

              <div className="flex items-center gap-2">
                {renaming ? (
                  <>
                    <InputGroup className="flex-1">
                      <InputGroupInput
                        autoFocus
                        value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveName();
                          if (e.key === "Escape") setRenaming(false);
                        }}
                      />
                    </InputGroup>
                    <Button size="sm" onClick={saveName}>Save</Button>
                  </>
                ) : (
                  <>
                    <p className="font-medium flex-1 truncate">{displayNameOf(current)}</p>
                    <Button variant="outline" size="sm" onClick={() => setRenaming(true)}>Edit name</Button>
                  </>
                )}
              </div>

              <div className="text-sm text-muted-foreground space-y-0.5 break-words">
                <p>
                  {dimsOf(current) ? `${dimsOf(current).w}px × ${dimsOf(current).h}px` : "…"}
                  {(current.sizeBytes ?? sizes[current.fileUrl]) != null && ` / ${((current.sizeBytes ?? sizes[current.fileUrl]) / 1048576).toFixed(1).replace(/\.0$/, "")} MiB`}
                </p>
                {uploadedAtOf(current.fileUrl) && (
                  <p>{uploadedAtOf(current.fileUrl)!.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
                )}
                <p>{current.mimeType?.toUpperCase() ?? `IMAGE/${extOf(current.fileUrl)}`} file format</p>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={toggleArchive}>
                  <ArchiveIcon className="size-4" /> {current.archived ? "Unarchive" : "Archive"}
                </Button>
                <Button
                  className="bg-accent hover:bg-accent/80"
                  render={<a href={current.fileUrl} download={displayNameOf(current)} />}
                  nativeButton={false}
                >
                  <DownloadIcon className="size-4" /> Download
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
