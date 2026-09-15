export const LISTING_STATUS: Record<string, { label: string; dot: string }> = {
  draft: { label: "Local Draft", dot: "bg-muted-foreground" },
  queued: { label: "Queued", dot: "bg-blue-500" },
  creating: { label: "Publishing…", dot: "bg-blue-500" },
  draft_on_printify: { label: "Draft on Printify", dot: "bg-yellow-500" },
  published: { label: "Published", dot: "bg-green-600" },
  out_of_sync: { label: "Out of sync", dot: "bg-orange-500" },
  failed: { label: "Failed", dot: "bg-destructive" },
};
