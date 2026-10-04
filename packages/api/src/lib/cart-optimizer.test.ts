import { describe, expect, test } from "bun:test";

import { optimizeCart } from "./cart-optimizer";
import type { CartOptimization, OptimizerItem } from "./cart-optimizer";
import { getStoreConfig, shippingCost } from "./store-config";

// Valorile de transport folosite aici vin din store-config.ts:
// emag 1999 (gratis de la 15000), pcgarage 1499 (20000), altex 1799 (25000),
// orice alt magazin 2000 fără prag.

function item(
  id: string,
  quantity: number,
  prices: Record<string, number>
): OptimizerItem {
  return {
    productId: id,
    title: `Produs ${id}`,
    quantity,
    offers: Object.entries(prices).map(([store, unitPrice]) => ({
      productId: `${id}@${store}`,
      store,
      unitPrice,
      title: `Produs ${id} (${store})`,
      url: `https://${store}.example/${id}`,
      imageUrl: null,
    })),
  };
}

// Generator liniar congruențial: determinist, fără operatori pe biți.
function seededRandom(seed: number): () => number {
  const modulus = 4_294_967_296;
  let state = seed;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % modulus;
    return state / modulus;
  };
}

function randomItems(
  count: number,
  stores: string[],
  random: () => number
): OptimizerItem[] {
  return Array.from({ length: count }, (_, i) => {
    const prices: Record<string, number> = {};
    for (const store of stores) {
      if (random() < 0.8) {
        prices[store] = 1000 + Math.floor(random() * 30_000);
      }
    }
    const quantity = 1 + Math.floor(random() * 3);
    return item(`r${i}`, quantity, prices);
  });
}

function cost(subtotals: Map<string, number>): number {
  let total = 0;
  for (const [store, subtotal] of subtotals) {
    total += subtotal + shippingCost(getStoreConfig(store), subtotal);
  }
  return total;
}

// Referință: încearcă toate atribuirile articol -> magazin.
function bruteForce(items: OptimizerItem[]): number | null {
  const available = items.filter((i) => i.offers.length > 0);
  if (available.length === 0) {
    return null;
  }
  let best = Number.POSITIVE_INFINITY;
  const subtotals = new Map<string, number>();
  const walk = (index: number): void => {
    const current = available[index];
    if (!current) {
      best = Math.min(best, cost(subtotals));
      return;
    }
    for (const offer of current.offers) {
      const line = offer.unitPrice * current.quantity;
      subtotals.set(offer.store, (subtotals.get(offer.store) ?? 0) + line);
      walk(index + 1);
      const left = (subtotals.get(offer.store) ?? 0) - line;
      if (left === 0) {
        subtotals.delete(offer.store);
      } else {
        subtotals.set(offer.store, left);
      }
    }
  };
  walk(0);
  return best;
}

// Costul "naiv": fiecare articol la cel mai mic preț, apoi transportul per magazin.
function naiveBaseline(items: OptimizerItem[]): number {
  const subtotals = new Map<string, number>();
  for (const current of items) {
    const [cheapest] = current.offers.toSorted(
      (a, b) => a.unitPrice - b.unitPrice || a.store.localeCompare(b.store)
    );
    if (cheapest) {
      subtotals.set(
        cheapest.store,
        (subtotals.get(cheapest.store) ?? 0) +
          cheapest.unitPrice * current.quantity
      );
    }
  }
  return cost(subtotals);
}

// Invarianți valabili pentru orice rezultat.
function expectConsistent(result: CartOptimization, items: OptimizerItem[]) {
  const available = items.filter((i) => i.offers.length > 0);
  const lines = result.plan.flatMap((p) => p.lines);
  expect(lines.map((l) => l.productId).toSorted()).toEqual(
    available.map((i) => i.productId).toSorted()
  );

  for (const plan of result.plan) {
    const config = getStoreConfig(plan.store);
    expect(plan.lines.length).toBeGreaterThan(0);
    for (const line of plan.lines) {
      const source = items.find((i) => i.productId === line.productId);
      expect(line.quantity).toBe(source?.quantity ?? -1);
      expect(line.lineTotal).toBe(line.unitPrice * line.quantity);
    }
    expect(plan.subtotal).toBe(plan.lines.reduce((s, l) => s + l.lineTotal, 0));
    expect(plan.shipping).toBe(shippingCost(config, plan.subtotal));
    expect(plan.total).toBe(plan.subtotal + plan.shipping);
    expect(plan.freeShippingRemaining).toBe(
      config.freeShippingOver !== null && plan.subtotal < config.freeShippingOver
        ? config.freeShippingOver - plan.subtotal
        : 0
    );
  }

  const totals = result.plan.map((p) => p.total);
  expect(totals).toEqual(totals.toSorted((a, b) => b - a));
  expect(result.totals.optimized).toBe(totals.reduce((s, t) => s + t, 0));
  expect(result.totals.savingsVsNaive).toBeGreaterThanOrEqual(0);
  expect(result.totals.savingsVsSingleStore).toBeGreaterThanOrEqual(0);
  expect(result.totals.optimized).toBeLessThanOrEqual(
    result.totals.naiveCheapest
  );
  expect(result.totals.naiveCheapest).toBe(naiveBaseline(items));
  const single = result.totals.bestSingleStore;
  if (single) {
    expect(result.totals.optimized).toBeLessThanOrEqual(single.total);
  }
}

describe("optimizeCart", () => {
  test("pragul de transport gratuit schimbă planul câștigător", () => {
    // Împreună la eMAG: 15100 >= 15000, transport gratuit. Separat, PC Garage e mai ieftin.
    const crossing = [
      item("a", 1, { emag: 9000, pcgarage: 8900 }),
      item("b", 1, { emag: 6100, pcgarage: 6000 }),
    ];
    const free = optimizeCart(crossing, "RON");
    expect(free.plan.map((p) => p.store)).toEqual(["emag"]);
    expect(free.plan[0]?.shipping).toBe(0);
    expect(free.plan[0]?.freeShippingRemaining).toBe(0);
    expect(free.totals.optimized).toBe(15_100);
    expect(free.totals.naiveCheapest).toBe(16_399);
    expect(free.totals.savingsVsNaive).toBe(1299);
    expectConsistent(free, crossing);

    // Cu 200 de bani mai puțin, eMAG rămâne sub prag și PC Garage câștigă.
    const below = [
      item("a", 1, { emag: 8800, pcgarage: 8900 }),
      item("b", 1, { emag: 6000, pcgarage: 6000 }),
    ];
    const paid = optimizeCart(below, "RON");
    expect(paid.plan.map((p) => p.store)).toEqual(["pcgarage"]);
    expect(paid.totals.optimized).toBe(14_900 + 1499);
    expect(paid.plan[0]?.freeShippingRemaining).toBe(5100);
    expectConsistent(paid, below);
  });

  test("consolidarea într-un singur magazin bate împărțirea la cel mai mic preț", () => {
    const items = [
      item("a", 1, { emag: 5000, altex: 5100 }),
      item("b", 1, { emag: 5100, altex: 5000 }),
    ];
    const result = optimizeCart(items, "RON");

    expect(result.plan.map((p) => p.store)).toEqual(["altex"]);
    expect(result.totals.optimized).toBe(10_100 + 1799);
    expect(result.totals.naiveCheapest).toBe(10_000 + 1999 + 1799);
    expect(result.totals.savingsVsNaive).toBe(1899);
    expect(result.totals.bestSingleStore).toEqual({
      store: "altex",
      total: 10_100 + 1799,
    });
    expect(result.totals.savingsVsSingleStore).toBe(0);
    expect(result.method).toBe("exhaustive");
    expectConsistent(result, items);
  });

  test("împărțirea între magazine câștigă când diferențele de preț sunt mari", () => {
    const items = [
      item("a", 1, { emag: 100_000, pcgarage: 150_000 }),
      item("b", 1, { emag: 160_000, pcgarage: 90_000 }),
    ];
    const result = optimizeCart(items, "RON");

    expect(result.plan.map((p) => p.store)).toEqual(["emag", "pcgarage"]);
    expect(result.plan.every((p) => p.shipping === 0)).toBe(true);
    expect(result.totals.optimized).toBe(190_000);
    expect(result.totals.bestSingleStore).toEqual({
      store: "pcgarage",
      total: 240_000,
    });
    expect(result.totals.savingsVsSingleStore).toBe(50_000);
    expect(result.totals.savingsVsNaive).toBe(0);
    expectConsistent(result, items);
  });

  test("articolele fără ofertă în stoc ajung în unavailable și nu intră în totaluri", () => {
    const items = [
      item("a", 2, { emag: 8000 }),
      item("gone", 3, {}),
      item("b", 1, { emag: 9000 }),
    ];
    const result = optimizeCart(items, "RON");

    expect(result.unavailable).toEqual([
      { productId: "gone", title: "Produs gone", quantity: 3 },
    ]);
    expect(result.plan).toHaveLength(1);
    expect(result.totals.optimized).toBe(25_000);
    expect(result.singleStoreOptions).toEqual([
      { store: "emag", total: 25_000, missing: 0 },
    ]);
    expectConsistent(result, items);
  });

  test("un coș fără nicio ofertă returnează un plan gol", () => {
    const result = optimizeCart([item("gone", 1, {})], "RON");

    expect(result.plan).toEqual([]);
    expect(result.unavailable).toHaveLength(1);
    expect(result.singleStoreOptions).toEqual([]);
    expect(result.totals).toEqual({
      optimized: 0,
      bestSingleStore: null,
      naiveCheapest: 0,
      savingsVsSingleStore: 0,
      savingsVsNaive: 0,
    });
    expect(result.currency).toBe("RON");
  });

  test("articolele fără EAN rămân la singurul lor magazin", () => {
    const items = [
      item("solo", 1, { emag: 12_000 }),
      item("shared", 1, { emag: 9000, pcgarage: 8000 }),
    ];
    const result = optimizeCart(items, "RON");

    expect(result.plan.map((p) => p.store)).toEqual(["emag"]);
    expect(result.singleStoreOptions).toEqual([
      { store: "emag", total: 21_000, missing: 0 },
      { store: "pcgarage", total: null, missing: 1 },
    ]);
    expect(result.totals.bestSingleStore).toEqual({
      store: "emag",
      total: 21_000,
    });
    expectConsistent(result, items);
  });

  test("păstrează doar cea mai ieftină ofertă a fiecărui magazin", () => {
    const base = item("a", 1, { emag: 5000 });
    const variant = item("a", 1, { emag: 4000 });
    const result = optimizeCart(
      [{ ...base, offers: [...base.offers, ...variant.offers] }],
      "RON"
    );

    expect(result.plan[0]?.lines[0]?.unitPrice).toBe(4000);
  });

  test("cantitatea înmulțește prețul unitar în fiecare linie", () => {
    const result = optimizeCart([item("a", 4, { emag: 3000 })], "RON");

    expect(result.plan[0]?.lines[0]).toMatchObject({
      quantity: 4,
      unitPrice: 3000,
      lineTotal: 12_000,
      url: "https://emag.example/a",
    });
    expect(result.plan[0]?.freeShippingRemaining).toBe(3000);
  });

  test("magazinele necunoscute folosesc transportul implicit fără prag", () => {
    const result = optimizeCart([item("a", 1, { shopx: 500_000 })], "RON");

    expect(result.plan[0]?.shipping).toBe(2000);
    expect(result.plan[0]?.freeShippingRemaining).toBe(0);
  });

  describe("departajare deterministă", () => {
    test("la prețuri egale alege magazinul primul în ordine alfabetică", () => {
      const items = [
        item("a", 1, { beta: 1000, alpha: 1000 }),
        item("b", 1, { alpha: 2000, beta: 2000 }),
      ];
      const result = optimizeCart(items, "RON");

      expect(result.plan.map((p) => p.store)).toEqual(["alpha"]);
      expect(result.plan[0]?.lines).toHaveLength(2);
      expect(result.singleStoreOptions.map((o) => o.store)).toEqual([
        "alpha",
        "beta",
      ]);
    });

    test("ordinea ofertelor și a articolelor nu schimbă rezultatul", () => {
      const items = [
        item("a", 1, { emag: 7000, pcgarage: 7000, altex: 7000 }),
        item("b", 2, { emag: 4000, pcgarage: 4000, altex: 4000 }),
        item("c", 1, { emag: 9000, pcgarage: 8000, altex: 8000 }),
      ];
      const reversed = items.toReversed().map((i) => ({
        ...i,
        offers: i.offers.toReversed(),
      }));

      const first = optimizeCart(items, "RON");
      const second = optimizeCart(items, "RON");
      const third = optimizeCart(reversed, "RON");

      expect(second).toEqual(first);
      expect(third.plan.map((p) => [p.store, p.total])).toEqual(
        first.plan.map((p) => [p.store, p.total])
      );
      expect(first.plan.map((p) => p.store)).toEqual(["pcgarage"]);
    });

    test("singleStoreOptions: totalurile cresc, magazinele incomplete la final", () => {
      const items = [
        item("a", 1, { emag: 5000, pcgarage: 5000, altex: 5000 }),
        item("b", 1, { emag: 5000, pcgarage: 5000 }),
      ];
      const result = optimizeCart(items, "RON");

      expect(result.singleStoreOptions).toEqual([
        { store: "pcgarage", total: 10_000 + 1499, missing: 0 },
        { store: "emag", total: 10_000 + 1999, missing: 0 },
        { store: "altex", total: null, missing: 1 },
      ]);
    });
  });

  describe("căutare exactă", () => {
    test("coincide cu verificarea prin forță brută pe cazuri aleatorii", () => {
      const random = seededRandom(7);
      const stores = ["altex", "emag", "pcgarage", "shopx"];

      for (let round = 0; round < 60; round += 1) {
        const count = 1 + Math.floor(random() * 6);
        const items = randomItems(count, stores, random);
        const result = optimizeCart(items, "RON");
        const expected = bruteForce(items);

        expect(result.method).toBe("exhaustive");
        expect(result.totals.optimized).toBe(expected ?? 0);
        expectConsistent(result, items);
      }
    });

    test("12 articole la 4 magazine se rezolvă repede și nu depășește referința naivă", () => {
      const items = randomItems(
        12,
        ["altex", "emag", "pcgarage", "shopx"],
        seededRandom(11)
      );
      const result = optimizeCart(items, "RON");

      expect(["exhaustive", "heuristic"]).toContain(result.method);
      expectConsistent(result, items);
    });

    test("limita de noduri trece pe euristică și rămâne cel puțin la fel de bună ca naivul", () => {
      const items = randomItems(
        10,
        ["altex", "emag", "pcgarage", "shopx"],
        seededRandom(3)
      );
      const result = optimizeCart(items, "RON", { nodeLimit: 1 });

      expect(result.method).toBe("heuristic");
      expectConsistent(result, items);
    });
  });

  describe("euristică (peste 12 articole)", () => {
    test("folosește metoda euristică și nu e mai slabă decât cumpărarea naivă", () => {
      const random = seededRandom(21);
      const stores = ["altex", "emag", "pcgarage", "shopx"];

      for (let round = 0; round < 10; round += 1) {
        const items = randomItems(13 + (round % 18), stores, random);
        const result = optimizeCart(items, "RON");

        expect(result.method).toBe("heuristic");
        expect(result.totals.optimized).toBeLessThanOrEqual(
          naiveBaseline(items)
        );
        expectConsistent(result, items);
      }
    });

    test("găsește consolidarea la un singur magazin când aceasta bate împărțirea", () => {
      // La PC Garage fiecare articol e cu 10 bani mai ieftin, dar doar eMAG trece de prag.
      const items = Array.from({ length: 13 }, (_, i) =>
        item(`x${i}`, 1, { emag: 1200, pcgarage: 1190 })
      );
      const result = optimizeCart(items, "RON");

      expect(result.method).toBe("heuristic");
      expect(result.plan.map((p) => p.store)).toEqual(["emag"]);
      expect(result.totals.optimized).toBe(15_600);
      expect(result.totals.naiveCheapest).toBe(15_470 + 1499);
      expectConsistent(result, items);
    });
  });
});
