import { formatBani, formatDate, formatPercent } from "@/lib/format";

export interface PricePoint {
  price: number;
  recordedAt: string;
}

export interface SeriesPoint {
  price: number;
  time: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface XTick {
  x: number;
  label: string;
  anchor: "start" | "middle" | "end";
}

/** Pixel positions of everything the chart draws, derived from the data and the box size. */
export interface Layout {
  plot: { left: number; right: number; top: number; bottom: number };
  xs: number[];
  ys: number[];
  yTicks: { y: number; label: string }[];
  xTicks: XTick[];
  targetY: number | null;
  extremes: { min: number; max: number };
}

export type Trend = "down" | "up" | "flat";

const MARGIN = { top: 24, right: 12, bottom: 28 } as const;
/** Rough width of one digit of the 11px tick labels; used to size the y-axis gutter. */
const Y_LABEL_CHAR_PX = 6.6;
const X_TICK_SPACING_PX = 120;

/** A change smaller than this many percent is shown as "unchanged". */
const FLAT_THRESHOLD_PCT = 0.05;
/** How far from the data a target may sit and still stretch the chart to show it. */
const TARGET_NEAR_RATIO = 0.1;
const DOMAIN_PADDING_RATIO = 0.14;
const MIN_FLAT_PADDING_BANI = 100;

export function toSeries(points: readonly PricePoint[]): SeriesPoint[] {
  return points
    .map((point) => ({ price: point.price, time: new Date(point.recordedAt).getTime() }))
    .filter((point) => Number.isFinite(point.price) && Number.isFinite(point.time))
    .sort((a, b) => a.time - b.time);
}

export function changePercent(from: number, to: number): number {
  return from === 0 ? 0 : ((to - from) / from) * 100;
}

export function getTrend(pct: number): Trend {
  if (Math.abs(pct) < FLAT_THRESHOLD_PCT) {
    return "flat";
  }
  return pct < 0 ? "down" : "up";
}

/** "scădere de 3,2 %", "creștere de 1 %" or "fără modificare". */
export function describeChange(pct: number): string {
  const trend = getTrend(pct);
  if (trend === "flat") {
    return "fără modificare";
  }
  return `${trend === "down" ? "scădere" : "creștere"} de ${formatPercent(Math.abs(pct))}`;
}

export function scaleLinear(
  domainStart: number,
  domainEnd: number,
  rangeStart: number,
  rangeEnd: number,
): (value: number) => number {
  if (domainEnd === domainStart) {
    const middle = (rangeStart + rangeEnd) / 2;
    return () => middle;
  }
  const ratio = (rangeEnd - rangeStart) / (domainEnd - domainStart);
  return (value) => rangeStart + (value - domainStart) * ratio;
}

/**
 * Vertical domain in bani: the data range with breathing room, stretched to include the target
 * when it is within or near the data (a far-away target would flatten the line, so it is left out).
 */
function getYDomain(
  prices: readonly number[],
  targetPrice: number | null,
): [number, number] {
  let min = Math.min(...prices);
  let max = Math.max(...prices);
  const near = Math.max(max - min, max * TARGET_NEAR_RATIO);
  if (targetPrice !== null && targetPrice >= min - near && targetPrice <= max + near) {
    min = Math.min(min, targetPrice);
    max = Math.max(max, targetPrice);
  }
  const range = max - min;
  const padding =
    range === 0 ? Math.max(max * 0.05, MIN_FLAT_PADDING_BANI) : range * DOMAIN_PADDING_RATIO;
  return [Math.max(0, min - padding), max + padding];
}

function niceStep(rawStep: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  let factor = 10;
  if (normalized <= 1) {
    factor = 1;
  } else if (normalized <= 2) {
    factor = 2;
  } else if (normalized <= 5) {
    factor = 5;
  }
  return Math.max(1, factor * magnitude);
}

/** Round tick values (in bani) inside [min, max]; aims for `target` ticks, never fewer than two. */
function niceTicks(min: number, max: number, target: number): number[] {
  if (!(max > min)) {
    return [min];
  }
  let ticks: number[] = [];
  for (const attempt of [target, target * 2, target * 4]) {
    const step = niceStep((max - min) / attempt);
    ticks = [];
    for (let value = Math.ceil(min / step) * step; value <= max; value += step) {
      ticks.push(value);
    }
    if (ticks.length >= 3) {
      break;
    }
  }
  return ticks;
}

/** Index of the position in `xs` (ascending) closest to `x`. */
export function nearestIndex(xs: readonly number[], x: number): number {
  let low = 0;
  let high = xs.length - 1;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if ((xs[middle] ?? 0) <= x) {
      low = middle;
    } else {
      high = middle;
    }
  }
  return Math.abs((xs[low] ?? 0) - x) <= Math.abs((xs[high] ?? 0) - x) ? low : high;
}

/** Positions of the lowest and highest price; on ties the most recent point wins. */
function extremeIndexes(prices: readonly number[]): { min: number; max: number } {
  let min = 0;
  let max = 0;
  for (const [index, price] of prices.entries()) {
    if (price <= (prices[min] ?? price)) {
      min = index;
    }
    if (price >= (prices[max] ?? price)) {
      max = index;
    }
  }
  return { min, max };
}

/** SVG path of straight segments through the points; the line never overshoots the data. */
export function linePath(xs: readonly number[], ys: readonly number[]): string {
  return xs
    .map((x, index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${(ys[index] ?? 0).toFixed(1)}`)
    .join(" ");
}

function buildXTicks(firstTime: number, lastTime: number, left: number, right: number): XTick[] {
  const width = right - left;
  const count =
    lastTime === firstTime ? 1 : Math.max(2, Math.min(5, Math.floor(width / X_TICK_SPACING_PX)));
  const ticks: XTick[] = [];
  for (let index = 0; index < count; index += 1) {
    const ratio = count === 1 ? 0.5 : index / (count - 1);
    const label = formatDate(new Date(firstTime + (lastTime - firstTime) * ratio));
    if (ticks.at(-1)?.label !== label) {
      let anchor: XTick["anchor"] = "middle";
      if (count > 1 && index === 0) {
        anchor = "start";
      } else if (count > 1 && index === count - 1) {
        anchor = "end";
      }
      ticks.push({ x: left + width * ratio, label, anchor });
    }
  }
  return ticks;
}

export function buildLayout(
  series: readonly SeriesPoint[],
  { width, height }: Size,
  targetPrice: number | null,
  currency: string,
): Layout {
  const prices = series.map((point) => point.price);
  const [domainMin, domainMax] = getYDomain(prices, targetPrice);
  const tickValues = niceTicks(domainMin, domainMax, height < 240 ? 3 : 4);
  const tickLabels = tickValues.map((value) => formatBani(value, currency));
  const labelChars = Math.max(1, ...tickLabels.map((label) => label.length));
  const plot = {
    left: Math.ceil(labelChars * Y_LABEL_CHAR_PX) + 14,
    right: width - MARGIN.right,
    top: MARGIN.top,
    bottom: height - MARGIN.bottom,
  };
  const y = scaleLinear(domainMin, domainMax, plot.bottom, plot.top);
  const firstTime = series[0]?.time ?? 0;
  const lastTime = series.at(-1)?.time ?? 0;
  const x = scaleLinear(firstTime, lastTime, plot.left, plot.right);
  const targetInRange =
    targetPrice !== null && targetPrice >= domainMin && targetPrice <= domainMax;

  return {
    plot,
    xs: series.map((point) => x(point.time)),
    ys: prices.map(y),
    yTicks: tickValues.map((value, index) => ({ y: y(value), label: tickLabels[index] ?? "" })),
    xTicks: buildXTicks(firstTime, lastTime, plot.left, plot.right),
    targetY: targetInRange ? y(targetPrice) : null,
    extremes: extremeIndexes(prices),
  };
}

/** Screen-reader sentence for one point, e.g. "4 oct. 2026: 129,99 RON, scădere de 3 %...". */
export function describePoint(
  series: readonly SeriesPoint[],
  index: number,
  currency: string,
): string {
  const point = series[index];
  const previous = series[index - 1];
  if (!point) {
    return "";
  }
  const base = `${formatDate(new Date(point.time))}: ${formatBani(point.price, currency)}`;
  if (!previous) {
    return `${base}, primul preț înregistrat`;
  }
  const change = describeChange(changePercent(previous.price, point.price));
  return `${base}, ${change} față de punctul anterior`;
}

/** Screen-reader summary of the whole chart. */
export function describeSeries(series: readonly SeriesPoint[], currency: string): string {
  const [first] = series;
  const last = series.at(-1);
  if (!first || !last) {
    return "Grafic de preț fără date pentru perioada aleasă.";
  }
  if (series.length === 1) {
    return `Grafic de preț cu un singur punct: ${formatBani(last.price, currency)} la ${formatDate(new Date(last.time))}.`;
  }
  const prices = series.map((point) => point.price);
  const period = `${formatDate(new Date(first.time))} - ${formatDate(new Date(last.time))}`;
  const change = describeChange(changePercent(first.price, last.price));
  const range = `de la ${formatBani(first.price, currency)} la ${formatBani(last.price, currency)}`;
  const extremes = `minim ${formatBani(Math.min(...prices), currency)}, maxim ${formatBani(Math.max(...prices), currency)}`;
  return `Grafic de preț pentru ${period}: ${change}, ${range}; ${extremes}. Folosește săgețile stânga și dreapta pentru a parcurge punctele.`;
}
