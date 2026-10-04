"use client";

import { Badge } from "@my-better-t-app/ui/components/badge";
import { Button, buttonVariants } from "@my-better-t-app/ui/components/button";
import { Card, CardContent, CardHeader } from "@my-better-t-app/ui/components/card";
import { Separator } from "@my-better-t-app/ui/components/separator";
import { Skeleton } from "@my-better-t-app/ui/components/skeleton";
import { cn } from "@my-better-t-app/ui/lib/utils";
import { Check, ExternalLink, RefreshCw, Zap } from "lucide-react";
import { useState } from "react";

import type { CartItem } from "@/components/cart/types";
import { PriceDelta } from "@/components/price-delta";
import { StoreBadge } from "@/components/store-badge";
import { formatBani } from "@/lib/format";
import { getSafeHref } from "@/lib/safe-href";

import { PriceChart } from "./price-chart";
import { TargetEditor } from "./target-editor";
import { isTargetReached, useProductHistory } from "./watchlist";

export const DETAIL_PANEL_ID = "detaliu-produs";

const PERIODS = [7, 30, 90, 365] as const;
type Period = (typeof PERIODS)[number];
const DEFAULT_PERIOD: Period = 90;

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

function PeriodToggle({ value, onChange }: { value: Period; onChange: (days: Period) => void }) {
  return (
    <div
      role="group"
      aria-label="Perioada graficului"
      className="inline-flex gap-1 rounded-lg bg-muted p-1"
    >
      {PERIODS.map((days) => (
        <button
          key={days}
          type="button"
          aria-pressed={value === days}
          onClick={() => onChange(days)}
          className={cn(
            "h-10 rounded-md px-2.5 font-medium text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring sm:h-8 sm:px-3",
            value === days
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {days} zile
        </button>
      ))}
    </div>
  );
}

function PriceHistory({ item }: { item: CartItem }) {
  const [days, setDays] = useState<Period>(DEFAULT_PERIOD);
  const history = useProductHistory(item.productId, days);
  const stats = history.data?.stats ?? null;
  const current = item.currentPrice ?? stats?.current ?? null;
  const loading = history.isPending;
  const value = (bani: number | null) =>
    loading ? <Skeleton className="h-5 w-20" /> : formatBani(bani, item.currency);

  return (
    <section aria-labelledby={`${DETAIL_PANEL_ID}-history`}>
      <div aria-live="polite" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Minim">{value(stats?.min ?? null)}</Stat>
        <Stat label="Maxim">{value(stats?.max ?? null)}</Stat>
        <Stat label="Curent">{value(current)}</Stat>
        <Stat label="Variație">
          {loading ? <Skeleton className="h-5 w-16" /> : null}
          {!loading && stats ? <PriceDelta value={stats.changePct} className="text-base" /> : null}
          {!loading && !stats ? "—" : null}
        </Stat>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <h3 id={`${DETAIL_PANEL_ID}-history`} className="font-semibold text-base">
          Evoluția prețului
        </h3>
        <PeriodToggle value={days} onChange={setDays} />
      </div>

      <div className="mt-3" aria-busy={history.isFetching}>
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
            targetPrice={item.targetPrice}
            currency={item.currency}
            className={cn("transition-opacity", history.isPlaceholderData && "opacity-60")}
          />
        ) : null}
      </div>
    </section>
  );
}

export function ProductDetail({ item }: { item: CartItem }) {
  const href = getSafeHref(item.url);
  const titleId = `${DETAIL_PANEL_ID}-title`;

  return (
    <Card id={DETAIL_PANEL_ID} role="region" aria-labelledby={titleId}>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <StoreBadge store={item.store} />
          {isTargetReached(item) ? (
            <Badge variant="success">
              <Check aria-hidden="true" />
              Țintă atinsă
            </Badge>
          ) : null}
          {item.autoBuyEnabled ? (
            <Badge variant="secondary">
              <Zap aria-hidden="true" />
              Cumpără automat
            </Badge>
          ) : null}
        </div>
        <h2 id={titleId} className="text-balance break-words font-semibold text-lg leading-snug">
          {item.title}
        </h2>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: "outline" }), "w-full sm:w-fit")}
          >
            Deschide în magazin
            <ExternalLink aria-hidden="true" data-icon="inline-end" />
            <span className="sr-only">(se deschide într-o filă nouă)</span>
          </a>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-6">
        <PriceHistory key={item.productId} item={item} />
        <Separator />
        <section aria-labelledby={`${DETAIL_PANEL_ID}-target`}>
          <h3 id={`${DETAIL_PANEL_ID}-target`} className="mb-3 font-semibold text-base">
            Preț țintă
          </h3>
          <TargetEditor
            key={`${item.productId}:${item.targetPrice}:${item.autoBuyEnabled}`}
            item={item}
          />
        </section>
      </CardContent>
    </Card>
  );
}

export function ProductDetailSkeleton() {
  return (
    <Card aria-hidden="true">
      <CardHeader className="gap-3">
        <Skeleton className="h-6 w-24 rounded-full" />
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-10 w-full sm:w-44" />
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {["minim", "maxim", "curent", "variatie"].map((key) => (
            <Skeleton key={key} className="h-[4.25rem]" />
          ))}
        </div>
        <Skeleton className={cn("w-full", CHART_HEIGHT_CLASS)} />
      </CardContent>
    </Card>
  );
}
