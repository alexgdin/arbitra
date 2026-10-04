import { Badge } from "@my-better-t-app/ui/components/badge";
import { PiggyBank, ShieldCheck, Target } from "lucide-react";

import { PriceDelta } from "@/components/price-delta";
import { StoreBadge } from "@/components/store-badge";
import { formatBani } from "@/lib/format";

/** Example data, in bani. The preview is illustrative and not tied to a real product. */
const START_PRICE = 339_900;
const CURRENT_PRICE = 289_900;
const TARGET_PRICE = 295_000;
const HISTORY = [
  START_PRICE,
  START_PRICE,
  334_900,
  337_900,
  329_900,
  319_900,
  322_900,
  309_900,
  304_900,
  299_900,
  292_900,
  CURRENT_PRICE,
];

const SAVED = START_PRICE - CURRENT_PRICE;
const CHANGE_PCT = (SAVED / START_PRICE) * -100;

const WIDTH = 320;
const HEIGHT = 112;
const PAD = 12;
const MAX = Math.max(...HISTORY, TARGET_PRICE);
const MIN = Math.min(...HISTORY, TARGET_PRICE);

function toX(index: number): number {
  return PAD + (index / (HISTORY.length - 1)) * (WIDTH - PAD * 2);
}

function toY(price: number): number {
  return PAD + ((MAX - price) / (MAX - MIN)) * (HEIGHT - PAD * 2);
}

const POINTS = HISTORY.map((price, index) => `${toX(index).toFixed(1)},${toY(price).toFixed(1)}`);
const LINE_PATH = `M${POINTS.join(" L")}`;
const AREA_PATH = `${LINE_PATH} L${toX(HISTORY.length - 1).toFixed(1)},${HEIGHT} L${toX(0).toFixed(1)},${HEIGHT} Z`;
const TARGET_Y = toY(TARGET_PRICE);
const END_X = toX(HISTORY.length - 1);
const END_Y = toY(CURRENT_PRICE);

const DESCRIPTION = `Exemplu de produs urmărit: prețul unui laptop a scăzut de la ${formatBani(START_PRICE)} la ${formatBani(CURRENT_PRICE)}, sub ținta de ${formatBani(TARGET_PRICE)}. Economie: ${formatBani(SAVED)}.`;

export function PricePreview() {
  return (
    <div role="img" aria-label={DESCRIPTION} className="relative mx-auto w-full max-w-md">
      <div className="space-y-4 rounded-2xl border bg-card p-5 text-card-foreground shadow-lg shadow-primary/5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <StoreBadge store="emag" />
          <Badge variant="warning">
            <Target aria-hidden="true" />
            Țintă atinsă
          </Badge>
        </div>

        <div className="space-y-1">
          <p className="font-medium text-sm leading-snug">
            Laptop ASUS Vivobook 15, 16 GB RAM, 512 GB SSD
          </p>
          <p className="text-muted-foreground text-xs">Evoluția prețului în ultimele 30 de zile</p>
        </div>

        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-semibold text-3xl tabular-nums tracking-tight">
            {formatBani(CURRENT_PRICE)}
          </span>
          <span className="text-muted-foreground text-sm tabular-nums line-through">
            {formatBani(START_PRICE)}
          </span>
          <PriceDelta value={CHANGE_PCT} />
        </div>

        <div>
          <svg aria-hidden="true" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-auto w-full">
            <path d={AREA_PATH} className="fill-chart-area" />
            <line
              x1={0}
              x2={WIDTH}
              y1={TARGET_Y}
              y2={TARGET_Y}
              strokeWidth={1.5}
              strokeDasharray="5 5"
              className="stroke-warning"
            />
            <path
              d={LINE_PATH}
              fill="none"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="stroke-chart-line"
            />
            <circle
              cx={END_X}
              cy={END_Y}
              r={5}
              strokeWidth={2.5}
              className="fill-card stroke-chart-line"
            />
          </svg>
          <p className="mt-2 flex items-center gap-2 text-muted-foreground text-xs">
            <span
              aria-hidden="true"
              className="inline-block w-5 border-warning border-t-2 border-dashed"
            />
            Prețul tău țintă: <span className="tabular-nums">{formatBani(TARGET_PRICE)}</span>
          </p>
        </div>

        <div className="flex items-center gap-3 rounded-lg bg-success/10 px-3.5 py-3 text-success">
          <PiggyBank aria-hidden="true" className="size-5 shrink-0" />
          <p className="font-medium text-sm">
            Economisești <span className="tabular-nums">{formatBani(SAVED)}</span>
          </p>
        </div>
      </div>

      <div className="absolute -bottom-5 left-4 hidden items-center gap-3 rounded-xl border bg-card px-3.5 py-2.5 shadow-md sm:flex lg:-left-6">
        <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <ShieldCheck aria-hidden="true" className="size-4" />
        </span>
        <div>
          <p className="font-medium text-xs">Protecția prețului</p>
          <p className="text-muted-foreground text-xs">Activă 14 zile după cumpărare</p>
        </div>
      </div>
    </div>
  );
}
