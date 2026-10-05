import { cn } from "@my-better-t-app/ui/lib/utils";

import { ENTER, ENTER_DELAY } from "@/components/dashboard/enter-animation";

import { HowItWorks } from "./how-it-works";
import { TargetsTable } from "./targets-table";

/** The price alerts page: products with a target price, plus a short note on how alerts work. */
export function PriceAlerts() {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <TargetsTable className={cn("min-w-0", ENTER)} />
      <HowItWorks className={cn(ENTER, ENTER_DELAY.short)} />
    </div>
  );
}
