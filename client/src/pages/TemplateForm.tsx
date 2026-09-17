import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeftIcon, SaveIcon } from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldLabel, FieldContent } from "@/components/ui/field";
import { InputGroup, InputGroupInput } from "@/components/ui/input-group";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { VariantPicker } from "@/components/listing/VariantPicker";
import { PricingTable } from "@/components/listing/PricingTable";
import type { ListingDraft } from "@/pages/CreateListing";

interface Blueprint {
  id: string;
  blueprintId: number;
  brand: string;
  model: string;
}
interface Provider {
  id: number;
  title: string;
}
interface CatalogVariant {
  id: number;
  options: { color: string; size: string };
}

export default function TemplateForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [blueprints, setBlueprints] = useState<Blueprint[]>([]);
  const [blueprintsLoading, setBlueprintsLoading] = useState(true);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [catalogVariants, setCatalogVariants] = useState<CatalogVariant[]>([]);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [blueprintId, setBlueprintId] = useState<number | null>(null);
  const [blueprintLabel, setBlueprintLabel] = useState("");
  const [printProviderId, setPrintProviderId] = useState<number | null>(null);
  const [printProviderLabel, setPrintProviderLabel] = useState("");
  const [variants, setVariants] = useState<any[]>([]);

  useEffect(() => {
    // This is a picker, not the paginated Catalog page — pull a generous
    // page size so the dropdown still shows everything for a normal user.
    api.get("/blueprints", { params: { pageSize: 100 } })
      .then(({ data }) => setBlueprints(data.items))
      .finally(() => setBlueprintsLoading(false));
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    api.get(`/templates/${id}`).then(({ data }) => {
      setName(data.name);
      setDescription(data.description);
      setBlueprintId(data.blueprintId);
      setBlueprintLabel(data.blueprintLabel);
      setPrintProviderId(data.printProviderId);
      setPrintProviderLabel(data.printProviderLabel);
      setVariants(data.variants);
      setLoading(false);
    }).catch(() => toast.error("Template not found"));
  }, [id, isEdit]);

  useEffect(() => {
    if (!blueprintId) return;
    api.get(`/listings/providers/${blueprintId}`).then(({ data }) => setProviders(data));
  }, [blueprintId]);

  useEffect(() => {
    if (!blueprintId || !printProviderId) { setCatalogVariants([]); return; }
    api
      .get(`/listings/variants/${blueprintId}/${printProviderId}`)
      .then(({ data }) => setCatalogVariants(data.variants ?? []));
  }, [blueprintId, printProviderId]);

  const selectedIds = new Set(variants.map((v) => v.id));

  const toggleOne = (variantId: number) => {
    setVariants((prev) =>
      prev.some((v) => v.id === variantId) ? prev.filter((v) => v.id !== variantId) : [...prev, { id: variantId, price: 0, is_enabled: true }]
    );
  };

  const toggleGroup = (ids: number[]) => {
    const allIn = ids.every((vid) => selectedIds.has(vid));
    setVariants((prev) =>
      allIn
        ? prev.filter((v) => !ids.includes(v.id))
        : [...prev, ...ids.filter((vid) => !selectedIds.has(vid)).map((vid) => ({ id: vid, price: 0, is_enabled: true }))]
    );
  };

  const toggleAll = () => {
    if (selectedIds.size === catalogVariants.length) { setVariants([]); return; }
    setVariants(catalogVariants.map((v) => variants.find((x) => x.id === v.id) ?? { id: v.id, price: 0, is_enabled: true }));
  };

  const pricingDraft: ListingDraft = {
    id: id ?? "new", shopId: "",
    blueprintId, blueprintLabel,
    printProviderId, printProviderLabel,
    title: name, description, tags: [], variants, designs: [],
  };

  const save = async () => {
    if (!name.trim() || !blueprintId || !printProviderId) return;
    setSaving(true);
    try {
      if (isEdit) {
        await api.put(`/templates/${id}`, {
          name, description, variants,
          blueprintId, blueprintLabel, printProviderId, printProviderLabel,
        });
        toast.success("Template updated");
      } else {
        await api.post("/templates", {
          name, description,
          blueprintId, blueprintLabel, printProviderId, printProviderLabel, variants,
        });
        toast.success("Template created");
      }
      navigate("/templates");
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? "Failed to save template");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-sm text-muted-foreground">Loading...</div>;

  return (
    <div>
      <div className="sticky top-0 z-10 grid grid-cols-3 items-center justify-items-stretch border-b bg-background px-8 py-6">
        <Button variant="ghost" onClick={() => navigate("/templates")} className="justify-self-start">
          <ArrowLeftIcon className="size-4" /> Back
        </Button>
        <span className="text-lg font-semibold justify-self-center">
          {isEdit ? "Edit Template" : "Create Template"}
        </span>
        <Button onClick={save} disabled={saving || !name.trim() || !blueprintId || !printProviderId} className="justify-self-end">
          <SaveIcon className="size-4" />
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>

      <div className="max-w-7xl mx-auto p-8 space-y-6">
        <Card>
          <CardContent className="space-y-5">
            <Field>
              <FieldLabel>Template name</FieldLabel>
              <FieldContent>
                <InputGroup>
                  <InputGroupInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Classic Tee" />
                </InputGroup>
              </FieldContent>
            </Field>

            <Field>
              <FieldLabel>Description</FieldLabel>
              <FieldContent>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
              </FieldContent>
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel>Blueprint</FieldLabel>
                <FieldContent>
                  <Select
                    value={blueprintId?.toString() ?? ""}
                    onValueChange={(v) => {
                      const bp = blueprints.find((b) => b.blueprintId === Number(v));
                      setBlueprintId(Number(v));
                      setBlueprintLabel(bp ? `${bp.brand} ${bp.model}` : "");
                      setPrintProviderId(null);
                      setPrintProviderLabel("");
                      setVariants([]);
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select blueprint...">{blueprintLabel || "Select blueprint..."}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {blueprintsLoading ? (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">Loading blueprints...</div>
                      ) : blueprints.length === 0 ? (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">No blueprint added yet</div>
                      ) : null}
                      {blueprints.map((b) => (
                        <SelectItem key={b.id} value={b.blueprintId.toString()}>{b.brand} {b.model}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel>Print provider</FieldLabel>
                <FieldContent>
                  <Select
                    value={printProviderId?.toString() ?? ""}
                    disabled={!blueprintId}
                    onValueChange={(v) => {
                      const p = providers.find((p) => p.id === Number(v));
                      setPrintProviderId(Number(v));
                      setPrintProviderLabel(p?.title ?? "");
                      setVariants([]);
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select provider...">{printProviderLabel || "Select provider..."}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {providers.map((p) => (
                        <SelectItem key={p.id} value={p.id.toString()}>{p.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldContent>
              </Field>
            </div>

            <div>
              <p className="text-sm font-medium mb-2">Variants</p>
              {!blueprintId || !printProviderId ? (
                <p className="text-sm text-muted-foreground">Pick a blueprint and provider first.</p>
              ) : (
                <VariantPicker
                  variants={catalogVariants}
                  selected={selectedIds}
                  onToggleOne={toggleOne}
                  onToggleGroup={toggleGroup}
                  onToggleAll={toggleAll}
                />
              )}
            </div>

            <div>
              <p className="text-sm font-medium mb-2">Pricing</p>
              {variants.length === 0 ? (
                <p className="text-sm text-muted-foreground">Select variants above to set pricing.</p>
              ) : (
                <PricingTable
                  draft={pricingDraft}
                  onChange={(patch) => patch.variants && setVariants(patch.variants)}
                />
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
