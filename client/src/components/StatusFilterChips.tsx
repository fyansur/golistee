import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface StatusFilterChipsProps {
  statuses: readonly string[];
  value: string;
  onChange: (value: string) => void;
  // Renders the same status badge used elsewhere on the page (e.g.
  // ListingStatusBadge, OrderStatusBadge) — chips share its icon/color
  // instead of duplicating a separate style map.
  renderBadge: (status: string) => ReactNode;
}

// Single-select, unlike a shop filter's chips — picking one status replaces
// the previous pick instead of toggling into a set.
export function StatusFilterChips({ statuses, value, onChange, renderBadge }: StatusFilterChipsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => onChange("")}
        className={`w-16 cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors ${value === ""
            ? "bg-accent text-primary-foreground border-accent"
            : "bg-card text-muted-foreground hover:bg-muted"
          }`}
      >
        All
      </button>
      {statuses.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onChange(s)}
          className={cn(
            "rounded-full transition-all cursor-pointer",
            value === s ? "ring-2 ring-ring ring-offset-2 ring-offset-background" : "opacity-60 hover:opacity-100"
          )}
        >
          {renderBadge(s)}
        </button>
      ))}
    </div>
  );
}
