import { cn } from "@my-better-t-app/ui/lib/utils";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { formatCount } from "@/components/cart/plural";
import { FreshnessBadge } from "@/components/freshness-badge";

import type { CatalogItem } from "./types";

export function BackToSearch() {
  return (
    <Link
      href="/cauta"
      className="-ml-2 inline-flex h-10 items-center gap-1.5 rounded-lg px-2 font-medium text-muted-foreground text-sm outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ArrowLeft aria-hidden="true" className="size-4" />
      Înapoi la căutare
    </Link>
  );
}

/** Title, EAN and how fresh the prices are. */
export function ProductHeader({ item, className }: { item: CatalogItem; className?: string }) {
  const storeCount = new Set(item.offers.map((offer) => offer.store)).size;

  return (
    <div className={cn("min-w-0 space-y-3", className)}>
      <h1 className="text-balance break-words font-semibold text-2xl leading-tight tracking-tight sm:text-3xl">
        {item.title}
      </h1>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {item.ean ? (
          <p className="text-muted-foreground text-sm tabular-nums">EAN {item.ean}</p>
        ) : null}
        {item.lastCheckedAt ? <FreshnessBadge checkedAt={item.lastCheckedAt} /> : null}
      </div>
      <p className="text-muted-foreground text-sm">
        Găsit în {formatCount(storeCount, "magazin", "magazine")}.
      </p>
    </div>
  );
}
