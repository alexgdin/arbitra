import { user } from "@my-better-t-app/db/schema/auth";
import { cartItems, products } from "@my-better-t-app/db/schema/commerce";
import { TRPCError } from "@trpc/server";
import { and, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure, router } from "../index";
import { bani } from "../schemas";

const shippingAddressSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(6),
  street: z.string().min(1),
  city: z.string().min(1),
  county: z.string().min(1),
  postalCode: z.string().min(1),
  country: z.string().min(2),
});

export const brokerRouter = router({
  // Setările globale Auto-Broker ale utilizatorului curent.
  getSettings: protectedProcedure.query(async ({ ctx }) => {
    const [row] = await ctx.db
      .select({
        enabled: user.brokerEnabled,
        maxOrderValue: user.brokerMaxOrderValue,
        monthlyBudget: user.brokerMonthlyBudget,
        paymentMethodRef: user.brokerPaymentMethodRef,
        shippingAddress: user.shippingAddress,
      })
      .from(user)
      .where(eq(user.id, ctx.session.user.id))
      .limit(1);

    if (!row) {
      throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
    }

    return {
      enabled: row.enabled,
      maxOrderValue: row.maxOrderValue,
      monthlyBudget: row.monthlyBudget,
      // nu expunem tokenul către client, doar dacă există
      hasPaymentMethod: Boolean(row.paymentMethodRef),
      shippingAddress: row.shippingAddress,
    };
  }),

  // Câmpurile omise rămân neschimbate; null șterge valoarea.
  updateSettings: protectedProcedure
    .input(
      z
        .object({
          enabled: z.boolean().optional(),
          maxOrderValue: bani.nullable().optional(),
          monthlyBudget: bani.nullable().optional(),
          paymentMethodRef: z.string().min(1).nullable().optional(),
          shippingAddress: shippingAddressSchema.nullable().optional(),
        })
        .refine((v) => Object.values(v).some((x) => x !== undefined), {
          message: "Provide at least one field to update",
        })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(user)
        .set({
          brokerEnabled: input.enabled,
          brokerMaxOrderValue: input.maxOrderValue,
          brokerMonthlyBudget: input.monthlyBudget,
          brokerPaymentMethodRef: input.paymentMethodRef,
          shippingAddress: input.shippingAddress,
        })
        .where(eq(user.id, ctx.session.user.id));

      return { ok: true as const };
    }),

  // Setează prețul țintă pentru un produs (creează intrarea în coș dacă nu există).
  setTarget: protectedProcedure
    .input(
      z.object({
        productId: z.uuid(),
        targetPrice: bani,
        autoBuyEnabled: z.boolean().default(false),
        quantity: z.number().int().min(1).max(99).optional(),
      })
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
          targetPrice: input.targetPrice,
          autoBuyEnabled: input.autoBuyEnabled,
          quantity: input.quantity,
        })
        .onConflictDoUpdate({
          target: [cartItems.userId, cartItems.productId],
          set: {
            targetPrice: input.targetPrice,
            autoBuyEnabled: input.autoBuyEnabled,
            quantity: input.quantity,
          },
        })
        .returning();

      return item;
    }),

  // Elimină targetul, fără să scoată produsul din coș.
  clearTarget: protectedProcedure
    .input(z.object({ productId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(cartItems)
        .set({ targetPrice: null, autoBuyEnabled: false })
        .where(
          and(
            eq(cartItems.userId, ctx.session.user.id),
            eq(cartItems.productId, input.productId)
          )
        );

      return { ok: true as const };
    }),

  // Toate produsele cu target setat, cu flag dacă ținta e atinsă.
  listTargets: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        productId: cartItems.productId,
        quantity: cartItems.quantity,
        targetPrice: cartItems.targetPrice,
        autoBuyEnabled: cartItems.autoBuyEnabled,
        title: products.title,
        store: products.store,
        url: products.url,
        currency: products.currency,
        currentPrice: products.currentPrice,
      })
      .from(cartItems)
      .innerJoin(products, eq(products.id, cartItems.productId))
      .where(
        and(
          eq(cartItems.userId, ctx.session.user.id),
          isNotNull(cartItems.targetPrice)
        )
      );

    return rows.map((r) => ({
      ...r,
      targetReached:
        r.currentPrice !== null &&
        r.targetPrice !== null &&
        r.currentPrice <= r.targetPrice,
    }));
  }),
});
