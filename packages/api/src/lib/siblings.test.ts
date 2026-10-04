import { describe, expect, test } from "bun:test";

import type { Database } from "@my-better-t-app/db";
import type { SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { PgDialect } from "drizzle-orm/pg-core";

import { fakeCatalogDb, perStore } from "../test-support/catalog-db";
import type { CatalogRow } from "./catalog";
import {
  collectIdentifiers,
  loadSiblingProducts,
  siblingFilter,
  siblingQuery,
} from "./siblings";

const dialect = new PgDialect();

function toQuery(filter: SQL | undefined) {
  if (!filter) {
    throw new Error("Expected a filter");
  }
  return dialect.sqlToQuery(filter);
}

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

// EAN-uri sintetice, sortabile ca text: "e000", "e001", ...
function numbered(prefix: string, count: number): string[] {
  return Array.from(
    { length: count },
    (_, index) => `${prefix}${String(index).padStart(3, "0")}`
  );
}

describe("collectIdentifiers", () => {
  test("collects the non-null eans and mpns", () => {
    expect(
      collectIdentifiers([
        row("a", { ean: "111", mpn: null }),
        row("b", { ean: null, mpn: "AAAA111" }),
        row("c", { ean: "222", mpn: "BBBB222" }),
      ])
    ).toEqual({ eans: ["111", "222"], mpns: ["AAAA111", "BBBB222"] });
  });

  test("removes duplicates and sorts, so the query does not depend on the row order", () => {
    const rows = [
      row("a", { ean: "222", mpn: "BBBB222" }),
      row("b", { ean: "111", mpn: "BBBB222" }),
      row("c", { ean: "222", mpn: "AAAA111" }),
    ];

    expect(collectIdentifiers(rows)).toEqual({
      eans: ["111", "222"],
      mpns: ["AAAA111", "BBBB222"],
    });
    expect(collectIdentifiers([...rows].reverse())).toEqual(
      collectIdentifiers(rows)
    );
  });

  test("skips empty and missing identifiers", () => {
    expect(
      collectIdentifiers([
        row("a", { ean: "", mpn: "" }),
        row("b", { ean: null, mpn: null }),
      ])
    ).toEqual({ eans: [], mpns: [] });
    expect(collectIdentifiers([])).toEqual({ eans: [], mpns: [] });
  });

  test("leaves out identifiers that were already searched", () => {
    expect(
      collectIdentifiers(
        [
          row("a", { ean: "111", mpn: "AAAA111" }),
          row("b", { ean: "222", mpn: "AAAA111" }),
        ],
        { eans: ["111"], mpns: ["AAAA111"] }
      )
    ).toEqual({ eans: ["222"], mpns: [] });
  });

  test("caps each set at 200 values, the smallest first", () => {
    const eans = numbered("e", 250);
    const mpns = numbered("MPN", 201);
    const rows = [
      ...eans.map((ean, index) => row(`e${index}`, { ean })),
      ...mpns.map((mpn, index) => row(`m${index}`, { mpn })),
    ];
    const sets = collectIdentifiers(rows);

    expect(sets.eans).toEqual(eans.slice(0, 200));
    expect(sets.mpns).toEqual(mpns.slice(0, 200));
  });

  test("picks the same capped values whatever the order of the rows", () => {
    const rows = numbered("e", 300).map((ean, index) => row(`r${index}`, { ean }));
    const shuffled = [...rows].reverse().sort((a, b) => a.id.length - b.id.length);

    expect(collectIdentifiers(shuffled)).toEqual(collectIdentifiers(rows));
  });

  test("offers the values left out by the cap once the first ones were searched", () => {
    const eans = numbered("e", 250);
    const rows = eans.map((ean, index) => row(`r${index}`, { ean }));
    const first = collectIdentifiers(rows);
    const second = collectIdentifiers(rows, first);

    expect(second.eans).toEqual(eans.slice(200));
  });
});

describe("siblingFilter", () => {
  test("has no condition without identifiers", () => {
    expect(siblingFilter({ eans: [], mpns: [] })).toBeUndefined();
  });

  test("matches on the ean alone when there is no mpn", () => {
    const { sql, params } = toQuery(
      siblingFilter({ eans: ["111", "222"], mpns: [] })
    );

    expect(sql).toBe('"products"."ean" in ($1, $2)');
    expect(params).toEqual(["111", "222"]);
  });

  test("matches on the mpn alone when there is no ean", () => {
    const { sql, params } = toQuery(
      siblingFilter({ eans: [], mpns: ["AAAA111"] })
    );

    expect(sql).toBe('"products"."mpn" in ($1)');
    expect(params).toEqual(["AAAA111"]);
  });

  test("matches an ean or an mpn in one condition", () => {
    const { sql, params } = toQuery(
      siblingFilter({ eans: ["111"], mpns: ["AAAA111", "BBBB222"] })
    );

    expect(sql).toBe(
      '(("products"."ean" in ($1)) or ("products"."mpn" in ($2, $3)))'
    );
    expect(params).toEqual(["111", "AAAA111", "BBBB222"]);
  });

  test("does not restrict the stock or the price, so out-of-stock rows can bridge two offers", () => {
    const { sql } = toQuery(siblingFilter({ eans: ["111"], mpns: [] }));

    expect(sql).not.toContain("in_stock");
    expect(sql).not.toContain("current_price");
  });
});


describe("siblingQuery", () => {
  // Driver fals: construiește interogarea fără conexiune, ca să se poată citi SQL-ul generat.
  const db = drizzle.mock() as unknown as Database;
  const filter = siblingFilter({ eans: ["111"], mpns: ["AAAA111"] }) as SQL;

  test("limits the result to 25 rows of one store, in stock first, then cheapest, then freshest", () => {
    const { sql, params } = siblingQuery(db, filter, "emag").toSQL();

    expect(sql).toContain(
      'where (((("products"."ean" in ($1)) or ("products"."mpn" in ($2)))) and ("products"."store" = $3))'
    );
    expect(sql).toContain(
      'order by "products"."in_stock" desc, "products"."current_price" asc, "products"."last_checked_at" desc nulls last, "products"."id" asc limit $4'
    );
    expect(params).toEqual(["111", "AAAA111", "emag", 25]);
  });

  test("sorts the price ascending, so a row without a price comes after the priced ones", () => {
    const { sql } = siblingQuery(db, filter, "altex").toSQL();

    // în Postgres, ASC pune valorile null la sfârșit
    expect(sql).toContain('"products"."current_price" asc,');
    expect(sql).not.toContain("nulls first");
  });

  test("selects only the public catalog columns", () => {
    const { sql } = siblingQuery(db, filter, "pcgarage").toSQL();

    expect(
      sql.startsWith(
        'select "id", "store", "ean", "mpn", "title", "url", "image_url", "currency", "current_price", "in_stock", "last_checked_at" from "products" where'
      )
    ).toBe(true);
    expect(sql).not.toContain("search_text");
  });
});

describe("loadSiblingProducts", () => {
  test("returns the given rows without a query when they have no identifiers", async () => {
    const { db, queries } = fakeCatalogDb([]);
    const rows = [row("a"), row("b")];

    expect(await loadSiblingProducts(db, rows)).toEqual(rows);
    expect(queries()).toBe(0);
  });

  test("runs one query per supported store in a round, each limited to its own store", async () => {
    const input = row("emag", { mpn: "WDS200T4G0E" });
    const { db, wheres, limits } = fakeCatalogDb([perStore([])]);

    await loadSiblingProducts(db, [input]);

    expect(wheres.map((where) => toQuery(where).params)).toEqual([
      ["WDS200T4G0E", "emag"],
      ["WDS200T4G0E", "pcgarage"],
      ["WDS200T4G0E", "altex"],
    ]);
    expect(limits).toEqual([25, 25, 25]);
  });

  test("adds the rows that share an ean or an mpn", async () => {
    const input = row("emag", { mpn: "WDS200T4G0E" });
    const altex = row("altex", {
      store: "altex",
      ean: "718037904610",
      mpn: "WDS200T4G0E",
    });
    const { db, wheres } = fakeCatalogDb([perStore([altex]), perStore([])]);

    const result = await loadSiblingProducts(db, [input]);

    expect(result.map((r) => r.id)).toEqual(["emag", "altex"]);
    expect(toQuery(wheres[0]).sql).toContain('"products"."mpn" in ($1)');
  });

  test("keeps the offers of the other stores when one store is flooded with rows", async () => {
    const input = row("emag-real", { ean: "111", currentPrice: 12_000 });
    // 25 de rânduri false în eMAG: umplu cele 25 de locuri ale magazinului, dar numai ale lui
    const flood = Array.from({ length: 25 }, (_, index) =>
      row(`emag-fake-${index}`, { ean: "111", currentPrice: 1 + index })
    );
    const altex = row("altex", { store: "altex", ean: "111", currentPrice: 11_000 });
    const pcgarage = row("pcg", { store: "pcgarage", ean: "111", currentPrice: 11_500 });
    const { db } = fakeCatalogDb([
      perStore([...flood, altex, pcgarage]),
      perStore([]),
    ]);

    const result = await loadSiblingProducts(db, [input]);

    expect(result.map((r) => r.id)).toContain("altex");
    expect(result.map((r) => r.id)).toContain("pcg");
  });

  test("never asks for a store that is not supported", async () => {
    const input = row("a", { ean: "111" });
    const { db, wheres } = fakeCatalogDb([perStore([]), perStore([])]);

    await loadSiblingProducts(db, [input]);

    const stores = wheres.map((where) => toQuery(where).params.at(-1));
    expect(stores).toEqual(["emag", "pcgarage", "altex"]);
  });

  test("lists a row once when the query returns the given row again", async () => {
    const input = row("emag", { ean: "111", mpn: "AAAA111" });
    const other = row("altex", { store: "altex", ean: "111" });
    const { db } = fakeCatalogDb([perStore([input, other]), perStore([other])]);

    const result = await loadSiblingProducts(db, [input, input]);

    expect(result.map((r) => r.id)).toEqual(["emag", "altex"]);
  });

  test("lets identifiers found through a sibling pull in further siblings", async () => {
    const input = row("emag", { mpn: "WDS200T4G0E" });
    const altex = row("altex", {
      store: "altex",
      ean: "718037904610",
      mpn: "WDS200T4G0E",
    });
    const pcgarage = row("pcg", { store: "pcgarage", ean: "718037904610" });
    const { db, wheres } = fakeCatalogDb([
      perStore([altex]),
      perStore([pcgarage]),
    ]);

    const result = await loadSiblingProducts(db, [input]);

    expect(result.map((r) => r.id)).toEqual(["emag", "altex", "pcg"]);
    expect(wheres).toHaveLength(6);
    // a doua rundă caută doar identificatorii noi
    expect(toQuery(wheres[3]).sql).toContain('"products"."ean" in ($1)');
    expect(toQuery(wheres[3]).params).toEqual(["718037904610", "emag"]);
  });

  test("stops after two rounds", async () => {
    const input = row("a", { mpn: "AAAA111" });
    const second = row("b", { store: "altex", mpn: "AAAA111", ean: "111" });
    const third = row("c", { store: "pcgarage", ean: "111", mpn: "CCCC333" });
    const fourth = row("d", { mpn: "CCCC333" });
    const { db, wheres } = fakeCatalogDb([
      perStore([second]),
      perStore([third]),
      perStore([fourth]),
    ]);

    const result = await loadSiblingProducts(db, [input]);

    expect(wheres).toHaveLength(6);
    expect(result.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  test("does not query again when a round finds nothing new", async () => {
    const input = row("a", { ean: "111", mpn: "AAAA111" });
    const { db, queries } = fakeCatalogDb([perStore([input])]);

    expect(await loadSiblingProducts(db, [input])).toEqual([input]);
    expect(queries()).toBe(3);
  });

  test("does not query a second time for a plain ean group", async () => {
    const input = row("a", { ean: "111" });
    const other = row("b", { ean: "111", store: "altex" });
    const { db, queries } = fakeCatalogDb([
      perStore([input, other]),
      perStore([other]),
    ]);

    const result = await loadSiblingProducts(db, [input]);

    expect(result.map((r) => r.id)).toEqual(["a", "b"]);
    expect(queries()).toBe(3);
  });

  test("searches at most 200 values per set in a round and the rest in the next", async () => {
    const eans = numbered("e", 250);
    const input = eans.map((ean, index) => row(`r${index}`, { ean }));
    const { db, wheres } = fakeCatalogDb([perStore([]), perStore([])]);

    await loadSiblingProducts(db, input);

    expect(wheres).toHaveLength(6);
    expect(toQuery(wheres[0]).params).toEqual([...eans.slice(0, 200), "emag"]);
    expect(toQuery(wheres[3]).params).toEqual([...eans.slice(200), "emag"]);
  });

  test("keeps the order of the given rows ahead of the siblings", async () => {
    const { db } = fakeCatalogDb([
      perStore([row("z", { ean: "111", store: "altex" })]),
      perStore([]),
    ]);

    const result = await loadSiblingProducts(db, [
      row("b", { ean: "111" }),
      row("a", { ean: "222" }),
    ]);

    expect(result.map((r) => r.id)).toEqual(["b", "a", "z"]);
  });
});
