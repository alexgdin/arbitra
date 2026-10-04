import { cn } from "@my-better-t-app/ui/lib/utils";

import {
  changePercent,
  describeChange,
  getTrend,
  linePath,
  scaleLinear,
  toSeries,
} from "./chart-math";
import type { PricePoint, Trend } from "./chart-math";

const WIDTH = 96;
const HEIGHT = 32;
const PADDING = 4;
const END_DOT_RADIUS = 3;

const TREND_CLASSES: Record<Trend, { line: string; dot: string }> = {
  down: { line: "stroke-success", dot: "fill-success" },
  up: { line: "stroke-destructive", dot: "fill-destructive" },
  flat: { line: "stroke-muted-foreground", dot: "fill-muted-foreground" },
};

/** Axis-free price trend: green when the price fell, red when it rose. */
export function Sparkline({
  points,
  className,
}: {
  points: readonly PricePoint[];
  className?: string;
}) {
  const series = toSeries(points);
  const [first] = series;
  const last = series.at(-1);
  const sizeClass = cn("h-8 w-24 shrink-0", className);

  if (!first || !last || series.length < 2) {
    return (
      <svg
        role="img"
        aria-label="Nu există suficient istoric pentru grafic"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className={sizeClass}
      >
        <line
          x1={PADDING}
          x2={WIDTH - PADDING}
          y1={HEIGHT / 2}
          y2={HEIGHT / 2}
          strokeWidth={2}
          strokeLinecap="round"
          strokeDasharray="2 5"
          className="stroke-muted-foreground/60"
        />
      </svg>
    );
  }

  const prices = series.map((point) => point.price);
  const x = scaleLinear(first.time, last.time, PADDING, WIDTH - PADDING);
  const y = scaleLinear(Math.min(...prices), Math.max(...prices), HEIGHT - PADDING, PADDING);
  const xs = series.map((point) => x(point.time));
  const ys = series.map((point) => y(point.price));
  const pct = changePercent(first.price, last.price);
  const classes = TREND_CLASSES[getTrend(pct)];

  return (
    <svg
      role="img"
      aria-label={`Evoluția prețului: ${describeChange(pct)}`}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className={sizeClass}
    >
      <path
        d={linePath(xs, ys)}
        fill="none"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={classes.line}
      />
      <circle
        cx={xs.at(-1)}
        cy={ys.at(-1)}
        r={END_DOT_RADIUS}
        strokeWidth={1.5}
        className={cn("stroke-card", classes.dot)}
      />
    </svg>
  );
}
