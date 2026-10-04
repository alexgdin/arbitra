import { Badge } from "@my-better-t-app/ui/components/badge";
import { buttonVariants } from "@my-better-t-app/ui/components/button";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@my-better-t-app/ui/components/table";
import { cn } from "@my-better-t-app/ui/lib/utils";
import { Check, ExternalLink } from "lucide-react";

import { FreshnessBadge } from "@/components/freshness-badge";
import { StoreBadge } from "@/components/store-badge";
import { formatBani } from "@/lib/format";
import { getSafeHref } from "@/lib/safe-href";
import { getStore } from "@/lib/stores";

import type { CatalogItem, CatalogOffer } from "./types";

const TITLE_ID = "preturi-magazine";
const TABLE_CAPTION =
  "Prețul produsului în fiecare magazin, de la cel mai mic preț, cu stocul și ultima verificare";

/** An in-stock offer at the lowest price; stores that tie for it all count. */
function isBestOffer(item: CatalogItem, offer: CatalogOffer): boolean {
  return item.bestOffer !== null && offer.inStock && offer.price === item.bestOffer.price;
}

function Price({
  item,
  offer,
  className,
}: {
  item: CatalogItem;
  offer: CatalogOffer;
  className?: string;
}) {
  if (offer.price === null) {
    return <span className="text-muted-foreground text-sm">Preț indisponibil</span>;
  }
  return (
    <span
      className={cn(
        "font-semibold tabular-nums",
        !offer.inStock && "text-muted-foreground",
        className,
      )}
    >
      {formatBani(offer.price, item.currency)}
    </span>
  );
}

function Difference({ item, offer }: { item: CatalogItem; offer: CatalogOffer }) {
  const { bestOffer } = item;
  if (offer.price === null || !bestOffer) {
    return (
      <span aria-hidden="true" className="text-muted-foreground">
        —
      </span>
    );
  }
  if (isBestOffer(item, offer)) {
    return (
      <Badge variant="success">
        <Check aria-hidden="true" />
        Cel mai mic preț
      </Badge>
    );
  }
  return (
    <span className="font-medium text-muted-foreground tabular-nums">
      +{formatBani(offer.price - bestOffer.price, item.currency)}
    </span>
  );
}

function StockBadge({ offer }: { offer: CatalogOffer }) {
  return (
    <Badge variant={offer.inStock ? "success" : "secondary"}>
      {offer.inStock ? "În stoc" : "Stoc epuizat"}
    </Badge>
  );
}

function OfferLink({
  offer,
  size,
  className,
}: {
  offer: CatalogOffer;
  size?: "default" | "sm";
  className?: string;
}) {
  const href = getSafeHref(offer.url);
  if (!href) {
    return <span className="text-muted-foreground text-xs">Link indisponibil</span>;
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className={buttonVariants({ variant: "outline", size, className })}
    >
      Deschide în magazin
      <ExternalLink aria-hidden="true" data-icon="inline-end" />
      <span className="sr-only">
        {" "}
        ({getStore(offer.store).name}, se deschide într-o filă nouă)
      </span>
    </a>
  );
}

function OffersCards({ item }: { item: CatalogItem }) {
  return (
    <ul aria-labelledby={TITLE_ID} className="space-y-3 @4xl:hidden">
      {item.offers.map((offer) => (
        <li
          key={offer.productId}
          className={cn(
            "space-y-3 rounded-xl border bg-card p-4 shadow-sm",
            isBestOffer(item, offer) && "border-success/30 bg-success/5",
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <StoreBadge store={offer.store} />
            <Difference item={item} offer={offer} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <Price item={item} offer={offer} className="text-xl" />
            <StockBadge offer={offer} />
          </div>
          <FreshnessBadge checkedAt={offer.lastCheckedAt} />
          <OfferLink offer={offer} className="w-full" />
        </li>
      ))}
    </ul>
  );
}

function OffersDesktopTable({ item }: { item: CatalogItem }) {
  return (
    <div className="hidden overflow-hidden rounded-xl border bg-card shadow-sm @4xl:block">
      <Table>
        <TableCaption className="sr-only">{TABLE_CAPTION}</TableCaption>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Magazin</TableHead>
            <TableHead>Preț</TableHead>
            <TableHead>Diferență</TableHead>
            <TableHead>Stoc</TableHead>
            <TableHead>Verificat</TableHead>
            <TableHead>
              <span className="sr-only">Acțiuni</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {item.offers.map((offer) => (
            <TableRow
              key={offer.productId}
              className={cn(isBestOffer(item, offer) && "bg-success/5 hover:bg-success/10")}
            >
              <TableCell>
                <StoreBadge store={offer.store} />
              </TableCell>
              <TableCell>
                <Price item={item} offer={offer} />
              </TableCell>
              <TableCell>
                <Difference item={item} offer={offer} />
              </TableCell>
              <TableCell>
                <StockBadge offer={offer} />
              </TableCell>
              <TableCell>
                <FreshnessBadge checkedAt={offer.lastCheckedAt} />
              </TableCell>
              <TableCell className="text-right">
                <OfferLink offer={offer} size="sm" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** Every store's price for this product: a table on wide screens, stacked cards on narrow ones. */
export function OffersTable({ item, className }: { item: CatalogItem; className?: string }) {
  return (
    <section aria-labelledby={TITLE_ID} className={cn("@container", className)}>
      <div className="mb-3 space-y-1">
        <h2 id={TITLE_ID} className="font-semibold text-lg">
          Prețuri în magazine
        </h2>
        <p className="text-muted-foreground text-sm">
          Ordonate de la cel mai mic preț; ofertele fără stoc sunt la final. Vezi cât de proaspăt este
          fiecare preț.
        </p>
      </div>
      <OffersCards item={item} />
      <OffersDesktopTable item={item} />
    </section>
  );
}
