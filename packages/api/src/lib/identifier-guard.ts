// Protecția împotriva unei punți între produse: un rând cu EAN-ul produsului A și codul de model al
// produsului B ar uni pentru totdeauna cele două grupuri (prima scriere câștigă, deci nu se mai desface).
// Orice cont poate trimite prețuri, deci scrierea unui al doilea identificator se face doar când nu leagă
// două grupuri care nu aveau deja o legătură.

import type { Database } from "@my-better-t-app/db";
import { products } from "@my-better-t-app/db/schema/commerce";
import { and, eq, ne, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

import { cleanIdentifiers } from "./identifiers";
import type { StoredIdentifiers } from "./identifiers";

export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

type IdentifierInput = { ean?: string | undefined; mpn?: string | undefined };
type ExistingRow = StoredIdentifiers & { id: string };

// Scrierile care pot lega două grupuri se execută pe rând: fără blocare, două cereri simultane ar vedea
// amândouă grupul celeilalte încă necomis și ar trece de verificare. Blocarea ține până la sfârșitul tranzacției.
const BRIDGE_LOCK = sql`select pg_advisory_xact_lock(hashtext('products-identifier-bridge'))`;

async function hasRow(
  tx: Transaction,
  condition: SQL | undefined,
  selfId: string | undefined
): Promise<boolean> {
  const rows = await tx
    .select({ id: products.id })
    .from(products)
    .where(
      and(condition, selfId === undefined ? undefined : ne(products.id, selfId))
    )
    .limit(1);
  return rows.length > 0;
}

// Adevărat când există rânduri cu EAN-ul, rânduri cu codul de model, dar niciun rând (în afara celui scris)
// care să le aibă pe amândouă: rândul scris ar uni două grupuri separate. Se oprește la prima mulțime goală.
async function bridgesTwoGroups(
  tx: Transaction,
  ean: string,
  mpn: string,
  selfId: string | undefined
): Promise<boolean> {
  const sameEan = eq(products.ean, ean);
  const sameMpn = eq(products.mpn, mpn);
  return (
    (await hasRow(tx, sameEan, selfId)) &&
    (await hasRow(tx, sameMpn, selfId)) &&
    !(await hasRow(tx, and(sameEan, sameMpn), selfId))
  );
}

// Identificatorii de scris pentru o cerere (cleanIdentifiers), fără puntea dintre grupuri. Verificarea se
// face când scrierea lasă rândul cu ambii identificatori și adaugă cel puțin unul. Dacă ar uni două grupuri,
// se păstrează doar identificatorul pe care rândul îl avea deja (la un rând nou sau fără mpn: EAN-ul),
// iar celălalt se ignoră la această scriere.
export async function cleanIdentifiersWithoutBridge(
  tx: Transaction,
  input: IdentifierInput,
  existing: ExistingRow | undefined
) {
  const identifiers = cleanIdentifiers(input, existing);
  const { ean, mpn } = identifiers.stored;
  const adds = identifiers.ean !== undefined || identifiers.mpn !== undefined;
  if (ean === null || mpn === null || !adds) {
    return identifiers;
  }

  await tx.execute(BRIDGE_LOCK);
  if (!(await bridgesTwoGroups(tx, ean, mpn, existing?.id))) {
    return identifiers;
  }
  return existing?.mpn
    ? cleanIdentifiers({ mpn: input.mpn }, existing)
    : cleanIdentifiers({ ean: input.ean }, existing);
}
