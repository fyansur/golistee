import { Fragment, useEffect, useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import api from "@/lib/api";
import type { ListingDraft } from "@/pages/CreateListing";
import { colorToHex } from "./DesignDialog";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

interface Variant {
  id: number;
  options: { color: string; size: string };
}

interface Props {
  draft: ListingDraft;
  onChange: (patch: Partial<ListingDraft>) => void;
  // Shipping/production cost only exist on Printify's side once the listing
  // has actually been created there — true only for an already-published
  // Edit Listing (mirrors the same signal ListingCardForm uses to lock the
  // blueprint/provider/store selects).
  locked?: boolean;
}

const dollars = (cents: number) => (cents ? String(cents / 100) : "");
const toCents = (value: string) => Math.round(Number(value || 0) * 100);
const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

// Profit/margin are based on production cost only — buyer shipping cost is
// informational (Printify's own pricing tool computes it the same way: e.g.
// $25.08 retail - $13.04 production cost = $12.04 profit, unaffected by the
// $4.95 shipping shown alongside it).
const profitOf = (priceCents: number, costCents: number) => priceCents - costCents;
const priceFromProfit = (profitCents: number, costCents: number) => Math.max(0, costCents + profitCents);

// margin% = (price - cost) / price — solved for price to drive the margin input.
const priceFromMargin = (marginPct: number, costCents: number) => {
  const clamped = Math.min(99, Math.max(0, marginPct));
  return Math.max(0, Math.round(costCents / (1 - clamped / 100)));
};
const marginOf = (priceCents: number, costCents: number) =>
  priceCents > 0 ? Math.round((1 - costCents / priceCents) * 100) : null;

export function PricingTable({ draft, onChange, locked }: Props) {
  const [variants, setVariants] = useState<Variant[]>([]);
  const [shipping, setShipping] = useState<Record<number, number>>({});
  const [costs, setCosts] = useState<Record<number, number>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!draft.blueprintId || !draft.printProviderId) return;
    api
      .get(`/listings/variants/${draft.blueprintId}/${draft.printProviderId}`)
      .then(({ data }) => setVariants(data.variants ?? []));
  }, [draft.blueprintId, draft.printProviderId]);

  useEffect(() => {
    if (!locked || !draft.blueprintId || !draft.printProviderId) return;
    api
      .get(`/listings/shipping/${draft.blueprintId}/${draft.printProviderId}`)
      .then(({ data }) => setShipping(data ?? {}));
    api.get(`/listings/cost/${draft.id}`).then(({ data }) => setCosts(data ?? {}));
  }, [locked, draft.blueprintId, draft.printProviderId, draft.id]);

  const selectedIds = new Set(draft.variants.map((v: any) => v.id));
  const rows = variants.filter((v) => selectedIds.has(v.id));
  if (rows.length === 0) return null;

  const bySize = rows.reduce((acc, v) => {
    (acc[v.options.size] ??= []).push(v);
    return acc;
  }, {} as Record<string, Variant[]>);

  const priceOf = (id: number) => draft.variants.find((v: any) => v.id === id)?.price ?? 0;

  const setPrice = (ids: number[], cents: number) => {
    onChange({
      variants: draft.variants.map((v: any) => (ids.includes(v.id) ? { ...v, price: cents } : v)),
    });
  };

  const setMargin = (ids: number[], marginPct: number, costCents: number) => {
    if (Number.isNaN(marginPct) || costCents <= 0) return;
    setPrice(ids, priceFromMargin(marginPct, costCents));
  };

  const setProfit = (ids: number[], value: string, costCents: number) => {
    setPrice(ids, priceFromProfit(toCents(value), costCents));
  };

  const toggle = (size: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(size) ? next.delete(size) : next.add(size);
      return next;
    });
  };

  return (
    <Table className="border rounded-xl text-sm">
      <TableHeader>
        <TableRow className="bg-muted hover:bg-muted">
          <TableHead className="h-auto px-4 py-3 text-xs font-semibold">Size</TableHead>
          <TableHead className="h-auto px-4 py-3 text-xs font-semibold">Color</TableHead>
          {locked && <TableHead className="h-auto px-4 py-3 text-xs font-semibold">Cost</TableHead>}
          {locked && <TableHead className="h-auto px-4 py-3 text-xs font-semibold">Shipping</TableHead>}
          {locked && <TableHead className="h-auto px-4 py-3 text-xs font-semibold">Profit</TableHead>}
          {locked && <TableHead className="h-auto px-4 py-3 text-xs font-semibold">Margin</TableHead>}
          <TableHead className="h-auto px-4 py-3 text-xs font-semibold">Retail price</TableHead>
          <TableHead className="h-auto w-8 px-0" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {Object.entries(bySize).map(([size, vars]) => {
          const prices = vars.map((v) => priceOf(v.id));
          const uniform = prices.every((p) => p === prices[0]);
          const rowCosts = vars.map((v) => costs[v.id]).filter((c) => c != null);
          const costsUniform = rowCosts.length === vars.length && rowCosts.every((c) => c === rowCosts[0]);
          const rowShipping = vars.map((v) => shipping[v.id]).filter((c) => c != null);
          const shippingUniform = rowShipping.length === vars.length && rowShipping.every((c) => c === rowShipping[0]);
          const canEditEarnings = uniform && costsUniform && rowCosts[0] > 0;
          const cost = rowCosts[0] ?? 0;
          const isOpen = expanded.has(size);

          return (
            <Fragment key={size}>
              <TableRow
                className="cursor-pointer bg-background"
                onClick={() => toggle(size)}
              >
                <TableCell className="px-4 py-3 font-medium border-r">{size}</TableCell>
                <TableCell className="px-4 py-3 text-muted-foreground border-r">
                  {vars.length} color{vars.length > 1 ? "s" : ""}
                </TableCell>
                {locked && (
                  <TableCell className="px-4 py-3 text-muted-foreground border-r">
                    {rowCosts.length === 0 ? "—" : costsUniform ? fmt(rowCosts[0]) : "varies"}
                  </TableCell>
                )}
                {locked && (
                  <TableCell className="px-4 py-3 text-muted-foreground border-r">
                    {rowShipping.length === 0 ? "—" : shippingUniform ? fmt(rowShipping[0]) : "varies"}
                  </TableCell>
                )}
                {locked && (
                  <TableCell className="px-4 py-3 border-r">
                    <InputGroup onClick={(e) => e.stopPropagation()}>
                      <InputGroupAddon>USD</InputGroupAddon>
                      <InputGroupInput
                        type="number"
                        step="1"
                        placeholder={canEditEarnings ? "0.00" : "—"}
                        disabled={!canEditEarnings}
                        value={canEditEarnings ? dollars(profitOf(prices[0], cost)) : ""}
                        onChange={(e) => setProfit(vars.map((v) => v.id), e.target.value, cost)}
                        className="no-spinner"
                      />
                    </InputGroup>
                  </TableCell>
                )}
                {locked && (
                  <TableCell className="px-4 py-3 border-r">
                    <InputGroup onClick={(e) => e.stopPropagation()}>
                      <InputGroupInput
                        type="number"
                        step="1"
                        placeholder={canEditEarnings ? "0" : "—"}
                        disabled={!canEditEarnings}
                        value={canEditEarnings ? marginOf(prices[0], cost) ?? "" : ""}
                        onChange={(e) => setMargin(vars.map((v) => v.id), Number(e.target.value), cost)}
                        className="no-spinner"
                      />
                      <InputGroupAddon align="inline-end">%</InputGroupAddon>
                    </InputGroup>
                  </TableCell>
                )}
                <TableCell className="px-4 py-3 border-r">
                  <InputGroup onClick={(e) => e.stopPropagation()}>
                    <InputGroupAddon>USD</InputGroupAddon>
                    <InputGroupInput
                      type="number"
                      step="1"
                      min="0"
                      placeholder={uniform ? "0.00" : "Mixed"}
                      value={uniform ? dollars(prices[0]) : ""}
                      onChange={(e) => setPrice(vars.map((v) => v.id), toCents(e.target.value))}
                      className="no-spinner"
                    />
                  </InputGroup>
                </TableCell>
                <TableCell className="px-4 py-3 text-end">
                  <ChevronDownIcon className={`size-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </TableCell>
              </TableRow>
              {isOpen &&
                vars.map((v) => {
                  const costCents = costs[v.id];
                  const shipCents = shipping[v.id];
                  const canEditVEarnings = costCents != null && costCents > 0;

                  return (
                    <TableRow key={v.id} className="bg-muted/30 hover:bg-muted/30">
                      <TableCell className="px-4 py-2.5 border-r" />
                      <TableCell className="px-4 py-2.5 border-r">
                        <span className="flex items-center gap-2">
                          <span
                            className="inline-block size-4 shrink-0 rounded-full border"
                            style={{ backgroundColor: colorToHex(v.options.color) }}
                          />
                          {v.options.color}
                        </span>
                      </TableCell>
                      {locked && (
                        <TableCell className="px-4 py-2.5 text-muted-foreground border-r">
                          {costCents != null ? fmt(costCents) : "—"}
                        </TableCell>
                      )}
                      {locked && (
                        <TableCell className="px-4 py-2.5 text-muted-foreground border-r">
                          {shipCents != null ? fmt(shipCents) : "—"}
                        </TableCell>
                      )}
                      {locked && (
                        <TableCell className="px-4 py-2.5 border-r">
                          <InputGroup className="bg-card!">
                            <InputGroupAddon>USD</InputGroupAddon>
                            <InputGroupInput
                              type="number"
                              step="1"
                              placeholder={canEditVEarnings ? "0.00" : "—"}
                              disabled={!canEditVEarnings}
                              value={canEditVEarnings ? dollars(profitOf(priceOf(v.id), costCents!)) : ""}
                              onChange={(e) => setProfit([v.id], e.target.value, costCents!)}
                              className="no-spinner"
                            />
                          </InputGroup>
                        </TableCell>
                      )}
                      {locked && (
                        <TableCell className="px-4 py-2.5 border-r">
                          <InputGroup className="bg-card!">
                            <InputGroupInput
                              type="number"
                              step="1"
                              placeholder={canEditVEarnings ? "0" : "—"}
                              disabled={!canEditVEarnings}
                              value={canEditVEarnings ? marginOf(priceOf(v.id), costCents!) ?? "" : ""}
                              onChange={(e) => setMargin([v.id], Number(e.target.value), costCents!)}
                              className="no-spinner"
                            />
                            <InputGroupAddon align="inline-end">%</InputGroupAddon>
                          </InputGroup>
                        </TableCell>
                      )}
                      <TableCell className="px-4 py-2.5 border-r">
                        <InputGroup>
                          <InputGroupAddon>USD</InputGroupAddon>
                          <InputGroupInput
                            type="number"
                            step="1"
                            min="0"
                            value={dollars(priceOf(v.id))}
                            onChange={(e) => setPrice([v.id], toCents(e.target.value))}
                            className="no-spinner"
                          />
                        </InputGroup>
                      </TableCell>
                      <TableCell className="px-0" />
                    </TableRow>
                  );
                })}
            </Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}
