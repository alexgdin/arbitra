"use client";

import { cn } from "@my-better-t-app/ui/lib/utils";
import { ChartLine } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { PriceDelta } from "@/components/price-delta";
import { formatBani, formatDate } from "@/lib/format";

import {
  buildLayout,
  changePercent,
  describePoint,
  describeSeries,
  linePath,
  nearestIndex,
  toSeries,
} from "./chart-math";
import type { Layout, PricePoint, SeriesPoint, Size } from "./chart-math";

const LABEL_CHAR_PX = 6.2;
const MARKER_RADIUS = 4;
const TOOLTIP_WIDTH = 176;

/** Area and markers appear once the line has (mostly) drawn itself; only on mount. */
const FADE_IN_CLASS =
  "motion-safe:animate-[arbitra-fade_600ms_ease-out_700ms_backwards]";

export interface PriceChartProps {
  points: readonly PricePoint[];
  targetPrice?: number | null;
  currency?: string;
  className?: string;
}

function useElementSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) {
        return;
      }
      const { width, height } = entry.contentRect;
      setSize((previous) =>
        previous.width === width && previous.height === height ? previous : { width, height },
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, size] as const;
}

function ChartTooltip({
  series,
  index,
  layout,
  size,
  currency,
}: {
  series: readonly SeriesPoint[];
  index: number;
  layout: Layout;
  size: Size;
  currency: string;
}) {
  const point = series[index];
  const previous = series[index - 1];
  const x = layout.xs[index];
  const y = layout.ys[index];
  if (!point || x === undefined || y === undefined) {
    return null;
  }
  const left = Math.max(4, Math.min(x - TOOLTIP_WIDTH / 2, size.width - TOOLTIP_WIDTH - 4));
  const placement = y > 120 ? { bottom: size.height - y + 14 } : { top: y + 14 };
  const difference = previous ? point.price - previous.price : 0;

  return (
    <div
      className="pointer-events-none absolute z-10 rounded-lg border bg-popover px-3 py-2 text-popover-foreground shadow-md"
      style={{ width: TOOLTIP_WIDTH, left, ...placement }}
    >
      <p className="text-muted-foreground text-xs">{formatDate(new Date(point.time))}</p>
      <p className="mt-1 flex items-center gap-2">
        <span aria-hidden="true" className="h-0.5 w-3 shrink-0 rounded-full bg-chart-line" />
        <span className="font-semibold text-sm tabular-nums">
          {formatBani(point.price, currency)}
        </span>
      </p>
      <p className="mt-1.5 flex items-center justify-between gap-2 border-t pt-1.5 text-xs">
        {previous ? (
          <>
            <PriceDelta value={changePercent(previous.price, point.price)} className="text-xs" />
            <span className="text-muted-foreground tabular-nums">
              {difference > 0 ? "+" : ""}
              {formatBani(difference, currency)}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">Primul preț înregistrat</span>
        )}
      </p>
    </div>
  );
}

function ChartLabel({
  label,
  cx,
  cy,
  above,
  plot,
}: {
  label: string;
  cx: number;
  cy: number;
  above: boolean;
  plot: Layout["plot"];
}) {
  const half = (label.length * LABEL_CHAR_PX) / 2;
  const x = Math.min(Math.max(cx, plot.left + half), plot.right - half);

  return (
    <text
      x={x}
      y={above ? cy - 10 : cy + 18}
      textAnchor="middle"
      paintOrder="stroke"
      strokeWidth={3}
      strokeLinejoin="round"
      className="fill-foreground stroke-card font-medium text-[11px] tabular-nums"
    >
      {label}
    </text>
  );
}

function ChartSvg({
  series,
  layout,
  size,
  activeIndex,
  targetPrice,
  currency,
}: {
  series: readonly SeriesPoint[];
  layout: Layout;
  size: Size;
  activeIndex: number | null;
  targetPrice: number | null;
  currency: string;
}) {
  const { plot, xs, ys, yTicks, xTicks, targetY, extremes } = layout;
  const lastIndex = series.length - 1;
  const prices = series.map((point) => point.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const hoverIndex = activeIndex ?? lastIndex;
  const hoverX = xs[hoverIndex] ?? 0;
  const hoverY = ys[hoverIndex] ?? 0;
  const line = linePath(xs, ys);
  // A flat or single-point series has no extremes to mark, so the only price is labelled instead.
  const markers =
    series.length > 1 && maxPrice > minPrice
      ? [
          { index: extremes.max, label: `Max ${formatBani(maxPrice, currency)}`, above: true },
          { index: extremes.min, label: `Min ${formatBani(minPrice, currency)}`, above: false },
        ]
      : [{ index: lastIndex, label: formatBani(maxPrice, currency), above: true }];
  const targetLabel = targetPrice === null ? "" : `Țintă ${formatBani(targetPrice, currency)}`;
  const chipWidth = Math.ceil(targetLabel.length * LABEL_CHAR_PX) + 16;
  const chipY = (targetY ?? 0) + (targetPrice !== null && targetPrice <= minPrice ? 4 : -22);

  return (
    <svg
      aria-hidden="true"
      width={size.width}
      height={size.height}
      viewBox={`0 0 ${size.width} ${size.height}`}
      className="block"
    >
      {yTicks.map(({ y, label }) => (
        <g key={label}>
          <line
            x1={plot.left}
            x2={plot.right}
            y1={y}
            y2={y}
            strokeWidth={1}
            shapeRendering="crispEdges"
            className="stroke-border"
          />
          <text
            x={plot.left - 8}
            y={y}
            dy="0.32em"
            textAnchor="end"
            className="fill-muted-foreground text-[11px] tabular-nums"
          >
            {label}
          </text>
        </g>
      ))}
      <line
        x1={plot.left}
        x2={plot.right}
        y1={plot.bottom}
        y2={plot.bottom}
        strokeWidth={1}
        shapeRendering="crispEdges"
        className="stroke-border"
      />
      {xTicks.map(({ x, label, anchor }) => (
        <text
          key={label}
          x={x}
          y={plot.bottom + 18}
          textAnchor={anchor}
          className="fill-muted-foreground text-[11px]"
        >
          {label}
        </text>
      ))}

      {targetY !== null ? (
        <g>
          <line
            x1={plot.left}
            x2={plot.right}
            y1={targetY}
            y2={targetY}
            strokeWidth={2}
            strokeDasharray="6 4"
            className="stroke-chart-3"
          />
          <rect
            x={plot.right - chipWidth}
            y={chipY}
            width={chipWidth}
            height={18}
            rx={9}
            strokeWidth={1}
            className="fill-card stroke-chart-3"
          />
          <text
            x={plot.right - chipWidth / 2}
            y={chipY + 9}
            dy="0.32em"
            textAnchor="middle"
            className="fill-warning-foreground font-medium text-[11px] tabular-nums"
          >
            {targetLabel}
          </text>
        </g>
      ) : null}

      {series.length > 1 ? (
        <>
          <path
            d={`${line} L${(xs[lastIndex] ?? 0).toFixed(1)} ${plot.bottom} L${(xs[0] ?? 0).toFixed(1)} ${plot.bottom} Z`}
            className={cn("fill-chart-area", FADE_IN_CLASS)}
          />
          {/* pathLength normalises the dash so the draw-in works for any line length */}
          <path
            d={line}
            fill="none"
            pathLength={1}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="stroke-chart-line motion-safe:animate-[arbitra-draw_1100ms_cubic-bezier(0.65,0,0.35,1)]"
          />
        </>
      ) : null}

      {markers.map(({ index, label, above }) => (
        <g key={label} className={FADE_IN_CLASS}>
          <circle
            cx={xs[index]}
            cy={ys[index]}
            r={MARKER_RADIUS}
            strokeWidth={2}
            className="fill-chart-line stroke-card"
          />
          <ChartLabel
            label={label}
            cx={xs[index] ?? 0}
            cy={ys[index] ?? 0}
            above={above}
            plot={plot}
          />
        </g>
      ))}

      <circle
        cx={xs[lastIndex]}
        cy={ys[lastIndex]}
        r={MARKER_RADIUS}
        strokeWidth={2}
        className={cn("fill-chart-line stroke-card", FADE_IN_CLASS)}
      />

      <g
        className={cn(
          "transition-opacity duration-150 motion-reduce:transition-none",
          activeIndex === null ? "opacity-0" : "opacity-100",
        )}
      >
        <line
          x1={hoverX}
          x2={hoverX}
          y1={plot.top}
          y2={plot.bottom}
          strokeWidth={1}
          className="stroke-muted-foreground/60"
        />
        <circle
          cx={hoverX}
          cy={hoverY}
          r={MARKER_RADIUS}
          strokeWidth={2}
          className="fill-chart-line stroke-card"
        />
      </g>
    </svg>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 text-center">
      <ChartLine aria-hidden="true" className="size-6 text-muted-foreground" />
      <p className="font-medium text-sm">Încă nu avem istoric de preț</p>
      <p className="max-w-xs text-muted-foreground text-xs">
        Graficul apare după ce prețul produsului este înregistrat în perioada aleasă.
      </p>
    </div>
  );
}

/**
 * Hand-built SVG price chart. The line is made of straight segments between the recorded prices,
 * so it never shows a price that was not seen. Hover, touch and the arrow keys move a crosshair.
 */
export function PriceChart({
  points,
  targetPrice = null,
  currency = "RON",
  className,
}: PriceChartProps) {
  const [containerRef, size] = useElementSize();
  const [active, setActive] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const series = toSeries(points);
  const count = series.length;
  const layout =
    count > 0 && size.width > 0 && size.height > 0
      ? buildLayout(series, size, targetPrice, currency)
      : null;
  const activeIndex = active !== null && active < count ? active : null;
  const targetOutOfRange = layout !== null && layout.targetY === null;

  function selectIndex(index: number | null) {
    setActive(index);
    setAnnouncement(index === null ? "" : describePoint(series, index, currency));
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!layout) {
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    setActive(nearestIndex(layout.xs, event.clientX - bounds.left));
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const current = activeIndex ?? count - 1;
    let next: number | null;
    switch (event.key) {
      case "ArrowLeft":
        next = Math.max(0, current - 1);
        break;
      case "ArrowRight":
        next = Math.min(count - 1, current + 1);
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = count - 1;
        break;
      case "Escape":
        next = null;
        break;
      default:
        return;
    }
    event.preventDefault();
    selectIndex(next);
  }

  return (
    <figure className={cn("w-full", className)}>
      <div
        ref={containerRef}
        role="img"
        aria-label={describeSeries(series, currency)}
        tabIndex={count > 0 ? 0 : undefined}
        className="relative h-56 w-full touch-pan-y select-none rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-72"
        onPointerMove={handlePointerMove}
        onPointerLeave={(event) => {
          if (event.pointerType !== "touch") {
            setActive(null);
          }
        }}
        onKeyDown={handleKeyDown}
        onFocus={(event) => {
          if (count > 0 && event.currentTarget.matches(":focus-visible")) {
            setActive(count - 1);
          }
        }}
        onBlur={() => selectIndex(null)}
      >
        {count === 0 ? <EmptyChart /> : null}
        {layout ? (
          <>
            <ChartSvg
              series={series}
              layout={layout}
              size={size}
              activeIndex={activeIndex}
              targetPrice={targetPrice}
              currency={currency}
            />
            {activeIndex === null ? null : (
              <ChartTooltip
                series={series}
                index={activeIndex}
                layout={layout}
                size={size}
                currency={currency}
              />
            )}
          </>
        ) : null}
      </div>

      {count > 0 && (targetPrice !== null || count === 1) ? (
        <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground text-xs">
          {targetPrice === null ? null : (
            <span className="inline-flex items-center gap-1.5">
              <svg aria-hidden="true" width={20} height={4} viewBox="0 0 20 4">
                <line
                  x1={0}
                  x2={20}
                  y1={2}
                  y2={2}
                  strokeWidth={2}
                  strokeDasharray="5 3"
                  className="stroke-chart-3"
                />
              </svg>
              Țintă {formatBani(targetPrice, currency)}
              {targetOutOfRange ? " (în afara intervalului afișat)" : null}
            </span>
          )}
          {count === 1 ? (
            <span>Avem un singur preț înregistrat; graficul se completează când prețul se schimbă.</span>
          ) : null}
        </figcaption>
      ) : null}

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <table className="sr-only">
        <caption>Istoricul prețului</caption>
        <thead>
          <tr>
            <th scope="col">Data</th>
            <th scope="col">Preț</th>
          </tr>
        </thead>
        <tbody>
          {series.map((point) => (
            <tr key={`${point.time}-${point.price}`}>
              <td>{formatDate(new Date(point.time))}</td>
              <td>{formatBani(point.price, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
