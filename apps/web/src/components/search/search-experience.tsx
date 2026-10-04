"use client";

import { cn } from "@my-better-t-app/ui/lib/utils";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Info } from "lucide-react";

import { formatCount } from "@/components/cart/plural";
import { trpc } from "@/utils/trpc";

import { PopularSearches } from "./popular-searches";
import { ResultCard } from "./result-card";
import { ResultSkeleton } from "./result-skeleton";
import { SearchBox } from "./search-box";
import { EmptyCatalog, NoResults, SearchError } from "./search-states";
import { useSearchQuery } from "./use-search-query";

const RESULT_LIMIT = 24;
const RESULTS_TITLE_ID = "search-results-title";

function describeCount(count: number): string {
  if (count === 0) {
    return "Niciun rezultat";
  }
  const found = `${formatCount(count, "produs", "produse")} ${count === 1 ? "găsit" : "găsite"}`;
  return count >= RESULT_LIMIT ? `${found} · precizează căutarea ca să găsești mai exact` : found;
}

export function SearchExperience({ initialQuery }: { initialQuery: string }) {
  const { text, term, change, submit, clear } = useSearchQuery(initialQuery);
  const search = useQuery(
    trpc.catalog.search.queryOptions(
      { q: term, limit: RESULT_LIMIT },
      { placeholderData: keepPreviousData },
    ),
  );
  const items = search.data?.items;
  // Se tastează sau rezultatele afișate sunt încă cele ale căutării anterioare.
  const isUpdating = search.isPlaceholderData || text.trim() !== term;
  // O reîmprospătare eșuată nu ascunde rezultatele deja afișate.
  const failed = search.isError && !items;
  const showSkeleton = !items || (items.length === 0 && isUpdating);

  function renderResults() {
    if (failed) {
      return <SearchError retrying={search.isFetching} onRetry={() => search.refetch()} />;
    }
    if (showSkeleton) {
      return <ResultSkeleton />;
    }
    if (items.length === 0) {
      return term === "" ? <EmptyCatalog /> : <NoResults term={term} />;
    }
    return (
      <ul
        className={cn(
          "grid gap-4 transition-opacity motion-reduce:transition-none lg:grid-cols-2",
          isUpdating && "opacity-60",
        )}
      >
        {items.map((item) => (
          <ResultCard key={item.key} item={item} />
        ))}
      </ul>
    );
  }

  function getStatus(): string {
    if (failed) {
      return "";
    }
    return showSkeleton || isUpdating ? "Se caută produse…" : describeCount(items.length);
  }

  return (
    <>
      <SearchBox value={text} onChange={change} onSubmit={submit} onClear={clear} />
      <p className="mt-3 flex items-start gap-2 text-muted-foreground text-sm">
        <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span>
          Prețurile sunt colectate din magazine. Eticheta de pe fiecare produs arată când au fost
          verificate ultima dată, iar cele mai vechi sunt marcate ca posibil depășite.
        </span>
      </p>
      {term === "" ? <PopularSearches className="mt-5" /> : null}
      <section aria-labelledby={RESULTS_TITLE_ID} aria-busy={isUpdating} className="mt-8 space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2
            id={RESULTS_TITLE_ID}
            className="min-w-0 font-semibold text-lg tracking-tight [overflow-wrap:anywhere]"
          >
            {term === "" ? "Produse actualizate recent" : `Rezultate pentru „${term}”`}
          </h2>
          <p aria-live="polite" className="text-muted-foreground text-sm tabular-nums">
            {getStatus()}
          </p>
        </div>
        {renderResults()}
      </section>
    </>
  );
}
