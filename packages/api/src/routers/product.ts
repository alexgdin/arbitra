import { priceHistory, products } from "@my-better-t-app/db/schema/commerce";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gt, gte, ilike, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { z } from "zod";

import { protectedProcedure, publicProcedure, router } from "../index";
import { cleanIdentifiersWithoutBridge } from "../lib/identifier-guard";
import type { Transaction } from "../lib/identifier-guard";
import { normalizeModelCode } from "../lib/identifiers";
import { buildProductSearchText, escapeLike } from "../lib/search";
import {
  canonicalProductUrl,
  isStoreHostname,
  isSupportedStore,
  SUPPORTED_STORE_IDS,
} from "../lib/store-config";
import {
  bani,
  CONTROL_CHARS_MESSAGE,
  httpUrl,
  withoutControlChars,
} from "../schemas";

const MS_PER_DAY = 86_400_000;
const MAX_URL_LENGTH = 2048;
const MAX_EAN_LENGTH = 64;
const MAX_MPN_LENGTH = 128;
// Cel mult atâtea puncte (cele mai noi) întoarce istoricul unui produs.
const MAX_HISTORY_POINTS = 2000;

// Hostname-ul unui link; null când textul nu e un URL valid.
function hostnameOf(url: string): string | null {
  return URL.canParse(url) ? new URL(url).hostname : null;
}

// Un identificator prea lung nu e valid, dar nu respinge observația: se ignoră, ca orice valoare invalidă
// (cleanIdentifiers). Conținutul lui nu se verifică aici.
function optionalIdentifier(maxLength: number) {
  return z
    .string()
    .optional()
    .transform((value) =>
      value !== undefined && value.length <= maxLength ? value : undefined
    );
}

// Linkul produsului se salvează în forma canonică (canonicalProductUrl): https, fără utilizator, port, query
// și hash, cu hostul în litere mici.
const productUrl = z
  .string()
  .max(MAX_URL_LENGTH)
  .transform((value, ctx) => {
    const url = canonicalProductUrl(value);
    if (url === null || url.length > MAX_URL_LENGTH) {
      ctx.addIssue({
        code: "custom",
        message:
          "The link must be an https link without credentials, port or control characters",
      });
      return z.NEVER;
    }
    return url;
  });

// Intrarea lui ingestPrice. Oricine are cont (și extensia) poate trimite prețuri, deci fiecare câmp are
// plafon, magazinul e din lista cunoscută, iar linkul trebuie să fie pe domeniul magazinului: altfel
// pagina publică ar afișa un link către orice site. Identificatorii (ean, mpn) nu se resping pentru
// conținut: cei invalizi sau prea lungi se ignoră în cleanIdentifiers.
export const ingestPriceInput = z
  .object({
    store: z.enum(SUPPORTED_STORE_IDS),
    externalId: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .refine(withoutControlChars, CONTROL_CHARS_MESSAGE),
    title: z
      .string()
      .trim()
      .min(1)
      .max(300)
      .refine(withoutControlChars, CONTROL_CHARS_MESSAGE),
    url: productUrl,
    imageUrl: httpUrl
      .max(MAX_URL_LENGTH)
      .refine(withoutControlChars, CONTROL_CHARS_MESSAGE)
      .optional(),
    ean: optionalIdentifier(MAX_EAN_LENGTH),
    mpn: optionalIdentifier(MAX_MPN_LENGTH),
    price: bani,
    currency: z.literal("RON").default("RON"),
    inStock: z.boolean().default(true),
  })
  // Zod rulează și acest test când un câmp de mai sus a fost deja respins (de exemplu un url
  // malformat), deci valorile pot fi invalide aici; în acel caz testul eșuează, nu aruncă.
  .refine(
    ({ store, url }) => {
      const hostname = hostnameOf(url);
      return (
        hostname !== null &&
        isSupportedStore(store) &&
        isStoreHostname(store, hostname)
      );
    },
    {
      path: ["url"],
      message: "The link must be on the store's own domain",
    }
  );

// Prima scriere câștigă și în SQL, nu doar în cleanIdentifiers: dacă între citire și scriere alt cont a
// salvat identificatorul, rămâne al lui. `undefined` lasă coloana neatinsă.
function keepFirst(column: PgColumn, value: string | undefined) {
  return value === undefined ? undefined : sql`coalesce(${column}, ${value})`;
}

// Un preț care se schimbă des (de exemplu un cont care alternează două valori) nu umple istoricul: în 5 minute
// de la ultimul punct, acela primește prețul nou în loc să se adauge altul. Istoricul rămâne la zi, dar crește
// cu cel mult un punct la 5 minute per produs. Ceasul e al bazei de date, ca în coloana recorded_at.
async function recordPrice(
  tx: Transaction,
  productId: string,
  price: number,
  inStock: boolean,
  isNewProduct: boolean
) {
  const [recent] = isNewProduct
    ? []
    : await tx
        .select({ id: priceHistory.id })
        .from(priceHistory)
        .where(
          and(
            eq(priceHistory.productId, productId),
            gt(priceHistory.recordedAt, sql`now() - interval '5 minutes'`)
          )
        )
        .orderBy(desc(priceHistory.recordedAt))
        .limit(1);

  if (recent) {
    await tx
      .update(priceHistory)
      .set({ price, inStock })
      .where(eq(priceHistory.id, recent.id));
    return;
  }
  await tx
    .insert(priceHistory)
    .values({ productId, price, inStock, source: "extension" });
}

export const productRouter = router({
  // Apelat de extensia de browser: upsert produs + istoric doar dacă prețul s-a schimbat.
  ingestPrice: protectedProcedure
    .input(ingestPriceInput)
    .mutation(({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const now = new Date();

        const [existing] = await tx
          .select({
            id: products.id,
            currentPrice: products.currentPrice,
            ean: products.ean,
            mpn: products.mpn,
          })
          .from(products)
          .where(
            and(
              eq(products.store, input.store),
              eq(products.externalId, input.externalId)
            )
          )
          .limit(1);

        // Fără EAN sau mpn valid în cerere, produsul își păstrează valorile din baza de date, iar un
        // identificator deja salvat nu se înlocuiește niciodată. Un al doilea identificator care ar uni
        // două grupuri de produse nu se scrie.
        const identifiers = await cleanIdentifiersWithoutBridge(
          tx,
          input,
          existing
        );
        // Codul de model brut ("WDS100T4G0E-00CPS0") se indexează doar dacă e valid și desemnează codul salvat.
        const requestedMpn =
          input.mpn === undefined ? null : normalizeModelCode(input.mpn);
        const rawMpn =
          requestedMpn !== null && requestedMpn === identifiers.stored.mpn
            ? (input.mpn ?? null)
            : null;
        const searchText = buildProductSearchText(
          input.title,
          identifiers.stored.ean,
          identifiers.stored.mpn,
          rawMpn
        );

        const [product] = await tx
          .insert(products)
          .values({
            store: input.store,
            externalId: input.externalId,
            ean: identifiers.ean,
            mpn: identifiers.mpn,
            title: input.title,
            searchText,
            url: input.url,
            imageUrl: input.imageUrl,
            currency: input.currency,
            currentPrice: input.price,
            inStock: input.inStock,
            lastCheckedAt: now,
          })
          .onConflictDoUpdate({
            target: [products.store, products.externalId],
            // câmpurile undefined sunt ignorate de Drizzle, deci nu șterg valorile existente
            set: {
              title: input.title,
              searchText,
              // linkul rămâne cel de la prima scriere: un cont nu poate muta o pagină existentă pe alt link
              url: keepFirst(products.url, input.url),
              imageUrl: input.imageUrl,
              ean: keepFirst(products.ean, identifiers.ean),
              mpn: keepFirst(products.mpn, identifiers.mpn),
              currency: input.currency,
              currentPrice: input.price,
              inStock: input.inStock,
              lastCheckedAt: now,
            },
          })
          .returning({ id: products.id });

        if (!product) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to save product",
          });
        }

        const previousPrice = existing?.currentPrice ?? null;
        const changed = previousPrice !== input.price;

        if (changed) {
          await recordPrice(
            tx,
            product.id,
            input.price,
            input.inStock,
            existing === undefined
          );
        }

        return { productId: product.id, changed, previousPrice };
      })
    ),

  // Doar pentru căutarea din coș, deci cu cont: ILIKE pe titlu nu are index, iar un apel public ar fi gratuit pentru abuz.
  list: protectedProcedure
    .input(
      z.object({
        q: z
          .string()
          .trim()
          .min(1)
          .max(80)
          .refine(withoutControlChars, CONTROL_CHARS_MESSAGE)
          .optional(),
        limit: z.number().int().min(1).max(100).default(20),
      })
    )
    .query(({ ctx, input }) =>
      ctx.db
        .select()
        .from(products)
        .where(
          input.q
            ? ilike(products.title, `%${escapeLike(input.q)}%`)
            : undefined
        )
        .orderBy(desc(products.updatedAt))
        .limit(input.limit)
    ),

  // Date pentru PriceChart: cele mai noi 2000 de puncte, în ordine cronologică, plus statistici pe ele.
  history: publicProcedure
    .input(
      z.object({
        productId: z.uuid(),
        days: z.number().int().min(1).max(365).default(90),
      })
    )
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - input.days * MS_PER_DAY);

      const newest = await ctx.db
        .select({
          price: priceHistory.price,
          inStock: priceHistory.inStock,
          recordedAt: priceHistory.recordedAt,
        })
        .from(priceHistory)
        .where(
          and(
            eq(priceHistory.productId, input.productId),
            gte(priceHistory.recordedAt, since)
          )
        )
        .orderBy(desc(priceHistory.recordedAt))
        .limit(MAX_HISTORY_POINTS);

      const points = newest.reverse();
      const first = points[0];
      const last = points.at(-1);

      // fără Math.min(...spread): la zeci de mii de argumente spread-ul aruncă RangeError
      const stats =
        first && last
          ? {
              min: points.reduce((min, p) => Math.min(min, p.price), first.price),
              max: points.reduce((max, p) => Math.max(max, p.price), first.price),
              current: last.price,
              changePct: ((last.price - first.price) / first.price) * 100,
            }
          : null;

      return { points, stats };
    }),
});
