import { describe, expect, test } from "bun:test";

import { t } from "../index";
import type { CatalogRow } from "../lib/catalog";
import {
  fakeCatalogDb,
  perStore,
  single,
  sqlOf,
} from "../test-support/catalog-db";
import { catalogRouter } from "./catalog";

const createCaller = t.createCallerFactory(catalogRouter);

function row(id: string, overrides: Partial<CatalogRow> = {}): CatalogRow {
  return {
    id,
    store: "emag",
    ean: null,
    mpn: null,
    title: `Produs ${id}`,
    url: `https://www.emag.ro/${id}`,
    imageUrl: null,
    currency: "RON",
    currentPrice: 10_000,
    inStock: true,
    lastCheckedAt: null,
    ...overrides,
  };
}

describe("catalog.search", () => {
  test("returns nothing, without a query, when the text has no searchable word", async () => {
    for (const q of ["---", "%%", "_", "/ , !", "💾💾", "—"]) {
      const { db, queries } = fakeCatalogDb([perStore([row("a")])]);

      const result = await createCaller({ session: null, db }).search({ q });

      expect(result).toEqual({ items: [], query: q });
      expect(queries()).toBe(0);
    }
  });

  test("browses the most recent products only for an empty text", async () => {
    for (const q of [undefined, "", "   "]) {
      const { db, wheres } = fakeCatalogDb([perStore([row("a")])]);

      const result = await createCaller({ session: null, db }).search(
        q === undefined ? {} : { q }
      );

      // fără cuvinte, singura condiție e magazinul, câte o interogare pe magazin
      expect(wheres.map((where) => sqlOf(where).params)).toEqual([
        ["emag"],
        ["pcgarage"],
        ["altex"],
      ]);
      expect(result.items.map((item) => item.representativeProductId)).toEqual(["a"]);
      expect(result.query).toBe("");
    }
  });

  test("searches every word of the text", async () => {
    const { db, wheres } = fakeCatalogDb([perStore([row("a", { ean: "E1" })])]);

    const result = await createCaller({ session: null, db }).search({
      q: "Căști Sony",
    });

    expect(sqlOf(wheres[0]).params).toContain("%casti%");
    expect(sqlOf(wheres[0]).params).toContain("%sony%");
    expect(result.items).toHaveLength(1);
  });

  describe("candidates per store", () => {
    test("runs one query per supported store, each limited to 60 rows", async () => {
      const { db, wheres, limits } = fakeCatalogDb([perStore([])]);

      await createCaller({ session: null, db }).search({ q: "ssd" });

      expect(wheres).toHaveLength(3);
      for (const where of wheres) {
        // cuvântul se caută în textul indexat și în titlu
        expect(sqlOf(where).params.filter((param) => param === "%ssd%")).toHaveLength(2);
      }
      expect(wheres.map((where) => sqlOf(where).params.at(-1))).toEqual([
        "emag",
        "pcgarage",
        "altex",
      ]);
      expect(limits).toEqual([60, 60, 60]);
    });

    test("orders the candidates of each store by the most recent check, then by id", async () => {
      const { db, orders } = fakeCatalogDb([perStore([])]);

      await createCaller({ session: null, db }).search({ q: "ssd" });

      expect(orders).toHaveLength(3);
      for (const order of orders) {
        expect(order.map((clause) => sqlOf(clause).sql)).toEqual([
          '"products"."last_checked_at" desc nulls last',
          '"products"."id" asc',
        ]);
      }
    });

    test("does not ask for a store that is not supported", async () => {
      const { db, wheres } = fakeCatalogDb([perStore([row("a")])]);

      await createCaller({ session: null, db }).search({ q: "produs" });

      const stores = wheres.map((where) => sqlOf(where).params.at(-1));
      expect(stores).toEqual(["emag", "pcgarage", "altex"]);
    });

    test("groups the candidates of the three stores into one item", async () => {
      const rows = [
        row("e", { store: "emag", ean: "E1", currentPrice: 9000 }),
        row("p", { store: "pcgarage", ean: "E1", currentPrice: 9500 }),
        row("a", { store: "altex", ean: "E1", currentPrice: 9900 }),
      ];
      const { db } = fakeCatalogDb([perStore(rows), perStore([])]);

      const result = await createCaller({ session: null, db }).search({
        q: "produs",
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.offers.map((offer) => offer.productId)).toEqual([
        "e",
        "p",
        "a",
      ]);
    });
  });

  describe("gtin in the text", () => {
    function paramsOfSearch(q: string) {
      const { db, wheres } = fakeCatalogDb([perStore([])]);
      return createCaller({ session: null, db })
        .search({ q })
        .then(() => sqlOf(wheres[0]).params);
    }

    test("searches the canonical form of a GTIN that was typed with leading zeros", async () => {
      const params = await paramsOfSearch("0718037904610");

      expect(params).toContain("%718037904610%");
      expect(params).not.toContain("%0718037904610%");
    });

    test("searches the same code for every padding of the same GTIN", async () => {
      expect(await paramsOfSearch("00718037904610")).toEqual(
        await paramsOfSearch("718037904610")
      );
      expect(await paramsOfSearch("0718037904610")).toEqual(
        await paramsOfSearch("718037904610")
      );
    });

    test("searches a GTIN once when the text has two spellings of it", async () => {
      const params = await paramsOfSearch("718037904610 0718037904610");

      expect(params.filter((param) => param === "%718037904610%")).toHaveLength(2);
      expect(params.filter((param) => String(param).includes("0718"))).toEqual([]);
    });

    test("keeps a GTIN that has no leading zeros, and the other words of the text", async () => {
      const params = await paramsOfSearch("ssd 4006381333931");

      expect(params).toContain("%ssd%");
      expect(params).toContain("%4006381333931%");
    });

    test("keeps a number whose check digit is wrong exactly as typed", async () => {
      const params = await paramsOfSearch("0718037904611");

      expect(params).toContain("%0718037904611%");
    });

    test("finds a product that stores the canonical GTIN when it is searched with a leading zero", async () => {
      const stored = row("a", { ean: "718037904610", store: "altex" });
      const { db } = fakeCatalogDb([perStore([stored]), perStore([])]);

      const result = await createCaller({ session: null, db }).search({
        q: "0718037904610",
      });

      expect(result.items.map((item) => item.key)).toEqual(["718037904610"]);
    });
  });

  test("finds a product by the exact model code the store shows, suffix included", async () => {
    const pcgarage = row("pcg", {
      store: "pcgarage",
      mpn: "WDS100T4G0E",
      title: "SSD WD Blue SN5000, 1TB",
    });
    const emag = row("emag", {
      store: "emag",
      mpn: "WDS100T4G0E",
      title: "SSD WD Blue 1TB",
      currentPrice: 8000,
    });
    const { db, wheres } = fakeCatalogDb([perStore([pcgarage]), perStore([emag])]);

    const result = await createCaller({ session: null, db }).search({
      q: "WDS100T4G0E-00CPS0",
    });

    // cele două părți ale codului se caută ca doi termeni, ca în textul indexat
    expect(sqlOf(wheres[0]).params).toContain("%wds100t4g0e%");
    expect(sqlOf(wheres[0]).params).toContain("%00cps0%");
    // oferta eMAG intră prin codul de model comun, chiar dacă titlul ei nu s-a potrivit
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.offers.map((offer) => offer.productId)).toEqual([
      "emag",
      "pcg",
    ]);
  });

  test("caps the text at 80 characters", async () => {
    const { db } = fakeCatalogDb([]);

    await expect(
      createCaller({ session: null, db }).search({ q: "a".repeat(81) })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  test("returns at most the requested number of items", async () => {
    const rows = Array.from({ length: 5 }, (_, index) =>
      row(`p${index}`, { ean: `E${index}` })
    );
    const { db } = fakeCatalogDb([perStore(rows)]);

    const result = await createCaller({ session: null, db }).search({
      q: "produs",
      limit: 2,
    });

    expect(result.items).toHaveLength(2);
  });
});

describe("catalog.compare and catalog.lookup", () => {
  const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";

  test("finds the item of a product that is not its store's cheapest offer", async () => {
    const pricey = row(PRODUCT_ID, { ean: "E1", currentPrice: 12_000 });
    const cheap = row("cheap", { ean: "E1", currentPrice: 9000 });
    const altex = row("altex", { store: "altex", ean: "E1", currentPrice: 10_000 });
    const { db } = fakeCatalogDb([single([pricey]), perStore([pricey, cheap, altex])]);

    const item = await createCaller({ session: null, db }).compare({
      productId: PRODUCT_ID,
    });

    // un singur rând per magazin: eMAG apare cu oferta mai ieftină, nu cu produsul cerut
    expect(item.offers.map((offer) => offer.productId)).toEqual(["cheap", "altex"]);
    expect(item.key).toBe("E1");
  });

  test("rejects an unknown product", async () => {
    const { db } = fakeCatalogDb([single([])]);

    await expect(
      createCaller({ session: null, db }).compare({ productId: PRODUCT_ID })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("does not return the offer of a legacy store, nor a forged price", async () => {
    const real = row(PRODUCT_ID, { ean: "E1", currentPrice: 10_000 });
    const altex = row("altex", { store: "altex", ean: "E1", currentPrice: 10_500 });
    const pcgarage = row("pcg", { store: "pcgarage", ean: "E1", currentPrice: 1 });
    const { db } = fakeCatalogDb([
      single([real]),
      perStore([real, altex, pcgarage]),
    ]);

    const item = await createCaller({ session: null, db }).compare({
      productId: PRODUCT_ID,
    });

    expect(item.offers.map((offer) => offer.productId)).toEqual([PRODUCT_ID, "altex"]);
    expect(item.bestOffer?.price).toBe(10_000);
  });

  test("shows only the supported stores for a product of a legacy store", async () => {
    const legacy = row(PRODUCT_ID, { store: "other", ean: "E1", currentPrice: 7000 });
    const altex = row("altex", { store: "altex", ean: "E1", currentPrice: 10_500 });
    const { db } = fakeCatalogDb([single([legacy]), perStore([altex])]);

    const item = await createCaller({ session: null, db }).compare({
      productId: PRODUCT_ID,
    });

    expect(item.offers.map((offer) => offer.productId)).toEqual(["altex"]);
  });

  test("looks a product up by store and external id, or returns null", async () => {
    const found = fakeCatalogDb([
      single([row("a", { ean: "E1" })]),
      perStore([row("a", { ean: "E1" })]),
    ]);
    const missing = fakeCatalogDb([single([])]);

    const item = await createCaller({ session: null, db: found.db }).lookup({
      store: "emag",
      externalId: "ABC123",
    });
    const none = await createCaller({ session: null, db: missing.db }).lookup({
      store: "emag",
      externalId: "ABC123",
    });

    expect(item?.offers.map((offer) => offer.productId)).toEqual(["a"]);
    expect(none).toBeNull();
  });

  test("rejects control characters in the store and the external id before querying", async () => {
    const { db, queries } = fakeCatalogDb([single([])]);
    const caller = createCaller({ session: null, db });

    for (const bad of ["a\u0000b", "a\nb", "a\tb", "\u001f", "a\u007fb"]) {
      await expect(
        caller.lookup({ store: "emag", externalId: bad })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await expect(
        caller.lookup({ store: bad, externalId: "ABC123" })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    expect(queries()).toBe(0);
  });

  test("accepts printable text, spaces and non-ASCII letters in the external id", async () => {
    const { db } = fakeCatalogDb([single([])]);

    expect(
      await createCaller({ session: null, db }).lookup({
        store: "emag",
        externalId: "Ștefan 12/ABC-1",
      })
    ).toBeNull();
  });
});
