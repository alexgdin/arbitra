import { cn } from "@my-better-t-app/ui/lib/utils";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import { formatPercent } from "@/lib/format";

type Direction = "up" | "down" | "flat";

const ICONS = { up: ArrowUpRight, down: ArrowDownRight, flat: Minus } as const;

function getDirection(value: number): Direction {
  if (Math.abs(value) < 0.05) {
    return "flat";
  }
  return value < 0 ? "down" : "up";
}

function getToneClass(direction: Direction, invert: boolean): string {
  if (direction === "flat") {
    return "text-muted-foreground";
  }
  const good = (direction === "down") !== invert;
  return good ? "text-success" : "text-destructive";
}

function describe(direction: Direction, value: number): string {
  if (direction === "flat") {
    return "fără modificare de preț";
  }
  const label = direction === "down" ? "scădere" : "creștere";
  return `${label} de ${formatPercent(Math.abs(value))}`;
}

/**
 * Percent change of a price. A falling price is good (success color) and a rising price is
 * bad (destructive); `invert` swaps that for values where an increase is the good outcome.
 */
export function PriceDelta({
  value,
  invert = false,
  className,
}: {
  value: number;
  invert?: boolean;
  className?: string;
}) {
  const direction = getDirection(value);
  const Icon = ICONS[direction];
  const visible = direction === "flat" ? formatPercent(0) : formatPercent(value, { signed: true });

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 font-medium text-sm tabular-nums",
        getToneClass(direction, invert),
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      <span aria-hidden="true">{visible}</span>
      <span className="sr-only">{describe(direction, value)}</span>
    </span>
  );
}
