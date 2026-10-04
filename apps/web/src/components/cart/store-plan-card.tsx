import { buttonVariants } from "@my-better-t-app/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@my-better-t-app/ui/components/card";
import { ExternalLink, Truck } from "lucide-react";

import { formatBani } from "@/lib/format";
import { getSafeHref } from "@/lib/safe-href";
import { getStore } from "@/lib/stores";

import { formatCount } from "./plural";
import type { StorePlan } from "./types";

export function StorePlanCard({ plan, currency }: { plan: StorePlan; currency: string }) {
  const store = getStore(plan.store);

  return (
    <Card className="border-t-4" style={{ borderTopColor: store.colorVar }}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <span
            aria-hidden="true"
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: store.colorVar }}
          />
          <span className="truncate">{store.name}</span>
        </CardTitle>
        <CardDescription>
          {formatCount(plan.lines.length, "produs", "produse")} de cumpărat de aici
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {plan.lines.map((line) => {
            const href = getSafeHref(line.url);
            return (
              <li key={line.productId} className="space-y-1 py-3 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-3">
                  <p className="line-clamp-2 font-medium leading-snug">{line.title}</p>
                  <p className="shrink-0 font-semibold tabular-nums">
                    {formatBani(line.lineTotal, currency)}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-muted-foreground text-xs tabular-nums">
                    {line.quantity} × {formatBani(line.unitPrice, currency)}
                  </p>
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Deschide ${line.title} pe ${store.name} (se deschide într-o filă nouă)`}
                      className={buttonVariants({ variant: "ghost", className: "-mr-3" })}
                    >
                      Deschide
                      <ExternalLink aria-hidden="true" />
                    </a>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
      <CardFooter className="flex-col items-stretch gap-2">
        <dl className="space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Produse</dt>
            <dd className="tabular-nums">{formatBani(plan.subtotal, currency)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Transport</dt>
            {plan.shipping === 0 ? (
              <dd className="font-medium text-success">Gratuit</dd>
            ) : (
              <dd className="tabular-nums">{formatBani(plan.shipping, currency)}</dd>
            )}
          </div>
          <div className="flex items-center justify-between gap-3 border-t pt-2 font-semibold">
            <dt>Total {store.name}</dt>
            <dd className="text-base tabular-nums">{formatBani(plan.total, currency)}</dd>
          </div>
        </dl>
        {plan.freeShippingRemaining > 0 ? (
          <p className="flex items-center gap-2 rounded-lg bg-warning/15 px-3 py-2 text-warning-foreground text-xs dark:bg-warning/25">
            <Truck aria-hidden="true" className="size-4 shrink-0" />
            Mai adaugă {formatBani(plan.freeShippingRemaining, currency)} pentru transport gratuit
          </p>
        ) : null}
      </CardFooter>
    </Card>
  );
}
