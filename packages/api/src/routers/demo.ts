import { cartItems, priceHistory, products } from "@my-better-t-app/db/schema/commerce";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure, router } from "../index";
import { loadTargetStatuses } from "./alerts";

// Produsele create de seed au externalId "demo-*" (apps/server/src/scripts/seed.ts).
export const DEMO_PREFIX = "demo-";
// Prețul simulat: 10 lei sub țintă, dar cel puțin 1 leu.
const DROP_BELOW_TARGET = 1000;
const MIN_PRICE = 100;

export function simulatedPrice(targetPrice: number): number {
  return Math.max(MIN_PRICE, targetPrice - DROP_BELOW_TARGET);
}

// Modul demo schimbă prețuri comune tuturor utilizatorilor, deci există doar în afara producției.
// Verificarea se face la fiecare apel, nu la încărcarea modulului.
const demoProcedure = protectedProcedure.use(({ next }) => {
  if (process.env.NODE_ENV === "production") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Demo mode is disabled in production",
    });
  }
  return next();
});

export const demoRouter = router({
  // Produsele demo urmărite cu țintă care nu au atins-o încă (în niciun magazin), pentru cardul „Mod demo”.
  trackedDemoProducts: demoProcedure.query(async ({ ctx }) => {
    const statuses = await loadTargetStatuses(ctx.db, ctx.session.user.id);
    return statuses
      .filter(
        (status) => status.externalId.startsWith(DEMO_PREFIX) && !status.reached
      )
      .map((status) => ({
        productId: status.productId,
        title: status.title,
        targetPrice: status.targetPrice,
        currentPrice: status.currentPrice,
      }))
      .sort((a, b) => a.title.localeCompare(b.title, "ro"));
  }),

  // Simulează o scădere de preț pe un produs demo urmărit: prețul ajunge la 10 lei sub țintă, în stoc, cu un
  // punct nou în istoric (sursa "manual"), ca notificarea să apară live. Nu cumpără nimic.
  simulateDrop: demoProcedure
    .input(z.object({ productId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [tracked] = await ctx.db
        .select({
          externalId: products.externalId,
          targetPrice: cartItems.targetPrice,
        })
        .from(cartItems)
        .innerJoin(products, eq(products.id, cartItems.productId))
        .where(
          and(
            eq(cartItems.userId, ctx.session.user.id),
            eq(cartItems.productId, input.productId)
          )
        )
        .limit(1);

      if (!tracked) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Tracked product not found",
        });
      }
      if (!tracked.externalId.startsWith(DEMO_PREFIX)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only demo products can be changed",
        });
      }
      if (tracked.targetPrice === null) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "The product has no target price",
        });
      }

      const newPrice = simulatedPrice(tracked.targetPrice);
      const now = new Date();

      await ctx.db.transaction(async (tx) => {
        await tx
          .update(products)
          .set({ currentPrice: newPrice, inStock: true, lastCheckedAt: now })
          .where(eq(products.id, input.productId));
        await tx.insert(priceHistory).values({
          productId: input.productId,
          price: newPrice,
          inStock: true,
          source: "manual",
          recordedAt: now,
        });
      });

      return { productId: input.productId, newPrice };
    }),
});
