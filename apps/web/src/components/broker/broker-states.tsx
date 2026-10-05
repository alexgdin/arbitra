import { Button } from "@my-better-t-app/ui/components/button";
import { Skeleton } from "@my-better-t-app/ui/components/skeleton";
import { CloudOff, LoaderCircle, RotateCw } from "lucide-react";

import { EmptyState } from "@/components/empty-state";

export function QueryError({
  title,
  onRetry,
  retrying,
}: {
  title: string;
  onRetry: () => void;
  retrying: boolean;
}) {
  return (
    <div role="alert">
      <EmptyState
        icon={<CloudOff />}
        title={title}
        description="Verifică conexiunea la internet și încearcă din nou."
        action={
          <Button variant="outline" onClick={onRetry} disabled={retrying}>
            {retrying ? (
              <LoaderCircle aria-hidden="true" className="motion-safe:animate-spin" />
            ) : (
              <RotateCw aria-hidden="true" />
            )}
            Încearcă din nou
          </Button>
        }
      />
    </div>
  );
}

const TARGET_ROWS = ["first", "second", "third"] as const;

export function TargetsSkeleton() {
  return (
    <div aria-busy="true" className="space-y-3">
      <p role="status" className="sr-only">
        Se încarcă produsele cu preț țintă…
      </p>
      {TARGET_ROWS.map((row) => (
        <Skeleton key={row} className="h-28 w-full rounded-xl" />
      ))}
    </div>
  );
}
