import { Card, CardContent, CardFooter, CardHeader } from "@my-better-t-app/ui/components/card";
import { Skeleton } from "@my-better-t-app/ui/components/skeleton";

const SKELETON_CARDS = [0, 1, 2, 3, 4, 5] as const;
const SKELETON_OFFERS = [0, 1, 2] as const;

/** Cartonașe de încărcare, cu aceeași formă ca ResultCard. Decorative: starea o anunță regiunea live. */
export function ResultSkeleton() {
  return (
    <ul aria-hidden="true" className="arbitra-shimmer grid gap-4 lg:grid-cols-2">
      {SKELETON_CARDS.map((card) => (
        <li key={card} className="flex">
          <Card className="w-full">
            <CardHeader>
              <Skeleton className="h-5 w-4/5" />
              <Skeleton className="h-3.5 w-28" />
            </CardHeader>
            <CardContent className="flex-1 divide-y">
              {SKELETON_OFFERS.map((offer) => (
                <div
                  key={offer}
                  className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  <Skeleton className="h-6 w-24 rounded-full" />
                  <Skeleton className="h-5 w-24" />
                </div>
              ))}
            </CardContent>
            <CardFooter className="justify-between gap-3">
              <Skeleton className="h-6 w-36 rounded-full" />
              <Skeleton className="h-10 w-36 sm:h-9" />
            </CardFooter>
          </Card>
        </li>
      ))}
    </ul>
  );
}
