import type { Database } from "@my-better-t-app/db";
import { products } from "@my-better-t-app/db/schema/commerce";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, ilike, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { z } from "zod";

import { publicProcedure, router } from "../index";
import {
  buildCatalogItem,
  connectedComponents,
  groupCatalogItems,
  rankCatalogItems,
} from "../lib/catalog";
import type { CatalogItem } from "../lib/catalog";
import { canonicalGtin } from "../lib/identifiers";
import { escapeLike, parseSearchTerms } from "../lib/search";
import { catalogColumns, loadSiblingProducts } from "../lib/siblings";
import { SUPPORTED_STORE_IDS } from "../lib/store-config";
import { CONTROL_CHARS_MESSAGE, withoutControlChars } from "../schemas";

// Câte rânduri potrivite din fiecare magazin se grupează și se ordonează înainte de a tăia rezultatul la `limit`.
// Limita e per magazin, ca un magazin inundat cu rânduri să nu scoată din căutare ofertele celorlalte.
const CANDIDATES_PER_STORE = 60;

// Produsele create înainte de coloana search_text au textul de căutare gol, deci se potrivesc
// și după titlu, cu diacriticele românești înlocuite (translate nu cere nicio extensie Postgres).
const DIACRITICS = "ăâîșşțţĂÂÎȘŞȚŢ";
const DIACRITICS_FOLDED = "aaissttAAISSTT";
const foldedTitle = sql`translate(${products.title}, ${DIACRITICS}, ${DIACRITICS_FOLDED})`;

function matchesTerm(term: string) {
  const pattern = `%${escapeLike(term)}%`;
  return or(
    ilike(products.searchText, pattern),
    ilike(foldedTitle, pattern)
  );
}

// Articolul care conține produsul găsit cu `where`, cu toate ofertele lui (EAN sau cod de model comun).
// Același cod pentru compare și lookup; null dacă produsul nu există.
async function findCatalogItem(
  db: Database,
  where: SQL | undefined
): Promise<CatalogItem | null> {
  const [product] = await db
    .select(catalogColumns)
    .from(products)
    .where(where)
    .limit(1);

  if (!product) {
    return null;
  }

  // Grupul se caută după rânduri, nu după oferte: un magazin arată o singură ofertă, deci produsul
  // cerut poate lipsi din ele când alt rând al aceluiași magazin e mai ieftin.
  const rows = await loadSiblingProducts(db, [product]);
  const group = connectedComponents(rows).find((component) =>
    component.some((row) => row.id === product.id)
  );
  return group ? buildCatalogItem(group) : null;
}

export const catalogRouter = router({
  // Căutare publică, fără cont: ofertele aceluiași produs din toate magazinele, grupate după EAN sau cod de model.
  search: publicProcedure
    .input(
      z.object({
        q: z.string().trim().max(80).default(""),
        limit: z.number().int().min(1).max(40).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      // Un cuvânt care e un GTIN valid se caută în forma canonică în care se salvează ("0718037904610" găsește
      // "718037904610").
      const terms = [
        ...new Set(
          parseSearchTerms(input.q).map((term) => canonicalGtin(term) ?? term)
        ),
      ];

      // Răsfoirea (cele mai recente produse) e doar pentru un q gol; un q fără niciun cuvânt
      // ("---", "%%") nu caută nimic și nu întoarce tot catalogul.
      if (input.q.length > 0 && terms.length === 0) {
        return { items: [], query: input.q };
      }

      const matches = (
        await Promise.all(
          SUPPORTED_STORE_IDS.map((store) =>
            ctx.db
              .select(catalogColumns)
              .from(products)
              .where(and(...terms.map(matchesTerm), eq(products.store, store)))
              .orderBy(
                sql`${products.lastCheckedAt} desc nulls last`,
                asc(products.id)
              )
              .limit(CANDIDATES_PER_STORE)
          )
        )
      ).flat();

      // Ofertele din celelalte magazine intră în rezultat chiar dacă titlul lor nu s-a potrivit.
      const rows = await loadSiblingProducts(ctx.db, matches);

      const items = rankCatalogItems(groupCatalogItems(rows)).slice(
        0,
        input.limit
      );

      return { items, query: input.q };
    }),

  // Toate magazinele pentru același produs (EAN sau cod de model), pentru pagina publică a produsului.
  compare: publicProcedure
    .input(z.object({ productId: z.uuid() }))
    .query(async ({ ctx, input }) => {
      const item = await findCatalogItem(
        ctx.db,
        eq(products.id, input.productId)
      );

      if (!item) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Product not found" });
      }
      return item;
    }),

  // Pentru extensie: articolul unui produs din magazin, după (magazin, id extern); null dacă nu e cunoscut.
  lookup: publicProcedure
    .input(
      z.object({
        store: z
          .string()
          .min(1)
          .max(32)
          .refine(withoutControlChars, CONTROL_CHARS_MESSAGE),
        externalId: z
          .string()
          .min(1)
          .max(128)
          .refine(withoutControlChars, CONTROL_CHARS_MESSAGE),
      })
    )
    .query(({ ctx, input }) =>
      findCatalogItem(
        ctx.db,
        and(
          eq(products.store, input.store),
          eq(products.externalId, input.externalId)
        )
      )
    ),
});
