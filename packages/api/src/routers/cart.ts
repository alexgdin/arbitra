import { cartItems, products } from "@my-better-t-app/db/schema/commerce";
import { TRPCError } from "@trpc/server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure, router } from "../index";

const quantity = z.number().int().min(1).max(99);

export const cartRouter = router({
  // Coșul utilizatorului, cu produsul și totalul în bani.
  list: protectedProcedure.query(async ({ ctx }) => {
    const items = await ctx.db
      .select({
        id: cartItems.id,
        productId: cartItems.productId,
        quantity: cartItems.quantity,
        targetPrice: cartItems.targetPrice,
        autoBuyEnabled: cartItems.autoBuyEnabled,
        title: products.title,
        store: products.store,
        url: products.url,
        imageUrl: products.imageUrl,
        ean: products.ean,
        currency: products.currency,
        currentPrice: products.currentPrice,
      })
      .from(cartItems)
      .innerJoin(products, eq(products.id, cartItems.productId))
      .where(eq(cartItems.userId, ctx.session.user.id));

    const total = items.reduce(
      (sum, i) => sum + (i.currentPrice ?? 0) * i.quantity,
      0
    );

    return { items, total };
  }),

  // Dacă produsul e deja în coș, adună cantitatea.
  add: protectedProcedure
    .input(
      z.object({ productId: z.uuid(), quantity: quantity.default(1) })
    )
    .mutation(async ({ ctx, input }) => {
      const [product] = await ctx.db
        .select({ id: products.id })
        .from(products)
        .where(eq(products.id, input.productId))
        .limit(1);

      if (!product) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Product not found" });
      }

      const [item] = await ctx.db
        .insert(cartItems)
        .values({
          userId: ctx.session.user.id,
          productId: input.productId,
          quantity: input.quantity,
        })
        .onConflictDoUpdate({
          target: [cartItems.userId, cartItems.productId],
          set: { quantity: sql`${cartItems.quantity} + ${input.quantity}` },
        })
        .returning();

      return item;
    }),

  updateQuantity: protectedProcedure
    .input(z.object({ id: z.uuid(), quantity }))
    .mutation(async ({ ctx, input }) => {
      const [item] = await ctx.db
        .update(cartItems)
        .set({ quantity: input.quantity })
        .where(
          and(
            eq(cartItems.id, input.id),
            eq(cartItems.userId, ctx.session.user.id)
          )
        )
        .returning();

      if (!item) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Cart item not found" });
      }
      return item;
    }),

  remove: protectedProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(cartItems)
        .where(
          and(
            eq(cartItems.id, input.id),
            eq(cartItems.userId, ctx.session.user.id)
          )
        );

      return { ok: true as const };
    }),

  clear: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db
      .delete(cartItems)
      .where(eq(cartItems.userId, ctx.session.user.id));

    return { ok: true as const };
  }),
});
