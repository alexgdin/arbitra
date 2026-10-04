import { describe, expect, test } from "bun:test";

import {
  buildCatalogItem,
  connectedComponents,
  dropPriceOutliers,
  groupCatalogItems,
  rankCatalogItems,
  sharesIdentifier,
  trustedRows,
} from "./catalog";
import type { CatalogItem, CatalogRow } from "./catalog";

const NOW = new Date("2026-04-10T12:00:00.000Z");

function minutesAgo(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * 60_000);
}

function row(id: string, overrides: Partial<CatalogRow> = {}): CatalogRow {
  return {
    id,
    store: "emag",
    ean: "4548736132580",
    mpn: null,
    title: `Produs ${id}`,
    url: `https://shop.example/${id}`,
    imageUrl: null,
    currency: "RON",
    currentPrice: 10_000,
    inStock: true,
    lastCheckedAt: minutesAgo(10),
    ...overrides,
  };
}

function single(rows: CatalogRow[]): CatalogItem {
  const [item, ...rest] = groupCatalogItems(rows);
  if (!item || rest.length > 0) {
    throw new Error("Expected exactly one item");
  }
  return item;
}

describe("groupCatalogItems", () => {
  test("groups rows that share an ean and keeps rows without ean apart", () => {
    const items = groupCatalogItems([
      row("a1", { store: "emag", ean: "111", currentPrice: 9000 }),
      row("a2", { store: "altex", ean: "111", currentPrice: 10_000 }),
      row("b1", { store: "emag", ean: "222" }),
      row("c1", { ean: null }),
      row("c2", { ean: null }),
    ]);

    expect(items).toHaveLength(4);
    const byKey = new Map(items.map((item) => [item.key, item]));
    expect(byKey.get("111")?.offers.map((o) => o.productId)).toEqual([
      "a1",
      "a2",
    ]);
    expect(byKey.get("222")?.offers).toHaveLength(1);
    expect(byKey.get("c1")?.ean).toBeNull();
    expect(byKey.get("c2")?.offers).toHaveLength(1);
  });

  test("uses the ean as key when present, otherwise the product id", () => {
    expect(single([row("a1", { ean: "111" })]).key).toBe("111");
    expect(single([row("a1", { ean: null })]).key).toBe("a1");
    expect(single([row("a1", { ean: "" })]).key).toBe("a1");
    expect(single([row("a1", { ean: "" })]).ean).toBeNull();
  });

  test("sorts in-stock priced offers by price, then the rest", () => {
    const item = single([
      row("out", { store: "altex", currentPrice: 5000, inStock: false }),
      row("high", { store: "emag", currentPrice: 12_000 }),
      row("low", { store: "pcgarage", currentPrice: 9000 }),
    ]);

    expect(item.offers.map((o) => o.productId)).toEqual(["low", "high", "out"]);
  });

  test("puts an offer without a price after an unavailable one that has a price", () => {
    const item = single([
      row("none", { store: "pcgarage", currentPrice: null }),
      row("out", { store: "altex", currentPrice: 5000, inStock: false }),
      row("high", { store: "emag", currentPrice: 12_000 }),
    ]);

    expect(item.offers.map((o) => o.productId)).toEqual(["high", "out", "none"]);
  });

  test("keeps price and stock on every offer, with dates as ISO strings", () => {
    const item = single([
      row("a1", {
        store: "emag",
        currentPrice: 12_999,
        lastCheckedAt: new Date("2026-04-10T11:30:00.000Z"),
      }),
      row("a2", { store: "altex", currentPrice: null, lastCheckedAt: null }),
    ]);

    expect(item.offers).toEqual([
      {
        productId: "a1",
        store: "emag",
        price: 12_999,
        inStock: true,
        url: "https://shop.example/a1",
        lastCheckedAt: "2026-04-10T11:30:00.000Z",
      },
      {
        productId: "a2",
        store: "altex",
        price: null,
        inStock: true,
        url: "https://shop.example/a2",
        lastCheckedAt: null,
      },
    ]);
  });

  test("picks the cheapest in-stock offer as representative and best offer", () => {
    const item = single([
      row("a1", { store: "emag", title: "Titlu eMAG", currentPrice: 13_000 }),
      row("a2", {
        store: "pcgarage",
        title: "Titlu PC Garage",
        currentPrice: 11_000,
      }),
      row("a3", {
        store: "altex",
        title: "Titlu Altex",
        currentPrice: 9000,
        inStock: false,
      }),
    ]);

    expect(item.representativeProductId).toBe("a2");
    expect(item.title).toBe("Titlu PC Garage");
    expect(item.bestOffer).toEqual({
      productId: "a2",
      store: "pcgarage",
      price: 11_000,
    });
  });

  test("falls back to the first offer when nothing is in stock with a price", () => {
    const item = single([
      row("a1", { store: "emag", currentPrice: null }),
      row("a2", { store: "altex", currentPrice: 8000, inStock: false }),
    ]);

    expect(item.bestOffer).toBeNull();
    expect(item.maxPrice).toBeNull();
    expect(item.savings).toBe(0);
    expect(item.lastCheckedAt).toBeNull();
    expect(item.representativeProductId).toBe("a2");
    expect(item.offers.map((o) => o.productId)).toEqual(["a2", "a1"]);
  });

  test("computes max price and savings from in-stock priced offers only", () => {
    const item = single([
      row("a1", { store: "emag", currentPrice: 13_499 }),
      row("a2", { store: "pcgarage", currentPrice: 12_999 }),
      row("a3", { store: "altex", currentPrice: 99_999, inStock: false }),
    ]);

    expect(item.maxPrice).toBe(13_499);
    expect(item.savings).toBe(500);
  });

  test("has no savings with fewer than two priced in-stock offers", () => {
    const item = single([
      row("a1", { store: "emag", currentPrice: 13_499 }),
      row("a2", { store: "pcgarage", currentPrice: 9000, inStock: false }),
    ]);

    expect(item.maxPrice).toBe(13_499);
    expect(item.bestOffer?.price).toBe(13_499);
    expect(item.savings).toBe(0);
  });

  test("reports the oldest check among in-stock priced offers", () => {
    const item = single([
      row("a1", { store: "emag", lastCheckedAt: minutesAgo(5) }),
      row("a2", { store: "pcgarage", lastCheckedAt: minutesAgo(180) }),
      row("a3", {
        store: "altex",
        inStock: false,
        lastCheckedAt: minutesAgo(5000),
      }),
      row("a4", { store: "other", currentPrice: null, lastCheckedAt: null }),
    ]);

    expect(item.lastCheckedAt).toBe(minutesAgo(180).toISOString());
  });

  test("ignores in-stock priced offers that were never checked", () => {
    const item = single([
      row("a1", { store: "emag", lastCheckedAt: null }),
      row("a2", { store: "pcgarage", lastCheckedAt: minutesAgo(30) }),
    ]);

    expect(item.lastCheckedAt).toBe(minutesAgo(30).toISOString());
  });

  test("takes the image from the representative, else from any offer", () => {
    const withOwn = single([
      row("a1", { store: "emag", currentPrice: 9000, imageUrl: "https://i/1" }),
      row("a2", { store: "altex", currentPrice: 8000, imageUrl: "https://i/2" }),
    ]);
    const borrowed = single([
      row("a1", { store: "emag", currentPrice: 9000, imageUrl: "https://i/1" }),
      row("a2", { store: "altex", currentPrice: 8000, imageUrl: null }),
    ]);
    const none = single([row("a1")]);

    expect(withOwn.imageUrl).toBe("https://i/2");
    expect(borrowed.imageUrl).toBe("https://i/1");
    expect(none.imageUrl).toBeNull();
  });

  test("lists a product only once when it is given several times", () => {
    const item = single([
      row("a1", { store: "emag" }),
      row("a2", { store: "altex", currentPrice: 9000 }),
      row("a1", { store: "emag" }),
    ]);

    expect(item.offers.map((o) => o.productId)).toEqual(["a2", "a1"]);
  });

  test("does not depend on the order of the rows", () => {
    const rows = [
      row("a1", { store: "emag", ean: "111", currentPrice: 9000 }),
      row("a2", { store: "altex", ean: "111", currentPrice: 9000 }),
      row("a3", { store: "pcgarage", ean: "111", currentPrice: null }),
      row("b1", { ean: "222", title: "Alt produs" }),
      row("c1", { ean: null, title: "Alt produs" }),
    ];

    const forward = groupCatalogItems(rows);
    const backward = groupCatalogItems([...rows].reverse());

    expect(backward).toEqual(forward);
  });

  test("orders items by title, then key", () => {
    const items = groupCatalogItems([
      row("z", { ean: "333", title: "Zebră" }),
      row("b2", { ean: "222", title: "Aspirator" }),
      row("b1", { ean: "111", title: "Aspirator" }),
    ]);

    expect(items.map((item) => item.key)).toEqual(["111", "222", "333"]);
  });

  test("returns nothing for no rows", () => {
    expect(groupCatalogItems([])).toEqual([]);
  });
});

// Aceleași produse ca în paginile reale: eMAG expune doar mpn, Altex un GTIN real, PC Garage un mpn cu sufix.
const MPN_2TB = "WDS200T4G0E";
const MPN_1TB = "WDS100T4G0E";
const GTIN_ALTEX = "718037904610";

function ssdRows(): CatalogRow[] {
  return [
    row("emag-2tb", {
      store: "emag",
      ean: null,
      mpn: MPN_2TB,
      title: "SSD WD Blue SN5000, 2TB, M.2",
      currentPrice: 149_077,
    }),
    row("altex-2tb", {
      store: "altex",
      ean: GTIN_ALTEX,
      mpn: MPN_2TB,
      title: "SSD intern WD Blue SN5000, 2TB, NVMe, WDS200T4G0E",
      currentPrice: 155_999,
    }),
    row("pcgarage-1tb", {
      store: "pcgarage",
      ean: null,
      mpn: MPN_1TB,
      title: "SSD WD Blue SN5000, 1TB",
      currentPrice: 89_900,
    }),
  ];
}

// Amestecare deterministă (LCG), ca testele să nu depindă de Math.random.
function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const result = [...items];
  let state = seed;
  for (let i = result.length - 1; i > 0; i--) {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    const j = state % (i + 1);
    [result[i], result[j]] = [result[j] as T, result[i] as T];
  }
  return result;
}

describe("groupCatalogItems with several identifiers", () => {
  test("joins an mpn-only row and a GTIN row that share the model code", () => {
    const items = groupCatalogItems(ssdRows());

    expect(items).toHaveLength(2);
    const twoTb = items.find((item) =>
      item.offers.some((offer) => offer.productId === "emag-2tb")
    );
    expect(twoTb?.offers.map((offer) => offer.productId)).toEqual([
      "emag-2tb",
      "altex-2tb",
    ]);
    expect(twoTb?.bestOffer).toEqual({
      productId: "emag-2tb",
      store: "emag",
      price: 149_077,
    });
    expect(twoTb?.savings).toBe(6922);
  });

  test("keeps a different model code in its own group", () => {
    const items = groupCatalogItems(ssdRows());
    const oneTb = items.find(
      (item) => item.offers[0]?.productId === "pcgarage-1tb"
    );

    expect(items).toHaveLength(2);
    expect(oneTb?.offers).toHaveLength(1);
    expect(oneTb?.key).toBe(`mpn:${MPN_1TB}`);
    expect(oneTb?.ean).toBeNull();
  });

  test("uses the ean of the group as key and ean even when the representative has none", () => {
    const [twoTb] = groupCatalogItems(ssdRows().slice(0, 2));

    // reprezentantul este oferta eMAG, cea mai ieftină, care nu are EAN
    expect(twoTb?.representativeProductId).toBe("emag-2tb");
    expect(twoTb?.key).toBe(GTIN_ALTEX);
    expect(twoTb?.ean).toBe(GTIN_ALTEX);
  });

  test("adds a third row that shares only the ean", () => {
    const items = groupCatalogItems([
      ...ssdRows(),
      row("other-2tb", {
        store: "pcgarage",
        ean: GTIN_ALTEX,
        mpn: null,
        title: "SSD WD Blue 2TB",
        currentPrice: 150_000,
      }),
    ]);

    expect(items).toHaveLength(2);
    const twoTb = items.find((item) => item.key === GTIN_ALTEX);
    expect(twoTb?.offers.map((offer) => offer.productId).sort()).toEqual([
      "altex-2tb",
      "emag-2tb",
      "other-2tb",
    ]);
  });

  test("joins rows through a chain of shared identifiers", () => {
    const item = single([
      row("r1", { ean: "1111", mpn: null, store: "emag" }),
      row("r2", { ean: "1111", mpn: "AAAA111", store: "altex" }),
      row("r3", { ean: "2222", mpn: "AAAA111", store: "pcgarage" }),
      row("r4", { ean: "2222", mpn: null, store: "emag", currentPrice: 9000 }),
    ]);

    // r4 intră în grup prin r3, dar magazinul eMAG arată o singură ofertă: cea mai ieftină
    expect(item.offers.map((o) => o.productId).sort()).toEqual(["r2", "r3", "r4"]);
    expect(item.key).toBe("1111");
  });

  test("joins two groups that a later row connects", () => {
    const rows = [
      row("a", { ean: "1111", mpn: null, store: "emag" }),
      row("b", { ean: null, mpn: "BBBB222", store: "altex" }),
      row("bridge", { ean: "1111", mpn: "BBBB222", store: "pcgarage" }),
    ];

    expect(single(rows).offers).toHaveLength(3);
    expect(single([...rows].reverse()).offers).toHaveLength(3);
  });

  test("does not join rows that only share a null or empty identifier", () => {
    const items = groupCatalogItems([
      row("n1", { ean: null, mpn: null, store: "emag" }),
      row("n2", { ean: null, mpn: null, store: "altex" }),
      row("e1", { ean: "", mpn: "", store: "emag" }),
      row("e2", { ean: "", mpn: "", store: "altex" }),
    ]);

    expect(items).toHaveLength(4);
    expect(items.every((item) => item.offers.length === 1)).toBe(true);
  });

  test("keeps products without identifiers as singletons keyed by their id", () => {
    const items = groupCatalogItems([
      row("c1", { ean: null, mpn: null, title: "Cablu" }),
      row("c2", { ean: null, mpn: null, title: "Cablu" }),
    ]);

    expect(items.map((item) => item.key)).toEqual(["c1", "c2"]);
    expect(items.map((item) => item.ean)).toEqual([null, null]);
  });

  test("does not confuse an ean with an mpn of the same text", () => {
    const items = groupCatalogItems([
      row("x", { ean: "ABC12345", mpn: null }),
      row("y", { ean: null, mpn: "ABC12345" }),
    ]);

    expect(items).toHaveLength(2);
  });

  test("gives the same result for every order of the rows", () => {
    const rows = [
      ...ssdRows(),
      row("other-2tb", { store: "other", ean: GTIN_ALTEX, mpn: null }),
      row("bridge", { store: "emag", ean: "9999", mpn: MPN_1TB }),
      row("single-a", { ean: null, mpn: null, title: "Cablu A" }),
      row("single-b", { ean: null, mpn: null, title: "Cablu A" }),
    ];
    const expected = groupCatalogItems(rows);

    for (let seed = 1; seed <= 40; seed++) {
      expect(groupCatalogItems(seededShuffle(rows, seed))).toEqual(expected);
    }
  });

  test("counts a product once when it appears several times", () => {
    const rows = ssdRows();
    const items = groupCatalogItems([...rows, ...rows.slice(0, 2), ...rows]);
    const twoTb = items.find((item) => item.key === GTIN_ALTEX);

    expect(items).toHaveLength(2);
    expect(twoTb?.offers).toHaveLength(2);
  });

  test("reports the oldest check and ignores out-of-stock offers across identifiers", () => {
    const item = single([
      row("emag-2tb", {
        store: "emag",
        ean: null,
        mpn: MPN_2TB,
        lastCheckedAt: minutesAgo(5),
      }),
      row("altex-2tb", {
        store: "altex",
        ean: GTIN_ALTEX,
        mpn: MPN_2TB,
        lastCheckedAt: minutesAgo(90),
      }),
      row("other-2tb", {
        store: "pcgarage",
        ean: GTIN_ALTEX,
        mpn: null,
        inStock: false,
        currentPrice: 1000,
        lastCheckedAt: minutesAgo(9000),
      }),
    ]);

    expect(item.lastCheckedAt).toBe(minutesAgo(90).toISOString());
    expect(item.maxPrice).toBe(10_000);
    expect(item.offers.map((offer) => offer.productId)).toEqual([
      "altex-2tb",
      "emag-2tb",
      "other-2tb",
    ]);
  });

  describe("group key", () => {
    test("is the smallest ean of the group", () => {
      const rows = [
        row("a", { ean: "222", mpn: "KEY1234", store: "emag" }),
        row("b", { ean: "111", mpn: "KEY1234", store: "altex" }),
        row("c", { ean: null, mpn: "KEY1234", store: "pcgarage" }),
      ];

      expect(single(rows).key).toBe("111");
      expect(single([...rows].reverse()).key).toBe("111");
    });

    test("is mpn: plus the model code when no row has an ean", () => {
      const item = single([
        row("a", { ean: null, mpn: "KEY1234", store: "emag" }),
        row("b", { ean: "", mpn: "KEY1234", store: "altex" }),
      ]);

      expect(item.key).toBe("mpn:KEY1234");
      expect(item.ean).toBeNull();
    });

    test("is the representative product id without any identifier", () => {
      expect(single([row("solo", { ean: null, mpn: null })]).key).toBe("solo");
    });

    test("prefers the ean over the model code", () => {
      const item = single([
        row("a", { ean: "5555", mpn: "KEY1234", store: "emag" }),
        row("b", { ean: null, mpn: "KEY1234", store: "altex" }),
      ]);

      expect(item.key).toBe("5555");
    });
  });

  describe("item ean", () => {
    test("is the ean of the representative offer when it has one", () => {
      const item = single([
        row("a", {
          ean: "222",
          mpn: "KEY1234",
          store: "emag",
          currentPrice: 9000,
        }),
        row("b", {
          ean: "111",
          mpn: "KEY1234",
          store: "altex",
          currentPrice: 9500,
        }),
      ]);

      expect(item.representativeProductId).toBe("a");
      expect(item.ean).toBe("222");
      expect(item.key).toBe("111");
    });

    test("falls back to the smallest ean of the group", () => {
      const item = single([
        row("a", {
          ean: null,
          mpn: "KEY1234",
          store: "emag",
          currentPrice: 9000,
        }),
        row("b", {
          ean: "333",
          mpn: "KEY1234",
          store: "altex",
          currentPrice: 9500,
        }),
        row("c", {
          ean: "222",
          mpn: "KEY1234",
          store: "pcgarage",
          currentPrice: 9900,
        }),
      ]);

      expect(item.representativeProductId).toBe("a");
      expect(item.ean).toBe("222");
    });

    test("is null when nothing in the group has an ean", () => {
      const item = single([
        row("a", { ean: null, mpn: "KEY1234", store: "emag" }),
        row("b", { ean: null, mpn: "KEY1234", store: "altex" }),
      ]);

      expect(item.ean).toBeNull();
    });
  });
});

describe("sharesIdentifier", () => {
  test("is true for the same ean or the same model code", () => {
    expect(
      sharesIdentifier({ ean: "111", mpn: null }, { ean: "111", mpn: "X" })
    ).toBe(true);
    expect(
      sharesIdentifier(
        { ean: null, mpn: "AAAA111" },
        { ean: "9", mpn: "AAAA111" }
      )
    ).toBe(true);
    expect(
      sharesIdentifier(
        { ean: "111", mpn: "AAAA111" },
        { ean: "222", mpn: "AAAA111" }
      )
    ).toBe(true);
  });

  test("is false for different identifiers", () => {
    expect(
      sharesIdentifier(
        { ean: "111", mpn: "AAAA111" },
        { ean: "222", mpn: "BBBB222" }
      )
    ).toBe(false);
  });

  test("never matches missing or empty identifiers", () => {
    expect(
      sharesIdentifier({ ean: null, mpn: null }, { ean: null, mpn: null })
    ).toBe(false);
    expect(
      sharesIdentifier({ ean: "", mpn: "" }, { ean: "", mpn: "" })
    ).toBe(false);
    expect(
      sharesIdentifier({ ean: "111", mpn: null }, { ean: null, mpn: null })
    ).toBe(false);
  });

  test("does not compare an ean with a model code", () => {
    expect(
      sharesIdentifier(
        { ean: "ABC12345", mpn: null },
        { ean: null, mpn: "ABC12345" }
      )
    ).toBe(false);
  });

  test("is symmetric", () => {
    const a = { ean: null, mpn: "AAAA111" };
    const b = { ean: "111", mpn: "AAAA111" };

    expect(sharesIdentifier(a, b)).toBe(sharesIdentifier(b, a));
  });
});

describe("one offer per store", () => {
  function emagOffers(...rows: CatalogRow[]) {
    return single(rows.map((r) => ({ ...r, store: "emag" })));
  }

  test("keeps the cheapest in-stock priced offer of a store", () => {
    const item = single([
      row("e1", { store: "emag", currentPrice: 12_000 }),
      row("e2", { store: "emag", currentPrice: 9000 }),
      row("e3", { store: "emag", currentPrice: 15_000 }),
      row("a1", { store: "altex", currentPrice: 11_000 }),
    ]);

    expect(item.offers.map((o) => o.productId)).toEqual(["e2", "a1"]);
    expect(item.bestOffer).toEqual({
      productId: "e2",
      store: "emag",
      price: 9000,
    });
    expect(item.maxPrice).toBe(11_000);
    expect(item.savings).toBe(2000);
  });

  test("ignores a cheaper offer that is out of stock or has no price", () => {
    const item = emagOffers(
      row("e1", { currentPrice: 5000, inStock: false }),
      row("e2", { currentPrice: null }),
      row("e3", { currentPrice: 14_000 })
    );

    expect(item.offers.map((o) => o.productId)).toEqual(["e3"]);
  });

  test("breaks a price tie by the most recent check, then by product id", () => {
    const byCheck = emagOffers(
      row("a", { currentPrice: 9000, lastCheckedAt: minutesAgo(60) }),
      row("b", { currentPrice: 9000, lastCheckedAt: minutesAgo(5) }),
      row("c", { currentPrice: 9000, lastCheckedAt: null })
    );
    const byId = emagOffers(
      row("z", { currentPrice: 9000, lastCheckedAt: minutesAgo(5) }),
      row("m", { currentPrice: 9000, lastCheckedAt: minutesAgo(5) }),
      row("q", { currentPrice: 9000, lastCheckedAt: minutesAgo(5) })
    );

    expect(byCheck.offers.map((o) => o.productId)).toEqual(["b"]);
    expect(byId.offers.map((o) => o.productId)).toEqual(["m"]);
  });

  test("falls back to the most recently checked offer when nothing is in stock with a price", () => {
    const item = emagOffers(
      row("a", {
        currentPrice: 5000,
        inStock: false,
        lastCheckedAt: minutesAgo(600),
      }),
      row("b", {
        currentPrice: 9000,
        inStock: false,
        lastCheckedAt: minutesAgo(20),
      }),
      row("c", { currentPrice: null, lastCheckedAt: minutesAgo(900) })
    );

    // cea mai nouă verificare câștigă, nu cel mai mic preț
    expect(item.offers.map((o) => o.productId)).toEqual(["b"]);
    expect(item.bestOffer).toBeNull();
  });

  test("breaks a tie between unavailable offers by product id", () => {
    const item = emagOffers(
      row("z", { currentPrice: null, lastCheckedAt: minutesAgo(5) }),
      row("k", {
        currentPrice: 7000,
        inStock: false,
        lastCheckedAt: minutesAgo(5),
      })
    );

    expect(item.offers.map((o) => o.productId)).toEqual(["k"]);
  });

  test("ranks an unchecked unavailable offer after a checked one", () => {
    const item = emagOffers(
      row("a", { currentPrice: null, lastCheckedAt: null }),
      row("b", { currentPrice: null, lastCheckedAt: minutesAgo(10_000) })
    );

    expect(item.offers.map((o) => o.productId)).toEqual(["b"]);
  });

  test("prefers an in-stock offer over a more recent unavailable one", () => {
    const item = emagOffers(
      row("old", { currentPrice: 9000, lastCheckedAt: minutesAgo(5000) }),
      row("new", {
        currentPrice: 8000,
        inStock: false,
        lastCheckedAt: minutesAgo(1),
      })
    );

    expect(item.offers.map((o) => o.productId)).toEqual(["old"]);
  });

  test("returns one offer per store however many rows each store has", () => {
    const rows = ["emag", "altex", "pcgarage"].flatMap((store) =>
      Array.from({ length: 50 }, (_, index) =>
        row(`${store}-${String(index).padStart(2, "0")}`, {
          store,
          currentPrice: 10_000 + index,
        })
      )
    );
    const item = single(rows);

    expect(item.offers).toHaveLength(3);
    expect(item.offers.map((o) => o.productId)).toEqual([
      "altex-00",
      "emag-00",
      "pcgarage-00",
    ]);
  });

  test("does not depend on the order of the rows", () => {
    const rows = [
      row("e1", {
        store: "emag",
        currentPrice: 9000,
        lastCheckedAt: minutesAgo(5),
      }),
      row("e2", {
        store: "emag",
        currentPrice: 9000,
        lastCheckedAt: minutesAgo(5),
      }),
      row("e3", { store: "emag", currentPrice: 8000, inStock: false }),
      row("a1", {
        store: "altex",
        currentPrice: null,
        lastCheckedAt: minutesAgo(7),
      }),
      row("a2", {
        store: "altex",
        currentPrice: 9500,
        inStock: false,
        lastCheckedAt: minutesAgo(7),
      }),
      row("p1", { store: "pcgarage", currentPrice: 8500 }),
    ];
    const expected = groupCatalogItems(rows);

    for (let seed = 1; seed <= 40; seed++) {
      expect(groupCatalogItems(seededShuffle(rows, seed))).toEqual(expected);
    }
  });

  test("keeps the group key and the ean from every row, not only the shown offers", () => {
    const item = single([
      row("e1", {
        store: "emag",
        ean: "222",
        mpn: "KEY1234",
        currentPrice: 9000,
      }),
      row("e2", {
        store: "emag",
        ean: "111",
        mpn: "KEY1234",
        currentPrice: 12_000,
      }),
    ]);

    expect(item.offers.map((o) => o.productId)).toEqual(["e1"]);
    expect(item.key).toBe("111");
  });

  test("takes the image from any row of the group, as before", () => {
    const item = single([
      row("e1", { store: "emag", currentPrice: 9000, imageUrl: null }),
      row("e2", {
        store: "emag",
        currentPrice: 12_000,
        imageUrl: "https://i/2",
      }),
    ]);

    expect(item.offers.map((o) => o.productId)).toEqual(["e1"]);
    expect(item.imageUrl).toBe("https://i/2");
  });

  test("reports the oldest check among the shown in-stock priced offers", () => {
    const item = single([
      row("e1", {
        store: "emag",
        currentPrice: 9000,
        lastCheckedAt: minutesAgo(5),
      }),
      row("e2", {
        store: "emag",
        currentPrice: 9500,
        lastCheckedAt: minutesAgo(9000),
      }),
      row("a1", {
        store: "altex",
        currentPrice: 9100,
        lastCheckedAt: minutesAgo(40),
      }),
    ]);

    expect(item.lastCheckedAt).toBe(minutesAgo(40).toISOString());
  });
});

describe("connectedComponents", () => {
  function ids(groups: readonly (readonly CatalogRow[])[]): string[][] {
    return groups
      .map((group) => group.map((r) => r.id).sort())
      .sort((a, b) => (a[0] ?? "").localeCompare(b[0] ?? ""));
  }

  test("groups rows through shared eans and model codes, directly or through other rows", () => {
    const groups = connectedComponents([
      row("cel", { store: "other", ean: "E", mpn: null }),
      row("altex", { store: "altex", ean: "E", mpn: "MMMM11" }),
      row("emag", { store: "emag", ean: null, mpn: "MMMM11" }),
      row("solo", { store: "emag", ean: "X", mpn: null }),
      row("nothing", { store: "emag", ean: null, mpn: null }),
    ]);

    expect(ids(groups)).toEqual([
      ["altex", "cel", "emag"],
      ["nothing"],
      ["solo"],
    ]);
  });

  test("gives the same groups for every order of the rows", () => {
    const rows = [
      row("a", { ean: "E1", mpn: null, store: "emag" }),
      row("b", { ean: "E1", mpn: "MMMM11", store: "altex" }),
      row("c", { ean: "E2", mpn: "MMMM11", store: "pcgarage" }),
      row("d", { ean: "E2", mpn: null, store: "other" }),
      row("e", { ean: "E9", mpn: null, store: "emag" }),
    ];
    const expected = ids(connectedComponents(rows));

    for (let seed = 1; seed <= 40; seed++) {
      expect(ids(connectedComponents(seededShuffle(rows, seed)))).toEqual(
        expected
      );
    }
    expect(expected).toEqual([["a", "b", "c", "d"], ["e"]]);
  });

  test("lists a row once and never joins rows that share a null or empty identifier", () => {
    const groups = connectedComponents([
      row("n1", { ean: null, mpn: null }),
      row("n2", { ean: "", mpn: "" }),
      row("n3", { ean: "", mpn: "" }),
      row("n1", { ean: null, mpn: null }),
    ]);

    expect(ids(groups)).toEqual([["n1"], ["n2"], ["n3"]]);
  });

  test("returns nothing for no rows", () => {
    expect(connectedComponents([])).toEqual([]);
  });
});

describe("buildCatalogItem", () => {
  test("builds one item from the rows of a single product", () => {
    const item = buildCatalogItem([
      row("a1", { ean: null, currentPrice: 4500 }),
    ]);

    expect(item.key).toBe("a1");
    expect(item.representativeProductId).toBe("a1");
    expect(item.bestOffer?.price).toBe(4500);
    expect(item.savings).toBe(0);
  });
});

describe("rankCatalogItems", () => {
  // doar magazinele cunoscute au oferte în catalog
  const RANK_STORES = ["emag", "pcgarage", "altex"];

  function item(
    key: string,
    title: string,
    prices: (number | null)[]
  ): CatalogItem {
    return buildCatalogItem([
      row(`${key}-0`, { ean: key, title, currentPrice: prices[0] ?? null }),
      ...prices.slice(1).map((price, index) =>
        row(`${key}-${index + 1}`, {
          ean: key,
          title,
          store: RANK_STORES[index + 1] ?? "altex",
          currentPrice: price,
        })
      ),
    ]);
  }

  test("puts items with more in-stock priced offers first", () => {
    const ranked = rankCatalogItems([
      item("one", "Aaa", [1000]),
      item("three", "Zzz", [1000, 1000, 1000]),
      item("two", "Mmm", [1000, 1000]),
    ]);

    expect(ranked.map((i) => i.key)).toEqual(["three", "two", "one"]);
  });

  test("breaks ties by larger savings", () => {
    const ranked = rankCatalogItems([
      item("small", "Aaa", [1000, 1100]),
      item("big", "Zzz", [1000, 1900]),
    ]);

    expect(ranked.map((i) => i.key)).toEqual(["big", "small"]);
  });

  test("breaks remaining ties by title, then key", () => {
    const ranked = rankCatalogItems([
      item("k2", "Beta", [1000, 1100]),
      item("k3", "Alfa", [1000, 1100]),
      item("k1", "Beta", [1000, 1100]),
    ]);

    expect(ranked.map((i) => i.key)).toEqual(["k3", "k1", "k2"]);
  });

  test("counts only in-stock priced offers", () => {
    const ranked = rankCatalogItems([
      item("none", "Aaa", [null, null, null]),
      item("one", "Zzz", [1000]),
    ]);

    expect(ranked.map((i) => i.key)).toEqual(["one", "none"]);
  });

  test("returns a new array and leaves the input untouched", () => {
    const input = [item("b", "Bbb", [1000]), item("a", "Aaa", [1000])];
    const ranked = rankCatalogItems(input);

    expect(ranked).not.toBe(input);
    expect(input.map((i) => i.key)).toEqual(["b", "a"]);
    expect(ranked.map((i) => i.key)).toEqual(["a", "b"]);
  });
});

describe("dropPriceOutliers", () => {
  function offer(
    store: string,
    currentPrice: number | null,
    overrides: Partial<CatalogRow> = {}
  ) {
    return row(`${store}-${currentPrice}`, { store, currentPrice, ...overrides });
  }

  function kept(rows: CatalogRow[]): string[] {
    return dropPriceOutliers(rows).map((r) => r.id);
  }

  test("drops a forged price of 1 bani when two other stores agree on a real price", () => {
    const forged = offer("emag", 1);
    const rows = [forged, offer("altex", 10_000), offer("pcgarage", 10_500)];

    expect(kept(rows)).toEqual(["altex-10000", "pcgarage-10500"]);
  });

  test("drops a forged price of a million lei", () => {
    const rows = [
      offer("emag", 100_000_000),
      offer("altex", 10_000),
      offer("pcgarage", 10_500),
    ];

    expect(kept(rows)).toEqual(["altex-10000", "pcgarage-10500"]);
  });

  test("keeps a real discount of 30% and a real premium of 40%", () => {
    const rows = [
      offer("emag", 7000),
      offer("altex", 10_000),
      offer("pcgarage", 10_000),
    ];

    expect(kept(rows)).toHaveLength(3);
    expect(
      kept([offer("emag", 14_000), offer("altex", 10_000), offer("pcgarage", 10_000)])
    ).toHaveLength(3);
  });

  test("keeps a price exactly at 20% and at 500% of the median, and drops one just beyond", () => {
    const others = [offer("altex", 10_000), offer("pcgarage", 10_000)];

    expect(kept([offer("emag", 2000), ...others])).toHaveLength(3);
    expect(kept([offer("emag", 1999), ...others])).toHaveLength(2);
    expect(kept([offer("emag", 50_000), ...others])).toHaveLength(3);
    expect(kept([offer("emag", 50_001), ...others])).toHaveLength(2);
  });

  test("compares with the median of the cheapest price of each store", () => {
    // mediana celor trei prețuri e 10000 (mijlocul), oricare ar fi magazinul verificat
    const rows = [
      offer("emag", 3000),
      offer("altex", 10_000),
      offer("pcgarage", 30_000),
    ];

    expect(kept(rows)).toHaveLength(3);
    expect(
      kept([offer("emag", 1999), offer("altex", 10_000), offer("pcgarage", 30_000)])
    ).toEqual(["altex-10000", "pcgarage-30000"]);
    expect(
      kept([offer("emag", 3000), offer("altex", 10_000), offer("pcgarage", 50_001)])
    ).toEqual(["emag-3000", "altex-10000"]);
  });

  test("keeps the two real prices when one other store has a forged price, in either direction", () => {
    // mediana celorlalte două magazine ar fi media lor și ar scoate prețurile reale
    for (const forged of [1, 100_000_000]) {
      const rows = [
        offer("emag", forged),
        offer("altex", 10_000),
        offer("pcgarage", 10_500),
      ];

      expect(kept(rows)).toEqual(["altex-10000", "pcgarage-10500"]);
    }
  });

  test("uses the median of an even number of stores, which is the mean of the two in the middle", () => {
    const rows = [
      offer("a", 10_000),
      offer("b", 10_000),
      offer("c", 10_000),
      offer("d", 2000),
    ];

    expect(kept(rows)).toHaveLength(4);
    expect(kept([...rows, offer("e", 1999)])).toEqual([
      "a-10000",
      "b-10000",
      "c-10000",
      "d-2000",
    ]);
    expect(
      kept([offer("a", 1), offer("b", 10_000), offer("c", 10_000), offer("d", 10_000)])
    ).toEqual(["b-10000", "c-10000", "d-10000"]);
  });

  test("never filters a group with fewer than two other stores", () => {
    expect(kept([offer("emag", 1), offer("altex", 10_000)])).toHaveLength(2);
    expect(kept([offer("emag", 99_999_999)])).toHaveLength(1);
    expect(
      kept([offer("emag", 1), offer("emag", 10_000, { id: "emag-b" })])
    ).toHaveLength(2);
  });

  test("does not count a store that is out of stock or has no price as a basis for comparison", () => {
    const rows = [
      offer("emag", 1),
      offer("altex", 10_000),
      offer("pcgarage", 10_000, { inStock: false }),
    ];

    expect(kept(rows)).toHaveLength(3);
    expect(
      kept([offer("emag", 1), offer("altex", 10_000), offer("pcgarage", null)])
    ).toHaveLength(3);
  });

  test("keeps the offers that are out of stock or have no price, whatever their price", () => {
    const rows = [
      offer("emag", 1, { inStock: false }),
      offer("altex", 10_000),
      offer("pcgarage", 10_000),
      offer("emag", null, { id: "emag-none" }),
    ];

    expect(kept(rows)).toHaveLength(4);
  });

  test("keeps the real price of a store whose cheapest row is forged", () => {
    const rows = [
      offer("emag", 1),
      offer("emag", 10_200, { id: "emag-real" }),
      offer("altex", 10_000),
      offer("pcgarage", 10_500),
    ];

    expect(kept(rows)).toEqual(["emag-real", "altex-10000", "pcgarage-10500"]);
  });

  test("compares prices in the same currency only", () => {
    const rows = [
      offer("emag", 1, { currency: "EUR" }),
      offer("altex", 10_000),
      offer("pcgarage", 10_500),
    ];

    expect(kept(rows)).toHaveLength(3);
  });

  test("gives the same result for every order of the rows", () => {
    const rows = [
      offer("emag", 1),
      offer("emag", 10_200, { id: "emag-real" }),
      offer("altex", 10_000),
      offer("pcgarage", 10_500),
      offer("altex", null, { id: "altex-none" }),
    ];
    const expected = kept(rows).sort();

    for (let seed = 1; seed <= 20; seed++) {
      expect(kept(seededShuffle(rows, seed)).sort()).toEqual(expected);
    }
  });

  test("returns a new array and leaves the input untouched", () => {
    const rows = [offer("emag", 1), offer("altex", 10_000), offer("pcgarage", 10_000)];
    const result = dropPriceOutliers(rows);

    expect(result).not.toBe(rows);
    expect(rows).toHaveLength(3);
  });
});

describe("trustedRows", () => {
  test("leaves out the rows of a store that is not supported", () => {
    const rows = [
      row("a", { store: "emag" }),
      row("legacy", { store: "other" }),
      row("b", { store: "altex" }),
    ];

    expect(trustedRows(rows).map((r) => r.id)).toEqual(["a", "b"]);
  });

  test("does not count a store that is not supported as a basis for comparison", () => {
    // fără magazinul vechi rămân doar două magazine, deci nu există bază de comparație pentru prețul de 1 ban
    const rows = [
      row("fake", { store: "emag", currentPrice: 1 }),
      row("real", { store: "altex", currentPrice: 10_000 }),
      row("legacy", { store: "other", currentPrice: 10_000 }),
    ];

    expect(trustedRows(rows).map((r) => r.id)).toEqual(["fake", "real"]);
  });
});

describe("price outliers in the catalog", () => {
  function item(rows: CatalogRow[]) {
    const [first, ...rest] = rows;
    if (!first) {
      throw new Error("Expected rows");
    }
    return buildCatalogItem([first, ...rest]);
  }

  test("keeps a forged price out of the offers, the best offer, the max price and the savings", () => {
    const result = item([
      row("fake", { store: "emag", currentPrice: 1 }),
      row("altex", { store: "altex", currentPrice: 10_000 }),
      row("pcg", { store: "pcgarage", currentPrice: 12_000 }),
    ]);

    expect(result.offers.map((o) => o.productId)).toEqual(["altex", "pcg"]);
    expect(result.bestOffer).toEqual({ productId: "altex", store: "altex", price: 10_000 });
    expect(result.maxPrice).toBe(12_000);
    expect(result.savings).toBe(2000);
    expect(result.representativeProductId).toBe("altex");
  });

  test("shows the real offer of the store that was forged, when it is known", () => {
    const result = item([
      row("fake", { store: "emag", currentPrice: 1 }),
      row("real", { store: "emag", currentPrice: 10_500 }),
      row("altex", { store: "altex", currentPrice: 10_000 }),
      row("pcg", { store: "pcgarage", currentPrice: 12_000 }),
    ]);

    expect(result.offers.map((o) => o.productId)).toEqual(["altex", "real", "pcg"]);
    expect(result.bestOffer?.productId).toBe("altex");
  });

  test("keeps a forged price in a group of two stores, where there is nothing to compare with", () => {
    const result = item([
      row("fake", { store: "emag", currentPrice: 1 }),
      row("altex", { store: "altex", currentPrice: 10_000 }),
    ]);

    expect(result.bestOffer?.productId).toBe("fake");
  });

  test("lists only offers of supported stores", () => {
    const result = item([
      row("a", { store: "emag", currentPrice: 9000 }),
      row("legacy", { store: "magazin liber", currentPrice: 100 }),
    ]);

    expect(result.offers.map((o) => o.productId)).toEqual(["a"]);
    expect(result.bestOffer?.store).toBe("emag");
  });

  test("builds an item without offers from a group that has only legacy stores", () => {
    const result = item([row("legacy", { store: "other" })]);

    expect(result.offers).toEqual([]);
    expect(result.bestOffer).toBeNull();
    expect(result.representativeProductId).toBe("legacy");
  });

  test("keeps the key of the group whatever the filter removes", () => {
    const result = item([
      row("fake", { store: "emag", ean: "111", currentPrice: 1 }),
      row("altex", { store: "altex", ean: "222", currentPrice: 10_000 }),
      row("pcg", { store: "pcgarage", ean: "222", currentPrice: 10_000 }),
    ]);

    expect(result.key).toBe("111");
  });
});
