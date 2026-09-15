import { Checkbox } from "@/components/ui/checkbox";
import { colorToHex } from "./DesignDialog";

interface Variant {
  id: number;
  options: { color: string; size: string };
}

interface Props {
  variants: Variant[]; // full catalog list for this blueprint/provider
  selected: Set<number>;
  onToggleOne: (id: number) => void;
  onToggleGroup: (ids: number[]) => void;
  onToggleAll: () => void;
}

// One row per color — a swatch, the color name, an "All sizes" toggle for
// that row, and every size for that color as inline checkboxes. Flat and
// fully visible at once, unlike DesignDialog's tabbed/collapsible tree —
// that one also has to juggle canvas/design state the picker here doesn't.
// Plain native scroll (not the ScrollArea primitive) so the "Select all"
// header can be a true `position: sticky` child of the scroll container —
// base-ui's ScrollArea Viewport doesn't reliably resolve height:100% once
// it has more than one child, which breaks its internal scroll clamp.
export function VariantPicker({ variants, selected, onToggleOne, onToggleGroup, onToggleAll }: Props) {
  const byColor = variants.reduce((acc, v) => {
    (acc[v.options.color] ??= []).push(v);
    return acc;
  }, {} as Record<string, Variant[]>);

  return (
    <div className="border rounded-lg max-h-72 overflow-y-auto">
      <div
        className="sticky top-0 z-10 flex items-center gap-2 px-4 py-3 border-b bg-muted cursor-pointer"
        onClick={onToggleAll}
      >
        <Checkbox className="bg-card" checked={selected.size === variants.length && variants.length > 0} />
        <span className="text-sm font-medium">Select all ({variants.length})</span>
      </div>
      <div className="divide-y">
        {Object.entries(byColor).map(([color, vars]) => {
          const ids = vars.map((v) => v.id);
          const allChecked = ids.every((id) => selected.has(id));
          const someChecked = ids.some((id) => selected.has(id));
          return (
            <div key={color} className="flex items-center gap-4 flex-wrap px-4 py-3">
              <div className="flex items-center gap-2 shrink-0">
                <div
                  className="flex items-center gap-1.5 text-sm cursor-pointer shrink-0"
                  onClick={() => onToggleGroup(ids)}
                >
                  <Checkbox checked={allChecked} indeterminate={someChecked && !allChecked} />
                </div>
                <span className="inline-block size-4 rounded-full border shrink-0" style={{ backgroundColor: colorToHex(color) }} />
                <span className="text-sm font-medium">{color}</span>
              </div>
              <div className="flex items-center gap-3 flex-wrap sm:ml-auto">
                {vars.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center gap-1.5 text-sm cursor-pointer"
                    onClick={() => onToggleOne(v.id)}
                  >
                    <Checkbox checked={selected.has(v.id)} />
                    <span>{v.options.size}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
