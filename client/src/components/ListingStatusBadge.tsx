import {
  CircleCheckIcon,
  CircleHelpIcon,
  CircleXIcon,
  CloudIcon,
  FilePenLineIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
  TimerIcon,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { LISTING_STATUS } from "@/lib/listingStatus";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<string, { icon: LucideIcon; className: string; animate?: boolean }> = {
  draft: {
    icon: FilePenLineIcon,
    className: "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300",
  },
  queued: {
    icon: TimerIcon,
    className: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/60 dark:text-blue-300",
  },
  draft_queued: {
    icon: TimerIcon,
    className: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/60 dark:text-blue-300",
  },
  creating: {
    icon: LoaderCircleIcon,
    className: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/60 dark:text-blue-300",
    animate: true,
  },
  scheduled: {
    icon: TimerIcon,
    className: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/60 dark:text-violet-300",
  },
  draft_on_printify: {
    icon: CloudIcon,
    className: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-300",
  },
  published: {
    icon: CircleCheckIcon,
    className: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300",
  },
  out_of_sync: {
    icon: RefreshCwIcon,
    className: "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950/60 dark:text-orange-300",
  },
  failed: {
    icon: CircleXIcon,
    className: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/60 dark:text-red-300",
  },
};

interface ListingStatusBadgeProps {
  status: string;
  label?: string;
  count?: number;
  className?: string;
}

export function ListingStatusBadge({ status, label, count, className }: ListingStatusBadgeProps) {
  const style = STATUS_STYLE[status] ?? {
    icon: CircleHelpIcon,
    className: "border-border bg-muted/50 text-muted-foreground",
  };
  const Icon = style.icon;
  const statusLabel = label ?? LISTING_STATUS[status]?.label ?? status;

  return (
    <Badge
      variant="outline"
      className={cn("h-6 gap-1.5 rounded-full px-2.5 font-semibold", style.className, className)}
    >
      <Icon className={cn(style.animate && "animate-spin")} />
      {count == null ? statusLabel : `${count} ${statusLabel}`}
    </Badge>
  );
}
