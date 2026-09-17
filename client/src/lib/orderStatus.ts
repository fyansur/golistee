// Printify's order.status isn't documented as a closed enum, so this covers
// the values Golistee's own order-action logic already treats as known
// (see server/src/routes/orders.ts runOrderAction) — anything else falls
// back to a plain label in OrderStatusBadge instead of breaking.
export const ORDER_STATUS: Record<string, { label: string }> = {
  "on-hold": { label: "On Hold" },
  "payment-not-received": { label: "Payment Issue" },
  "sending-to-production": { label: "Sending to Production" },
  "in-production": { label: "In Production" },
  "partially-fulfilled": { label: "Partially Fulfilled" },
  fulfilled: { label: "Fulfilled" },
  canceled: { label: "Canceled" },
};

export const FILTERABLE_ORDER_STATUSES = [
  "on-hold", "payment-not-received", "sending-to-production",
  "in-production", "partially-fulfilled", "fulfilled", "canceled",
] as const;
