export { cn } from "cn"

// datetime-local inputs read/write local time with no timezone suffix —
// shift by the timezone offset before slicing so the input shows the
// intended local moment instead of UTC.
export const localDateTime = (date: Date) =>
  new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

export const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
