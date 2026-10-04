const LOCALE = "ro-RO";
const TIME_ZONE = "Europe/Bucharest";
const EMPTY = "—";
/** Largest amount the database can store (int4), in bani. */
const MAX_BANI = 2_147_483_647;

const currencyFormatters = new Map<string, Intl.NumberFormat>();

function getCurrencyFormatter(currency: string): Intl.NumberFormat {
  const cached = currencyFormatters.get(currency);
  if (cached) {
    return cached;
  }
  const formatter = new Intl.NumberFormat(LOCALE, { style: "currency", currency });
  currencyFormatters.set(currency, formatter);
  return formatter;
}

const percentFormatter = new Intl.NumberFormat(LOCALE, {
  style: "percent",
  maximumFractionDigits: 1,
  signDisplay: "negative",
});

const signedPercentFormatter = new Intl.NumberFormat(LOCALE, {
  style: "percent",
  maximumFractionDigits: 1,
  signDisplay: "exceptZero",
});

const shortDateFormatter = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: TIME_ZONE,
});

const longDateFormatter = new Intl.DateTimeFormat(LOCALE, {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: TIME_ZONE,
});

const relativeFormatter = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto" });

const RELATIVE_UNITS: readonly (readonly [Intl.RelativeTimeFormatUnit, number])[] = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["week", 604_800],
  ["day", 86_400],
  ["hour", 3600],
  ["minute", 60],
];

function toDate(value: string | Date): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Formats an amount stored in bani, e.g. 12999 -> "129,99 RON".
 * Returns "—" for null, undefined or non-finite values. Apply `tabular-nums` where it is shown.
 */
export function formatBani(bani: number | null | undefined, currency = "RON"): string {
  if (bani === null || bani === undefined || !Number.isFinite(bani)) {
    return EMPTY;
  }
  return getCurrencyFormatter(currency).format(bani / 100);
}

/**
 * Formats a percentage given in percent units, e.g. 12.5 -> "12,5 %".
 * With `signed`, positive values get a "+" and zero stays unsigned.
 */
export function formatPercent(value: number, options?: { signed?: boolean }): string {
  if (!Number.isFinite(value)) {
    return EMPTY;
  }
  const formatter = options?.signed ? signedPercentFormatter : percentFormatter;
  return formatter.format(value / 100);
}

/**
 * "short" -> "12 mar. 2026"; "long" -> "12 martie 2026 la 16:30" (includes the time).
 * Always uses the Europe/Bucharest time zone so server and browser render the same text.
 */
export function formatDate(iso: string | Date, style: "short" | "long" = "short"): string {
  const date = toDate(iso);
  if (!date) {
    return EMPTY;
  }
  return (style === "long" ? longDateFormatter : shortDateFormatter).format(date);
}

/** "chiar acum", "acum 3 ore", "ieri", "săptămâna trecută", "peste 2 zile", ... */
export function formatRelativeTime(iso: string | Date): string {
  const date = toDate(iso);
  if (!date) {
    return EMPTY;
  }
  const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const absSeconds = Math.abs(diffSeconds);
  if (absSeconds < 45) {
    return "chiar acum";
  }
  for (const [unit, unitSeconds] of RELATIVE_UNITS) {
    if (absSeconds >= unitSeconds) {
      return relativeFormatter.format(Math.trunc(diffSeconds / unitSeconds), unit);
    }
  }
  return relativeFormatter.format(Math.sign(diffSeconds), "minute");
}

const GROUPED_WITH_DOT = /^[1-9]\d{0,2}(?:\.\d{3})+$/;
const GROUPED_WITH_COMMA = /^[1-9]\d{0,2}(?:,\d{3})+$/;
const WHITESPACE = /[\s ]/g;
const CURRENCY_SUFFIX = /(?:lei|ron)\.?$/i;
const AMOUNT_CHARS = /^\d[\d.,]*$/;
const WHOLE_DIGITS = /^\d{1,9}$/;
const FRACTION_DIGITS = /^\d{0,2}$/;

function isGrouped(text: string, separator: "." | ","): boolean {
  return (separator === "." ? GROUPED_WITH_DOT : GROUPED_WITH_COMMA).test(text);
}

function splitAmount(text: string): { whole: string; fraction: string } | null {
  const hasDot = text.includes(".");
  const hasComma = text.includes(",");

  if (hasDot && hasComma) {
    const decimalSeparator = text.lastIndexOf(".") > text.lastIndexOf(",") ? "." : ",";
    const groupSeparator = decimalSeparator === "." ? "," : ".";
    const parts = text.split(decimalSeparator);
    const [whole = "", fraction = ""] = parts;
    if (parts.length !== 2 || !isGrouped(whole, groupSeparator)) {
      return null;
    }
    return { whole: whole.split(groupSeparator).join(""), fraction };
  }

  if (hasComma) {
    const parts = text.split(",");
    const [whole = "", fraction = ""] = parts;
    return parts.length === 2 ? { whole, fraction } : null;
  }

  if (hasDot) {
    const parts = text.split(".");
    const [whole = "", fraction = ""] = parts;
    if (parts.length === 2 && fraction.length !== 3) {
      return { whole, fraction };
    }
    return isGrouped(text, ".") ? { whole: parts.join(""), fraction: "" } : null;
  }

  return { whole: text, fraction: "" };
}

/**
 * Parses text typed by a user into bani. Accepts "129,99", "129.99", "1.299,50", "1299"
 * and an optional "lei"/"RON" suffix. A comma is the decimal separator; a lone dot is a
 * decimal separator unless it groups thousands ("1.299" -> 129900).
 * Returns null for empty, invalid, negative, zero (a price must be positive; treat an empty
 * field as "no value" in the caller), more than two decimals, or amounts above the int4 limit.
 */
export function parseLeiToBani(input: string): number | null {
  const text = input.replace(WHITESPACE, "").replace(CURRENCY_SUFFIX, "");
  if (!AMOUNT_CHARS.test(text)) {
    return null;
  }
  const amount = splitAmount(text);
  if (!(amount && WHOLE_DIGITS.test(amount.whole) && FRACTION_DIGITS.test(amount.fraction))) {
    return null;
  }
  const bani = Number(amount.whole) * 100 + Number(amount.fraction.padEnd(2, "0"));
  return bani > 0 && bani <= MAX_BANI ? bani : null;
}

/** Prefills an input from bani: 12999 -> "129,99", 130000 -> "1300". */
export function baniToLeiInput(bani: number): string {
  if (!Number.isFinite(bani)) {
    return "";
  }
  const rounded = Math.round(bani);
  const sign = rounded < 0 ? "-" : "";
  const absolute = Math.abs(rounded);
  const whole = Math.floor(absolute / 100);
  const fraction = absolute % 100;
  return fraction === 0
    ? `${sign}${whole}`
    : `${sign}${whole},${String(fraction).padStart(2, "0")}`;
}
