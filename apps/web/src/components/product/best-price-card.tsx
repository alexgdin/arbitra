import { buttonVariants } from "@my-better-t-app/ui/components/button";
import { Card, CardContent } from "@my-better-t-app/ui/components/card";
import { cn } from "@my-better-t-app/ui/lib/utils";
import { ExternalLink, TrendingDown } from "lucide-react";

import { CountUp } from "@/components/motion/count-up";
import { StoreBadge } from "@/components/store-badge";
import { formatBani } from "@/lib/format";
import { getSafeHref } from "@/lib/safe-href";
import { getStore } from "@/lib/stores";

import type { CatalogItem } from "./types";

const TITLE_ID = "cel-mai-mic-pret";

function BestPriceTitle() {
  return (
    <h2
      id={TITLE_ID}
      className="flex items-center gap-1.5 font-medium text-accent-foreground text-sm"
    >
      <TrendingDown aria-hidden="true" className="size-4" />
      Cel mai mic preț
    </h2>
  );
}

/** The cheapest in-stock offer, with the saving against the dearest store and a link to buy. */
export function BestPriceCard({ item, className }: { item: CatalogItem; className?: string }) {
  const { bestOffer } = item;
  const offer = bestOffer
    ? item.offers.find((candidate) => candidate.productId === bestOffer.productId)
    : undefined;
  const href = offer ? getSafeHref(offer.url) : null;

  if (!bestOffer) {
    return (
      <Card className={cn("border-dashed", className)} role="region" aria-labelledby={TITLE_ID}>
        <CardContent className="space-y-2">
          <BestPriceTitle />
          <p className="font-semibold text-2xl text-muted-foreground tracking-tight">
            Indisponibil
          </p>
          <p className="text-muted-foreground text-sm">
            Produsul nu este în stoc în niciun magazin sau nu are încă un preț. Mai jos vezi ce
            știm despre fiecare ofertă.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={cn(
        "border-primary/25 bg-accent/40 shadow-[0_18px_50px_-24px_color-mix(in_oklch,var(--primary)_55%,transparent)]",
        className,
      )}
      role="region"
      aria-labelledby={TITLE_ID}
    >
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <BestPriceTitle />
          <p className="font-semibold text-4xl tabular-nums tracking-tight">
            <CountUp value={bestOffer.price} currency={item.currency} />
          </p>
          <p className="flex flex-wrap items-center gap-1.5 text-muted-foreground text-sm">
            la <StoreBadge store={bestOffer.store} />
          </p>
        </div>
        {item.savings > 0 ? (
          <p className="text-sm">
            Economisești până la{" "}
            <span className="font-semibold text-success tabular-nums">
              {formatBani(item.savings, item.currency)}
            </span>{" "}
            față de cel mai scump magazin.
          </p>
        ) : null}
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className={buttonVariants({ size: "lg", className: "w-full" })}
          >
            Deschide în magazin
            <ExternalLink aria-hidden="true" data-icon="inline-end" />
            <span className="sr-only">
              {" "}
              ({getStore(bestOffer.store).name}, se deschide într-o filă nouă)
            </span>
          </a>
        ) : null}
      </CardContent>
    </Card>
  );
}
