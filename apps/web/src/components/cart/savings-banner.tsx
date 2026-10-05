import { cn } from "@my-better-t-app/ui/lib/utils";
import { CircleCheck, PiggyBank } from "lucide-react";

import { CountUp } from "@/components/motion/count-up";
import { formatBani } from "@/lib/format";
import { getStore } from "@/lib/stores";

import type { CartOptimization } from "./types";

type Totals = CartOptimization["totals"];

function Money({ bani, currency }: { bani: number; currency: string }) {
  return <span className="whitespace-nowrap tabular-nums">{formatBani(bani, currency)}</span>;
}

function describeSavings(totals: Totals, currency: string) {
  // Economiile nu pot fi negative, orice ar întoarce serverul.
  const vsSingleStore = Math.max(0, totals.savingsVsSingleStore);
  const vsNaive = Math.max(0, totals.savingsVsNaive);

  let detail: string;
  if (vsNaive > 0) {
    const lead = vsSingleStore > 0 ? "Și cu" : "Cu";
    detail = `${lead} ${formatBani(vsNaive, currency)} mai puțin decât dacă alegi doar cel mai mic preț la fiecare produs, fără să ții cont de transport.`;
  } else if (vsSingleStore > 0) {
    detail = "Nici alegerea celui mai mic preț la fiecare produs nu iese mai ieftin.";
  } else if (totals.bestSingleStore === null) {
    detail = "Niciun magazin nu are tot coșul, așa că produsele sunt împărțite între magazine.";
  } else {
    detail = "Nu poți plăti mai puțin pentru acest coș.";
  }

  const headline =
    vsSingleStore > 0 ? (
      <>
        Economisești{" "}
        <CountUp
          value={vsSingleStore}
          currency={currency}
          className="whitespace-nowrap tabular-nums"
        />{" "}
        față de cumpărarea dintr-un singur magazin
      </>
    ) : (
      "Împărțirea actuală e deja cea mai ieftină"
    );

  return { headline, detail, celebrate: vsSingleStore > 0 || vsNaive > 0 };
}

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="font-semibold">{children}</dd>
    </div>
  );
}

export function SavingsBanner({ totals, currency }: { totals: Totals; currency: string }) {
  const { headline, detail, celebrate } = describeSavings(totals, currency);
  const Icon = celebrate ? PiggyBank : CircleCheck;

  return (
    <div
      className={cn(
        "space-y-4 rounded-xl border p-5 shadow-sm",
        celebrate ? "border-success/25 bg-success/10 dark:bg-success/12" : "bg-card",
      )}
    >
      <div className="flex items-start gap-3">
        <div
          aria-hidden="true"
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-lg",
            celebrate ? "bg-success text-success-foreground" : "bg-accent text-accent-foreground",
          )}
        >
          <Icon className="size-5" />
        </div>
        <div className="min-w-0 space-y-1">
          <h3 className="text-pretty font-semibold text-lg leading-snug sm:text-xl">{headline}</h3>
          <p className="text-muted-foreground">{detail}</p>
        </div>
      </div>
      <dl className="flex flex-wrap gap-x-8 gap-y-3 border-t pt-4">
        <Figure label="Total de plată, cu transport">
          <Money bani={totals.optimized} currency={currency} />
        </Figure>
        <Figure label="Dintr-un singur magazin">
          {totals.bestSingleStore ? (
            <>
              <Money bani={totals.bestSingleStore.total} currency={currency} />
              <span className="font-normal text-muted-foreground">
                {" "}
                · {getStore(totals.bestSingleStore.store).name}
              </span>
            </>
          ) : (
            <span className="font-normal text-muted-foreground">indisponibil</span>
          )}
        </Figure>
        <Figure label="Cel mai mic preț la fiecare produs">
          <Money bani={totals.naiveCheapest} currency={currency} />
        </Figure>
      </dl>
    </div>
  );
}
