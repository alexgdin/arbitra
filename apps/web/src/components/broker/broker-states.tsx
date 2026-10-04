import { Button } from "@my-better-t-app/ui/components/button";
import { Card, CardContent, CardFooter, CardHeader } from "@my-better-t-app/ui/components/card";
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

function FieldSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-4 w-36" />
      <Skeleton className="h-10 w-full sm:h-9" />
    </div>
  );
}

function FormCardSkeleton({ fields }: { fields: readonly string[] }) {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-44" />
        <Skeleton className="h-4 w-full" />
      </CardHeader>
      <CardContent className="space-y-4">
        {fields.map((field) => (
          <FieldSkeleton key={field} />
        ))}
      </CardContent>
      <CardFooter className="justify-end">
        <Skeleton className="h-10 w-32 sm:h-9" />
      </CardFooter>
    </Card>
  );
}

export function SettingsSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      <p role="status" className="sr-only">
        Se încarcă setările brokerului…
      </p>
      <Card>
        <CardContent className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
          <Skeleton className="h-6 w-11 rounded-full" />
        </CardContent>
      </Card>
      <FormCardSkeleton fields={["max-order", "monthly"]} />
      <FormCardSkeleton fields={["token"]} />
      <FormCardSkeleton fields={["name", "street", "city", "postal-code"]} />
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
