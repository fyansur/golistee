import {
  CircleAlertIcon,
  CircleCheckIcon,
  CircleHelpIcon,
  CircleXIcon,
  PackageIcon,
  TimerIcon,
  TruckIcon,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ORDER_STATUS } from "@/lib/orderStatus";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<string, { icon: LucideIcon; className: string; animate?: boolean }> = {
  "on-hold": {
    icon: TimerIcon,
    className: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-300",
  },
  "payment-not-received": {
    icon: CircleAlertIcon,
    className: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/60 dark:text-red-300",
  },
  "sending-to-production": {
    icon: PackageIcon,
    className: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/60 dark:text-blue-300",
  },
  "in-production": {
    icon: PackageIcon,
    className: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/60 dark:text-blue-300",
  },
  "partially-fulfilled": {
    icon: TruckIcon,
    className: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/60 dark:text-violet-300",
  },
  fulfilled: {
    icon: CircleCheckIcon,
    className: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300",
  },
  canceled: {
    icon: CircleXIcon,
    className: "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300",
  },
};

export function OrderStatusBadge({ status, className }: { status: string; className?: string }) {
  const style = STATUS_STYLE[status] ?? {
    icon: CircleHelpIcon,
    className: "border-border bg-muted/50 text-muted-foreground",
  };
  const Icon = style.icon;

  return (
    <Badge variant="outline" className={cn("h-6 gap-1.5 rounded-full px-2.5 font-semibold", style.className, className)}>
      <Icon className={cn(style.animate && "animate-spin")} />
      {ORDER_STATUS[status]?.label ?? status}
    </Badge>
  );
}
