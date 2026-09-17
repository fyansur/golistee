import { useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "cn";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

interface CalendarProps {
  selected: Date;
  onSelect: (date: Date) => void;
  minDate?: Date;
  className?: string;
}

// Plain month-grid built on native Date — a full date library is overkill
// for "show a month, pick a day, disable the past."
export function Calendar({ selected, onSelect, minDate, className }: CalendarProps) {
  const [viewMonth, setViewMonth] = useState(() => new Date(selected.getFullYear(), selected.getMonth(), 1));
  const today = startOfDay(new Date());
  const minDay = minDate ? startOfDay(minDate) : undefined;

  const firstWeekday = viewMonth.getDay();
  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(viewMonth.getFullYear(), viewMonth.getMonth(), i + 1)),
  ];

  const changeMonth = (delta: number) =>
    setViewMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));

  return (
    <div className={cn("w-64 bg-card! p-2 rounded-lg", className)}>
      <div className="mb-2 flex items-center justify-between">
        <Button type="button" variant="ghost" size="icon-sm" onClick={() => changeMonth(-1)}>
          <ChevronLeftIcon className="size-4" />
        </Button>
        <p className="text-sm font-semibold">
          {viewMonth.toLocaleString("en-US", { month: "long", year: "numeric" })}
        </p>
        <Button type="button" variant="ghost" size="icon-sm" onClick={() => changeMonth(1)}>
          <ChevronRightIcon className="size-4" />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-2 text-center text-xs text-muted-foreground">
        {WEEKDAYS.map((w) => <div key={w} className="py-1">{w}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-2">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const disabled = minDay ? day < minDay : false;
          const isSelected = sameDay(day, selected);
          const isToday = sameDay(day, today);
          return (
            <button
              key={i}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(day)}
              className={cn(
                "flex size-12 w-full items-center justify-center rounded-md text-sm transition-colors",
                disabled
                  ? "cursor-not-allowed text-muted-foreground/40"
                  : "cursor-pointer hover:bg-muted",
                isSelected && "bg-accent text-primary-foreground hover:bg-accent/80",
                !isSelected && isToday && "ring-1 ring-ring"
              )}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
