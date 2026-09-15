import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BookOpen, PlusIcon, Search, SearchIcon, Tag } from "lucide-react";
import { toast } from "sonner";
import { Empty, EmptyDescription, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { BlueprintMarquee } from "@/components/BlueprintMarquee";
import { BlueprintImage } from "@/components/BlueprintImage";
import { PaginationFooter } from "@/components/PaginationFooter";

function BlueprintCardSkeleton({ className = "" }: { className?: string }) {
  return (
    <Card className={`overflow-hidden ${className}`}>
      <CardHeader>
        <Skeleton className="aspect-square w-full rounded-md" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </CardContent>
      <CardFooter>
        <Skeleton className="h-8 w-full" />
      </CardFooter>
    </Card>
  );
}

function MarqueeSkeleton() {
  return (
    <div className="flex gap-4 overflow-hidden p-2">
      {Array.from({ length: 5 }).map((_, i) => <BlueprintCardSkeleton key={i} className="w-64 shrink-0" />)}
    </div>
  );
}

interface Blueprint {
  id: number;
  title: string;
  brand: string;
  model: string;
  images: string[];
}

interface CuratedBlueprint {
  id: string;
  blueprintId: number;
  brand: string;
  model: string;
  title: string;
  images: string[];
}

export default function Catalog() {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Blueprint[]>([]);
  const [pool, setPool] = useState<CuratedBlueprint[]>([]);
  const [poolTotal, setPoolTotal] = useState(0);
  const [poolPage, setPoolPage] = useState(1);
  const [poolPageSize, setPoolPageSize] = useState(12);
  // Full (unpaginated) set of curated blueprint ids — used only for "is this
  // already in my pool?" checks (marquee + search dialog), so those stay
  // correct regardless of which page of `pool` is currently loaded.
  const [poolBlueprintIds, setPoolBlueprintIds] = useState<Set<number>>(new Set());
  const [poolLoading, setPoolLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const fetchPool = async () => {
    try {
      const { data } = await api.get("/blueprints", { params: { page: poolPage, pageSize: poolPageSize } });
      setPool(data.items);
      setPoolTotal(data.total);
    } finally {
      setPoolLoading(false);
    }
  };
  const fetchPoolIds = async () => {
    const { data } = await api.get("/blueprints/ids");
    setPoolBlueprintIds(new Set(data));
  };

  useEffect(() => { fetchPool(); }, [poolPage, poolPageSize]);
  useEffect(() => { fetchPoolIds(); }, []);

  const searchBlueprints = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/blueprints/search");
      const filtered = data.filter(
        (b: Blueprint) =>
          b.title.toLowerCase().includes(search.toLowerCase()) ||
          b.brand?.toLowerCase().includes(search.toLowerCase()) ||
          b.model?.toLowerCase().includes(search.toLowerCase()),
      );
      setResults(filtered);
    } catch {
      toast.error("Failed to fetch catalog");
    } finally {
      setLoading(false);
    }
  };

  const addToPool = async (b: Blueprint) => {
    try {
      await api.post("/blueprints", {
        blueprintId: b.id,
        brand: b.brand ?? "",
        model: b.model ?? "",
        title: b.title,
        images: b.images ?? [],
      });
      toast.success(`${b.brand} ${b.model} added to pool`);
      fetchPool();
      fetchPoolIds();
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? "Failed to add");
    }
  };

  const removeFromPool = async (id: string) => {
    await api.delete(`/blueprints/${id}`);
    toast.success("Removed from pool");
    fetchPool();
    fetchPoolIds();
  };

  const inPool = (blueprintId: number) => poolBlueprintIds.has(blueprintId);

  const resized = (url: string) =>
    `https://printify.com/cdn-cgi/image/width=320,quality=90,format=avif/${url}`;

  return (
    <div className="max-w-7xl mx-auto justify-center p-8 space-y-6">

      {/* Pool */}
      <div className="flex items-center justify-between mb-16">
        <p className="text-3xl font-black flex gap-3 items-center"><Tag size="24" />Catalog</p>
      </div>

      <div className="flex items-center justify-between mb-8">
        <p className="text-xl font-black">Popular</p>
        <Button className="bg-accent hover:bg-accent/80" variant="default" type="button" onClick={() => setDialogOpen(true)}>
          <Search className="size-4" /> Search Catalog
        </Button>
      </div>
      <Card className="bg-accent mb-16">
        <CardContent>
          {poolLoading ? (
            <MarqueeSkeleton />
          ) : (
            <BlueprintMarquee
              poolBlueprintIds={poolBlueprintIds}
              onAdd={(b) => addToPool({ id: b.id, brand: b.brand, model: b.model, title: b.title, images: b.images })}
            />
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between mb-8">
        <p className="text-xl font-black">Your Collection</p>
        <Button className="bg-accent hover:bg-accent/80" variant="default" size="sm" type="button" onClick={() => window.location.href = "/create"}>
          <PlusIcon className="size-4" /> Create Products
        </Button>
      </div>
      {poolLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <BlueprintCardSkeleton key={i} />)}
        </div>
      ) : pool.length > 0 ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {pool.map((p) => (
              <Card key={p.id} className="overflow-hidden">
                <CardHeader>
                  {p.images?.[0] && <BlueprintImage src={resized(p.images[0])} alt={p.title} />}
                </CardHeader>
                <CardContent>
                  <p className="text-sm font-bold leading-none">{p.brand} {p.model}</p>
                  <p className="text-xs text-muted-foreground leading-none truncate">{p.title}</p>
                </CardContent>
                <CardFooter>
                  <Button size="sm" className="w-full" onClick={() => removeFromPool(p.id)}>
                    Remove
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
          <PaginationFooter
            page={poolPage} pageSize={poolPageSize} total={poolTotal}
            onPageChange={setPoolPage} onPageSizeChange={setPoolPageSize}
            pageSizes={[12, 24, 48, 96]}
          />
        </div>
      ) : (
        <Empty className="border bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon"><BookOpen /></EmptyMedia>
            <EmptyTitle>Collection is Empty</EmptyTitle>
            <EmptyDescription>
              Your collection currently has no items. Start adding blueprints to see them here.
            </EmptyDescription>
            <EmptyContent>
              <Button onClick={() => setDialogOpen(true)}>Start Adding Blueprints</Button>
            </EmptyContent>
          </EmptyHeader>
        </Empty>
      )}
      {/* Search Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setResults([]); }}>
        <DialogContent className="min-w-7xl max-h-[80vh] flex flex-col" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Add Blueprints</DialogTitle>
          </DialogHeader>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                className="pl-9 bg-card"
                placeholder="Search by brand or model..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && searchBlueprints()}
              />
            </div>
            <Button size="lg" onClick={searchBlueprints} disabled={loading}>
              {loading ? "Searching..." : "Search"}
            </Button>
          </div>
          {loading ? (
            <div className="overflow-y-auto p-[1px] scrollbar-none scroll-fade">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {Array.from({ length: 8 }).map((_, i) => <BlueprintCardSkeleton key={i} />)}
              </div>
            </div>
          ) : results.length > 0 && (
            <div className="overflow-y-auto p-[1px] scrollbar-none scroll-fade">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {results.map((b) => (
                  <Card key={b.id} className="overflow-hidden">
                    <CardHeader>
                      {b.images?.[0] && <BlueprintImage src={resized(b.images[0])} alt={b.title} />}
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm font-bold leading-none">{b.brand} {b.model}</p>
                      <p className="text-xs text-muted-foreground leading-none truncate">{b.title}</p>
                    </CardContent>
                    <CardFooter>
                      <Button
                        size="sm"
                        className="w-full"
                        disabled={inPool(b.id)}
                        onClick={() => !inPool(b.id) && addToPool(b)}
                      >
                        {inPool(b.id) ? "Added" : <><PlusIcon className="size-4" /> Add</>}
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}