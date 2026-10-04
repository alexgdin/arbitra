import { priceHistory, products } from "@my-better-t-app/db/schema/commerce";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gte, ilike } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure, publicProcedure, router } from "../index";
import { bani, httpUrl } from "../schemas";

const MS_PER_DAY = 86_400_000;

export const productRouter = router({
  // Apelat de extensia de browser: upsert produs + istoric doar dacă prețul s-a schimbat.
  ingestPrice: protectedProcedure
    .input(
      z.object({
        store: z.string().min(1),
        externalId: z.string().min(1),
        title: z.string().min(1),
        url: httpUrl,
        imageUrl: httpUrl.optional(),
        ean: z.string().min(8).max(14).optional(),
        price: bani,
        currency: z.string().length(3).default("RON"),
        inStock: z.boolean().default(true),
      })
    )
    .mutation(({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const now = new Date();

        const [existing] = await tx
          .select({ currentPrice: products.currentPrice })
          .from(products)
          .where(
            and(
              eq(products.store, input.store),
              eq(products.externalId, input.externalId)
            )
          )
          .limit(1);

        const [product] = await tx
          .insert(products)
          .values({
            store: input.store,
            externalId: input.externalId,
            ean: input.ean,
            title: input.title,
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
              url: input.url,
              imageUrl: input.imageUrl,
              ean: input.ean,
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
          await tx.insert(priceHistory).values({
            productId: product.id,
            price: input.price,
            inStock: input.inStock,
            source: "extension",
          });
        }

        return { productId: product.id, changed, previousPrice };
      })
    ),

  getById: publicProcedure
    .input(z.object({ id: z.uuid() }))
    .query(async ({ ctx, input }) => {
      const [product] = await ctx.db
        .select()
        .from(products)
        .where(eq(products.id, input.id))
        .limit(1);

      if (!product) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Product not found" });
      }
      return product;
    }),

  list: publicProcedure
    .input(
      z.object({
        q: z.string().trim().min(1).optional(),
        limit: z.number().int().min(1).max(100).default(20),
      })
    )
    .query(({ ctx, input }) =>
      ctx.db
        .select()
        .from(products)
        .where(input.q ? ilike(products.title, `%${input.q}%`) : undefined)
        .orderBy(desc(products.updatedAt))
        .limit(input.limit)
    ),

  // Date pentru PriceChart: puncte în ordine cronologică + statistici pe interval.
  history: publicProcedure
    .input(
      z.object({
        productId: z.uuid(),
        days: z.number().int().min(1).max(365).default(90),
      })
    )
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - input.days * MS_PER_DAY);

      const points = await ctx.db
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
        .orderBy(asc(priceHistory.recordedAt));

      const first = points[0];
      const last = points.at(-1);
      const prices = points.map((p) => p.price);

      const stats =
        first && last
          ? {
              min: Math.min(...prices),
              max: Math.max(...prices),
              current: last.price,
              changePct: ((last.price - first.price) / first.price) * 100,
            }
          : null;

      return { points, stats };
    }),
});
