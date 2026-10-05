import { Button } from "@my-better-t-app/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@my-better-t-app/ui/components/card";
import { Skeleton } from "@my-better-t-app/ui/components/skeleton";
import { Info, PackageX, RefreshCw, Sparkles, TriangleAlert } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { staggerStyle } from "@/components/motion/stagger";

import { SavingsBanner } from "./savings-banner";
import { StoreComparison } from "./store-comparison";
import { StorePlanCard } from "./store-plan-card";
import type { CartOptimization } from "./types";

const RESULT_TITLE_ID = "optimization-result-title";
/** Delay between two cards of the optimisation plan. */
const PLAN_STEP_MS = 120;

function ResultSkeleton() {
  return (
    <>
      <p className="sr-only">Calculăm cel mai bun plan pentru coșul tău…</p>
      <div aria-hidden="true" className="arbitra-shimmer space-y-4">
        <Skeleton className="h-44 rounded-xl" />
        <Skeleton className="h-60 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </>
  );
}

function ResultError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-4 rounded-xl border border-destructive/30 bg-destructive/5 p-5">
      <div className="flex items-start gap-3">
        <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-destructive" />
        <div className="space-y-1">
          <p className="font-semibold text-base">Nu am putut optimiza coșul</p>
          <p className="text-muted-foreground">
            Ceva n-a mers bine pe drum. Încearcă din nou în câteva clipe.
          </p>
        </div>
      </div>
      <Button variant="outline" onClick={onRetry}>
        <RefreshCw aria-hidden="true" />
        Încearcă din nou
      </Button>
    </div>
  );
}

function ResultPlaceholder() {
  return (
    <EmptyState
      icon={<Sparkles aria-hidden="true" />}
      title="Vezi unde costă cel mai puțin coșul tău"
      description="Adaugă produse în coș și apasă „Optimizează coșul”. Îți arătăm cum să le împarți între magazine ca să plătești cât mai puțin, cu transportul inclus."
    />
  );
}

function StaleNotice({ onRefresh }: { onRefresh: () => void }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-warning/40 bg-warning/15 p-4 text-warning-foreground sm:flex-row sm:items-center sm:justify-between dark:bg-warning/20">
      <div className="flex items-start gap-3">
        <RefreshCw aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <div className="space-y-0.5">
          <p className="font-semibold">Rezultatul nu mai e actual</p>
          <p>Ai modificat coșul după ultima optimizare.</p>
        </div>
      </div>
      <Button variant="outline" onClick={onRefresh}>
        Actualizează
      </Button>
    </div>
  );
}

function UnavailableList({ items }: { items: CartOptimization["unavailable"] }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Indisponibile</CardTitle>
        <CardDescription>
          Nu sunt în stoc în niciun magazin acum, așa că nu intră în plan.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {items.map((item) => (
            <li
              key={item.productId}
              className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0"
            >
              <span className="line-clamp-2 leading-snug">{item.title}</span>
              <span className="shrink-0 text-muted-foreground tabular-nums">
                {item.quantity} buc.
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function OptimizationDetails({ data }: { data: CartOptimization }) {
  const hasPlan = data.plan.length > 0;

  return (
    <>
      {hasPlan ? (
        <>
          {/* the plan reveals one card after another: savings, comparison, then each store */}
          <div className="arbitra-enter" style={staggerStyle(0, PLAN_STEP_MS)}>
            <SavingsBanner totals={data.totals} currency={data.currency} />
          </div>
          <div className="arbitra-enter" style={staggerStyle(1, PLAN_STEP_MS)}>
            <StoreComparison optimization={data} />
          </div>
          {data.plan.map((plan, index) => (
            <div
              key={plan.store}
              className="arbitra-enter"
              style={staggerStyle(index + 2, PLAN_STEP_MS)}
            >
              <StorePlanCard plan={plan} currency={data.currency} />
            </div>
          ))}
        </>
      ) : (
        <EmptyState
          icon={<PackageX aria-hidden="true" />}
          title="Niciun produs din coș nu e în stoc acum"
          description="Încearcă mai târziu sau înlocuiește produsele cu altele."
        />
      )}
      {data.unavailable.length > 0 ? <UnavailableList items={data.unavailable} /> : null}
      {data.method === "heuristic" ? (
        <p className="flex items-center gap-2 text-muted-foreground text-xs">
          <Info aria-hidden="true" className="size-4 shrink-0" />
          Rezultat aproximativ (coș mare)
        </p>
      ) : null}
    </>
  );
}

export function OptimizationResult({
  data,
  isPending,
  isError,
  isStale,
  onOptimize,
}: {
  data: CartOptimization | undefined;
  isPending: boolean;
  isError: boolean;
  isStale: boolean;
  onOptimize: () => void;
}) {
  function renderBody() {
    if (isPending) {
      return <ResultSkeleton />;
    }
    if (isError) {
      return <ResultError onRetry={onOptimize} />;
    }
    if (!data) {
      return <ResultPlaceholder />;
    }
    return (
      <>
        {isStale ? <StaleNotice onRefresh={onOptimize} /> : null}
        <OptimizationDetails data={data} />
      </>
    );
  }

  return (
    <section
      aria-live="polite"
      aria-busy={isPending}
      aria-labelledby={RESULT_TITLE_ID}
      className="space-y-4"
    >
      <h2 id={RESULT_TITLE_ID} className="sr-only">
        Rezultatul optimizării
      </h2>
      {renderBody()}
    </section>
  );
}
