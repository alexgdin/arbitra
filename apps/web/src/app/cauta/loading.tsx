import { Skeleton } from "@my-better-t-app/ui/components/skeleton";

import { ResultSkeleton } from "@/components/search/result-skeleton";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <p role="status" className="sr-only">
        Se încarcă…
      </p>
      <div aria-hidden="true" className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-full max-w-md" />
        </div>
        <Skeleton className="h-12 rounded-xl" />
        <ResultSkeleton />
      </div>
    </div>
  );
}
