"use client";

import { Badge } from "@my-better-t-app/ui/components/badge";
import { Button } from "@my-better-t-app/ui/components/button";
import { Skeleton } from "@my-better-t-app/ui/components/skeleton";
import { cn } from "@my-better-t-app/ui/lib/utils";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, ChevronUp, PackagePlus, Plus } from "lucide-react";
import { useState } from "react";

import type { CartItem } from "@/components/cart/types";
import { EmptyState } from "@/components/empty-state";
import { StoreBadge } from "@/components/store-badge";
import { formatBani } from "@/lib/format";
import { trpc } from "@/utils/trpc";

import { Sparkline } from "./sparkline";

/** Rows shown before "Arată toate"; each row loads its own 30-day history. */
const PAGE_SIZE = 12;
const SPARKLINE_DAYS = 30;
const HISTORY_STALE_MS = 5 * 60_000;

/** Price history of one product. The rows and the detail panel share cached results. */
export function useProductHistory(productId: string, days: number) {
  return useQuery({
    ...trpc.product.history.queryOptions({ productId, days }),
    staleTime: HISTORY_STALE_MS,
    placeholderData: keepPreviousData,
  });
}

export function isTargetReached(item: Pick<CartItem, "currentPrice" | "targetPrice">): boolean {
  return (
    item.targetPrice !== null &&
    item.currentPrice !== null &&
    item.currentPrice <= item.targetPrice
  );
}

function getTargetCaption(item: CartItem, reached: boolean): string {
  const { currentPrice, targetPrice, currency } = item;
  if (targetPrice === null) {
    return "Fără țintă setată";
  }
  if (currentPrice === null) {
    return "Prețul nu este disponibil încă";
  }
  return reached
    ? "Prețul a ajuns la țintă"
    : `Încă ${formatBani(currentPrice - targetPrice, currency)} până la țintă`;
}

function WatchlistRow({
  item,
  selected,
  onSelect,
}: {
  item: CartItem;
  selected: boolean;
  onSelect: (productId: string) => void;
}) {
  const history = useProductHistory(item.productId, SPARKLINE_DAYS);
  const { currentPrice, targetPrice, currency } = item;
  const reached = isTargetReached(item);
  let progress = 0;
  if (reached) {
    progress = 1;
  } else if (targetPrice !== null && currentPrice) {
    progress = Math.min(1, targetPrice / currentPrice);
  }

  return (
    <li className="rounded-xl border bg-card shadow-sm lg:rounded-none lg:border-x-0 lg:border-t-0 lg:shadow-none lg:last:border-b-0">
      <button
        type="button"
        aria-pressed={selected}
        onClick={() => onSelect(item.productId)}
        className={cn(
          "flex w-full flex-col gap-3 rounded-[inherit] p-4 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          selected ? "bg-accent/40 ring-2 ring-primary/50 ring-inset" : "hover:bg-muted/50",
        )}
      >
        <span className="flex items-start justify-between gap-3">
          <span className="min-w-0 space-y-2">
            <span className="line-clamp-2 block font-medium text-sm leading-snug">
              {item.title}
            </span>
            <span className="flex flex-wrap items-center gap-1.5">
              <StoreBadge store={item.store} />
              {reached ? (
                <Badge variant="success">
                  <Check aria-hidden="true" />
                  Țintă atinsă
                </Badge>
              ) : null}
            </span>
          </span>
          {history.isPending ? (
            <Skeleton className="h-8 w-24 shrink-0" />
          ) : (
            <Sparkline points={history.data?.points ?? []} />
          )}
        </span>

        <span className="flex items-end justify-between gap-3">
          <span className="font-semibold text-lg tabular-nums leading-none">
            {formatBani(currentPrice, currency)}
            {item.quantity > 1 ? (
              <span className="ml-1.5 font-normal text-muted-foreground text-xs">
                × {item.quantity}
              </span>
            ) : null}
          </span>
          <span className="text-muted-foreground text-xs tabular-nums">
            {targetPrice === null ? "Fără țintă" : `Țintă ${formatBani(targetPrice, currency)}`}
          </span>
        </span>

        {targetPrice === null ? null : (
          <span className="block space-y-1.5">
            <span aria-hidden="true" className="block h-1.5 overflow-hidden rounded-full bg-muted">
              <span
                className={cn(
                  "block h-full rounded-full transition-[width] motion-reduce:transition-none",
                  reached ? "bg-success" : "bg-primary",
                )}
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </span>
            <span className="block text-muted-foreground text-xs">
              {getTargetCaption(item, reached)}
            </span>
          </span>
        )}
      </button>
    </li>
  );
}

function WatchlistRowSkeleton() {
  return (
    <div className="space-y-3 rounded-xl border bg-card p-4 shadow-sm lg:rounded-none lg:border-x-0 lg:border-t-0 lg:shadow-none lg:last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
        <Skeleton className="h-8 w-24 shrink-0" />
      </div>
      <Skeleton className="h-5 w-28" />
      <Skeleton className="h-1.5 w-full rounded-full" />
    </div>
  );
}

const LIST_CLASSES =
  "space-y-3 lg:space-y-0 lg:overflow-hidden lg:rounded-xl lg:border lg:bg-card lg:shadow-sm";

export function Watchlist({
  items,
  loading,
  selectedId,
  onSelect,
  onAddProduct,
  className,
}: {
  items: readonly CartItem[];
  loading: boolean;
  selectedId: string | undefined;
  onSelect: (productId: string) => void;
  onAddProduct: () => void;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, PAGE_SIZE);

  if (!loading && items.length === 0) {
    return (
      <EmptyState
        className={className}
        icon={<PackagePlus />}
        title="Nu urmărești niciun produs încă"
        description="Adaugă primul produs și îi urmărim prețul. Setează un preț țintă și te anunțăm în aplicație când prețul ajunge la el sau scade sub el."
        action={
          <Button onClick={onAddProduct}>
            <Plus aria-hidden="true" data-icon="inline-start" />
            Adaugă primul produs
          </Button>
        }
      />
    );
  }

  return (
    <section aria-labelledby="watchlist-title" aria-busy={loading} className={className}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 id="watchlist-title" className="font-semibold text-lg">
          Produsele tale
        </h2>
        <p className="text-muted-foreground text-sm">Alege un produs pentru detalii</p>
      </div>

      {loading ? (
        <div aria-hidden="true" className={LIST_CLASSES}>
          {["a", "b", "c"].map((key) => (
            <WatchlistRowSkeleton key={key} />
          ))}
        </div>
      ) : (
        <ul className={LIST_CLASSES}>
          {visible.map((item) => (
            <WatchlistRow
              key={item.id}
              item={item}
              selected={item.productId === selectedId}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}

      {items.length > PAGE_SIZE ? (
        <Button
          variant="ghost"
          aria-expanded={expanded}
          className="mt-3 w-full"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Arată mai puține" : `Arată toate (${items.length})`}
          {expanded ? (
            <ChevronUp aria-hidden="true" data-icon="inline-end" />
          ) : (
            <ChevronDown aria-hidden="true" data-icon="inline-end" />
          )}
        </Button>
      ) : null}
    </section>
  );
}
