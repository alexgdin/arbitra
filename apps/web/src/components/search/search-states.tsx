import { Button } from "@my-better-t-app/ui/components/button";
import { PackageSearch, RefreshCw, SearchX, TriangleAlert } from "lucide-react";

import { EmptyState } from "@/components/empty-state";

import { PopularSearches } from "./popular-searches";

export function SearchError({
  retrying,
  onRetry,
}: {
  retrying: boolean;
  onRetry: () => void;
}) {
  return (
    <div role="alert">
      <EmptyState
        icon={<TriangleAlert />}
        title="Nu am putut încărca produsele"
        description="Verifică conexiunea la internet și încearcă din nou."
        action={
          <Button variant="outline" disabled={retrying} onClick={onRetry}>
            <RefreshCw aria-hidden="true" data-icon="inline-start" />
            Încearcă din nou
          </Button>
        }
      />
    </div>
  );
}

export function NoResults({ term }: { term: string }) {
  return (
    <EmptyState
      icon={<SearchX />}
      title={
        <>
          Nu am găsit niciun produs pentru{" "}
          <span className="[overflow-wrap:anywhere]">„{term}”</span>
        </>
      }
      description={
        <div className="space-y-2 text-left">
          <p>Câteva idei care ajută:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Folosește mai puține cuvinte, de exemplu doar marca.</li>
            <li>Diacriticele sunt opționale: „casti” găsește și „căști”.</li>
            <li>Încearcă o marcă sau un model, de exemplu „Sony WH-1000XM5”.</li>
          </ul>
        </div>
      }
      action={<PopularSearches centered />}
    />
  );
}

export function EmptyCatalog() {
  return (
    <EmptyState
      icon={<PackageSearch />}
      title="Nu avem încă produse de arătat"
      description="Produsele apar aici imediat ce prețurile lor sunt verificate în magazine. Revino în curând."
    />
  );
}
