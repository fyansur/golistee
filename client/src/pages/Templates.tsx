import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Trash2Icon, PencilIcon, LayoutTemplateIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty";
import { colorToHex } from "@/components/listing/DesignDialog";
import { PaginationFooter } from "@/components/PaginationFooter";

interface Template {
  id: string;
  name: string;
  blueprintLabel: string;
  printProviderLabel: string;
  variants: any[];
  description: string;
  variantOptions: { id: number; color: string; size: string }[];
}

const variantSummary = (t: Template) => {
  const total = t.variants.length;
  if (t.variantOptions.length === 0) return `Total ${total} variant${total === 1 ? "" : "s"}`;
  const colors = new Set(t.variantOptions.map((v) => v.color)).size;
  const sizes = new Set(t.variantOptions.map((v) => v.size)).size;
  return `${colors} color${colors === 1 ? "" : "s"} · ${sizes} size${sizes === 1 ? "" : "s"} · Total ${total} variant${total === 1 ? "" : "s"}`;
};

export default function Templates() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const fetchTemplates = async () => {
    const { data } = await api.get("/templates", { params: { page, pageSize } });
    setTemplates(data.items);
    setTotal(data.total);
  };

  useEffect(() => { fetchTemplates(); }, [page, pageSize]);

  const deleteTemplate = async (id: string) => {
    await api.delete(`/templates/${id}`);
    toast.success("Template deleted");
    fetchTemplates();
  };

  return (
    <div className="max-w-7xl mx-auto justify-center p-8 space-y-6">
      <div className="flex items-center justify-between mb-16">
        <p className="text-3xl font-black flex gap-3 items-center">
          <LayoutTemplateIcon size="24" />Templates
        </p>
      </div>

      <div className="flex items-center justify-between mb-8">
        <p className="text-xl font-black">Saved Templates</p>
        <Button className="bg-accent hover:bg-accent/80" onClick={() => navigate("/templates/new")}>
          <PlusIcon className="size-4" /> Create Template
        </Button>
      </div>

      {templates.length === 0 ? (
        <Empty className="border bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon"><LayoutTemplateIcon /></EmptyMedia>
            <EmptyTitle>No Templates</EmptyTitle>
            <EmptyDescription>
              Templates are created from the Create Listing page — save a blueprint, provider, and variant setup to reuse later.
            </EmptyDescription>
            <EmptyContent>
              <Button onClick={() => navigate("/create")}>
                <PlusIcon className="size-4" /> Create Listing
              </Button>
            </EmptyContent>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {templates.map((t) => (
            <div key={t.id} className="rounded-xl border bg-card p-5 space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xl font-bold truncate">{t.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {t.blueprintLabel} · {t.printProviderLabel}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button variant="outline" size="icon" onClick={() => navigate(`/templates/${t.id}`)}>
                    <PencilIcon className="size-4" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger render={<Button variant="outline" size="icon" />}>
                      <Trash2Icon className="size-4 text-destructive" />
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete template?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteTemplate(t.id)}>
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>

              {t.variantOptions.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {[...new Set(t.variantOptions.map((v) => v.color))].map((color) => (
                    <span
                      key={color}
                      title={color}
                      className="inline-block size-4 rounded-full border shrink-0"
                      style={{ backgroundColor: colorToHex(color) }}
                    />
                  ))}
                </div>
              )}

              {t.description && (
                <p className="text-xs text-muted-foreground line-clamp-2">{t.description}</p>
              )}

              <p className="text-xs text-muted-foreground">{variantSummary(t)}</p>
            </div>
          ))}
        </div>
      )}

      <PaginationFooter page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} />
    </div>
  );
}
