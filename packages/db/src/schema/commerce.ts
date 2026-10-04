import { defineRelationsPart, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

// Convenție: toate sumele sunt întregi în subunități (bani). 129.99 RON = 12999.

export const priceSourceEnum = pgEnum("price_source", [
  "extension",
  "crawler",
  "manual",
]);

export const orderStatusEnum = pgEnum("order_status", [
  "pending",
  "placed",
  "delivered",
  "cancelled",
  "refunded",
]);

export const orderSourceEnum = pgEnum("order_source", [
  "manual",
  "auto_broker",
]);

export const protectionStatusEnum = pgEnum("protection_status", [
  "monitoring",
  "claim_generated",
  "refunded",
  "expired",
]);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    store: text("store").notNull(), // "emag" | "pcgarage" | "altex" | ...
    externalId: text("external_id").notNull(), // SKU / id din magazin
    ean: text("ean"), // leagă aceeași ofertă între magazine
    mpn: text("mpn"), // codul de model al producătorului, normalizat (litere mari, fără separatori)
    title: text("title").notNull(),
    // Titlul și EAN-ul normalizate (fără diacritice, litere mici) pentru căutarea publică.
    // Pentru cataloage mari, calea de upgrade este un index GIN pg_trgm pe această coloană.
    searchText: text("search_text").notNull().default(""),
    url: text("url").notNull(),
    imageUrl: text("image_url"),
    currency: text("currency").notNull().default("RON"),
    currentPrice: integer("current_price"),
    inStock: boolean("in_stock").notNull().default(true),
    lastCheckedAt: timestamp("last_checked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    uniqueIndex("products_store_external_id_uq").on(t.store, t.externalId),
    index("products_ean_idx").on(t.ean),
    index("products_mpn_idx").on(t.mpn),
  ]
);

export const priceHistory = pgTable(
  "price_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    price: integer("price").notNull(),
    inStock: boolean("in_stock").notNull().default(true),
    source: priceSourceEnum("source").notNull().default("extension"),
    recordedAt: timestamp("recorded_at").defaultNow().notNull(),
  },
  (t) => [
    index("price_history_product_recorded_idx").on(t.productId, t.recordedAt),
  ]
);

export const cartItems = pgTable(
  "cart_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull().default(1),
    // Auto-Broker: cumpără automat când prețul <= targetPrice
    targetPrice: integer("target_price"),
    autoBuyEnabled: boolean("auto_buy_enabled").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    uniqueIndex("cart_items_user_product_uq").on(t.userId, t.productId),
    index("cart_items_user_idx").on(t.userId),
  ]
);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull().default(1),
    unitPrice: integer("unit_price").notNull(), // prețul plătit per bucată
    currency: text("currency").notNull().default("RON"),
    status: orderStatusEnum("status").notNull().default("placed"),
    source: orderSourceEnum("source").notNull().default("manual"),
    externalOrderId: text("external_order_id"),
    purchasedAt: timestamp("purchased_at").defaultNow().notNull(),

    // Price Protection
    protectionStatus: protectionStatusEnum("protection_status")
      .notNull()
      .default("monitoring"),
    protectionExpiresAt: timestamp("protection_expires_at")
      .notNull()
      .default(sql`now() + interval '14 days'`),
    refundAmount: integer("refund_amount"), // (unitPrice - preț curent) * quantity
    refundClaimText: text("refund_claim_text"), // cererea generată
    refundClaimedAt: timestamp("refund_claimed_at"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index("orders_user_purchased_idx").on(t.userId, t.purchasedAt),
    index("orders_protection_idx").on(t.protectionStatus, t.protectionExpiresAt),
  ]
);

// Drizzle 1.0 (RQB v2): relațiile se definesc cu defineRelationsPart, ca în auth.ts.
// Nu definim chei pentru `user` aici, ca să nu suprascriem `authRelations` la spread în relations.ts.
export const commerceRelations = defineRelationsPart(
  { user, products, priceHistory, cartItems, orders },
  (r) => ({
    products: {
      priceHistory: r.many.priceHistory({
        from: r.products.id,
        to: r.priceHistory.productId,
      }),
      cartItems: r.many.cartItems({
        from: r.products.id,
        to: r.cartItems.productId,
      }),
      orders: r.many.orders({
        from: r.products.id,
        to: r.orders.productId,
      }),
    },
    priceHistory: {
      product: r.one.products({
        from: r.priceHistory.productId,
        to: r.products.id,
      }),
    },
    cartItems: {
      user: r.one.user({ from: r.cartItems.userId, to: r.user.id }),
      product: r.one.products({
        from: r.cartItems.productId,
        to: r.products.id,
      }),
    },
    orders: {
      user: r.one.user({ from: r.orders.userId, to: r.user.id }),
      product: r.one.products({
        from: r.orders.productId,
        to: r.products.id,
      }),
    },
  })
);

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type PriceHistoryRow = typeof priceHistory.$inferSelect;
export type CartItem = typeof cartItems.$inferSelect;
export type Order = typeof orders.$inferSelect;