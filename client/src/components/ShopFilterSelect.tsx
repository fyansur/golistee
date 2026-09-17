import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { RotateCcwIcon } from "lucide-react";

interface ShopOption {
  id: string;
  title: string;
}

interface ShopFilterSelectProps {
  shops: ShopOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function ShopFilterSelect({ shops, value, onChange, className = "w-48" }: ShopFilterSelectProps) {
  return (
  <>
    <Select value={value || "all"} onValueChange={(v) => onChange(v === "all" ? "" : v ?? "")}>
      <SelectTrigger className={className}>
        <SelectValue placeholder="All shops">
          {value ? shops.find((s) => s.id === value)?.title ?? "All shops" : "All shops"}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All shops</SelectItem>
        {shops.map((shop) => (
          <SelectItem key={shop.id} value={shop.id}>{shop.title}</SelectItem>
        ))}
      </SelectContent>
    </Select>
    {value && (
      <Button type="button" variant="ghost" size="icon" className="size-8" onClick={() => onChange("")} aria-label="Clear blueprint" title="Clear blueprint">
        <RotateCcwIcon className="size-4" />
      </Button>
    )}
  </> );
}
