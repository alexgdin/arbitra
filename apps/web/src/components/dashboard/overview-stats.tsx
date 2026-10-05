import { Skeleton } from "@my-better-t-app/ui/components/skeleton";
import { cn } from "@my-better-t-app/ui/lib/utils";
import { Eye, PiggyBank, ShoppingCart, Target } from "lucide-react";

import type { CartItem } from "@/components/cart/types";
import { StatCard } from "@/components/stat-card";
import { formatBani } from "@/lib/format";

import { ENTER } from "./enter-animation";
import { isTargetReached } from "./watchlist";

const GRID_CLASSES = "grid grid-cols-2 gap-3 xl:grid-cols-4";
const WIDE_CARD_CLASSES = "col-span-2 sm:col-span-1";

function summarize(items: readonly CartItem[]) {
  let reached = 0;
  let cartValue = 0;
  let savings = 0;
  for (const item of items) {
    if (isTargetReached(item)) {
      reached += 1;
    }
    if (item.currentPrice !== null) {
      cartValue += item.currentPrice * item.quantity;
      if (item.targetPrice !== null && item.currentPrice > item.targetPrice) {
        savings += (item.currentPrice - item.targetPrice) * item.quantity;
      }
    }
  }
  return { reached, cartValue, savings, currency: items[0]?.currency ?? "RON" };
}

/** The four stat cards enter one after another. */
const STAT_DELAYS = [
  undefined,
  "motion-safe:[--tw-animation-delay:75ms]",
  "motion-safe:[--tw-animation-delay:150ms]",
  "motion-safe:[--tw-animation-delay:225ms]",
] as const;

export function OverviewStats({
  items,
  loading,
}: {
  items: readonly CartItem[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div aria-hidden="true" className={GRID_CLASSES}>
        {["produse", "tinte", "valoare", "economie"].map((key, index) => (
          <Skeleton key={key} className={cn("h-27 rounded-xl", index >= 2 && WIDE_CARD_CLASSES)} />
        ))}
      </div>
    );
  }

  const { reached, cartValue, savings, currency } = summarize(items);

  return (
    <div className={GRID_CLASSES}>
      <StatCard
        label="Produse urmărite"
        value={items.length}
        hint="în lista ta"
        icon={<Eye />}
        className={ENTER}
      />
      <StatCard
        label="Ținte atinse"
        value={reached}
        hint="gata de cumpărat"
        icon={<Target />}
        tone="success"
        className={cn(ENTER, STAT_DELAYS[1])}
      />
      <StatCard
        label="Valoarea coșului"
        value={formatBani(cartValue, currency)}
        hint="la prețurile de azi"
        icon={<ShoppingCart />}
        className={cn(WIDE_CARD_CLASSES, ENTER, STAT_DELAYS[2])}
      />
      <StatCard
        label="Economie până la țintă"
        value={formatBani(savings, currency)}
        hint="dacă toate ating ținta"
        icon={<PiggyBank />}
        tone="warning"
        className={cn(WIDE_CARD_CLASSES, ENTER, STAT_DELAYS[3])}
      />
    </div>
  );
}
