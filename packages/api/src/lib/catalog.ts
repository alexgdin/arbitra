// Catalog public: grupează ofertele aceluiași produs din mai multe magazine, după EAN sau cod de model (mpn).
// Funcții pure, fără acces la baza de date. Sumele sunt întregi în bani.

import { isSupportedStore } from "./store-config";

export type CatalogRow = {
  id: string;
  store: string;
  ean: string | null;
  mpn: string | null;
  title: string;
  url: string;
  imageUrl: string | null;
  currency: string;
  currentPrice: number | null;
  inStock: boolean;
  lastCheckedAt: Date | null;
};

export type CatalogOffer = {
  productId: string;
  store: string;
  price: number | null;
  inStock: boolean;
  url: string;
  lastCheckedAt: string | null;
};

export type CatalogItem = {
  // Cel mai mic EAN din grup când există, altfel "mpn:" + cel mai mic cod de model, altfel id-ul produsului
  key: string;
  // Ținta linkului /produs/<id>: cea mai ieftină ofertă în stoc cu preț, altfel prima ofertă
  representativeProductId: string;
  title: string;
  // EAN-ul ofertei reprezentative, altfel cel mai mic EAN din grup, altfel null
  ean: string | null;
  imageUrl: string | null;
  currency: string;
  // O ofertă per magazin: întâi cele în stoc cu preț, crescător după preț, apoi restul (fără stoc sau fără preț)
  offers: CatalogOffer[];
  bestOffer: { productId: string; store: string; price: number } | null;
  maxPrice: number | null;
  // maxPrice - bestOffer.price; 0 când sunt mai puțin de două oferte în stoc cu preț
  savings: number;
  // Cea mai veche verificare dintre ofertele în stoc cu preț (prospețime prudentă)
  lastCheckedAt: string | null;
};

type PricedOffer = Pick<
  CatalogRow,
  "store" | "currency" | "currentPrice" | "inStock"
>;

function isAvailable<T extends Pick<CatalogRow, "inStock" | "currentPrice">>(
  row: T
): row is T & { currentPrice: number } {
  return row.inStock && row.currentPrice !== null;
}

// Un preț sub 20% sau peste 500% din cel obișnuit nu e credibil (un preț fals de 1 ban sau de un milion de lei,
// trimis de orice cont). Prețul obișnuit e mediana celor mai mici prețuri în stoc ale tuturor magazinelor din
// grup, inclusiv a celui verificat: mediana celorlalte două ar fi media lor, iar un singur preț fals ar face din
// celelalte două prețuri reale valori aberante. Cu mai puțin de trei magazine nu există bază de comparație.
const OUTLIER_FACTOR = 5;
const MIN_STORES_TO_COMPARE = 3;

function median(values: readonly number[]): number {
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const high = sorted[middle] ?? 0;
  return sorted.length % 2 === 1 ? high : ((sorted[middle - 1] ?? 0) + high) / 2;
}

// Rândurile fără ofertele în stoc cu preț aberant. Ofertele fără stoc sau fără preț rămân, la fel și grupurile
// cu mai puțin de trei magazine în stoc cu preț. Prețurile se compară doar în aceeași monedă.
export function dropPriceOutliers<T extends PricedOffer>(
  rows: readonly T[]
): T[] {
  // moneda -> magazin -> cel mai mic preț în stoc
  const cheapest = new Map<string, Map<string, number>>();
  for (const row of rows) {
    if (!isAvailable(row)) {
      continue;
    }
    const stores = cheapest.get(row.currency) ?? new Map<string, number>();
    stores.set(
      row.store,
      Math.min(stores.get(row.store) ?? row.currentPrice, row.currentPrice)
    );
    cheapest.set(row.currency, stores);
  }

  // moneda -> prețul obișnuit, doar unde există destule magazine
  const typical = new Map<string, number>();
  for (const [currency, stores] of cheapest) {
    if (stores.size >= MIN_STORES_TO_COMPARE) {
      typical.set(currency, median([...stores.values()]));
    }
  }

  return rows.filter((row) => {
    const reference = typical.get(row.currency);
    if (!isAvailable(row) || reference === undefined) {
      return true;
    }
    return (
      row.currentPrice * OUTLIER_FACTOR >= reference &&
      row.currentPrice <= reference * OUTLIER_FACTOR
    );
  });
}

// Rândurile pe care se bazează ofertele: doar din magazinele cunoscute (rândurile vechi, cu text liber în
// `store`, nu se afișează și nu intră în optimizare), fără prețurile aberante. Același filtru pentru catalog și coș.
export function trustedRows<T extends PricedOffer>(rows: readonly T[]): T[] {
  return dropPriceOutliers(rows.filter((row) => isSupportedStore(row.store)));
}

function compareText(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  return a > b ? 1 : 0;
}

// Prețurile lipsă merg la sfârșit.
function comparePrice(a: number | null, b: number | null): number {
  if (a === b) {
    return 0;
  }
  if (a === null) {
    return 1;
  }
  return b === null ? -1 : a - b;
}

// Ofertele disponibile înaintea celorlalte; în fiecare grup, cele cu preț cresc după preț.
// Egalitățile se rezolvă după magazin și id, ca ordinea să nu depindă de ordinea rândurilor.
function compareRows(a: CatalogRow, b: CatalogRow): number {
  return (
    Number(isAvailable(b)) - Number(isAvailable(a)) ||
    comparePrice(a.currentPrice, b.currentPrice) ||
    compareText(a.store, b.store) ||
    compareText(a.id, b.id)
  );
}

// Verificările mai recente primesc valori mai mari; rândurile neverificate vin ultimele.
function checkedTime(row: CatalogRow): number {
  return row.lastCheckedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
}

// Care rând reprezintă un magazin: cea mai ieftină ofertă în stoc cu preț (egalități: cea verificată
// cel mai recent, apoi id-ul), iar fără așa ceva, rândul verificat cel mai recent (egalități: id-ul).
function compareWithinStore(a: CatalogRow, b: CatalogRow): number {
  const byAvailability = Number(isAvailable(b)) - Number(isAvailable(a));
  if (byAvailability !== 0) {
    return byAvailability;
  }
  const byPrice =
    isAvailable(a) && isAvailable(b) ? a.currentPrice - b.currentPrice : 0;
  return (
    byPrice || checkedTime(b) - checkedTime(a) || compareText(a.id, b.id)
  );
}

// Un singur rând per magazin, ca un magazin cu multe rânduri legate să nu umfle grupul.
function onePerStore(rows: readonly CatalogRow[]): CatalogRow[] {
  const byStore = new Map<string, CatalogRow>();
  for (const row of rows) {
    const current = byStore.get(row.store);
    if (!current || compareWithinStore(row, current) < 0) {
      byStore.set(row.store, row);
    }
  }
  return [...byStore.values()];
}

function toOffer(row: CatalogRow): CatalogOffer {
  return {
    productId: row.id,
    store: row.store,
    price: row.currentPrice,
    inStock: row.inStock,
    url: row.url,
    lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
  };
}

function oldestCheck(rows: CatalogRow[]): string | null {
  let oldest: Date | null = null;
  for (const row of rows) {
    if (row.lastCheckedAt && (!oldest || row.lastCheckedAt < oldest)) {
      oldest = row.lastCheckedAt;
    }
  }
  return oldest?.toISOString() ?? null;
}

// Un identificator gol ("") înseamnă lipsă, ca null.
function sharedValue(a: string | null, b: string | null): boolean {
  return Boolean(a) && a === b;
}

// Două produse au un identificator comun dacă au același EAN sau același cod de model (mpn). E legătura
// directă; grupurile din catalog mai includ și legăturile prin alte rânduri (vezi connectedComponents).
export function sharesIdentifier(
  a: Pick<CatalogRow, "ean" | "mpn">,
  b: Pick<CatalogRow, "ean" | "mpn">
): boolean {
  return sharedValue(a.ean, b.ean) || sharedValue(a.mpn, b.mpn);
}

// Cel mai mic identificator în ordine lexicografică, ignorând valorile lipsă.
function smallest(values: readonly (string | null)[]): string | null {
  let result: string | null = null;
  for (const value of values) {
    if (value && (result === null || value < result)) {
      result = value;
    }
  }
  return result;
}

// Un articol din rândurile aceluiași produs (legate prin EAN sau cod de model, direct sau prin alte rânduri).
// Un rând apare o singură dată după id, chiar dacă este dat de mai multe ori, iar fiecare magazin
// contribuie cu o singură ofertă (vezi compareWithinStore), doar din magazinele cunoscute și fără prețuri
// aberante (vezi trustedRows). Cheia ține cont de toate rândurile, ca să nu depindă de filtru.
export function buildCatalogItem(
  rows: readonly [CatalogRow, ...CatalogRow[]]
): CatalogItem {
  const unique = [...new Map(rows.map((row) => [row.id, row])).values()];
  const trusted = trustedRows(unique);
  const sorted = onePerStore(trusted).sort(compareRows);
  const available = sorted.filter(isAvailable);
  const [representative = rows[0]] = sorted;
  const best = available[0];
  const worst = available.at(-1);
  const groupEan = smallest(unique.map((row) => row.ean));
  const groupMpn = smallest(unique.map((row) => row.mpn));

  return {
    key: groupEan ?? (groupMpn ? `mpn:${groupMpn}` : representative.id),
    representativeProductId: representative.id,
    title: representative.title,
    ean: representative.ean || groupEan,
    imageUrl:
      trusted.toSorted(compareRows).find((row) => row.imageUrl)?.imageUrl ??
      null,
    currency: representative.currency,
    offers: sorted.map(toOffer),
    bestOffer: best
      ? { productId: best.id, store: best.store, price: best.currentPrice }
      : null,
    maxPrice: worst?.currentPrice ?? null,
    savings: best && worst ? worst.currentPrice - best.currentPrice : 0,
    lastCheckedAt: oldestCheck(available),
  };
}

// Rădăcina grupului unui rând în structura union-find, cu comprimarea căii.
function find(parent: number[], index: number): number {
  const up = parent[index] ?? index;
  if (up === index) {
    return index;
  }
  const root = find(parent, up);
  parent[index] = root;
  return root;
}

// Componentele conexe ale rândurilor: două rânduri sunt în același grup dacă au un EAN sau un cod
// de model comun, direct sau prin alte rânduri. Rândurile fără identificatori rămân singure.
// Aceeași regulă o folosește și coșul, ca ofertele alternative să fie cele din catalog.
export function connectedComponents(
  rows: readonly CatalogRow[]
): [CatalogRow, ...CatalogRow[]][] {
  const unique = [...new Map(rows.map((row) => [row.id, row])).values()];
  const parent = unique.map((_, index) => index);
  // primul rând care a avut fiecare identificator ("ean:..." și "mpn:..." nu se confundă)
  const firstWith = new Map<string, number>();

  for (const [index, row] of unique.entries()) {
    const identifiers = [
      row.ean ? `ean:${row.ean}` : null,
      row.mpn ? `mpn:${row.mpn}` : null,
    ];
    for (const identifier of identifiers) {
      if (identifier === null) {
        continue;
      }
      const first = firstWith.get(identifier);
      if (first === undefined) {
        firstWith.set(identifier, index);
      } else {
        parent[find(parent, index)] = find(parent, first);
      }
    }
  }

  const groups = new Map<number, [CatalogRow, ...CatalogRow[]]>();
  for (const [index, row] of unique.entries()) {
    const root = find(parent, index);
    const group = groups.get(root);
    if (group) {
      group.push(row);
    } else {
      groups.set(root, [row]);
    }
  }
  return [...groups.values()];
}

// Grupează rândurile prin identificatori comuni (EAN sau cod de model); rândurile fără identificatori
// formează fiecare propriul grup. Rezultatul nu depinde de ordinea rândurilor:
// articolele sunt ordonate după titlu, apoi cheie.
export function groupCatalogItems(rows: readonly CatalogRow[]): CatalogItem[] {
  return connectedComponents(rows)
    .map(buildCatalogItem)
    .sort(
      (a, b) =>
        a.title.localeCompare(b.title, "ro") || compareText(a.key, b.key)
    );
}

function availableOfferCount(item: CatalogItem): number {
  return item.offers.filter((offer) => offer.inStock && offer.price !== null)
    .length;
}

// Ordinea rezultatelor căutării: mai multe oferte în stoc cu preț, apoi economie mai mare, apoi titlu.
export function rankCatalogItems(items: readonly CatalogItem[]): CatalogItem[] {
  return [...items].sort(
    (a, b) =>
      availableOfferCount(b) - availableOfferCount(a) ||
      b.savings - a.savings ||
      a.title.localeCompare(b.title, "ro") ||
      compareText(a.key, b.key)
  );
}
