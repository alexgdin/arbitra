import { describe, expect, test } from "bun:test";

import { buildOptimizerItems } from "./cart-offers";
import { optimizeCart } from "./cart-optimizer";
import type { CatalogRow } from "./catalog";

function row(id: string, overrides: Partial<CatalogRow> = {}): CatalogRow {
  return {
    id,
    store: "emag",
    ean: null,
    mpn: null,
    title: `Produs ${id}`,
    url: `https://shop.example/${id}`,
    imageUrl: null,
    currency: "RON",
    currentPrice: 10_000,
    inStock: true,
    lastCheckedAt: null,
    ...overrides,
  };
}

function quantities(...entries: [string, number][]): Map<string, number> {
  return new Map(entries);
}

function offerIds(
  items: ReturnType<typeof buildOptimizerItems>,
  productId: string
): string[] {
  const item = items.find((candidate) => candidate.productId === productId);
  return (item?.offers ?? []).map((offer) => offer.productId).sort();
}

// Aceeași situație ca în datele reale: un magazin are doar EAN, altul EAN și cod de model, al treilea doar cod de model.
function bridgeRows() {
  return {
    cel: row("cel", {
      store: "pcgarage",
      ean: "E",
      mpn: null,
      currentPrice: 12_000,
    }),
    altex: row("altex", {
      store: "altex",
      ean: "E",
      mpn: "MMMM11",
      currentPrice: 11_000,
    }),
    emag: row("emag", {
      store: "emag",
      ean: null,
      mpn: "MMMM11",
      currentPrice: 9000,
    }),
  };
}

describe("buildOptimizerItems", () => {
  describe("bridge row", () => {
    test("offers the store that shares only the model code with the requested one, through the bridge", () => {
      const { cel, altex, emag } = bridgeRows();
      const items = buildOptimizerItems(
        [cel],
        quantities(["cel", 1]),
        [cel, altex, emag],
        "RON"
      );

      expect(offerIds(items, "cel")).toEqual(["altex", "cel", "emag"]);
    });

    test("lets the optimizer pick the cheapest store, which only the bridge reveals", () => {
      const { cel, altex, emag } = bridgeRows();
      const items = buildOptimizerItems(
        [cel],
        quantities(["cel", 1]),
        [cel, altex, emag],
        "RON"
      );
      const result = optimizeCart(items, "RON");

      expect(result.plan).toHaveLength(1);
      expect(result.plan[0]?.store).toBe("emag");
      expect(result.plan[0]?.lines[0]?.unitPrice).toBe(9000);
      // cheia liniei rămâne produsul din coș, nu oferta aleasă
      expect(result.plan[0]?.lines[0]?.productId).toBe("cel");
      expect(result.unavailable).toEqual([]);
    });

    test("gives every product of the chain the same offers, whichever one is in the cart", () => {
      const { cel, altex, emag } = bridgeRows();
      const rows = [cel, altex, emag];

      for (const requested of rows) {
        const items = buildOptimizerItems(
          [requested],
          quantities([requested.id, 1]),
          rows,
          "RON"
        );
        expect(offerIds(items, requested.id)).toEqual(["altex", "cel", "emag"]);
      }
    });

    test("does not depend on the order of the loaded rows", () => {
      const { cel, altex, emag } = bridgeRows();

      for (const rows of [
        [cel, altex, emag],
        [emag, altex, cel],
        [altex, emag, cel],
      ]) {
        const items = buildOptimizerItems(
          [cel],
          quantities(["cel", 1]),
          rows,
          "RON"
        );
        expect(offerIds(items, "cel")).toEqual(["altex", "cel", "emag"]);
      }
    });

    test("follows a bridge that is out of stock, but does not offer it", () => {
      const { cel, altex, emag } = bridgeRows();
      const soldOut = { ...altex, inStock: false };
      const items = buildOptimizerItems(
        [cel],
        quantities(["cel", 1]),
        [cel, soldOut, emag],
        "RON"
      );

      expect(offerIds(items, "cel")).toEqual(["cel", "emag"]);
    });

    test("does not reach a store that has no link to the requested product", () => {
      const { cel, altex, emag } = bridgeRows();
      const stranger = row("stranger", {
        store: "pcgarage",
        ean: "OTHER",
        mpn: "ZZZZ99",
        currentPrice: 1000,
      });
      const items = buildOptimizerItems(
        [cel],
        quantities(["cel", 1]),
        [cel, altex, emag, stranger],
        "RON"
      );

      expect(offerIds(items, "cel")).toEqual(["altex", "cel", "emag"]);
    });
  });

  describe("ean only", () => {
    test("offers every store that has the same ean", () => {
      const rows = [
        row("emag", { store: "emag", ean: "E1", currentPrice: 9000 }),
        row("altex", { store: "altex", ean: "E1", currentPrice: 9500 }),
        row("pcg", { store: "pcgarage", ean: "E1", currentPrice: 9900 }),
        row("other", { store: "emag", ean: "E2", currentPrice: 100 }),
      ];
      const items = buildOptimizerItems(
        [rows[0] as CatalogRow],
        quantities(["emag", 2]),
        rows,
        "RON"
      );

      expect(offerIds(items, "emag")).toEqual(["altex", "emag", "pcg"]);
      expect(items[0]?.quantity).toBe(2);
      expect(items[0]?.title).toBe("Produs emag");
    });

    test("keeps the requested product alone when it has no identifiers", () => {
      const solo = row("solo", { ean: null, mpn: null });
      const noise = row("noise", { store: "altex", ean: null, mpn: null });
      const items = buildOptimizerItems(
        [solo],
        quantities(["solo", 1]),
        [solo, noise],
        "RON"
      );

      expect(offerIds(items, "solo")).toEqual(["solo"]);
    });

    test("builds one item per requested product, with its own offers", () => {
      const rows = [
        row("a1", { store: "emag", ean: "EA", currentPrice: 5000 }),
        row("a2", { store: "altex", ean: "EA", currentPrice: 5200 }),
        row("b1", { store: "emag", ean: "EB", currentPrice: 7000 }),
        row("b2", { store: "pcgarage", ean: "EB", currentPrice: 6800 }),
      ];
      const items = buildOptimizerItems(
        [rows[0], rows[2]] as CatalogRow[],
        quantities(["a1", 1], ["b1", 3]),
        rows,
        "RON"
      );

      expect(items.map((item) => item.productId)).toEqual(["a1", "b1"]);
      expect(offerIds(items, "a1")).toEqual(["a1", "a2"]);
      expect(offerIds(items, "b1")).toEqual(["b1", "b2"]);
      expect(items.map((item) => item.quantity)).toEqual([1, 3]);
    });
  });

  describe("which offers count", () => {
    test("drops offers that are out of stock or have no price, but keeps the item", () => {
      const rows = [
        row("a", { store: "emag", ean: "E", currentPrice: 9000 }),
        row("b", { store: "altex", ean: "E", inStock: false }),
        row("c", { store: "pcgarage", ean: "E", currentPrice: null }),
      ];
      const items = buildOptimizerItems(
        [rows[0] as CatalogRow],
        quantities(["a", 1]),
        rows,
        "RON"
      );

      expect(offerIds(items, "a")).toEqual(["a"]);
    });

    test("leaves an item without offers when the requested product itself is unavailable", () => {
      const rows = [
        row("a", { store: "emag", ean: "E", inStock: false }),
        row("b", { store: "altex", ean: "E", inStock: false }),
      ];
      const items = buildOptimizerItems(
        [rows[0] as CatalogRow],
        quantities(["a", 1]),
        rows,
        "RON"
      );

      expect(items[0]?.offers).toEqual([]);
      expect(optimizeCart(items, "RON").unavailable).toHaveLength(1);
    });

    test("drops offers in another currency", () => {
      const rows = [
        row("a", { store: "emag", ean: "E", currentPrice: 9000 }),
        row("b", { store: "altex", ean: "E", currency: "EUR", currentPrice: 1 }),
      ];
      const items = buildOptimizerItems(
        [rows[0] as CatalogRow],
        quantities(["a", 1]),
        rows,
        "RON"
      );

      expect(offerIds(items, "a")).toEqual(["a"]);
    });

    test("drops stores that are not supported, so they cannot grow the optimizer", () => {
      const rows = [
        row("a", { store: "emag", ean: "E", currentPrice: 9000 }),
        ...Array.from({ length: 80 }, (_, index) =>
          row(`fake-${index}`, {
            store: `fake${index}`,
            ean: "E",
            currentPrice: 100 + index,
          })
        ),
      ];
      const items = buildOptimizerItems(
        [rows[0] as CatalogRow],
        quantities(["a", 1]),
        rows,
        "RON"
      );

      expect(offerIds(items, "a")).toEqual(["a"]);
    });

    test("drops a forged price, so the optimizer cannot pick it", () => {
      const rows = [
        row("a", { store: "emag", ean: "E", currentPrice: 12_000 }),
        row("fake", { store: "altex", ean: "E", currentPrice: 1 }),
        row("c", { store: "pcgarage", ean: "E", currentPrice: 11_000 }),
      ];
      const items = buildOptimizerItems(
        [rows[0] as CatalogRow],
        quantities(["a", 1]),
        rows,
        "RON"
      );
      const result = optimizeCart(items, "RON");

      expect(offerIds(items, "a")).toEqual(["a", "c"]);
      expect(result.plan.map((plan) => plan.store)).toEqual(["pcgarage"]);
      expect(result.plan[0]?.lines[0]?.unitPrice).toBe(11_000);
    });

    test("keeps a real discount of 30%", () => {
      const rows = [
        row("a", { store: "emag", ean: "E", currentPrice: 12_000 }),
        row("b", { store: "altex", ean: "E", currentPrice: 8400 }),
        row("c", { store: "pcgarage", ean: "E", currentPrice: 12_000 }),
      ];
      const items = buildOptimizerItems(
        [rows[0] as CatalogRow],
        quantities(["a", 1]),
        rows,
        "RON"
      );

      expect(offerIds(items, "a")).toEqual(["a", "b", "c"]);
    });

    test("does not filter a group of two stores, where there is no price to compare with", () => {
      const rows = [
        row("a", { store: "emag", ean: "E", currentPrice: 12_000 }),
        row("b", { store: "altex", ean: "E", currentPrice: 1 }),
      ];
      const items = buildOptimizerItems(
        [rows[0] as CatalogRow],
        quantities(["a", 1]),
        rows,
        "RON"
      );

      expect(offerIds(items, "a")).toEqual(["a", "b"]);
    });

    test("gives the same offers to every product of a group that contains a forged row", () => {
      const rows = [
        row("a", { store: "emag", ean: "E", currentPrice: 12_000 }),
        row("fake", { store: "altex", ean: "E", currentPrice: 1 }),
        row("c", { store: "pcgarage", ean: "E", currentPrice: 11_000 }),
      ];

      for (const requested of rows) {
        const items = buildOptimizerItems(
          [requested],
          quantities([requested.id, 1]),
          rows,
          "RON"
        );
        expect(offerIds(items, requested.id)).toEqual(["a", "c"]);
      }
    });

    test("keeps the offers of the other stores when the requested product is of a store that is not supported", () => {
      const legacy = row("legacy", { store: "other", ean: "E", currentPrice: 9000 });
      const rows = [
        legacy,
        row("a", { store: "emag", ean: "E", currentPrice: 12_000 }),
        row("b", { store: "altex", ean: "E", currentPrice: 12_500 }),
      ];
      const items = buildOptimizerItems(
        [legacy],
        quantities(["legacy", 1]),
        rows,
        "RON"
      );

      expect(offerIds(items, "legacy")).toEqual(["a", "b"]);
    });

    test("keeps the offer fields the optimizer needs", () => {
      const a = row("a", {
        store: "altex",
        ean: "E",
        currentPrice: 12_345,
        imageUrl: "https://img.example/a.jpg",
      });
      const [item] = buildOptimizerItems([a], quantities(["a", 1]), [a], "RON");

      expect(item?.offers).toEqual([
        {
          productId: "a",
          store: "altex",
          unitPrice: 12_345,
          title: "Produs a",
          url: "https://shop.example/a",
          imageUrl: "https://img.example/a.jpg",
        },
      ]);
    });
  });
});
