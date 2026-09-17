export const LISTING_STATUS: Record<string, { label: string; dot: string }> = {
  draft: { label: "Local Draft", dot: "bg-muted-foreground" },
  queued: { label: "Queued", dot: "bg-blue-500" },
  draft_queued: { label: "Draft queued", dot: "bg-blue-500" },
  creating: { label: "Publishing…", dot: "bg-blue-500" },
  scheduled: { label: "Scheduled", dot: "bg-violet-500" },
  draft_on_printify: { label: "Draft on Printify", dot: "bg-yellow-500" },
  published: { label: "Published", dot: "bg-green-600" },
  out_of_sync: { label: "Out of sync", dot: "bg-orange-500" },
  failed: { label: "Failed", dot: "bg-destructive" },
};

// Statuses worth filtering Products by — excludes the transient in-flight
// ones (queued, draft_queued, creating) that a listing only sits in for a
// few seconds while a background job runs.
export const FILTERABLE_STATUSES = [
  "published", "draft_on_printify", "scheduled", "draft", "out_of_sync", "failed",
] as const;
