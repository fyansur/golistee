import { useEffect, useState } from "react";
import { CircleAlertIcon } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { localDateTime, cn } from "@/lib/utils";
import { Alert, AlertDescription } from "./ui/alert";

const pad = (n: number) => String(n).padStart(2, "0");

interface TimeSegmentProps {
  value: number;
  max: number; // exclusive — hour: 24, minute: 60
  invalid?: boolean;
  onChange: (value: number) => void;
  className?: string;
}

// One typed digit pair (hour or minute). The displayed text is its own state
// while focused — padding it to "09" on every keystroke (the previous
// version) fought the cursor position and made "1" then "4" land as
// something other than "14". Padding only happens on blur; mid-typing, only
// digits get through and only a value that's actually < max is committed
// upward, so the real scheduled time can never hold an invalid hour/minute
// even though the field can transiently show one (e.g. "99") until blur
// snaps it back to the last good value.
function TimeSegment({ value, max, invalid, onChange, className }: TimeSegmentProps) {
  const [text, setText] = useState(pad(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(pad(value));
  }, [value, focused]);

  return (
    <input
      type="text"
      inputMode="numeric"
      maxLength={2}
      value={text}
      onFocus={(e) => { setFocused(true); e.target.select(); }}
      onBlur={() => { setFocused(false); setText(pad(value)); }}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, "").slice(0, 2);
        setText(digits);
        const n = Number(digits);
        if (digits !== "" && n < max) onChange(n);
      }}
      className={cn(
        "w-14 rounded-md border border-input bg-transparent py-1 text-center text-2xl font-semibold outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        invalid && "border-destructive/50",
        className
      )}
    />
  );
}

interface DateTimePickerProps {
  value: string; // "YYYY-MM-DDTHH:mm", local — same format localDateTime() produces
  onChange: (value: string) => void;
  min?: string; // same format; disables dates before it and flags times before it
}

export function DateTimePicker({ value, onChange, min }: DateTimePickerProps) {
  const selected = new Date(value);
  const minDate = min ? new Date(min) : undefined;
  // The calendar already blocks picking a day before minDate's day — this is
  // the one case it can't catch: today's day with a too-early time typed in.
  // Checked against the actual combined value, not the raw time field, so it
  // can't be fooled by a stale minute component after a date change.
  const isPastMin = minDate ? selected < minDate : false;

  const setDatePart = (date: Date) => {
    const next = new Date(date);
    next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
    onChange(localDateTime(next));
  };

  const setTimePart = (hours: number, minutes: number) => {
    const next = new Date(selected);
    next.setHours(hours, minutes, 0, 0);
    onChange(localDateTime(next));
  };

  return (
    <div>
      <Calendar selected={selected} onSelect={setDatePart} minDate={minDate} className="w-full" />
      <div className="mt-3 space-y-1 border-t pt-3">
        <div className="flex items-center justify-between gap-2 w-full h-12">
          <TimeSegment

            value={selected.getHours()}
            max={24}
            invalid={isPastMin}
            onChange={(h) => setTimePart(h, selected.getMinutes())}
            className="flex-1 h-full!"
          />
          <span className="text-2xl font-semibold text-muted-foreground">:</span>
          <TimeSegment
            value={selected.getMinutes()}
            max={60}
            invalid={isPastMin}
            onChange={(m) => setTimePart(selected.getHours(), m)}
            className="flex-1 h-full!"
          />
        </div>
        {isPastMin && (
          <Alert className="mt-2 flex p-2 rounded-md text-destructive bg-destructive/10 border-destructive/10">
            <CircleAlertIcon className="size-4" />
            <AlertDescription>
              Pick a time at least a minute from now.
            </AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  );
}
