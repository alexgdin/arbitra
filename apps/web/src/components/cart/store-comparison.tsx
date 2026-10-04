import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@my-better-t-app/ui/components/card";
import { cn } from "@my-better-t-app/ui/lib/utils";
import { BadgeCheck } from "lucide-react";

import { formatBani } from "@/lib/format";
import { getStore } from "@/lib/stores";

import { formatCount } from "./plural";
import type { CartOptimization } from "./types";

const MIN_BAR_PERCENT = 4;

interface ComparisonRow {
  key: string;
  label: string;
  color: string;
  total: number | null;
  note: string | null;
  highlighted: boolean;
}

function buildRows(optimization: CartOptimization): ComparisonRow[] {
  const { plan, singleStoreOptions, totals } = optimization;

  const optimized: ComparisonRow = {
    key: "optimized",
    label: "Plan optimizat",
    color: "var(--primary)",
    total: totals.optimized,
    note: `${formatCount(plan.length, "magazin", "magazine")}, transport inclus`,
    highlighted: true,
  };

  const single = singleStoreOptions.map((option): ComparisonRow => {
    const store = getStore(option.store);
    let note: string | null = null;
    if (option.total === null) {
      note = `Îi lipsesc ${formatCount(option.missing, "produs", "produse")} din coș`;
    } else if (totals.bestSingleStore?.store === option.store) {
      note = "Cea mai bună variantă cu un singur magazin";
    }
    return {
      key: option.store,
      label: store.name,
      color: store.colorVar,
      total: option.total,
      note,
      highlighted: false,
    };
  });

  return [optimized, ...single];
}

function ComparisonBar({ row, maxTotal }: { row: ComparisonRow; maxTotal: number }) {
  if (row.total === null) {
    return <div aria-hidden="true" className="h-2.5 rounded-full border border-dashed" />;
  }
  const percent = Math.max(MIN_BAR_PERCENT, (row.total / maxTotal) * 100);
  return (
    <div aria-hidden="true" className="h-2.5 overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full"
        style={{ width: `${percent}%`, backgroundColor: row.color }}
      />
    </div>
  );
}

export function StoreComparison({ optimization }: { optimization: CartOptimization }) {
  const rows = buildRows(optimization);
  const maxTotal = Math.max(...rows.map((row) => row.total ?? 0), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Magazine</CardTitle>
        <CardDescription>
          Cât ai plăti dacă ai lua tot coșul dintr-un singur magazin, cu transport cu tot.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.key}
              className={cn(
                "space-y-2 rounded-lg p-3",
                row.highlighted && "bg-accent ring-1 ring-primary/30",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  {row.highlighted ? (
                    <BadgeCheck aria-hidden="true" className="size-4 shrink-0 text-primary" />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: row.color }}
                    />
                  )}
                  <span className="truncate font-medium">{row.label}</span>
                </div>
                {row.total === null ? (
                  <span className="shrink-0 text-muted-foreground text-xs">
                    indisponibil complet
                  </span>
                ) : (
                  <span className="shrink-0 font-semibold tabular-nums">
                    {formatBani(row.total, optimization.currency)}
                  </span>
                )}
              </div>
              <ComparisonBar row={row} maxTotal={maxTotal} />
              {row.note ? <p className="text-muted-foreground text-xs">{row.note}</p> : null}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
