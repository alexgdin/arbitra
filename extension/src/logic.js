// Logică pură a service worker-ului: validare, deduplicare și numărarea ofertelor.
// Nu atinge chrome.* sau rețeaua, deci se testează direct.

/**
 * @typedef {{
 *   store: string, externalId: string, title: string, url: string, imageUrl?: string,
 *   ean?: string, mpn?: string, price: number, currency: string, inStock: boolean,
 * }} Observation
 * @typedef {{
 *   productId: string, store: string, price: number | null, inStock: boolean,
 *   url: string, lastCheckedAt: string | null,
 * }} CatalogOffer
 * @typedef {{
 *   key: string, representativeProductId: string, title: string, ean: string | null,
 *   imageUrl: string | null, currency: string, offers: CatalogOffer[],
 *   bestOffer: { productId: string, store: string, price: number } | null,
 *   maxPrice: number | null, savings: number, lastCheckedAt: string | null,
 * }} CatalogItem
 * @typedef {{ at: number, store: string, title: string, price: number, changed: boolean }} RecentEntry
 * @typedef {{ price: number, at: number }} SeenRecord
 */

const SUPPORTED_STORES = ["emag", "pcgarage", "altex"];

/** Domeniul fiecărui magazin; pagina produsului trebuie să-i aparțină. */
const STORE_DOMAINS = new Map([
  ["emag", "emag.ro"],
  ["pcgarage", "pcgarage.ro"],
  ["altex", "altex.ro"],
]);

// Limitele câmpurilor sunt cele din ingestPriceInput (packages/api/src/routers/product.ts) și din schemas.ts:
// o observație care le depășește ar primi BAD_REQUEST și s-ar pierde, deci se verifică aici, înainte de trimitere.
// Plafonul prețului: 100.000 RON, în bani (MAX_BANI de pe server).
export const MAX_PRICE_BANI = 10_000_000;
export const DEDUPE_WINDOW_MS = 6 * 60 * 60 * 1000;
export const RECENT_LIMIT = 5;
// Cel mult 10 minute de pauză după un 429, oricât cere serverul (sau o valoare stricată din storage).
export const MAX_BACKOFF_MS = 10 * 60 * 1000;
const SEEN_PREFIX = "seen:";

const MAX_EXTERNAL_ID_LENGTH = 128;
const MAX_TITLE_LENGTH = 300;
const MAX_URL_LENGTH = 2048;
// NUL și celelalte caractere de control: serverul le respinge în titlu și în id, iar Postgres nu le primește.
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const CONTROL_CHARS_GLOBAL = new RegExp(CONTROL_CHARS.source, "g");
// Forma minimă a unui cod de model, ca pe server: 6..64 de caractere, cu litere și cifre. Restul regulilor
// (caractere distincte, specificații) se aplică în extract.js, iar serverul le verifică din nou.
const MPN_PATTERN = /^(?=.*[A-Z])(?=.*[0-9])[A-Z0-9]{6,64}$/;
const CURRENCY_PATTERN = /^[A-Za-z]{3}$/;

/** @param {unknown} value */
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function text(value) {
  return typeof value === "string" ? value : "";
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function nullableText(value) {
  return typeof value === "string" ? value : null;
}

/**
 * @param {unknown} value
 * @returns {number | null} întregul strict pozitiv sau null
 */
function positiveInt(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

/**
 * @param {unknown} value
 * @returns {URL | null} URL-ul parsat, doar pentru http/https
 */
function parseHttpUrl(value) {
  if (typeof value !== "string" || value.length > MAX_URL_LENGTH) {
    return null;
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} hostname
 * @param {string} store
 */
function hostBelongsToStore(hostname, store) {
  const domain = STORE_DOMAINS.get(store);
  return domain !== undefined && (hostname === domain || hostname.endsWith(`.${domain}`));
}

/**
 * Verifică lungimea și cifra de control a unui cod GTIN (8, 12, 13 sau 14 cifre, nu doar zerouri).
 * @param {unknown} value
 */
export function isValidGtin(value) {
  if (typeof value !== "string" || !/^(\d{8}|\d{12,14})$/.test(value) || /^0+$/.test(value)) {
    return false;
  }
  const digits = Array.from(value, Number);
  const check = digits.pop();
  const sum = digits
    .reverse()
    .reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/**
 * Moneda unei observații: lipsa ei înseamnă RON. Serverul primește doar RON.
 * @param {Record<string, unknown>} raw
 */
function observationCurrency(raw) {
  return raw.currency === undefined ? "RON" : raw.currency;
}

/**
 * Observația este într-o monedă cu cod de 3 litere, alta decât RON: serverul nu o primește, deci se ignoră
 * în liniște, fără stare de eroare (validateObservation dă null pentru ea).
 * @param {unknown} raw
 */
export function hasForeignCurrency(raw) {
  if (!isRecord(raw)) {
    return false;
  }
  const currency = observationCurrency(raw);
  return typeof currency === "string" && CURRENCY_PATTERN.test(currency) && currency.toUpperCase() !== "RON";
}

/**
 * Validează defensiv o observație primită de la content script (date neîncredere), cu regulile serverului
 * (ingestPriceInput). Întoarce o copie curată, doar cu câmpurile cunoscute, sau null.
 * @param {unknown} raw
 * @returns {Observation | null}
 */
export function validateObservation(raw) {
  if (!isRecord(raw) || typeof raw.store !== "string" || !SUPPORTED_STORES.includes(raw.store)) {
    return null;
  }
  const { store, price, inStock } = raw;

  const externalId = text(raw.externalId).trim();
  // în titlu, caracterele de control devin spații; titlul se taie la limita serverului
  const title = text(raw.title).replace(CONTROL_CHARS_GLOBAL, " ").trim().slice(0, MAX_TITLE_LENGTH).trim();
  if (!externalId || externalId.length > MAX_EXTERNAL_ID_LENGTH || CONTROL_CHARS.test(externalId) || !title) {
    return null;
  }

  // ca pe server: https, fără utilizator, parolă sau port; fără query și hash (pot conține parametri de urmărire)
  const pageUrl = parseHttpUrl(raw.url);
  if (!pageUrl || pageUrl.username || pageUrl.password || pageUrl.port) {
    return null;
  }
  if (!hostBelongsToStore(pageUrl.hostname, store)) {
    return null;
  }
  const url = `https://${pageUrl.hostname}${pageUrl.pathname}`;

  const currency = observationCurrency(raw);
  if (
    typeof price !== "number" ||
    !Number.isSafeInteger(price) ||
    price < 1 ||
    price > MAX_PRICE_BANI ||
    url.length > MAX_URL_LENGTH ||
    typeof currency !== "string" ||
    currency.toUpperCase() !== "RON" ||
    typeof inStock !== "boolean"
  ) {
    return null;
  }

  /** @type {Observation} */
  const observation = { store, externalId, title, url, price, currency: "RON", inStock };
  // forma normalizată a adresei nu are caractere de control, dar poate fi mai lungă decât cea primită
  const image = typeof raw.imageUrl === "string" ? parseHttpUrl(raw.imageUrl) : null;
  if (image && image.href.length <= MAX_URL_LENGTH) {
    observation.imageUrl = image.href;
  }
  if (typeof raw.ean === "string" && isValidGtin(raw.ean)) {
    observation.ean = raw.ean;
  }
  if (typeof raw.mpn === "string" && MPN_PATTERN.test(raw.mpn)) {
    observation.mpn = raw.mpn;
  }
  return observation;
}

/**
 * Verifică dacă mesajul vine de pe o pagină https a magazinului observat.
 * @param {string | undefined} senderUrl
 * @param {string} store
 */
export function senderMatchesStore(senderUrl, store) {
  const url = parseHttpUrl(senderUrl);
  return url !== null && url.protocol === "https:" && hostBelongsToStore(url.hostname, store);
}

/** @param {Pick<Observation, "store" | "externalId">} observation */
export function seenKey({ store, externalId }) {
  return `${SEEN_PREFIX}${store}:${externalId}`;
}

/**
 * @param {unknown} raw valoare citită din storage
 * @returns {SeenRecord | null}
 */
export function normalizeSeen(raw) {
  if (!isRecord(raw) || typeof raw.price !== "number" || typeof raw.at !== "number") {
    return null;
  }
  return Number.isSafeInteger(raw.price) && Number.isFinite(raw.at)
    ? { price: raw.price, at: raw.at }
    : null;
}

/**
 * @param {SeenRecord} seen
 * @param {number} now
 */
function isFresh(seen, now) {
  const age = now - seen.at;
  return age >= 0 && age < DEDUPE_WINDOW_MS;
}

/**
 * Trimite din nou doar dacă prețul s-a schimbat sau ultima trimitere are peste 6 ore.
 * @param {SeenRecord | null} seen ultima trimitere reușită pentru acest produs
 * @param {Pick<Observation, "price">} observation
 * @param {number} now milisecunde epoch
 */
export function shouldSendIngest(seen, observation, now) {
  return seen === null || seen.price !== observation.price || !isFresh(seen, now);
}

/**
 * Cheile "seen:" care nu mai țin loc de deduplicare și pot fi șterse.
 * @param {Record<string, unknown>} entries tot conținutul storage-ului
 * @param {number} now
 * @returns {string[]}
 */
export function expiredSeenKeys(entries, now) {
  return Object.keys(entries).filter((key) => {
    if (!key.startsWith(SEEN_PREFIX)) {
      return false;
    }
    const seen = normalizeSeen(entries[key]);
    return seen === null || !isFresh(seen, now);
  });
}

/**
 * Numărul ofertelor în stoc din alte magazine, mai ieftine decât prețul paginii.
 * @param {CatalogItem | null} item
 * @param {Pick<Observation, "store" | "price">} observation
 */
export function countCheaperOffers(item, observation) {
  if (!item) {
    return 0;
  }
  return item.offers.filter(
    (offer) =>
      offer.store !== observation.store &&
      offer.inStock &&
      offer.price !== null &&
      offer.price < observation.price
  ).length;
}

/**
 * Serverul a răspuns 429 și pauza cerută nu s-a încheiat: nu se face nicio cerere. O valoare mai îndepărtată
 * decât pauza maximă (ceas mutat, storage stricat) nu mai ține extensia oprită.
 * @param {number | null} backoffUntil milisecunde epoch, din storage
 * @param {number} now
 */
export function isBackingOff(backoffUntil, now) {
  return backoffUntil !== null && backoffUntil > now && backoffUntil - now <= MAX_BACKOFF_MS;
}

/** @param {number} count */
export function badgeText(count) {
  if (count <= 0) {
    return "";
  }
  return count > 99 ? "99+" : String(count);
}

/**
 * Listă de produse recente, cele mai noi primele; un produs apare o singură dată.
 * @param {RecentEntry[]} recent
 * @param {RecentEntry} entry
 * @returns {RecentEntry[]}
 */
export function appendRecent(recent, entry) {
  const others = recent.filter((item) => item.store !== entry.store || item.title !== entry.title);
  return [entry, ...others].slice(0, RECENT_LIMIT);
}

/**
 * @param {unknown} raw valoare citită din storage
 * @returns {RecentEntry[]}
 */
export function normalizeRecent(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }
  /** @type {RecentEntry[]} */
  const entries = [];
  for (const entry of raw) {
    if (
      isRecord(entry) &&
      typeof entry.at === "number" &&
      Number.isFinite(entry.at) &&
      typeof entry.store === "string" &&
      typeof entry.title === "string" &&
      typeof entry.price === "number" &&
      Number.isSafeInteger(entry.price) &&
      typeof entry.changed === "boolean"
    ) {
      const { at, store, title, price, changed } = entry;
      entries.push({ at, store, title, price, changed });
    }
  }
  return entries.slice(0, RECENT_LIMIT);
}

/**
 * @param {unknown} raw
 * @returns {CatalogOffer | null}
 */
function sanitizeOffer(raw) {
  if (!isRecord(raw) || typeof raw.store !== "string" || raw.store === "") {
    return null;
  }
  return {
    productId: text(raw.productId),
    store: raw.store,
    price: positiveInt(raw.price),
    inStock: raw.inStock === true,
    url: typeof raw.url === "string" && parseHttpUrl(raw.url) ? raw.url : "",
    lastCheckedAt: nullableText(raw.lastCheckedAt),
  };
}

/**
 * @param {unknown} raw
 * @returns {CatalogItem["bestOffer"]}
 */
function sanitizeBestOffer(raw) {
  const price = isRecord(raw) ? positiveInt(raw.price) : null;
  if (!isRecord(raw) || price === null || typeof raw.store !== "string") {
    return null;
  }
  return { productId: text(raw.productId), store: raw.store, price };
}

/**
 * Curăță răspunsul catalog.lookup, ca overlay-ul să primească tipuri sigure.
 * @param {unknown} raw
 * @returns {CatalogItem | null} null când răspunsul nu are forma unui CatalogItem
 */
export function sanitizeCatalogItem(raw) {
  if (!isRecord(raw) || !Array.isArray(raw.offers)) {
    return null;
  }
  const currency = text(raw.currency);
  return {
    key: text(raw.key),
    representativeProductId: text(raw.representativeProductId),
    title: text(raw.title),
    ean: nullableText(raw.ean),
    imageUrl: typeof raw.imageUrl === "string" && parseHttpUrl(raw.imageUrl) ? raw.imageUrl : null,
    currency: CURRENCY_PATTERN.test(currency) ? currency.toUpperCase() : "RON",
    offers: raw.offers.map(sanitizeOffer).filter((offer) => offer !== null),
    bestOffer: sanitizeBestOffer(raw.bestOffer),
    maxPrice: positiveInt(raw.maxPrice),
    savings: positiveInt(raw.savings) ?? 0,
    lastCheckedAt: nullableText(raw.lastCheckedAt),
  };
}

const ERROR_MESSAGES = new Map([
  ["UNAUTHORIZED", "Nu ești conectat în PretPilot."],
  ["RATE_LIMITED", "Prea multe cereri, încerc din nou în câteva minute."],
  ["NETWORK", "Nu mă pot conecta la serverul PretPilot."],
  ["TIMEOUT", "Serverul PretPilot nu a răspuns la timp."],
  ["BAD_RESPONSE", "Serverul PretPilot a trimis un răspuns neașteptat."],
]);

/**
 * Mesaj în română pentru o eroare a clientului API (ApiError cu `code`).
 * @param {any} error
 */
export function describeError(error) {
  const code = error?.code;
  if (code === "SERVER") {
    return Number.isInteger(error.httpStatus)
      ? `Eroare de server (HTTP ${error.httpStatus}).`
      : "Eroare de server.";
  }
  return ERROR_MESSAGES.get(code) ?? "A apărut o eroare neașteptată.";
}
