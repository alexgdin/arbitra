import { Badge } from "@my-better-t-app/ui/components/badge";
import { buttonVariants } from "@my-better-t-app/ui/components/button";
import { Card, CardContent, CardFooter, CardHeader } from "@my-better-t-app/ui/components/card";
import { cn } from "@my-better-t-app/ui/lib/utils";
import { ArrowRight, PiggyBank } from "lucide-react";
import Link from "next/link";

import { formatCount } from "@/components/cart/plural";
import { FreshnessBadge } from "@/components/freshness-badge";
import { StoreBadge } from "@/components/store-badge";
import { formatBani } from "@/lib/format";

import { getProductHref } from "./hrefs";
import type { CatalogItem, CatalogOffer } from "./types";

const MAX_OFFERS = 4;

function OfferRow({
  offer,
  currency,
  bestPrice,
  markLowest,
}: {
  offer: CatalogOffer;
  currency: string;
  bestPrice: number | null;
  markLowest: boolean;
}) {
  const unavailable = !offer.inStock || offer.price === null;
  const isLowest = markLowest && !unavailable && offer.price === bestPrice;
  const difference =
    !unavailable && bestPrice !== null && offer.price !== null ? offer.price - bestPrice : 0;

  return (
    <li
      className={cn(
        "flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0",
        unavailable && "text-muted-foreground",
      )}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <StoreBadge store={offer.store} />
        {isLowest ? <Badge variant="success">Cel mai mic preț</Badge> : null}
        {offer.inStock ? null : <span className="text-xs">Stoc epuizat</span>}
      </div>
      <div className="shrink-0 text-right">
        <p className={cn("tabular-nums", unavailable ? "text-sm" : "font-semibold text-base")}>
          {offer.price === null ? "Preț indisponibil" : formatBani(offer.price, currency)}
        </p>
        {difference > 0 ? (
          <p className="text-muted-foreground text-xs tabular-nums">
            +{formatBani(difference, currency)}
            <span className="sr-only"> față de cel mai mic preț</span>
          </p>
        ) : null}
      </div>
    </li>
  );
}

/** Un produs din rezultatele căutării, cu ofertele lui din magazine (grupate după EAN). */
export function ResultCard({ item }: { item: CatalogItem }) {
  const visibleOffers = item.offers.slice(0, MAX_OFFERS);
  const hiddenCount = item.offers.length - visibleOffers.length;
  const bestPrice = item.bestOffer?.price ?? null;
  // „Cel mai mic preț” are sens doar când există cu ce să fie comparat.
  const availableCount = item.offers.filter(
    (offer) => offer.inStock && offer.price !== null,
  ).length;

  return (
    <li className="flex">
      <Card className="w-full">
        <CardHeader>
          <h3 className="line-clamp-2 font-semibold text-base leading-snug tracking-tight">
            <Link
              href={getProductHref(item.representativeProductId)}
              className="rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
              {item.title}
            </Link>
          </h3>
          {item.ean ? (
            <p className="text-muted-foreground text-xs tabular-nums">EAN {item.ean}</p>
          ) : null}
        </CardHeader>
        <CardContent className="flex-1 space-y-3">
          <ul aria-label="Prețuri pe magazine" className="divide-y">
            {visibleOffers.map((offer) => (
              <OfferRow
                key={offer.productId}
                offer={offer}
                currency={item.currency}
                bestPrice={bestPrice}
                markLowest={availableCount > 1}
              />
            ))}
          </ul>
          {hiddenCount > 0 ? (
            <p className="text-muted-foreground text-xs">
              Încă {formatCount(hiddenCount, "ofertă", "oferte")} pe pagina produsului
            </p>
          ) : null}
          {item.savings > 0 ? (
            <p className="flex items-start gap-2 rounded-lg bg-success/10 px-3 py-2 text-sm text-success dark:bg-success/12">
              <PiggyBank aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span>
                Economisești până la{" "}
                <strong className="font-semibold tabular-nums">
                  {formatBani(item.savings, item.currency)}
                </strong>{" "}
                față de cel mai scump magazin
              </span>
            </p>
          ) : null}
        </CardContent>
        <CardFooter className="flex-wrap justify-between gap-3">
          <FreshnessBadge checkedAt={item.lastCheckedAt} />
          <Link
            href={getProductHref(item.representativeProductId)}
            aria-label={`Vezi comparația pentru ${item.title}`}
            className={buttonVariants({ className: "max-sm:w-full" })}
          >
            Vezi comparația
            <ArrowRight aria-hidden="true" />
          </Link>
        </CardFooter>
      </Card>
    </li>
  );
}
