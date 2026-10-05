import { describe, expect, test } from "bun:test";

import type { Session } from "@my-better-t-app/auth";
import type { Database } from "@my-better-t-app/db";

import { t } from "../index";
import type { CatalogRow } from "../lib/catalog";
import { alertsRouter, evaluateTargets, reachedAlerts } from "./alerts";
import type { TrackedTarget } from "./alerts";

const NOW = new Date("2026-10-05T12:00:00.000Z");

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
    lastCheckedAt: new Date("2026-10-05T10:00:00.000Z"),
    ...overrides,
  };
}

function tracked(
  id: string,
  targetPrice: number,
  overrides: Partial<CatalogRow> = {}
): TrackedTarget {
  return { ...row(id, overrides), externalId: `demo-${id}`, targetPrice };
}

describe("evaluateTargets", () => {
  test("uses the cheapest in-stock offer of the whole group, in any store", () => {
    const target = tracked("a", 9000, { store: "emag", ean: "E1", currentPrice: 12_000 });
    const altex = row("b", {
      store: "altex",
      ean: "E1",
      currentPrice: 8500,
      url: "https://altex.ro/b",
      lastCheckedAt: new Date("2026-10-05T11:00:00.000Z"),
    });

    const [status] = evaluateTargets([target], [altex]);

    expect(status).toMatchObject({
      productId: "a",
      representativeProductId: "b",
      bestPrice: 8500,
      bestStore: "altex",
      bestUrl: "https://altex.ro/b",
      checkedAt: "2026-10-05T11:00:00.000Z",
      reached: true,
    });
  });

  test("links offers through a bridge row (EAN on one side, model code on the other)", () => {
    const target = tracked("a", 9000, { store: "pcgarage", ean: "E1", currentPrice: 12_000 });
    const bridge = row("b", { store: "altex", ean: "E1", mpn: "M1", currentPrice: 11_000 });
    const cheap = row("c", { store: "emag", mpn: "M1", currentPrice: 8999 });

    const [status] = evaluateTargets([target], [bridge, cheap]);

    expect(status?.bestPrice).toBe(8999);
    expect(status?.reached).toBe(true);
  });

  test("ignores offers that are out of stock or without a price", () => {
    const target = tracked("a", 9000, { ean: "E1", currentPrice: 12_000 });
    const outOfStock = row("b", { store: "altex", ean: "E1", currentPrice: 5000, inStock: false });
    const noPrice = row("c", { store: "pcgarage", ean: "E1", currentPrice: null });

    const [status] = evaluateTargets([target], [outOfStock, noPrice]);

    expect(status?.bestPrice).toBe(12_000);
    expect(status?.reached).toBe(false);
  });

  test("ignores an implausible outlier price, like the product page", () => {
    const target = tracked("a", 9000, { store: "emag", ean: "E1", currentPrice: 10_000 });
    const fake = row("b", { store: "altex", ean: "E1", currentPrice: 1 });
    const real = row("c", { store: "pcgarage", ean: "E1", currentPrice: 10_500 });

    const [status] = evaluateTargets([target], [fake, real]);

    expect(status?.bestPrice).toBe(10_000);
    expect(status?.reached).toBe(false);
  });

  test("counts a price equal to the target as reached", () => {
    const [status] = evaluateTargets([tracked("a", 10_000)], []);
    expect(status?.reached).toBe(true);
  });

  test("a product without any available offer has no best price", () => {
    const [status] = evaluateTargets(
      [tracked("a", 10_000, { inStock: false })],
      []
    );
    expect(status).toMatchObject({ bestPrice: null, bestStore: null, reached: false });
  });
});

describe("reachedAlerts", () => {
  test("returns only reached targets, newest first, with the savings vs the target", () => {
    const statuses = evaluateTargets(
      [
        tracked("old", 10_000, {
          currentPrice: 9000,
          lastCheckedAt: new Date("2026-10-01T00:00:00.000Z"),
        }),
        tracked("new", 10_000, {
          currentPrice: 9500,
          lastCheckedAt: new Date("2026-10-04T00:00:00.000Z"),
        }),
        tracked("above", 10_000, { currentPrice: 10_001 }),
      ],
      []
    );

    const alerts = reachedAlerts(statuses, NOW);

    expect(alerts.map((alert) => alert.productId)).toEqual(["new", "old"]);
    expect(alerts[0]).toEqual({
      productId: "new",
      representativeProductId: "new",
      title: "Produs new",
      targetPrice: 10_000,
      bestPrice: 9500,
      bestStore: "emag",
      bestUrl: "https://www.emag.ro/new",
      savingsVsTarget: 500,
      checkedAt: "2026-10-04T00:00:00.000Z",
    });
  });

  test("an item tracked in two stores gives one alert, for the higher target", () => {
    const statuses = evaluateTargets(
      [
        tracked("a", 9000, { store: "emag", ean: "E1", currentPrice: 8000 }),
        tracked("b", 9500, { store: "altex", ean: "E1", currentPrice: 9900 }),
      ],
      []
    );

    const alerts = reachedAlerts(statuses, NOW);

    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ productId: "b", bestPrice: 8000, savingsVsTarget: 1500 });
  });

  test("falls back to now when the best offer was never checked", () => {
    const statuses = evaluateTargets(
      [tracked("a", 10_000, { currentPrice: 9000, lastCheckedAt: null })],
      []
    );
    expect(reachedAlerts(statuses, NOW)[0]?.checkedAt).toBe(NOW.toISOString());
  });
});

describe("alerts.reached", () => {
  test("requires a session", async () => {
    const caller = t.createCallerFactory(alertsRouter)({
      session: null,
      db: {} as Database,
    });
    await expect(caller.reached()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  test("returns nothing without tracked targets, without loading siblings", async () => {
    let queries = 0;
    const db = {
      select: () => ({
        from: () => ({
          innerJoin: () => ({
            where: () => {
              queries++;
              return Promise.resolve([]);
            },
          }),
        }),
      }),
    } as unknown as Database;
    const session = { user: { id: "user-1" } } as unknown as Session;

    const result = await t.createCallerFactory(alertsRouter)({ session, db }).reached();

    expect(result).toEqual([]);
    expect(queries).toBe(1);
  });
});
