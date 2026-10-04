import { cartItems, products } from "@my-better-t-app/db/schema/commerce";
import type { Product } from "@my-better-t-app/db/schema/commerce";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure, router } from "../index";
import { optimizeCart } from "../lib/cart-optimizer";
import type { OptimizerItem, OptimizerOffer } from "../lib/cart-optimizer";

const quantity = z.number().int().min(1).max(99);

// O ofertă validă: în stoc, cu preț și în aceeași monedă ca restul coșului.
function toOffers(product: Product, currency: string): OptimizerOffer[] {
  if (!product.inStock || product.currentPrice === null) {
    return [];
  }
  if (product.currency !== currency) {
    return [];
  }
  return [
    {
      productId: product.id,
      store: product.store,
      unitPrice: product.currentPrice,
      title: product.title,
      url: product.url,
      imageUrl: product.imageUrl,
    },
  ];
}

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

  // Împarte coșul între magazine astfel încât totalul, cu transport cu tot, să fie minim.
  optimize: protectedProcedure
    .input(
      z.object({
        items: z
          .array(z.object({ productId: z.uuid(), quantity }))
          .min(1)
          .max(30),
      })
    )
    .query(async ({ ctx, input }) => {
      // Același produs de mai multe ori: adunăm cantitățile.
      const quantities = new Map<string, number>();
      for (const item of input.items) {
        quantities.set(
          item.productId,
          (quantities.get(item.productId) ?? 0) + item.quantity
        );
      }

      const found = await ctx.db
        .select()
        .from(products)
        .where(inArray(products.id, [...quantities.keys()]));
      const byId = new Map(found.map((product) => [product.id, product]));

      const requested: Product[] = [];
      for (const id of quantities.keys()) {
        const product = byId.get(id);
        if (!product) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Product not found" });
        }
        requested.push(product);
      }

      // Aceeași ofertă în alte magazine se recunoaște după EAN.
      const eans = [
        ...new Set(requested.flatMap((p) => (p.ean ? [p.ean] : []))),
      ];
      const sameEan =
        eans.length > 0
          ? await ctx.db
              .select()
              .from(products)
              .where(
                and(
                  inArray(products.ean, eans),
                  eq(products.inStock, true),
                  isNotNull(products.currentPrice)
                )
              )
          : [];

      const currency = requested[0]?.currency ?? "RON";
      const items: OptimizerItem[] = requested.map((product) => ({
        productId: product.id,
        title: product.title,
        quantity: quantities.get(product.id) ?? 1,
        offers: (product.ean
          ? sameEan.filter((other) => other.ean === product.ean)
          : [product]
        ).flatMap((offer) => toOffers(offer, currency)),
      }));

      return optimizeCart(items, currency);
    }),
});
