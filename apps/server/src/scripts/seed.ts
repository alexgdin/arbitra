// Seed de date demo pentru PretPilot: produse în 3 magazine, istoric de prețuri,
// utilizator demo cu coș, setări Auto-Broker și două comenzi pentru Price Protection.
//
// ATENȚIE: DEMO_EMAIL și DEMO_PASSWORD sunt credențiale demo-only, pentru testare locală.
// Scriptul refuză să ruleze cu NODE_ENV=production.
//
// Utilizare (din rădăcina repo-ului sau din apps/server):
//   bun run db:seed                          dry run: arată ce ar face, ieșire cu cod 1
//   bun run db:seed --yes                    adaugă sau actualizează datele demo (idempotent)
//   bun run db:seed:reset --yes              șterge datele demo, apoi le recreează
//   bun run db:seed:reset --yes --no-seed    doar șterge datele demo
//
// Tot ce creează scriptul se recunoaște după: produse cu externalId "demo-*" și userul DEMO_EMAIL.

import { canonicalGtin, isValidGtin } from "@my-better-t-app/api/lib/identifiers";
import { buildProductSearchText } from "@my-better-t-app/api/lib/search";
import type { ShippingAddress } from "@my-better-t-app/db/schema/auth";
import { user } from "@my-better-t-app/db/schema/auth";
import type { NewProduct, Order } from "@my-better-t-app/db/schema/commerce";
import {
  cartItems,
  orders,
  priceHistory,
  products,
} from "@my-better-t-app/db/schema/commerce";
import { eq, inArray, like, sql } from "drizzle-orm";

import { ENV } from "../env.server";
import { auth, db } from "../services";

export const DEMO_EMAIL = "demo@pretpilot.test";
export const DEMO_PASSWORD = "PretPilot-Demo-2026";

const DEMO_NAME = "Demo PretPilot";
const DEMO_PREFIX = "demo-";

const DAY_MS = 86_400_000;
const HISTORY_DAYS = 90;
const LAST_POINT_AGE_DAYS = 0.02; // ultima verificare: acum ~30 de minute
const OUT_OF_STOCK_DAYS = 4; // ofertele epuizate au fost verificate ca epuizate în ultimele zile
const DEFAULT_USUAL = 1.04; // prețul obișnuit față de cel curent, când nu e specificat
const REVERSION = 0.12; // cât de repede revine prețul spre cel obișnuit
const VOLATILITY = 0.008; // zgomot per punct, ca fracție din preț
const INSERT_CHUNK = 500;
const SEED = 20_260_410;

const STORES = ["emag", "pcgarage", "altex"] as const;
type Store = (typeof STORES)[number];

type Offer = {
  title: string;
  price: number; // prețul curent, în bani
  inStock?: boolean;
  drop?: number; // scădere bruscă în ultimele ~2 zile, ca fracție din prețul dinainte
  usual?: number; // prețul obișnuit împărțit la cel curent (peste 1: prețul curent e avantajos)
};

type CatalogItem = { ean: string; offers: Record<Store, Offer> };

// Același EAN (GTIN-13 valid) în toate cele 3 magazine, ca optimizarea coșului să aibă alternative reale.
// Numărul din externalId e poziția produsului în listă (1-9): "demo-<magazin>-<n>".
const CATALOG: CatalogItem[] = [
  {
    ean: "4548736132580",
    offers: {
      emag: {
        title: "Căști wireless Sony WH-1000XM5, Noise Cancelling, Bluetooth, Negru",
        price: 134_999,
        drop: 0.09,
      },
      pcgarage: {
        title: "Sony WH-1000XM5 - Căști Bluetooth cu Noise Cancelling, Negru",
        price: 129_999,
        usual: 1.06,
      },
      altex: {
        title: "Căști Over-Ear Sony WH-1000XM5, Bluetooth, Noise Cancelling, Negru",
        price: 137_999,
        usual: 1.02,
      },
    },
  },
  {
    ean: "8806095347127",
    offers: {
      emag: {
        title: "Telefon mobil Samsung Galaxy S24, Dual SIM, 8GB RAM, 128GB, 5G, Onyx Black",
        price: 239_999,
        usual: 1.03,
      },
      pcgarage: {
        title: "Samsung Galaxy S24 5G, 128GB, 8GB RAM, Dual SIM, Onyx Black",
        price: 244_999,
        usual: 1.02,
      },
      altex: {
        title: "Smartphone Samsung Galaxy S24, 128GB, 8GB RAM, 5G, Dual SIM, Onyx Black",
        price: 234_999,
        drop: 0.11,
      },
    },
  },
  {
    ean: "0196802948173",
    offers: {
      emag: {
        title: "Laptop Lenovo IdeaPad Slim 5 16 inch, AMD Ryzen 7 7730U, 16GB, 512GB SSD, Cloud Grey",
        price: 319_999,
        usual: 1.05,
      },
      pcgarage: {
        title: "Laptop Lenovo IdeaPad Slim 5 16ABR8 (16 inch WUXGA, Ryzen 7 7730U, 16GB, 512GB SSD)",
        price: 324_999,
      },
      altex: {
        title: "Laptop Lenovo IdeaPad Slim 5, 16 inch, AMD Ryzen 7 7730U, 16GB RAM, 512GB SSD, Gri",
        price: 329_999,
        usual: 1,
      },
    },
  },
  {
    ean: "8806091052841",
    offers: {
      emag: {
        title: "Monitor Gaming LG UltraGear 27GP850-B, 27 inch, QHD, Nano IPS, 165Hz, 1ms",
        price: 119_999,
        usual: 0.98,
      },
      pcgarage: {
        title: "Monitor Gaming LG UltraGear 27GP850-B 27 inch QHD Nano IPS 165Hz",
        price: 118_999,
        usual: 1.07,
      },
      altex: {
        title: "Monitor Gaming LED IPS LG UltraGear, 27 inch, QHD, 165Hz, FreeSync, 27GP850-B",
        price: 124_999,
      },
    },
  },
  {
    ean: "5099206108851",
    offers: {
      emag: {
        title: "Mouse wireless Logitech MX Master 3S, Bluetooth, 8000 DPI, Graphite",
        price: 44_999,
      },
      pcgarage: {
        title: "Mouse Logitech MX Master 3S Performance, Wireless, Bluetooth, Graphite",
        price: 45_999,
        usual: 1.08,
      },
      altex: {
        title: "Mouse Wireless Logitech MX Master 3S, Ergonomic, 8000 DPI, Grafit",
        price: 44_499,
        usual: 1.03,
      },
    },
  },
  {
    ean: "6942345600016",
    offers: {
      emag: {
        title: "Tastatură mecanică wireless Keychron K2 V2, layout 75%, Gateron Brown, RGB",
        price: 37_999,
        usual: 1.06,
      },
      pcgarage: {
        title: "Tastatură Gaming Keychron K2 V2 Wireless, Gateron Brown, RGB, Aluminiu",
        price: 38_999,
      },
      altex: {
        title: "Tastatură mecanică Keychron K2 V2, Bluetooth, RGB, Gateron Brown",
        price: 39_999,
        inStock: false,
      },
    },
  },
  {
    ean: "8806094215373",
    offers: {
      emag: {
        title: "SSD Samsung 990 PRO, 1TB, M.2 2280, PCIe Gen4 x4 NVMe",
        price: 57_999,
        usual: 1.05,
      },
      pcgarage: {
        title: "SSD Samsung 990 PRO 1TB, PCIe 4.0 x4, NVMe M.2 2280",
        price: 55_999,
        drop: 0.08,
      },
      altex: {
        title: "SSD Samsung 990 PRO, 1TB, NVMe, M.2, PCIe 4.0",
        price: 58_999,
        usual: 1.02,
      },
    },
  },
  {
    ean: "6970995783254",
    offers: {
      emag: {
        title: "Aspirator robot Roborock Q7, funcție mop, 4200 Pa, navigare LiDAR, Negru",
        price: 89_999,
        usual: 1.07,
      },
      pcgarage: {
        title: "Roborock Q7 - Aspirator robot cu spălare, 4200 Pa, Negru",
        price: 92_999,
      },
      altex: {
        title: "Robot de aspirare Roborock Q7, 4200 Pa, Mop, Wi-Fi, Negru",
        price: 91_999,
        drop: 0.13,
      },
    },
  },
  {
    ean: "0711719577300",
    offers: {
      emag: {
        title: "Consolă PlayStation 5 Slim Disc Edition, 1TB, Alb",
        price: 229_999,
        usual: 1.02,
      },
      pcgarage: {
        title: "Consolă Sony PlayStation 5 Slim (Disc), 1TB SSD, Alb",
        price: 224_999,
        inStock: false,
      },
      altex: {
        title: "Consolă Sony PlayStation 5 Slim, 1TB, Disc Edition, Alb",
        price: 227_999,
        usual: 1.01,
      },
    },
  },
];

// Un EAN demo invalid ar fi ignorat de API, iar produsele nu s-ar mai lega între magazine.
for (const { ean } of CATALOG) {
  if (!isValidGtin(ean)) {
    throw new Error(`Demo EAN ${ean} is not a valid GTIN`);
  }
}

type CartSpec = {
  externalId: string;
  quantity: number;
  targetPrice: number | null;
  autoBuyEnabled: boolean;
};

const CART: CartSpec[] = [
  // ținta atinsă (preț curent 2349.99), cu cumpărare automată
  { externalId: "demo-altex-2", quantity: 1, targetPrice: 240_000, autoBuyEnabled: true },
  // ținta neatinsă (preț curent 1349.99), cu cumpărare automată
  { externalId: "demo-emag-1", quantity: 1, targetPrice: 130_000, autoBuyEnabled: true },
  // două monitoare pentru un setup dual, ținta neatinsă
  { externalId: "demo-emag-4", quantity: 2, targetPrice: 115_000, autoBuyEnabled: false },
  // ținta atinsă (preț curent 379.99), doar alertă
  { externalId: "demo-emag-6", quantity: 1, targetPrice: 39_999, autoBuyEnabled: false },
  // ținta neatinsă (preț curent 3199.99)
  { externalId: "demo-emag-3", quantity: 1, targetPrice: 300_000, autoBuyEnabled: false },
  // fără țintă: doar produs în coș
  { externalId: "demo-emag-5", quantity: 1, targetPrice: null, autoBuyEnabled: false },
];

type OrderSpec = {
  externalId: string;
  quantity: number;
  daysAgo: number;
  source: Order["source"];
  status: Order["status"];
};

// Ambele produse au scăzut de la cumpărare, deci Price Protection poate găsi o rambursare.
const ORDERS: OrderSpec[] = [
  { externalId: "demo-pcgarage-7", quantity: 1, daysAgo: 3, source: "auto_broker", status: "placed" },
  { externalId: "demo-altex-8", quantity: 1, daysAgo: 9, source: "manual", status: "delivered" },
];

const PROTECTION_DAYS = 14;

const SHIPPING_ADDRESS: ShippingAddress = {
  name: "Demo PretPilot",
  phone: "0721 000 123",
  street: "Str. Exemplului nr. 12, bl. B2, sc. 1, ap. 15",
  city: "Cluj-Napoca",
  county: "Cluj",
  postalCode: "400123",
  country: "România",
};

const PRODUCT_URLS: Record<Store, (slug: string, number: number) => string> = {
  emag: (slug, number) => `https://www.emag.ro/${slug}/pd/${demoSku(number)}/`,
  pcgarage: (slug) => `https://www.pcgarage.ro/${slug}/`,
  altex: (slug, number) => `https://www.altex.ro/${slug}/cpd/${demoSku(number)}/`,
};

function demoSku(number: number): string {
  return `DEMO${String(number).padStart(4, "0")}`;
}

function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function chunk<T>(items: T[], size: number): T[][] {
  const parts: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    parts.push(items.slice(i, i + size));
  }
  return parts;
}

// ---------------------------------------------------------------------------
// Generator pseudo-aleatoriu determinist (mulberry32), fără Math.random
// ---------------------------------------------------------------------------

function hashString(text: string): number {
  let hash = 2_166_136_261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function createRng(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d_2b_79_f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };

  return {
    between: (min: number, max: number) => min + next() * (max - min),
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    // Box-Muller: zgomot normal standard
    normal: () =>
      Math.sqrt(-2 * Math.log(1 - next())) * Math.cos(2 * Math.PI * next()),
  };
}

// ---------------------------------------------------------------------------
// Istoric de prețuri
// ---------------------------------------------------------------------------

type HistoryPoint = { price: number; inStock: boolean; recordedAt: Date };

// Preț de raft românesc: multiplu de 5 RON minus 1 ban (…99 / …49 RON).
function toRetailPrice(raw: number): number {
  return Math.max(Math.round(raw / 500) * 500 - 1, 99);
}

// Mers aleator cu revenire la media istorică, 1-2 promoții de câteva zile și, pentru
// ofertele cu `drop`, o scădere clară în ultimele zile. Se generează dinspre prezent spre
// trecut, ca ultimul punct să fie exact prețul curent. Rezultatul e în ordine cronologică.
function buildHistory(key: string, offer: Offer, now: number): HistoryPoint[] {
  const rng = createRng(SEED ^ hashString(key));
  const dropAge = offer.drop ? rng.between(0.8, 2.4) : 0;
  const usual = offer.drop
    ? offer.price / (1 - offer.drop)
    : offer.price * (offer.usual ?? DEFAULT_USUAL);
  const dips = Array.from({ length: rng.int(1, 2) }, () => ({
    from: rng.between(12, 70),
    length: rng.between(3, 7),
    depth: rng.between(0.07, 0.15),
  }));

  const ages = [LAST_POINT_AGE_DAYS];
  let age = LAST_POINT_AGE_DAYS + rng.between(1, 2);
  while (age <= HISTORY_DAYS) {
    ages.push(age);
    age += rng.between(1, 2);
  }

  let level = offer.drop ? 1 : offer.price / usual;
  const points = ages.map((pointAge, index): HistoryPoint => {
    let price = offer.price;
    if (index > 0 && pointAge >= dropAge) {
      level += REVERSION * (1 - level) + VOLATILITY * rng.normal();
      const dipFactor = dips.reduce(
        (factor, dip) =>
          pointAge >= dip.from && pointAge <= dip.from + dip.length
            ? factor * (1 - dip.depth)
            : factor,
        1
      );
      price = toRetailPrice(usual * level * dipFactor);
    }

    return {
      price,
      inStock: offer.inStock !== false || pointAge >= OUT_OF_STOCK_DAYS,
      recordedAt: new Date(now - Math.round(pointAge * DAY_MS)),
    };
  });

  return points.reverse();
}

// Prețul la momentul `at`: ultimul punct înregistrat până atunci.
function priceAt(history: HistoryPoint[], at: Date): number {
  const point = history.findLast((p) => p.recordedAt <= at);
  if (!point) {
    throw new Error("No price point before the requested date");
  }
  return point.price;
}

// ---------------------------------------------------------------------------
// Construirea datelor demo (pur, fără acces la baza de date)
// ---------------------------------------------------------------------------

export type DemoRow = {
  externalId: string;
  product: NewProduct;
  history: HistoryPoint[];
};

export function buildDemoRows(now: number): DemoRow[] {
  return CATALOG.flatMap((item, index) =>
    STORES.map((store): DemoRow => {
      const offer = item.offers[store];
      const number = index + 1;
      const externalId = `${DEMO_PREFIX}${store}-${number}`;
      const history = buildHistory(externalId, offer, now);
      // forma canonică, ca la ingestie: un EAN care începe cu 0 se salvează fără zeroul din față
      const ean = canonicalGtin(item.ean);

      return {
        externalId,
        history,
        product: {
          store,
          externalId,
          ean,
          title: offer.title,
          searchText: buildProductSearchText(offer.title, ean),
          url: PRODUCT_URLS[store](slugify(offer.title), number),
          imageUrl: null,
          currency: "RON",
          currentPrice: offer.price,
          inStock: offer.inStock !== false,
          lastCheckedAt: new Date(now),
          createdAt: history[0]?.recordedAt,
          updatedAt: new Date(now),
        },
      };
    })
  );
}

// ---------------------------------------------------------------------------
// Acces la baza de date
// ---------------------------------------------------------------------------

type Flags = { yes: boolean; reset: boolean; noSeed: boolean };

function parseFlags(argv: string[]): Flags {
  const args = argv.filter((arg) => arg !== "--");
  const known = new Set(["--yes", "--reset", "--no-seed"]);
  const unknown = args.filter((arg) => !known.has(arg));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown option(s): ${unknown.join(" ")}. Supported: --yes, --reset, --no-seed.`
    );
  }

  const flags = {
    yes: args.includes("--yes"),
    reset: args.includes("--reset"),
    noSeed: args.includes("--no-seed"),
  };
  if (flags.noSeed && !flags.reset) {
    throw new Error("--no-seed only makes sense together with --reset.");
  }
  return flags;
}

// Doar hostname-ul, niciodată utilizatorul sau parola din DATABASE_URL.
function targetHost(): string {
  try {
    return new URL(ENV.DATABASE_URL).hostname || "(unknown)";
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

function describePlan(flags: Flags): string[] {
  const plan: string[] = [];
  if (flags.reset) {
    plan.push(
      `delete user ${DEMO_EMAIL} with its cart and orders, and products with external_id "${DEMO_PREFIX}*" with their price history`
    );
  }
  if (!flags.noSeed) {
    plan.push(
      `upsert ${CATALOG.length * STORES.length} demo products ("${DEMO_PREFIX}*") with ~${HISTORY_DAYS} days of price history`,
      `create user ${DEMO_EMAIL} if missing, then set its Auto-Broker settings and shipping address`,
      `replace its cart (${CART.length} items) and orders (${ORDERS.length})`
    );
  }
  return plan;
}

async function findDemoUserId(): Promise<string | undefined> {
  const row = await db.query.user.findFirst({
    columns: { id: true },
    where: { email: DEMO_EMAIL },
  });
  return row?.id;
}

async function ensureDemoUser(): Promise<string> {
  const existing = await findDemoUserId();
  if (existing) {
    return existing;
  }

  const { user: created } = await auth.api.signUpEmail({
    body: { name: DEMO_NAME, email: DEMO_EMAIL, password: DEMO_PASSWORD },
  });
  return created.id;
}

// Dacă alți utilizatori au comenzi pe produse demo, ștergerea eșuează (ON DELETE RESTRICT)
// și tranzacția se anulează fără să șteargă nimic.
async function resetDemoData() {
  const demoUserId = await findDemoUserId();

  return db.transaction(async (tx) => {
    // comenzile referă produsele cu RESTRICT, deci se șterg înaintea produselor
    const removedOrders = demoUserId
      ? await tx
          .delete(orders)
          .where(eq(orders.userId, demoUserId))
          .returning({ id: orders.id })
      : [];
    if (demoUserId) {
      // CASCADE: coș, sesiuni și conturi
      await tx.delete(user).where(eq(user.id, demoUserId));
    }
    // CASCADE: istoric de prețuri și intrări de coș
    const removedProducts = await tx
      .delete(products)
      .where(like(products.externalId, `${DEMO_PREFIX}%`))
      .returning({ id: products.id });

    return {
      user: demoUserId !== undefined,
      orders: removedOrders.length,
      products: removedProducts.length,
    };
  });
}

const excluded = (column: string) => sql.raw(`excluded."${column}"`);

async function seedDemoData(now: number) {
  const demoUserId = await ensureDemoUser();
  const rows = buildDemoRows(now);
  const historyByExternalId = new Map(rows.map((r) => [r.externalId, r.history]));

  return db.transaction(async (tx) => {
    const saved = await tx
      .insert(products)
      .values(rows.map((r) => r.product))
      .onConflictDoUpdate({
        target: [products.store, products.externalId],
        set: {
          ean: excluded("ean"),
          title: excluded("title"),
          searchText: excluded("search_text"),
          url: excluded("url"),
          imageUrl: excluded("image_url"),
          currency: excluded("currency"),
          currentPrice: excluded("current_price"),
          inStock: excluded("in_stock"),
          lastCheckedAt: excluded("last_checked_at"),
          updatedAt: excluded("updated_at"),
        },
      })
      .returning({ id: products.id, externalId: products.externalId });

    const idByExternalId = new Map(saved.map((p) => [p.externalId, p.id]));
    const productId = (externalId: string): string => {
      const id = idByExternalId.get(externalId);
      if (!id) {
        throw new Error(`Unknown demo product ${externalId}`);
      }
      return id;
    };

    await tx.delete(priceHistory).where(
      inArray(
        priceHistory.productId,
        saved.map((p) => p.id)
      )
    );
    const historyRows = saved.flatMap((p) =>
      (historyByExternalId.get(p.externalId) ?? []).map((point) => ({
        productId: p.id,
        price: point.price,
        inStock: point.inStock,
        source: "crawler" as const,
        recordedAt: point.recordedAt,
      }))
    );
    for (const part of chunk(historyRows, INSERT_CHUNK)) {
      await tx.insert(priceHistory).values(part);
    }

    await tx
      .update(user)
      .set({
        brokerEnabled: true,
        brokerMaxOrderValue: 300_000,
        brokerMonthlyBudget: 1_000_000,
        brokerPaymentMethodRef: null,
        shippingAddress: SHIPPING_ADDRESS,
      })
      .where(eq(user.id, demoUserId));

    await tx.delete(orders).where(eq(orders.userId, demoUserId));
    await tx.delete(cartItems).where(eq(cartItems.userId, demoUserId));

    const cartRows = CART.map((item) => ({
      userId: demoUserId,
      productId: productId(item.externalId),
      quantity: item.quantity,
      targetPrice: item.targetPrice,
      autoBuyEnabled: item.autoBuyEnabled,
    }));
    await tx.insert(cartItems).values(cartRows);

    const orderRows = ORDERS.map((order, index) => {
      const history = historyByExternalId.get(order.externalId) ?? [];
      const currentPrice = history.at(-1)?.price ?? 0;
      const purchasedAt = new Date(now - order.daysAgo * DAY_MS);
      const unitPrice = priceAt(history, purchasedAt);
      if (unitPrice <= currentPrice) {
        throw new Error(
          `Demo order for ${order.externalId} must have been bought above the current price`
        );
      }

      return {
        userId: demoUserId,
        productId: productId(order.externalId),
        quantity: order.quantity,
        unitPrice,
        currency: "RON",
        status: order.status,
        source: order.source,
        externalOrderId: `DEMO-ORDER-${String(index + 1).padStart(4, "0")}`,
        purchasedAt,
        protectionStatus: "monitoring" as const,
        protectionExpiresAt: new Date(
          purchasedAt.getTime() + PROTECTION_DAYS * DAY_MS
        ),
        createdAt: purchasedAt,
      };
    });
    await tx.insert(orders).values(orderRows);

    return {
      products: saved.length,
      outOfStock: rows.filter((r) => !r.product.inStock).length,
      pricePoints: historyRows.length,
      cartItems: cartRows.length,
      orders: orderRows.length,
    };
  });
}

async function main() {
  console.log(`Target database host: ${targetHost()}`);
  const flags = parseFlags(process.argv.slice(2));

  if (ENV.NODE_ENV === "production") {
    throw new Error("Refusing to run the demo seed with NODE_ENV=production.");
  }

  if (!flags.yes) {
    console.log("Dry run, nothing was changed. This run would:");
    for (const step of describePlan(flags)) {
      console.log(`  - ${step}`);
    }
    console.log("Re-run with --yes to apply.");
    process.exitCode = 1;
    return;
  }

  if (flags.reset) {
    const removed = await resetDemoData();
    console.log(
      `Reset: removed ${removed.products} products, ${removed.orders} orders, demo user ${removed.user ? "deleted" : "not found"}.`
    );
  }
  if (flags.noSeed) {
    return;
  }

  const summary = await seedDemoData(Date.now());
  console.log("Seed complete:");
  console.log(
    `  products: ${summary.products} (${summary.outOfStock} out of stock)`
  );
  console.log(`  price points: ${summary.pricePoints}`);
  console.log(`  cart items: ${summary.cartItems}`);
  console.log(`  orders: ${summary.orders}`);
  console.log(
    `Demo login: ${DEMO_EMAIL} (password: see DEMO_PASSWORD in seed.ts)`
  );
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Seed failed.");
    process.exitCode = 1;
  } finally {
    await db.$client.end();
  }
}
