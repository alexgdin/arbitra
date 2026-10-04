import { Badge } from "@my-better-t-app/ui/components/badge";
import { CircleCheck, ExternalLink } from "lucide-react";

import { StoreBadge } from "@/components/store-badge";
import { formatBani } from "@/lib/format";
import { getSafeHref } from "@/lib/safe-href";

import type { BrokerTarget } from "./types";

export function TargetTitle({ target }: { target: BrokerTarget }) {
  const href = getSafeHref(target.url);

  return (
    <div className="min-w-0 space-y-1.5">
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex max-w-full items-start gap-1 rounded-sm font-medium text-sm leading-snug outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="line-clamp-2 break-words">{target.title}</span>
          <ExternalLink
            aria-hidden="true"
            className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
          />
          <span className="sr-only">(se deschide într-o filă nouă)</span>
        </a>
      ) : (
        <span className="line-clamp-2 break-words font-medium text-sm leading-snug">
          {target.title}
        </span>
      )}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <StoreBadge store={target.store} />
        {target.quantity > 1 ? (
          <span className="text-muted-foreground text-xs tabular-nums">
            × {target.quantity} buc.
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function CurrentPrice({ target }: { target: BrokerTarget }) {
  if (target.currentPrice === null) {
    return (
      <span className="text-muted-foreground">
        <span aria-hidden="true">—</span>
        <span className="sr-only">Preț indisponibil</span>
      </span>
    );
  }
  return (
    <span className="font-semibold tabular-nums">
      {formatBani(target.currentPrice, target.currency)}
    </span>
  );
}

/** Target price with a "Țintă atinsă" badge, or how far the current price still is from it. */
export function TargetPrice({ target }: { target: BrokerTarget }) {
  return (
    <div className="space-y-1">
      <span className="font-semibold tabular-nums">
        {formatBani(target.targetPrice, target.currency)}
      </span>
      {target.targetReached ? (
        <div>
          <Badge variant="success">
            <CircleCheck aria-hidden="true" />
            Țintă atinsă
          </Badge>
        </div>
      ) : null}
      {!target.targetReached && target.currentPrice !== null ? (
        <p className="font-normal text-muted-foreground text-xs tabular-nums">
          {formatBani(target.currentPrice - target.targetPrice, target.currency)} peste țintă
        </p>
      ) : null}
    </div>
  );
}
