import { Button, buttonVariants } from "@my-better-t-app/ui/components/button";
import { Skeleton } from "@my-better-t-app/ui/components/skeleton";
import { LoaderCircle, RotateCw, SearchX, TriangleAlert } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";

/** Two columns on desktop (main content, side card); shared by the content and the skeleton. */
export const SPLIT_LAYOUT = "grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start";

export function ProductSkeleton() {
  return (
    <div aria-busy="true" className="space-y-6">
      <p role="status" className="sr-only">
        Se încarcă produsul…
      </p>
      <div aria-hidden="true" className="arbitra-shimmer space-y-6">
        <div className={SPLIT_LAYOUT}>
          <div className="space-y-3">
            <Skeleton className="h-8 w-11/12" />
            <Skeleton className="h-8 w-2/3" />
            <div className="flex flex-wrap items-center gap-3">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-6 w-44 rounded-full" />
            </div>
          </div>
          <Skeleton className="h-56 rounded-xl" />
        </div>
        <Skeleton className="h-72 rounded-xl" />
        <div className={SPLIT_LAYOUT}>
          <Skeleton className="h-96 rounded-xl" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

export function ProductNotFound() {
  return (
    <EmptyState
      icon={<SearchX />}
      title={<h1>Nu am găsit produsul</h1>}
      description="Linkul poate fi greșit sau produsul nu mai este în catalog. Caută-l din nou și îți arătăm prețurile din magazine."
      action={
        <Link href="/cauta" className={buttonVariants()}>
          Caută un produs
        </Link>
      }
    />
  );
}

export function ProductError({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  return (
    <div role="alert">
      <EmptyState
        icon={<TriangleAlert />}
        title={<h1>Nu am putut încărca produsul</h1>}
        description="Verifică conexiunea la internet și încearcă din nou."
        action={
          <Button variant="outline" disabled={retrying} onClick={onRetry}>
            {retrying ? (
              <LoaderCircle
                aria-hidden="true"
                className="motion-safe:animate-spin"
                data-icon="inline-start"
              />
            ) : (
              <RotateCw aria-hidden="true" data-icon="inline-start" />
            )}
            Încearcă din nou
          </Button>
        }
      />
    </div>
  );
}
