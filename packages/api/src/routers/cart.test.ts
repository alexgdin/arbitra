import { describe, expect, test } from "bun:test";

import type { Session } from "@my-better-t-app/auth";
import type { Database } from "@my-better-t-app/db";

import { t } from "../index";
import type { CatalogRow } from "../lib/catalog";
import { fakeCatalogDb, perStore, single } from "../test-support/catalog-db";
import { cartRouter } from "./cart";

const createCaller = t.createCallerFactory(cartRouter);
const session = { user: { id: "user-1" } } as unknown as Session;

const CEL = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ALTEX = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const EMAG = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OTHER = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function row(id: string, overrides: Partial<CatalogRow> = {}): CatalogRow {
  return {
    id,
    store: "emag",
    ean: null,
    mpn: null,
    title: `Produs ${id.slice(0, 1)}`,
    url: `https://www.emag.ro/${id}`,
    imageUrl: null,
    currency: "RON",
    currentPrice: 10_000,
    inStock: true,
    lastCheckedAt: null,
    ...overrides,
  };
}

describe("cart.optimize", () => {
  // Magazinul 1 are doar EAN, magazinul 2 EAN și cod de model, magazinul 3 doar cod de model (cel mai ieftin).
  function bridgeRows() {
    return {
      cel: row(CEL, { store: "pcgarage", ean: "E", currentPrice: 12_000 }),
      altex: row(ALTEX, {
        store: "altex",
        ean: "E",
        mpn: "MMMM11",
        currentPrice: 11_000,
      }),
      emag: row(EMAG, {
        store: "emag",
        mpn: "MMMM11",
        currentPrice: 9000,
      }),
    };
  }

  test("offers the store that is linked to the product only through a bridge row", async () => {
    const { cel, altex, emag } = bridgeRows();
    // cerere, runda 1 (același EAN), runda 2 (codul de model găsit prin rândul-punte)
    const { db, queries } = fakeCatalogDb([
      single([cel]),
      perStore([altex]),
      perStore([emag]),
    ]);

    const result = await createCaller({ session, db }).optimize({
      items: [{ productId: CEL, quantity: 1 }],
    });

    // cererea, apoi câte o interogare pe magazin la fiecare dintre cele două runde
    expect(queries()).toBe(1 + 3 + 3);
    expect(result.plan.map((plan) => plan.store)).toEqual(["emag"]);
    expect(result.plan[0]?.lines[0]).toMatchObject({
      productId: CEL,
      unitPrice: 9000,
    });
    expect(result.singleStoreOptions.map((option) => option.store).sort()).toEqual([
      "altex",
      "emag",
      "pcgarage",
    ]);
    expect(result.unavailable).toEqual([]);
  });

  test("uses a bridge row that is out of stock to link two offers, without offering it", async () => {
    const { cel, altex, emag } = bridgeRows();
    const soldOut = { ...altex, inStock: false };
    const { db } = fakeCatalogDb([
      single([cel]),
      perStore([soldOut]),
      perStore([emag]),
    ]);

    const result = await createCaller({ session, db }).optimize({
      items: [{ productId: CEL, quantity: 1 }],
    });

    expect(result.plan.map((plan) => plan.store)).toEqual(["emag"]);
    expect(result.singleStoreOptions.map((option) => option.store).sort()).toEqual([
      "emag",
      "pcgarage",
    ]);
  });

  test("does not spend a second round when the first one finds no new identifiers", async () => {
    const first = row(CEL, { store: "pcgarage", ean: "E", currentPrice: 12_000 });
    const second = row(ALTEX, { store: "altex", ean: "E", currentPrice: 11_000 });
    const { db, queries } = fakeCatalogDb([
      single([first]),
      perStore([first, second]),
      perStore([]),
    ]);

    const result = await createCaller({ session, db }).optimize({
      items: [{ productId: CEL, quantity: 2 }],
    });

    expect(queries()).toBe(1 + 3);
    expect(result.plan.map((plan) => plan.store)).toEqual(["altex"]);
    expect(result.plan[0]?.lines[0]).toMatchObject({
      quantity: 2,
      unitPrice: 11_000,
    });
  });

  test("keeps products without identifiers on their own store", async () => {
    const solo = row(OTHER, { store: "altex", currentPrice: 7000 });
    const { db, queries } = fakeCatalogDb([single([solo])]);

    const result = await createCaller({ session, db }).optimize({
      items: [{ productId: OTHER, quantity: 1 }],
    });

    expect(queries()).toBe(1);
    expect(result.plan.map((plan) => plan.store)).toEqual(["altex"]);
  });

  test("does not offer a forged price", async () => {
    const real = row(CEL, { store: "pcgarage", ean: "E", currentPrice: 12_000 });
    const fake = row(ALTEX, { store: "altex", ean: "E", currentPrice: 1 });
    const emag = row(EMAG, { store: "emag", ean: "E", currentPrice: 12_500 });
    const { db } = fakeCatalogDb([single([real]), perStore([real, fake, emag])]);

    const result = await createCaller({ session, db }).optimize({
      items: [{ productId: CEL, quantity: 1 }],
    });

    expect(result.plan.map((plan) => plan.store)).toEqual(["pcgarage"]);
    expect(result.plan[0]?.lines[0]?.unitPrice).toBe(12_000);
    expect(result.singleStoreOptions.map((option) => option.store).sort()).toEqual([
      "emag",
      "pcgarage",
    ]);
  });

  test("rejects a product that does not exist", async () => {
    const { db } = fakeCatalogDb([single([])]);

    await expect(
      createCaller({ session, db }).optimize({
        items: [{ productId: CEL, quantity: 1 }],
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("cart.list", () => {
  test("returns the model code of each item next to its ean", async () => {
    let selected: Record<string, unknown> = {};
    const db = {
      select: (columns: Record<string, unknown>) => {
        selected = columns;
        return {
          from: () => ({
            innerJoin: () => ({ where: () => Promise.resolve([]) }),
          }),
        };
      },
    } as unknown as Database;

    await createCaller({ session, db }).list();

    expect(Object.keys(selected)).toContain("mpn");
    expect(Object.keys(selected)).toContain("ean");
  });
});
