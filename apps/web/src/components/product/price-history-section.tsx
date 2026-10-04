"use client";

import { Button } from "@my-better-t-app/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@my-better-t-app/ui/components/card";
import { Skeleton } from "@my-better-t-app/ui/components/skeleton";
import { cn } from "@my-better-t-app/ui/lib/utils";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChartLine, RefreshCw } from "lucide-react";
import { useState } from "react";

import { PriceChart } from "@/components/dashboard/price-chart";
import { PriceDelta } from "@/components/price-delta";
import { formatBani } from "@/lib/format";
import { getStore } from "@/lib/stores";
import { trpc } from "@/utils/trpc";

import { isPriced, pickDefaultOffer } from "./product-utils";
import { SegmentedControl } from "./segmented-control";
import type { CatalogItem } from "./types";

const TITLE_ID = "evolutia-pretului";
const PERIODS = [30, 90, 365] as const;
type Period = (typeof PERIODS)[number];
const DEFAULT_PERIOD: Period = 90;
const PERIOD_OPTIONS = PERIODS.map((days) => ({ value: days, label: `${days} zile` }));
const HISTORY_STALE_MS = 5 * 60_000;
const CHART_HEIGHT_CLASS = "h-56 sm:h-72";

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-muted/40 px-3 py-2.5">
      <p className="text-muted-foreground text-xs">{label}</p>
      <div className="mt-0.5 flex h-7 items-center font-semibold text-base tabular-nums">
        {children}
      </div>
    </div>
  );
}

function StoreDot({ store }: { store: string }) {
  return (
    <span
      aria-hidden="true"
      className="size-2 shrink-0 rounded-full"
      style={{ backgroundColor: getStore(store).colorVar }}
    />
  );
}

/** Stats and chart for one offer. Give it a `key` with the offer so a store switch starts clean. */
function HistoryPanel({
  productId,
  days,
  currentPrice,
  currency,
}: {
  productId: string;
  days: Period;
  currentPrice: number;
  currency: string;
}) {
  const history = useQuery({
    ...trpc.product.history.queryOptions({ productId, days }),
    staleTime: HISTORY_STALE_MS,
    placeholderData: keepPreviousData,
  });
  const stats = history.data?.stats ?? null;
  const loading = history.isPending;
  const value = (bani: number | null) =>
    loading ? <Skeleton className="h-5 w-20" /> : formatBani(bani, currency);

  return (
    <div className="space-y-4">
      <div aria-live="polite" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Minim">{value(stats?.min ?? null)}</Stat>
        <Stat label="Maxim">{value(stats?.max ?? null)}</Stat>
        <Stat label="Curent">{formatBani(currentPrice, currency)}</Stat>
        <Stat label="Variație">
          {loading ? <Skeleton className="h-5 w-16" /> : null}
          {!loading && stats ? <PriceDelta value={stats.changePct} className="text-base" /> : null}
          {!loading && !stats ? "—" : null}
        </Stat>
      </div>

      <div aria-busy={history.isFetching}>
        {loading ? <Skeleton className={cn("w-full", CHART_HEIGHT_CLASS)} /> : null}
        {history.isError && !history.data ? (
          <div
            role="alert"
            className={cn(
              "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 text-center",
              CHART_HEIGHT_CLASS,
            )}
          >
            <p className="text-sm">Nu am putut încărca istoricul prețului.</p>
            <Button variant="outline" size="sm" onClick={() => history.refetch()}>
              <RefreshCw aria-hidden="true" data-icon="inline-start" />
              Încearcă din nou
            </Button>
          </div>
        ) : null}
        {history.data ? (
          <PriceChart
            points={history.data.points}
            currency={currency}
            className={cn("transition-opacity", history.isPlaceholderData && "opacity-60")}
          />
        ) : null}
      </div>
    </div>
  );
}

function NoPricesYet() {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 text-center",
        CHART_HEIGHT_CLASS,
      )}
    >
      <ChartLine aria-hidden="true" className="size-6 text-muted-foreground" />
      <p className="font-medium text-sm">Încă nu avem prețuri înregistrate</p>
      <p className="max-w-xs text-muted-foreground text-xs">
        Istoricul apare după ce un magazin are un preț pentru acest produs.
      </p>
    </div>
  );
}

/** Price history of one store at a time, defaulting to the cheapest offer. */
export function PriceHistorySection({
  item,
  className,
}: {
  item: CatalogItem;
  className?: string;
}) {
  const [days, setDays] = useState<Period>(DEFAULT_PERIOD);
  const [chosenId, setChosenId] = useState<string | null>(null);

  const pricedOffers = item.offers.filter(isPriced);
  const selected =
    pricedOffers.find((offer) => offer.productId === chosenId) ??
    pickDefaultOffer(item, pricedOffers);
  const storeOptions = pricedOffers.map((offer) => ({
    value: offer.productId,
    label: (
      <>
        <StoreDot store={offer.store} />
        {getStore(offer.store).name}
      </>
    ),
  }));

  return (
    <Card className={className} role="region" aria-labelledby={TITLE_ID}>
      <CardHeader>
        <h2 id={TITLE_ID} className="font-semibold text-lg">
          Evoluția prețului
        </h2>
        <CardDescription>Vezi cum s-a schimbat prețul într-un magazin, în timp.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {selected ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SegmentedControl
                label="Magazinul pentru grafic"
                options={storeOptions}
                value={selected.productId}
                onChange={setChosenId}
              />
              <SegmentedControl
                label="Perioada graficului"
                options={PERIOD_OPTIONS}
                value={days}
                onChange={setDays}
              />
            </div>
            <HistoryPanel
              key={selected.productId}
              productId={selected.productId}
              days={days}
              currentPrice={selected.price}
              currency={item.currency}
            />
          </>
        ) : (
          <NoPricesYet />
        )}
      </CardContent>
    </Card>
  );
}
