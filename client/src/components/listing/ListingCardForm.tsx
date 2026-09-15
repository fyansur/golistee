import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  XIcon,
  CircleAlertIcon,
  StoreIcon,
  BoxIcon,
  TruckIcon,
  LayoutTemplateIcon,
  RotateCcwIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  Trash2Icon,
} from "lucide-react";
import {
  Field,
  FieldLabel,
  FieldContent,
  FieldError,
} from "@/components/ui/field";
import { InputGroup, InputGroupInput } from "@/components/ui/input-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import api from "@/lib/api";
import type { ListingDraft } from "@/pages/CreateListing";
import { DesignDropzone } from "@/components/listing/DesignDropzone";
import { PricingTable } from "@/components/listing/PricingTable";
import { Kbd } from "@/components/ui/kbd"

interface Account {
  id: string;
  label: string;
  shops: { id: string; title: string }[];
}
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
interface Template {
  id: string;
  printifyAccountId: string;
  name: string;
  blueprintId: number;
  blueprintLabel: string;
  printProviderId: number;
  printProviderLabel: string;
  variants: any[];
  description: string;
}

interface Props {
  draft: ListingDraft;
  onChange: (patch: Partial<ListingDraft>) => void;
  // Store/blueprint/provider can't actually be changed once a listing exists
  // (Printify's update endpoint doesn't accept them either) — locks those
  // three selects instead of letting the user edit something that silently
  // won't save.
  locked?: boolean;
  // Card-chrome props — only CreateListing's multi-card list passes these
  // (numbering/collapsing/removing a card only makes sense there); EditListing
  // renders this form standalone and just omits them.
  index?: number;
  onRemove?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function ListingCardForm({ draft, onChange, locked, index, onRemove, collapsed, onToggleCollapse }: Props) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [blueprints, setBlueprints] = useState<Blueprint[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [tagInput, setTagInput] = useState("");
  // Opened programmatically when the user tries to add a design before
  // picking a blueprint/provider — sends them straight to the fix instead of a toast.
  const [blueprintOpen, setBlueprintOpen] = useState(false);
  const [providerOpen, setProviderOpen] = useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);

  const { control } = useForm({
    defaultValues: {
      title: draft.title,
      description: draft.description,
    },
    mode: "onBlur",
  });

  const {
    control: templateControl,
    handleSubmit: handleTemplateSubmit,
    reset: resetTemplateForm,
    formState: templateFormState,
  } = useForm<{ name: string }>({
    defaultValues: { name: "" },
    mode: "onBlur",
  });

  useEffect(() => {
    api.get("/connections").then(({ data }) => setAccounts(data));
    // This is a picker, not the paginated Catalog page — pull a generous
    // page size so the dropdown still shows everything for a normal user.
    api.get("/blueprints", { params: { pageSize: 100 } }).then(({ data }) => setBlueprints(data.items));
    // This is a picker, not the paginated Templates page — pull a generous
    // page size so the dropdown still shows everything for a normal user.
    api.get("/templates", { params: { pageSize: 100 } }).then(({ data }) => setTemplates(data.items));
  }, []);

  const applyTemplate = (t: Template) => {
    onChange({
      blueprintId: t.blueprintId,
      blueprintLabel: t.blueprintLabel,
      printProviderId: t.printProviderId,
      printProviderLabel: t.printProviderLabel,
      variants: t.variants,
      description: t.description,
    });
  };

  const openSaveTemplate = () => {
    // Templates aren't shop-scoped (no shopId column), just account-scoped —
    // no need to require picking a store first, any connected account works.
    const account = accounts[0];
    if (!account || !draft.blueprintId || !draft.printProviderId || draft.variants.length === 0) {
      toast.error("Select a blueprint, provider, and variant first before saving as template");
      return;
    }
    resetTemplateForm({ name: "" });
    setTemplateDialogOpen(true);
  };

  const saveAsTemplate = async (values: { name: string }) => {
    const account = accounts[0];
    if (!account) return;
    const { data } = await api.post("/templates", {
      printifyAccountId: account.id,
      name: values.name.trim(),
      blueprintId: draft.blueprintId,
      blueprintLabel: draft.blueprintLabel,
      printProviderId: draft.printProviderId,
      printProviderLabel: draft.printProviderLabel,
      variants: draft.variants,
      description: draft.description,
    });
    setTemplates((prev) => [...prev, data]);
    setTemplateDialogOpen(false);
    toast.success("Template saved");
  };

  useEffect(() => {
    if (!draft.blueprintId) return;
    api
      .get(`/listings/providers/${draft.blueprintId}`)
      .then(({ data }) => setProviders(data));
  }, [draft.blueprintId]);

  const addTag = (raw: string) => {
    const newTags = raw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const valid = newTags.filter((t) => {
      if (t.length > 20) return false;
      if (draft.tags.includes(t)) return false;
      if (draft.tags.length >= 13) return false;
      if (!/^[a-zA-Z0-9 \-']+$/.test(t)) return false;
      return true;
    });
    if (valid.length)
      onChange({ tags: [...draft.tags, ...valid].slice(0, 13) });
    setTagInput("");
  };

  const removeTag = (tag: string) =>
    onChange({ tags: draft.tags.filter((t) => t !== tag) });

  const resetStore = () => onChange({ shopId: "" });
  const resetBlueprint = () =>
    onChange({ blueprintId: null, blueprintLabel: "", printProviderId: null, printProviderLabel: "", variants: [] });
  const resetProvider = () =>
    onChange({ printProviderId: null, printProviderLabel: "", variants: [] });

  return (
    <div className="space-y-6">
      {/* Toolbar: #index, Blueprint, Provider — Template, collapse, delete */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {index !== undefined && (
            <span className="text-lg font-bold text-muted-foreground">#{index + 1}</span>
          )}

          <div className="flex items-center gap-1">
            <Select
              value={draft.blueprintId?.toString() ?? ""}
              disabled={locked}
              open={blueprintOpen}
              onOpenChange={setBlueprintOpen}
              onValueChange={(v) => {
                const bp = blueprints.find((b) => b.blueprintId === Number(v));
                onChange({
                  blueprintId: Number(v),
                  blueprintLabel: bp ? `${bp.brand} ${bp.model}` : "",
                  printProviderLabel: "",
                  printProviderId: null,
                  variants: [],
                });
              }}
            >
              <SelectTrigger size="sm">
                <BoxIcon className="size-4" />
                <SelectValue placeholder="Blueprint">{draft.blueprintLabel || "Blueprint"}</SelectValue>
              </SelectTrigger>
              <SelectContent align="start">
                {blueprints.map((b) => (
                  <SelectItem key={b.id} value={b.blueprintId.toString()}>
                    {b.brand} {b.model}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {draft.blueprintId && !locked && (
              <Button type="button" variant="ghost" size="icon" className="size-8" onClick={resetBlueprint} aria-label="Clear blueprint" title="Clear blueprint">
                <RotateCcwIcon className="size-4" />
              </Button>
            )}
          </div>

          <div className="flex items-center gap-1">
            <Select
              value={draft.printProviderId?.toString() ?? ""}
              disabled={locked || !draft.blueprintId}
              open={providerOpen}
              onOpenChange={setProviderOpen}
              onValueChange={(v) => {
                const p = providers.find((p) => p.id === Number(v));
                onChange({
                  printProviderId: Number(v),
                  printProviderLabel: p?.title ?? "",
                  variants: [],
                });
              }}
            >
              <SelectTrigger size="sm">
                <TruckIcon className="size-4" />
                <SelectValue placeholder="Provider">{draft.printProviderLabel || "Provider"}</SelectValue>
              </SelectTrigger>
              <SelectContent align="start">
                {providers.map((p) => (
                  <SelectItem key={p.id} value={p.id.toString()}>{p.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {draft.printProviderId && !locked && (
              <Button type="button" variant="ghost" size="icon" className="size-8" onClick={resetProvider} aria-label="Clear print provider" title="Clear print provider">
                <RotateCcwIcon className="size-4" />
              </Button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Apply Template — not shown when locked, since a template also carries a
              blueprint/provider that this listing can no longer change. */}
          {!locked && (
            <Select
              value="Apply Templates"
              onValueChange={(id) => {
                const t = templates.find((t) => t.id === id);
                if (t) applyTemplate(t);
              }}
            >
              <SelectTrigger size="sm">
                <LayoutTemplateIcon className="size-4" />
                <SelectValue placeholder="Template" />
              </SelectTrigger>
              <SelectContent align="end" className="min-w-56">
                {templates.length === 0 && (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">No templates yet</div>
                )}
                {accounts.map((a) => {
                  const accountTemplates = templates.filter((t) => t.printifyAccountId === a.id);
                  if (accountTemplates.length === 0) return null;
                  return (
                    <SelectGroup key={a.id}>
                      <SelectLabel>{a.label}</SelectLabel>
                      {accountTemplates.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  );
                })}
              </SelectContent>
            </Select>
          )}
          {onToggleCollapse && (
            <Button type="button" variant="outline" size="icon" onClick={onToggleCollapse} aria-label={collapsed ? "Expand" : "Collapse"}>
              {collapsed ? <ChevronDownIcon className="size-4" /> : <ChevronUpIcon className="size-4" />}
            </Button>
          )}
          {onRemove && (
            <Button type="button" variant="outline" size="icon" onClick={onRemove} aria-label="Remove listing">
              <Trash2Icon className="size-4 text-destructive" />
            </Button>
          )}
        </div>
      </div>

      {!collapsed && (
        <>
          {/* Thumbnail (left) + Title/Description (right) */}
          <div className="grid grid-cols-4 gap-6">
            <div className="col-span-1">
              <DesignDropzone
                draft={draft}
                onChange={onChange}
                disabled={!draft.blueprintId || !draft.printProviderId}
                onBlocked={() => (!draft.blueprintId ? setBlueprintOpen(true) : setProviderOpen(true))}
              />
            </div>
            <div className="col-span-3 space-y-4">
              <Controller
                name="title"
                control={control}
                rules={{ required: "Title is required" }}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel className="font-black text-sm">Title</FieldLabel>
                    <FieldContent>
                      <InputGroup className="h-12">
                        <InputGroupInput
                          aria-invalid={fieldState.invalid}
                          placeholder="Listing title..."
                          value={field.value}
                          onChange={(e) => {
                            field.onChange(e);
                            onChange({ title: e.target.value });
                          }}
                        />
                      </InputGroup>
                      {fieldState.invalid && (
                        <Alert className="mt-2 flex p-2 rounded-md text-destructive bg-destructive/10 border-destructive/10">
                          <CircleAlertIcon className="size-4" />
                          <AlertDescription>
                            <FieldError errors={[fieldState.error]} />
                          </AlertDescription>
                        </Alert>
                      )}
                    </FieldContent>
                  </Field>
                )}
              />

              <Field>
                <FieldLabel className="font-black text-sm">Description</FieldLabel>
                <FieldContent>
                  <Textarea
                    placeholder="Listing description..."
                    value={draft.description}
                    onChange={(e) => onChange({ description: e.target.value })}
                    rows={6}
                    className="h-48"
                  />
                </FieldContent>
              </Field>
            </div>
          </div>

          {/* Variants and Sizing — full width */}
          {draft.variants && draft.variants.length > 0 && (
            <>
          <Field>
            <FieldLabel className="font-black text-sm">Pricing</FieldLabel>
            <FieldContent>
              <PricingTable draft={draft} onChange={onChange} locked={locked} />
            </FieldContent>
          </Field>

          {/* Tags */}
          <Field>
            <div className="flex items-center justify-between">
              <FieldLabel className="font-black text-sm">Tags</FieldLabel>
              <span className="text-xs text-muted-foreground">
                {draft.tags.length}/13
              </span>
            </div>
            <FieldContent>
              <div className="flex flex-wrap gap-2 min-h-12 p-3 border rounded-md items-center">
                {draft.tags.map((tag) => (
                  <span
                    key={tag}
                    className="h-8 flex items-center gap-1 border text-xs px-2 py-0.5 rounded-md"
                  >
                    {tag}
                    <button className="text-muted hover:text-foreground active:translate-y-[1px]" onClick={() => removeTag(tag)}>
                      <XIcon className="size-4" />
                    </button>
                  </span>
                ))}
                {draft.tags.length < 13 && (
                  <input
                    className="flex-1 min-w-24 bg-transparent text-sm outline-none"
                    placeholder="Keywords"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === ",") {
                        e.preventDefault();
                        addTag(tagInput);
                      }
                      // Only when the input itself is empty — otherwise these
                      // would hijack normal text editing inside the field.
                      if (tagInput === "" && draft.tags.length > 0) {
                        if (e.key === "Backspace") removeTag(draft.tags[draft.tags.length - 1]);
                        if (e.key === "Delete") onChange({ tags: [] });
                      }
                    }}
                    onPaste={(e) => {
                      e.preventDefault();
                      addTag(e.clipboardData.getData("text"));
                    }}
                  />
                )}
              </div>
            </FieldContent>
          <div className="text-xs text-muted-foreground flex gap-2">
            <span><Kbd>⏎</Kbd> Add a tag </span><span><Kbd>Del</Kbd> Remove all tags </span>
          </div>
          </Field>
          </>
          )}

          {/* Store — picked last, only needed before actually saving/publishing */}
          <div className="flex items-center justify-end gap-2">
            <div className="flex items-center gap-1">
              <Select value={draft.shopId} disabled={locked} onValueChange={(v) => onChange({ shopId: v ?? "" })}>
                <SelectTrigger size="sm">
                  <StoreIcon className="size-4" />
                  <SelectValue placeholder="Store">
                    {draft.shopId
                      ? accounts.flatMap((a) => a.shops).find((s) => s.id === draft.shopId)?.title
                      : "Store"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent align="start">
                  {accounts.map((a) => (
                    <SelectGroup key={a.id}>
                      <SelectLabel>{a.label}</SelectLabel>
                      {a.shops.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              {draft.shopId && !locked && (
                <Button type="button" variant="ghost" size="icon" className="size-8" onClick={resetStore} aria-label="Clear store" title="Clear store">
                  <RotateCcwIcon className="size-4" />
                </Button>
              )}
            </div>

            <Button type="button" variant="outline" size="sm" onClick={openSaveTemplate}>
              Save as Template
            </Button>
          </div>
        </>
      )}

      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save as Template</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleTemplateSubmit(saveAsTemplate)} className="py-2">
            <Controller
              name="name"
              control={templateControl}
              rules={{ required: "Template name is required" }}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel>Template name</FieldLabel>
                  <FieldContent>
                    <InputGroup>
                      <InputGroupInput
                        placeholder="e.g. Classic Tee"
                        aria-invalid={fieldState.invalid}
                        autoFocus
                        {...field}
                      />
                    </InputGroup>
                    {fieldState.invalid && (
                      <Alert className="mt-1 flex p-2 rounded-md text-destructive bg-destructive/10 border-destructive/10">
                        <CircleAlertIcon className="size-4" />
                        <AlertDescription><FieldError errors={[fieldState.error]} /></AlertDescription>
                      </Alert>
                    )}
                  </FieldContent>
                </Field>
              )}
            />
          </form>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setTemplateDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleTemplateSubmit(saveAsTemplate)} disabled={templateFormState.isSubmitting}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
