// Produsele-surori: celelalte rânduri care au același EAN sau același cod de model (mpn) ca unele date.
// Niciun magazin nu expune ambii identificatori, deci legătura dintre două oferte poate trece printr-un
// al treilea rând (eMAG are doar mpn, Altex doar GTIN, iar un alt rând le are pe amândouă).

import type { Database } from "@my-better-t-app/db";
import { products } from "@my-better-t-app/db/schema/commerce";
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

import type { CatalogRow } from "./catalog";
import { SUPPORTED_STORE_IDS } from "./store-config";
import type { SupportedStoreId } from "./store-config";

// Doar coloanele publice ale produsului; căutarea nu atinge date de utilizator.
export const catalogColumns = {
  id: products.id,
  store: products.store,
  ean: products.ean,
  mpn: products.mpn,
  title: products.title,
  url: products.url,
  imageUrl: products.imageUrl,
  currency: products.currency,
  currentPrice: products.currentPrice,
  inStock: products.inStock,
  lastCheckedAt: products.lastCheckedAt,
} satisfies Record<keyof CatalogRow, unknown>;

// Un identificator găsit printr-o soră poate aduce alte surori; mai mult de două runde nu merită
// (a treia legătură dintr-un lanț de identificatori e rară și costă o interogare în plus).
const MAX_ROUNDS = 2;
// Plafoane pe rundă: un cont care trimite prețuri nu poate umfla grupul sau interogarea. Limita e per magazin,
// ca un magazin inundat cu rânduri să nu scoată din rezultat ofertele celorlalte.
const SIBLING_LIMIT_PER_STORE = 25;
const MAX_IDENTIFIERS_PER_SET = 200;

export type IdentifierSets = { eans: string[]; mpns: string[] };

function uniqueSorted(
  values: readonly (string | null)[],
  exclude: readonly string[]
): string[] {
  const skip = new Set(exclude);
  return [...new Set(values)]
    .filter(
      (value): value is string =>
        value !== null && value !== "" && !skip.has(value)
    )
    .sort()
    .slice(0, MAX_IDENTIFIERS_PER_SET);
}

// EAN-urile și codurile de model nenule ale rândurilor, unice și sortate (interogarea rămâne stabilă),
// fără cele din `searched`, adică deja căutate într-o rundă anterioară. Fiecare mulțime are cel mult
// 200 de valori: cele rămase în afară (cele mai mari, în ordine) se caută în runda următoare.
export function collectIdentifiers(
  rows: readonly Pick<CatalogRow, "ean" | "mpn">[],
  searched: IdentifierSets = { eans: [], mpns: [] }
): IdentifierSets {
  return {
    eans: uniqueSorted(
      rows.map((row) => row.ean),
      searched.eans
    ),
    mpns: uniqueSorted(
      rows.map((row) => row.mpn),
      searched.mpns
    ),
  };
}

// Condiția interogării: același EAN sau același mpn. Mulțimile goale se sar, iar fără niciun
// identificator nu există condiție (undefined), ca să nu se citească tot tabelul din greșeală.
export function siblingFilter(sets: IdentifierSets): SQL | undefined {
  return or(
    sets.eans.length > 0 ? inArray(products.ean, sets.eans) : undefined,
    sets.mpns.length > 0 ? inArray(products.mpn, sets.mpns) : undefined
  );
}

// Interogarea unei runde pentru un magazin: cel mult 25 de rânduri, cele în stoc întâi, apoi cele mai ieftine
// (prețurile lipsă la sfârșit, ca la orice sortare crescătoare în Postgres), apoi cele verificate cel mai
// recent. Id-ul rezolvă egalitățile, ca rezultatul tăiat la limită să fie același la fiecare rulare.
export function siblingQuery(db: Database, filter: SQL, store: SupportedStoreId) {
  return db
    .select(catalogColumns)
    .from(products)
    .where(and(filter, eq(products.store, store)))
    .orderBy(
      desc(products.inStock),
      asc(products.currentPrice),
      sql`${products.lastCheckedAt} desc nulls last`,
      asc(products.id)
    )
    .limit(SIBLING_LIMIT_PER_STORE);
}

// Rândurile date plus produsele care au același EAN sau mpn, fără duplicate după id. Câte o interogare pe
// magazin cunoscut la fiecare rundă (rândurile din magazine necunoscute nu se încarcă), cel mult două runde:
// identificatorii descoperiți la prima rundă pot aduce alte surori. Se oprește când nu mai rămâne niciun
// identificator necăutat.
export async function loadSiblingProducts(
  db: Database,
  rows: readonly CatalogRow[]
): Promise<CatalogRow[]> {
  const byId = new Map(rows.map((row) => [row.id, row]));
  let searched: IdentifierSets = { eans: [], mpns: [] };

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const sets = collectIdentifiers([...byId.values()], searched);
    const filter = siblingFilter(sets);
    if (!filter) {
      break;
    }

    const found = await Promise.all(
      SUPPORTED_STORE_IDS.map((store) => siblingQuery(db, filter, store))
    );
    for (const row of found.flat()) {
      if (!byId.has(row.id)) {
        byId.set(row.id, row);
      }
    }
    searched = {
      eans: [...searched.eans, ...sets.eans],
      mpns: [...searched.mpns, ...sets.mpns],
    };
  }

  return [...byId.values()];
}
