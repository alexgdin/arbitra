import { describe, expect, test } from "bun:test";

import type { Session } from "@my-better-t-app/auth";
import type { Database } from "@my-better-t-app/db";
import { priceHistory } from "@my-better-t-app/db/schema/commerce";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

import { t } from "../index";
import { INT4_MAX, MAX_BANI } from "../schemas";
import { ingestPriceInput, productRouter } from "./product";

const dialect = new PgDialect();

const BACKSLASH = String.fromCharCode(92);
const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const EXISTING_ID = "22222222-2222-4222-8222-222222222222";
// GTIN-12 valid, așa cum îl expune Altex
const GTIN = "718037904610";
const OTHER_GTIN = "4006381333931";

const valid = {
  store: "emag" as const,
  externalId: "ABC123",
  title: "SSD WD Blue SN5000, 2TB",
  url: "https://www.emag.ro/ssd-wd-blue/pd/ABC123/",
  price: 149_077,
};

function parse(overrides: Record<string, unknown>) {
  return ingestPriceInput.safeParse({ ...valid, ...overrides });
}

function urlOfLength(prefix: string, length: number): string {
  return `${prefix}${"a".repeat(length - prefix.length)}`;
}

describe("ingestPriceInput", () => {
  test("accepts a minimal valid observation and fills the defaults", () => {
    const result = ingestPriceInput.safeParse(valid);

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      ...valid,
      ean: undefined,
      mpn: undefined,
      currency: "RON",
      inStock: true,
    });
  });

  test("accepts every optional field", () => {
    const result = parse({
      imageUrl: "https://s13emagst.akamaized.net/products/1/image.jpg",
      ean: GTIN,
      mpn: "WDS200T4G0E",
      currency: "RON",
      inStock: false,
    });

    expect(result.success).toBe(true);
    expect(result.data?.ean).toBe(GTIN);
    expect(result.data?.mpn).toBe("WDS200T4G0E");
  });

  describe("store", () => {
    test("accepts the supported stores only", () => {
      expect(parse({ store: "emag" }).success).toBe(true);
      expect(
        parse({ store: "pcgarage", url: "https://www.pcgarage.ro/ssd/" }).success
      ).toBe(true);
      expect(
        parse({ store: "altex", url: "https://altex.ro/ssd/cpd/ABC/" }).success
      ).toBe(true);
    });

    test("rejects other spellings and unknown stores, so rows are not split", () => {
      for (const store of ["eMAG", "EMAG", "emag ", " emag", "pc garage", "cel", "", "other"]) {
        expect(parse({ store }).success).toBe(false);
      }
      expect(parse({ store: 7 }).success).toBe(false);
      expect(ingestPriceInput.safeParse({ ...valid, store: undefined }).success).toBe(false);
    });
  });

  describe("link", () => {
    test("accepts the store domain and its subdomains, in any case", () => {
      for (const url of [
        "https://emag.ro/ssd/pd/ABC/",
        "https://www.emag.ro/ssd/pd/ABC/",
        "https://WWW.EMAG.RO/ssd",
        "HTTPS://www.emag.ro/ssd",
        "https://m.shop.emag.ro/ssd",
        "https://www.emag.ro:443/ssd",
        "https://www.emag.ro/ssd?x=1&y=https://evil.example#frag",
      ]) {
        expect(parse({ url }).success).toBe(true);
      }
    });

    test("saves only the https origin and the path, with the host in lower case", () => {
      const cases: [string, string][] = [
        [
          "https://www.emag.ro/ssd?x=1&y=https://evil.example#frag",
          "https://www.emag.ro/ssd",
        ],
        ["https://www.emag.ro/ssd#frag", "https://www.emag.ro/ssd"],
        ["https://www.emag.ro/ssd?utm_source=x", "https://www.emag.ro/ssd"],
        ["HTTPS://WWW.EMAG.RO/Ssd/Pd/ABC", "https://www.emag.ro/Ssd/Pd/ABC"],
        ["https://www.emag.ro", "https://www.emag.ro/"],
        ["https://www.emag.ro:443/ssd", "https://www.emag.ro/ssd"],
        ["https://www.emag.ro/a b", "https://www.emag.ro/a%20b"],
      ];

      for (const [url, expected] of cases) {
        expect(parse({ url }).data?.url).toBe(expected);
      }
    });

    test("trims whitespace around the link, but not inside the host", () => {
      expect(parse({ url: "  https://www.emag.ro/ssd  " }).data?.url).toBe(
        "https://www.emag.ro/ssd"
      );
      expect(parse({ url: "https://www.emag .ro/ssd" }).success).toBe(false);
      expect(parse({ url: " https://www.emag.ro /ssd" }).success).toBe(false);
      expect(parse({ url: "https:// www.emag.ro/ssd" }).success).toBe(false);
    });

    test("rejects a link with control characters, even where the URL parser would ignore them", () => {
      for (const url of [
        "https://www.emag.ro/x\u0000y",
        "https://www.emag.ro/x\u0000",
        "https://www.em\nag.ro/ssd",
        "https://www.em\tag.ro/ssd",
        "https://www.emag.ro/s\rsd",
        "https://www.emag.ro/\u001fssd",
        "https://www.emag.ro/\u007fssd",
        "\u0000https://www.emag.ro/ssd",
      ]) {
        expect(parse({ url }).success).toBe(false);
      }
    });

    test("keeps an escaped NUL as plain text, since it cannot reach the database as a character", () => {
      expect(parse({ url: "https://www.emag.ro/x%00y" }).data?.url).toBe(
        "https://www.emag.ro/x%00y"
      );
    });

    test("rejects http, which is not upgraded", () => {
      for (const url of [
        "http://www.emag.ro/ssd",
        "HTTP://WWW.EMAG.RO/ssd",
        "http://emag.ro/x",
      ]) {
        expect(parse({ url }).success).toBe(false);
      }
    });

    test("rejects look-alike hosts", () => {
      for (const url of [
        "https://notemag.ro/x",
        "https://emag.ro.evil.example/x",
        "https://www.emag.ro.evil.example/x",
        "https://emag.com/x",
        "https://evil.example/emag.ro",
        "https://evil.example/?next=https://www.emag.ro/",
        "https://evil.example#www.emag.ro",
        "https://emag-ro.example/x",
        "https://emag.ro./x",
      ]) {
        expect(parse({ url }).success).toBe(false);
      }
    });

    test("rejects userinfo, even on the store's own host", () => {
      for (const url of [
        "https://evil.example@emag.ro/x",
        "https://user@www.emag.ro/x",
        "https://user:secret@www.emag.ro/x",
        "https://:secret@www.emag.ro/x",
        "https://www.emag.ro:@www.emag.ro/x",
      ]) {
        expect(parse({ url }).success).toBe(false);
      }
    });

    test("saves no userinfo even when it is empty", () => {
      expect(parse({ url: "https://@www.emag.ro/x" }).data?.url).toBe(
        "https://www.emag.ro/x"
      );
    });

    test("rejects userinfo tricks that hide the real host", () => {
      for (const url of [
        "https://emag.ro@evil.example/x",
        "https://www.emag.ro@evil.example/x",
        "https://www.emag.ro:secret@evil.example/x",
        "https://www.emag.ro%2f@evil.example/x",
        `https://evil.example${BACKSLASH}@www.emag.ro.evil.example/x`,
        `https://evil.example${BACKSLASH}.emag.ro/x`,
      ]) {
        expect(parse({ url }).success).toBe(false);
      }
    });

    test("rejects a port other than the default one", () => {
      for (const url of [
        "https://www.emag.ro:8443/ssd",
        "https://www.emag.ro:80/ssd",
        "https://www.emag.ro:0/ssd",
      ]) {
        expect(parse({ url }).success).toBe(false);
      }
    });

    test("rejects the domain of another store", () => {
      expect(parse({ store: "emag", url: "https://www.altex.ro/x" }).success).toBe(false);
      expect(parse({ store: "altex", url: "https://www.emag.ro/x" }).success).toBe(false);
      expect(parse({ store: "pcgarage", url: "https://www.emag.ro/x" }).success).toBe(false);
    });

    test("rejects anything but https", () => {
      for (const url of [
        "javascript:alert(1)",
        "data:text/html,<script>alert(1)</script>",
        "ftp://www.emag.ro/x",
        "file:///etc/passwd",
        "//www.emag.ro/x",
        "www.emag.ro/x",
        "/x",
        "",
        "   ",
        "not a url",
      ]) {
        expect(parse({ url }).success).toBe(false);
      }
    });

    test("fails with a message on the url field, not an exception, for a malformed host", () => {
      const result = parse({ url: "https://xn--e.emag.ro/" });

      expect(result.success).toBe(false);
      expect(result.error?.issues.some((issue) => issue.path[0] === "url")).toBe(true);
    });

    test("reports the host rule on the url field", () => {
      const result = parse({ url: "https://evil.example/x" });

      expect(result.error?.issues).toHaveLength(1);
      expect(result.error?.issues[0]?.path).toEqual(["url"]);
    });

    test("fails, without throwing, when the store is unknown", () => {
      const result = parse({ store: "cel", url: "https://www.emag.ro/x" });

      expect(result.success).toBe(false);
    });

    test("allows at most 2048 characters, before and after the link is made canonical", () => {
      const prefix = "https://www.emag.ro/";

      expect(parse({ url: urlOfLength(prefix, 2048) }).success).toBe(true);
      expect(parse({ url: urlOfLength(prefix, 2049) }).success).toBe(false);
      // spațiile se salvează ca %20: linkul canonic ar depăși limita
      expect(parse({ url: `${prefix}a${" ".repeat(1000)}b` }).success).toBe(false);
    });
  });

  describe("image link", () => {
    test("is optional and may be on any host, over http or https", () => {
      expect(parse({ imageUrl: undefined }).success).toBe(true);
      expect(parse({ imageUrl: "https://cdn.example/a.jpg" }).success).toBe(true);
      expect(parse({ imageUrl: "http://cdn.example/a.jpg" }).success).toBe(true);
    });

    test("rejects other schemes and malformed values", () => {
      for (const imageUrl of ["javascript:alert(1)", "data:image/png;base64,AAAA", "ftp://cdn.example/a.jpg", "a.jpg", ""]) {
        expect(parse({ imageUrl }).success).toBe(false);
      }
    });

    test("never keeps a control character, which would fail in the database", () => {
      for (const imageUrl of [
        "https://cdn.example/a\u0000.jpg",
        "https://cdn.example/a\n.jpg",
        "https://cdn.example/a\t.jpg",
        "https://cdn.example/a\u007f.jpg",
      ]) {
        // fie respins, fie curățat de parserul de URL-uri
        expect(parse({ imageUrl }).data?.imageUrl ?? "").not.toMatch(
          /[\u0000-\u001f\u007f]/
        );
      }
      expect(parse({ imageUrl: "https://cdn.example/a\u0000.jpg" }).success).toBe(false);
      expect(parse({ imageUrl: "https://cdn.example/a\u007f.jpg" }).success).toBe(false);
    });

    test("allows at most 2048 characters", () => {
      const prefix = "https://cdn.example/";

      expect(parse({ imageUrl: urlOfLength(prefix, 2048) }).success).toBe(true);
      expect(parse({ imageUrl: urlOfLength(prefix, 2049) }).success).toBe(false);
    });
  });

  describe("external id and title", () => {
    test("trims both and keeps what is left", () => {
      const result = parse({ externalId: "  ABC123  ", title: "  SSD WD Blue  " });

      expect(result.data?.externalId).toBe("ABC123");
      expect(result.data?.title).toBe("SSD WD Blue");
    });

    test("rejects empty or blank values", () => {
      for (const field of ["externalId", "title"]) {
        expect(parse({ [field]: "" }).success).toBe(false);
        expect(parse({ [field]: "   " }).success).toBe(false);
      }
    });

    test("allows an external id of at most 128 characters", () => {
      expect(parse({ externalId: "a".repeat(128) }).success).toBe(true);
      expect(parse({ externalId: "a".repeat(129) }).success).toBe(false);
    });

    test("allows a title of at most 300 characters", () => {
      expect(parse({ title: "a".repeat(300) }).success).toBe(true);
      expect(parse({ title: "a".repeat(301) }).success).toBe(false);
      expect(parse({ title: `${"a".repeat(300)}   ` }).success).toBe(true);
    });

    test("rejects control characters inside both, NUL first", () => {
      for (const field of ["externalId", "title"]) {
        for (const bad of [
          "ab\u0000cd",
          "ab\ncd",
          "ab\tcd",
          "ab\rcd",
          "ab\u001fcd",
          "ab\u007fcd",
          "ab\u0000",
        ]) {
          expect(parse({ [field]: bad }).success).toBe(false);
        }
      }
    });

    test("accepts a control character at the edges only because trim removes it", () => {
      expect(parse({ title: "SSD WD Blue\n" }).data?.title).toBe("SSD WD Blue");
      expect(parse({ externalId: "\tABC123" }).data?.externalId).toBe("ABC123");
    });

    test("accepts text with spaces, punctuation and non-ASCII letters", () => {
      const title = "Căști Sony WH-1000XM5, ™ 日本語 (negru) 128GB / 2TB";

      expect(parse({ title }).data?.title).toBe(title);
      expect(parse({ externalId: "ȘTEFAN 12/ABC-1" }).success).toBe(true);
    });
  });

  describe("identifiers", () => {
    test("accepts any text up to the caps, because invalid values are cleaned later", () => {
      for (const ean of ["WDS200T4G0E", "4006381333940", "not a gtin", "", "1".repeat(64)]) {
        expect(parse({ ean }).data?.ean).toBe(ean);
      }
      for (const mpn of ["N/A", "128GB", "TEST1", "", "a".repeat(128)]) {
        expect(parse({ mpn }).data?.mpn).toBe(mpn);
      }
    });

    test("drops an ean over 64 characters and a model code over 128, instead of rejecting the observation", () => {
      const eanResult = parse({ ean: "1".repeat(65) });
      const mpnResult = parse({ mpn: "a".repeat(129) });
      const hugeResult = parse({ ean: "1".repeat(100_000), mpn: "a".repeat(100_000) });

      expect(eanResult.success).toBe(true);
      expect(eanResult.data?.ean).toBeUndefined();
      expect(mpnResult.success).toBe(true);
      expect(mpnResult.data?.mpn).toBeUndefined();
      expect(hugeResult.success).toBe(true);
      expect(hugeResult.data?.ean).toBeUndefined();
      expect(hugeResult.data?.mpn).toBeUndefined();
    });

    test("keeps the other identifier when only one is dropped", () => {
      const result = parse({ ean: "1".repeat(65), mpn: "WDS200T4G0E" });

      expect(result.data?.ean).toBeUndefined();
      expect(result.data?.mpn).toBe("WDS200T4G0E");
    });

    test("rejects an identifier that is not text", () => {
      expect(parse({ ean: 7_180_379_046_105 }).success).toBe(false);
      expect(parse({ mpn: ["WDS200T4G0E"] }).success).toBe(false);
    });
  });

  describe("currency", () => {
    test("defaults to RON and accepts only RON", () => {
      expect(parse({}).data?.currency).toBe("RON");
      expect(parse({ currency: "RON" }).success).toBe(true);
      for (const currency of ["EUR", "USD", "ron", "RON ", "", "LEI", 1]) {
        expect(parse({ currency }).success).toBe(false);
      }
    });
  });

  describe("price", () => {
    test("accepts whole bani from 1 up to 100,000 RON", () => {
      expect(parse({ price: 1 }).success).toBe(true);
      expect(parse({ price: 12_999 }).success).toBe(true);
      expect(parse({ price: MAX_BANI }).success).toBe(true);
      expect(MAX_BANI).toBe(10_000_000);
    });

    test("rejects a price above the ceiling, including what the database could still store", () => {
      for (const price of [MAX_BANI + 1, 99_999_999, 2_000_000_000, INT4_MAX]) {
        expect(parse({ price }).success).toBe(false);
      }
    });

    test("rejects zero, negatives, fractions, overflow and non-numbers", () => {
      for (const price of [0, -1, 0.5, 129.99, INT4_MAX + 1, 1e12, Number.NaN, Number.POSITIVE_INFINITY, "12999", null]) {
        expect(parse({ price }).success).toBe(false);
      }
      expect(ingestPriceInput.safeParse({ ...valid, price: undefined }).success).toBe(false);
    });
  });

  test("defaults the stock to true and accepts false", () => {
    expect(parse({}).data?.inStock).toBe(true);
    expect(parse({ inStock: false }).data?.inStock).toBe(false);
    expect(parse({ inStock: "no" }).success).toBe(false);
  });
});

// Baza de date falsă pentru o tranzacție de ingestie: păstrează scrierile ca să se poată citi valorile și
// jurnalul apelurilor, ca să se vadă ordinea (blocarea înaintea verificărilor).
type Existing = {
  currentPrice: number | null;
  ean: string | null;
  mpn: string | null;
};

type FakeOptions = {
  existing?: Existing;
  // Rezultatul celor trei verificări ale punții: există rânduri cu EAN-ul, cu codul de model, cu amândouă.
  rows?: { ean?: boolean; mpn?: boolean; both?: boolean };
  // Există un punct de istoric mai nou de 5 minute.
  recentHistory?: boolean;
};

function fakeIngestDb({ existing, rows = {}, recentHistory = false }: FakeOptions = {}) {
  const written: {
    values?: Record<string, unknown>;
    set?: Record<string, unknown>;
    history: Record<string, unknown>[];
    historyUpdates: Record<string, unknown>[];
  } = { history: [], historyUpdates: [] };
  const calls: string[] = [];
  const locks: SQL[] = [];
  const bridgeWheres: SQL[] = [];
  const historyWheres: SQL[] = [];
  let transactions = 0;
  let productSelects = 0;

  const bridgeResults = [rows.ean, rows.mpn, rows.both].map((found) =>
    found ? [{ id: "other-row" }] : []
  );

  const tx = {
    select: () => ({
      from: (table: unknown) => ({
        where: (condition: SQL) => {
          if (table === priceHistory) {
            calls.push("select:history");
            historyWheres.push(condition);
            return {
              orderBy: () => ({
                limit: () =>
                  Promise.resolve(recentHistory ? [{ id: "history-1" }] : []),
              }),
            };
          }
          const index = productSelects;
          productSelects += 1;
          if (index === 0) {
            calls.push("select:existing");
            return {
              limit: () =>
                Promise.resolve(existing ? [{ id: EXISTING_ID, ...existing }] : []),
            };
          }
          calls.push("select:bridge");
          bridgeWheres.push(condition);
          return { limit: () => Promise.resolve(bridgeResults[index - 1] ?? []) };
        },
      }),
    }),
    execute: (query: SQL) => {
      calls.push("execute");
      locks.push(query);
      return Promise.resolve();
    },
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        if (table === priceHistory) {
          calls.push("insert:history");
          written.history.push(values);
          return Promise.resolve();
        }
        calls.push("insert:product");
        written.values = values;
        return {
          onConflictDoUpdate: (config: { set: Record<string, unknown> }) => {
            written.set = config.set;
            return { returning: () => Promise.resolve([{ id: PRODUCT_ID }]) };
          },
        };
      },
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: () => {
          calls.push("update:history");
          written.historyUpdates.push(values);
          return Promise.resolve();
        },
      }),
    }),
  };
  const db = {
    transaction: (callback: (transaction: typeof tx) => unknown) => {
      transactions += 1;
      return callback(tx);
    },
  } as unknown as Database;

  return {
    db,
    written,
    calls,
    locks,
    bridgeWheres,
    historyWheres,
    transactions: () => transactions,
    bridgeQueries: () => calls.filter((call) => call === "select:bridge").length,
  };
}

const session = { user: { id: "user-1" } } as unknown as Session;
const createCaller = t.createCallerFactory(productRouter);

function sqlOf(value: unknown) {
  return dialect.sqlToQuery(value as SQL);
}

describe("product.ingestPrice", () => {
  test("inserts a new product with cleaned identifiers and records its first price", async () => {
    const { db, written } = fakeIngestDb();
    const caller = createCaller({ session, db });

    const result = await caller.ingestPrice({
      ...valid,
      imageUrl: "https://cdn.example/a.jpg",
      ean: `0${GTIN}`,
      mpn: "wds100t4g0e-00cps0",
    });

    expect(result).toEqual({ productId: PRODUCT_ID, changed: true, previousPrice: null });
    expect(written.values).toMatchObject({
      store: "emag",
      externalId: "ABC123",
      ean: GTIN,
      mpn: "WDS100T4G0E",
      title: valid.title,
      url: valid.url,
      imageUrl: "https://cdn.example/a.jpg",
      currency: "RON",
      currentPrice: 149_077,
      inStock: true,
    });
    expect(written.values?.lastCheckedAt).toBeInstanceOf(Date);
    expect(written.history).toEqual([
      {
        productId: PRODUCT_ID,
        price: 149_077,
        inStock: true,
        source: "extension",
      },
    ]);
  });

  test("saves the link in its canonical form", async () => {
    const { db, written } = fakeIngestDb();

    await createCaller({ session, db }).ingestPrice({
      ...valid,
      url: "  HTTPS://WWW.EMAG.RO/ssd-wd-blue/pd/ABC123/?utm_source=x#top ",
    });

    expect(written.values?.url).toBe("https://www.emag.ro/ssd-wd-blue/pd/ABC123/");
  });

  test("indexes the title, the identifiers and the raw model code for search", async () => {
    const { db, written } = fakeIngestDb();
    const caller = createCaller({ session, db });

    await caller.ingestPrice({
      ...valid,
      store: "pcgarage",
      url: "https://www.pcgarage.ro/ssd/",
      title: "SSD WD Blue SN5000, 1TB",
      mpn: "WDS100T4G0E-00CPS0",
    });

    const text = String(written.values?.searchText);
    for (const word of ["ssd", "wd", "blue", "1tb", "wds100t4g0e", "00cps0"]) {
      expect(text.split(" ")).toContain(word);
    }
    expect(written.set?.searchText).toBe(text);
  });

  test("updates the changeable fields of an existing product and keeps the model code out of the way", async () => {
    const { db, written } = fakeIngestDb({
      existing: { currentPrice: 150_000, ean: null, mpn: null },
    });
    const caller = createCaller({ session, db });

    await caller.ingestPrice({ ...valid, ean: GTIN, mpn: "WDS200T4G0E" });

    expect(written.set).toMatchObject({
      title: valid.title,
      imageUrl: undefined,
      currency: "RON",
      currentPrice: 149_077,
      inStock: true,
    });
    expect(written.set?.lastCheckedAt).toBeInstanceOf(Date);
    // prima scriere câștigă și în SQL: coloana existentă are prioritate
    expect(sqlOf(written.set?.ean)).toEqual({
      sql: 'coalesce("products"."ean", $1)',
      params: [GTIN],
    });
    expect(sqlOf(written.set?.mpn)).toEqual({
      sql: 'coalesce("products"."mpn", $1)',
      params: ["WDS200T4G0E"],
    });
  });

  describe("link of an existing product", () => {
    test("keeps the link of the first write, in SQL as well", async () => {
      const { db, written } = fakeIngestDb({
        existing: { currentPrice: 149_077, ean: null, mpn: null },
      });

      await createCaller({ session, db }).ingestPrice({
        ...valid,
        url: "https://www.emag.ro/another-page/pd/ABC123/",
      });

      expect(sqlOf(written.set?.url)).toEqual({
        sql: 'coalesce("products"."url", $1)',
        params: ["https://www.emag.ro/another-page/pd/ABC123/"],
      });
      expect(written.values?.url).toBe("https://www.emag.ro/another-page/pd/ABC123/");
    });

    test("writes the canonical link as the value of a new row", async () => {
      const { db, written } = fakeIngestDb();

      await createCaller({ session, db }).ingestPrice({
        ...valid,
        url: "https://WWW.EMAG.RO/page?x=1",
      });

      expect(written.values?.url).toBe("https://www.emag.ro/page");
      expect(sqlOf(written.set?.url).params).toEqual(["https://www.emag.ro/page"]);
    });
  });

  test("drops invalid or overlong identifiers instead of rejecting the observation", async () => {
    const { db, written } = fakeIngestDb();
    const caller = createCaller({ session, db });

    const result = await caller.ingestPrice({
      ...valid,
      ean: "WDS200T4G0E",
      mpn: "128GB",
    });
    const overlong = await createCaller({ session, db: fakeIngestDb().db }).ingestPrice({
      ...valid,
      ean: "9".repeat(64),
      mpn: `A1${"B".repeat(100)}`,
    });
    const overCaps = await createCaller({ session, db: fakeIngestDb().db }).ingestPrice({
      ...valid,
      ean: "9".repeat(65),
      mpn: `A1${"B".repeat(200)}`,
    });

    expect(result.changed).toBe(true);
    expect(overlong.changed).toBe(true);
    expect(overCaps.changed).toBe(true);
    expect(written.values?.ean).toBeUndefined();
    expect(written.values?.mpn).toBeUndefined();
    expect(written.set?.ean).toBeUndefined();
    expect(written.set?.mpn).toBeUndefined();
    expect(written.values?.searchText).toBe(
      "ssd wd blue sn5000 2tb"
    );
  });

  test("never overwrites a stored identifier, and keeps the stored ones in the search text", async () => {
    const { db, written } = fakeIngestDb({
      existing: { currentPrice: 149_077, ean: "4006381333931", mpn: "WDS200T4G0E" },
    });
    const caller = createCaller({ session, db });

    await caller.ingestPrice({
      ...valid,
      ean: GTIN,
      mpn: "SM-S921BZKDEUE",
    });

    expect(written.values?.ean).toBeUndefined();
    expect(written.values?.mpn).toBeUndefined();
    expect(written.set?.ean).toBeUndefined();
    expect(written.set?.mpn).toBeUndefined();
    const words = String(written.values?.searchText).split(" ");
    expect(words).toContain("4006381333931");
    expect(words).toContain("wds200t4g0e");
    // codul de model al altui produs nu intră în textul de căutare
    expect(words).not.toContain("sms921bzkdeue");
    expect(words).not.toContain("s921bzkdeue");
    expect(words).not.toContain(GTIN);
  });

  test("keeps the stored identifiers when the request has none", async () => {
    const { db, written } = fakeIngestDb({
      existing: { currentPrice: 149_077, ean: GTIN, mpn: "WDS200T4G0E" },
    });

    await createCaller({ session, db }).ingestPrice(valid);

    expect(written.set?.ean).toBeUndefined();
    expect(written.set?.mpn).toBeUndefined();
    const words = String(written.values?.searchText).split(" ");
    expect(words).toContain(GTIN);
    expect(words).toContain("wds200t4g0e");
  });

  test("fills only the identifier the product does not have yet", async () => {
    const { db, written } = fakeIngestDb({
      existing: { currentPrice: 149_077, ean: GTIN, mpn: null },
    });

    await createCaller({ session, db }).ingestPrice({
      ...valid,
      ean: "4006381333931",
      mpn: "WDS200T4G0E",
    });

    expect(written.set?.ean).toBeUndefined();
    expect(sqlOf(written.set?.mpn).params).toEqual(["WDS200T4G0E"]);
    expect(String(written.values?.searchText).split(" ")).toContain("wds200t4g0e");
  });

  describe("identifier bridge guard", () => {
    const BOTH = { ean: GTIN, mpn: "WDS200T4G0E" };

    test("stores only the ean when a new row would join the group of an ean and the group of a model code", async () => {
      const { db, written, bridgeQueries } = fakeIngestDb({
        rows: { ean: true, mpn: true, both: false },
      });

      const result = await createCaller({ session, db }).ingestPrice({
        ...valid,
        ...BOTH,
      });

      expect(result.changed).toBe(true);
      expect(written.values?.ean).toBe(GTIN);
      expect(written.values?.mpn).toBeUndefined();
      expect(written.set?.mpn).toBeUndefined();
      expect(bridgeQueries()).toBe(3);
      // codul de model care nu s-a salvat nu intră nici în textul de căutare
      const words = String(written.values?.searchText).split(" ");
      expect(words).toContain(GTIN);
      expect(words).not.toContain("wds200t4g0e");
    });

    test("writes both identifiers of a first write when only the ean is known elsewhere", async () => {
      const { db, written, bridgeQueries } = fakeIngestDb({
        rows: { ean: true, mpn: false, both: false },
      });

      await createCaller({ session, db }).ingestPrice({ ...valid, ...BOTH });

      expect(written.values?.ean).toBe(GTIN);
      expect(written.values?.mpn).toBe("WDS200T4G0E");
      // fără rânduri cu codul de model nu mai e nevoie de a treia verificare
      expect(bridgeQueries()).toBe(2);
    });

    test("writes both identifiers of a first write when only the model code is known elsewhere", async () => {
      const { db, written } = fakeIngestDb({
        rows: { ean: false, mpn: true, both: false },
      });

      await createCaller({ session, db }).ingestPrice({ ...valid, ...BOTH });

      expect(written.values?.ean).toBe(GTIN);
      expect(written.values?.mpn).toBe("WDS200T4G0E");
    });

    test("writes both identifiers when neither is known yet, after one check", async () => {
      const { db, written, bridgeQueries } = fakeIngestDb();

      await createCaller({ session, db }).ingestPrice({ ...valid, ...BOTH });

      expect(written.values?.ean).toBe(GTIN);
      expect(written.values?.mpn).toBe("WDS200T4G0E");
      expect(bridgeQueries()).toBe(1);
    });

    test("writes both identifiers when a row already has both, because the groups are already joined", async () => {
      const { db, written, bridgeQueries } = fakeIngestDb({
        rows: { ean: true, mpn: true, both: true },
      });

      await createCaller({ session, db }).ingestPrice({ ...valid, ...BOTH });

      expect(written.values?.ean).toBe(GTIN);
      expect(written.values?.mpn).toBe("WDS200T4G0E");
      expect(bridgeQueries()).toBe(3);
    });

    test("completes a row that has the ean with the model code nobody else has", async () => {
      const { db, written } = fakeIngestDb({
        existing: { currentPrice: 149_077, ean: GTIN, mpn: null },
        rows: { ean: false, mpn: false, both: false },
      });

      await createCaller({ session, db }).ingestPrice({ ...valid, ...BOTH });

      expect(written.set?.ean).toBeUndefined();
      expect(sqlOf(written.set?.mpn).params).toEqual(["WDS200T4G0E"]);
    });

    test("completes a row that has the ean with the model code of the same product, which other rows already carry together", async () => {
      const { db, written } = fakeIngestDb({
        existing: { currentPrice: 149_077, ean: GTIN, mpn: null },
        rows: { ean: true, mpn: true, both: true },
      });

      await createCaller({ session, db }).ingestPrice({ ...valid, ...BOTH });

      expect(sqlOf(written.set?.mpn).params).toEqual(["WDS200T4G0E"]);
    });

    test("does not complete a row that has the ean with a model code that would join two groups", async () => {
      const { db, written } = fakeIngestDb({
        existing: { currentPrice: 149_077, ean: GTIN, mpn: null },
        rows: { ean: true, mpn: true, both: false },
      });

      await createCaller({ session, db }).ingestPrice({ ...valid, ...BOTH });

      expect(written.set?.ean).toBeUndefined();
      expect(written.set?.mpn).toBeUndefined();
      expect(String(written.values?.searchText).split(" ")).not.toContain("wds200t4g0e");
    });

    test("checks a model code sent alone for a row that already has an ean", async () => {
      const bridge = fakeIngestDb({
        existing: { currentPrice: 149_077, ean: GTIN, mpn: null },
        rows: { ean: true, mpn: true, both: false },
      });
      const free = fakeIngestDb({
        existing: { currentPrice: 149_077, ean: GTIN, mpn: null },
        rows: { ean: true, mpn: false, both: false },
      });

      await createCaller({ session, db: bridge.db }).ingestPrice({
        ...valid,
        mpn: "WDS200T4G0E",
      });
      await createCaller({ session, db: free.db }).ingestPrice({
        ...valid,
        mpn: "WDS200T4G0E",
      });

      expect(bridge.written.set?.mpn).toBeUndefined();
      expect(sqlOf(free.written.set?.mpn).params).toEqual(["WDS200T4G0E"]);
    });

    test("keeps the model code and drops the ean when the row has a model code and the ean would join two groups", async () => {
      const { db, written } = fakeIngestDb({
        existing: { currentPrice: 149_077, ean: null, mpn: "WDS200T4G0E" },
        rows: { ean: true, mpn: true, both: false },
      });

      await createCaller({ session, db }).ingestPrice({ ...valid, ean: GTIN });

      expect(written.set?.ean).toBeUndefined();
      expect(written.set?.mpn).toBeUndefined();
      const words = String(written.values?.searchText).split(" ");
      expect(words).toContain("wds200t4g0e");
      expect(words).not.toContain(GTIN);
    });

    test("fills the missing ean of a row that has a model code when nothing is joined", async () => {
      const { db, written } = fakeIngestDb({
        existing: { currentPrice: 149_077, ean: null, mpn: "WDS200T4G0E" },
        rows: { ean: false, mpn: true, both: false },
      });

      await createCaller({ session, db }).ingestPrice({ ...valid, ean: GTIN });

      expect(sqlOf(written.set?.ean).params).toEqual([GTIN]);
    });

    test("does not look at other rows when the row ends up with one identifier only", async () => {
      const onlyEan = fakeIngestDb();
      const onlyMpn = fakeIngestDb();
      const invalidMpn = fakeIngestDb();
      const none = fakeIngestDb();

      await createCaller({ session, db: onlyEan.db }).ingestPrice({ ...valid, ean: GTIN });
      await createCaller({ session, db: onlyMpn.db }).ingestPrice({
        ...valid,
        mpn: "WDS200T4G0E",
      });
      await createCaller({ session, db: invalidMpn.db }).ingestPrice({
        ...valid,
        ean: GTIN,
        mpn: "128GB",
      });
      await createCaller({ session, db: none.db }).ingestPrice(valid);

      for (const fake of [onlyEan, onlyMpn, invalidMpn, none]) {
        expect(fake.bridgeQueries()).toBe(0);
        expect(fake.locks).toHaveLength(0);
      }
      expect(invalidMpn.written.values?.ean).toBe(GTIN);
    });

    test("does not look at other rows when the row already has both identifiers", async () => {
      const { db, bridgeQueries, locks } = fakeIngestDb({
        existing: { currentPrice: 149_077, ean: GTIN, mpn: "WDS200T4G0E" },
        rows: { ean: true, mpn: true, both: false },
      });

      await createCaller({ session, db }).ingestPrice({
        ...valid,
        ean: OTHER_GTIN,
        mpn: "SM-S921BZKDEUE",
      });

      expect(bridgeQueries()).toBe(0);
      expect(locks).toHaveLength(0);
    });

    test("takes a lock before it reads the other rows, in the same transaction", async () => {
      const { db, calls, locks, transactions } = fakeIngestDb({
        rows: { ean: true, mpn: true, both: false },
      });

      await createCaller({ session, db }).ingestPrice({ ...valid, ...BOTH });

      expect(transactions()).toBe(1);
      expect(calls.slice(0, 5)).toEqual([
        "select:existing",
        "execute",
        "select:bridge",
        "select:bridge",
        "select:bridge",
      ]);
      expect(calls.indexOf("insert:product")).toBeGreaterThan(calls.lastIndexOf("select:bridge"));
      expect(locks).toHaveLength(1);
      expect(sqlOf(locks[0]).sql).toBe(
        "select pg_advisory_xact_lock(hashtext('products-identifier-bridge'))"
      );
    });

    test("looks for the ean, then the model code, then both, and leaves out the row being written", async () => {
      const { db, bridgeWheres } = fakeIngestDb({
        existing: { currentPrice: 149_077, ean: null, mpn: null },
        rows: { ean: true, mpn: true, both: true },
      });

      await createCaller({ session, db }).ingestPrice({ ...valid, ...BOTH });

      expect(bridgeWheres.map((where) => sqlOf(where))).toEqual([
        {
          sql: '(("products"."ean" = $1) and ("products"."id" <> $2))',
          params: [GTIN, EXISTING_ID],
        },
        {
          sql: '(("products"."mpn" = $1) and ("products"."id" <> $2))',
          params: ["WDS200T4G0E", EXISTING_ID],
        },
        {
          sql: '(((("products"."ean" = $1) and ("products"."mpn" = $2))) and ("products"."id" <> $3))',
          params: [GTIN, "WDS200T4G0E", EXISTING_ID],
        },
      ]);
    });

    test("does not leave out any row for a row that does not exist yet", async () => {
      const { db, bridgeWheres } = fakeIngestDb({
        rows: { ean: true, mpn: true, both: true },
      });

      await createCaller({ session, db }).ingestPrice({ ...valid, ...BOTH });

      expect(sqlOf(bridgeWheres[0])).toEqual({
        sql: '"products"."ean" = $1',
        params: [GTIN],
      });
    });

    test("still records the price and the observation when the model code is dropped", async () => {
      const { db, written } = fakeIngestDb({
        rows: { ean: true, mpn: true, both: false },
      });

      const result = await createCaller({ session, db }).ingestPrice({
        ...valid,
        ...BOTH,
      });

      expect(result).toEqual({ productId: PRODUCT_ID, changed: true, previousPrice: null });
      expect(written.values?.currentPrice).toBe(149_077);
      expect(written.history).toHaveLength(1);
    });
  });

  test("records no history when the price did not change", async () => {
    const { db, written, calls } = fakeIngestDb({
      existing: { currentPrice: 149_077, ean: null, mpn: null },
    });

    const result = await createCaller({ session, db }).ingestPrice(valid);

    expect(result).toEqual({
      productId: PRODUCT_ID,
      changed: false,
      previousPrice: 149_077,
    });
    expect(written.history).toEqual([]);
    expect(written.historyUpdates).toEqual([]);
    expect(calls).not.toContain("select:history");
  });

  test("records the new price and the stock when the price changed", async () => {
    const { db, written } = fakeIngestDb({
      existing: { currentPrice: 160_000, ean: null, mpn: null },
    });

    const result = await createCaller({ session, db }).ingestPrice({
      ...valid,
      inStock: false,
    });

    expect(result).toEqual({
      productId: PRODUCT_ID,
      changed: true,
      previousPrice: 160_000,
    });
    expect(written.history).toEqual([
      {
        productId: PRODUCT_ID,
        price: 149_077,
        inStock: false,
        source: "extension",
      },
    ]);
  });

  describe("rapid price changes", () => {
    test("does not add a history point when the last one is younger than 5 minutes, and rewrites it instead", async () => {
      const { db, written } = fakeIngestDb({
        existing: { currentPrice: 160_000, ean: null, mpn: null },
        recentHistory: true,
      });

      const result = await createCaller({ session, db }).ingestPrice({
        ...valid,
        inStock: false,
      });

      expect(result).toEqual({
        productId: PRODUCT_ID,
        changed: true,
        previousPrice: 160_000,
      });
      expect(written.history).toEqual([]);
      expect(written.historyUpdates).toEqual([{ price: 149_077, inStock: false }]);
    });

    test("still updates the current price and the check time of the product", async () => {
      const { db, written } = fakeIngestDb({
        existing: { currentPrice: 160_000, ean: null, mpn: null },
        recentHistory: true,
      });

      await createCaller({ session, db }).ingestPrice(valid);

      expect(written.values).toMatchObject({ currentPrice: 149_077, inStock: true });
      expect(written.set).toMatchObject({ currentPrice: 149_077, inStock: true });
      expect(written.set?.lastCheckedAt).toBeInstanceOf(Date);
    });

    test("adds a history point when the last one is 5 minutes old or older", async () => {
      const { db, written } = fakeIngestDb({
        existing: { currentPrice: 160_000, ean: null, mpn: null },
        recentHistory: false,
      });

      await createCaller({ session, db }).ingestPrice(valid);

      expect(written.history).toHaveLength(1);
      expect(written.historyUpdates).toEqual([]);
    });

    test("looks for a point of this product recorded in the last 5 minutes, by the database clock", async () => {
      const { db, historyWheres } = fakeIngestDb({
        existing: { currentPrice: 160_000, ean: null, mpn: null },
      });

      await createCaller({ session, db }).ingestPrice(valid);

      expect(historyWheres).toHaveLength(1);
      expect(sqlOf(historyWheres[0])).toEqual({
        sql: '(("price_history"."product_id" = $1) and ("price_history"."recorded_at" > now() - interval \'5 minutes\'))',
        params: [PRODUCT_ID],
      });
    });

    test("does not look for history when the product is new", async () => {
      const { db, written, calls } = fakeIngestDb();

      await createCaller({ session, db }).ingestPrice(valid);

      expect(calls).not.toContain("select:history");
      expect(written.history).toHaveLength(1);
    });

    test("keeps at most one point per window when a price flaps between two values", async () => {
      // primul apel scrie punctul, următoarele (în aceeași fereastră) îl rescriu
      const first = fakeIngestDb();
      const second = fakeIngestDb({
        existing: { currentPrice: 149_077, ean: null, mpn: null },
        recentHistory: true,
      });
      const third = fakeIngestDb({
        existing: { currentPrice: 100_000, ean: null, mpn: null },
        recentHistory: true,
      });

      await createCaller({ session, db: first.db }).ingestPrice(valid);
      await createCaller({ session, db: second.db }).ingestPrice({ ...valid, price: 100_000 });
      await createCaller({ session, db: third.db }).ingestPrice({ ...valid, price: 149_077 });

      const inserted = [first, second, third].flatMap((fake) => fake.written.history);
      expect(inserted).toHaveLength(1);
      expect(third.written.historyUpdates).toEqual([{ price: 149_077, inStock: true }]);
    });
  });

  test("rejects an unsupported store, a foreign or unsafe link or a price above the ceiling before touching the database", async () => {
    const { db, transactions } = fakeIngestDb();
    const caller = createCaller({ session, db });

    await expect(
      caller.ingestPrice({ ...valid, store: "cel" as never })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller.ingestPrice({ ...valid, url: "https://emag.ro@evil.example/x" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller.ingestPrice({ ...valid, url: "https://evil.example@emag.ro/x" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller.ingestPrice({ ...valid, url: "http://www.emag.ro/x" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller.ingestPrice({ ...valid, price: MAX_BANI + 1 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller.ingestPrice({ ...valid, title: "SSD\u0000WD" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller.ingestPrice({ ...valid, externalId: "AB\u0000C" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(transactions()).toBe(0);
  });

  test("requires a session", async () => {
    const { db, transactions } = fakeIngestDb();

    await expect(
      createCaller({ session: null, db }).ingestPrice(valid)
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(transactions()).toBe(0);
  });
});

describe("product.list", () => {
  function listDb() {
    const wheres: unknown[] = [];
    let selects = 0;
    const db = {
      select: () => {
        selects += 1;
        return {
          from: () => ({
            where: (condition: unknown) => {
              wheres.push(condition);
              return {
                orderBy: () => ({ limit: () => Promise.resolve([]) }),
              };
            },
          }),
        };
      },
    } as unknown as Database;
    return { db, wheres, selects: () => selects };
  }

  test("requires a session, because the search has no index and must not be free for anyone", async () => {
    const { db, selects } = listDb();

    await expect(
      createCaller({ session: null, db }).list({ q: "casti" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(selects()).toBe(0);
  });

  test("accepts a search text of at most 80 characters and trims it", async () => {
    const { db, wheres } = listDb();
    const caller = createCaller({ session, db });

    await caller.list({ q: "a".repeat(80) });
    await caller.list({ q: "  casti  " });

    expect(sqlOf(wheres[1]).params).toEqual(["%casti%"]);
  });

  test("rejects a longer search text before querying", async () => {
    const { db, wheres } = listDb();

    await expect(
      createCaller({ session, db }).list({ q: "a".repeat(81) })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(wheres).toHaveLength(0);
  });

  test("rejects control characters in the search text before querying", async () => {
    const { db, selects } = listDb();

    await expect(
      createCaller({ session, db }).list({ q: "ca\u0000sti" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      createCaller({ session, db }).list({ q: "ca\nsti" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(selects()).toBe(0);
  });

  test("keeps at most 100 results", async () => {
    const { db } = listDb();

    await expect(
      createCaller({ session, db }).list({ q: "casti", limit: 101 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("product.getById", () => {
  test("is not offered any more", () => {
    expect(Object.keys(productRouter._def.procedures).sort()).toEqual([
      "history",
      "ingestPrice",
      "list",
    ]);
  });
});

describe("product.history", () => {
  type Point = { price: number; inStock: boolean; recordedAt: Date };

  function point(price: number, minutes: number): Point {
    return {
      price,
      inStock: true,
      recordedAt: new Date(Date.UTC(2026, 3, 10, 0, minutes)),
    };
  }

  // Baza de date întoarce punctele în ordinea cerută (cele mai noi întâi), cel mult cât cere `limit`.
  function historyDb(rows: Point[]) {
    const captured: { orderBy: unknown[]; limit?: number; where?: unknown } = {
      orderBy: [],
    };
    const db = {
      select: () => ({
        from: () => ({
          where: (condition: unknown) => {
            captured.where = condition;
            return {
              orderBy: (...order: unknown[]) => {
                captured.orderBy = order;
                return {
                  limit: (limit: number) => {
                    captured.limit = limit;
                    return Promise.resolve(rows.slice(0, limit));
                  },
                };
              },
            };
          },
        }),
      }),
    } as unknown as Database;
    return { db, captured };
  }

  test("is public", async () => {
    const { db } = historyDb([]);

    const result = await createCaller({ session: null, db }).history({
      productId: PRODUCT_ID,
    });

    expect(result).toEqual({ points: [], stats: null });
  });

  test("asks for the newest 2000 points of the interval", async () => {
    const { db, captured } = historyDb([]);

    await createCaller({ session: null, db }).history({ productId: PRODUCT_ID, days: 30 });

    expect(captured.limit).toBe(2000);
    expect(captured.orderBy).toHaveLength(1);
    expect(sqlOf(captured.orderBy[0]).sql).toBe('"price_history"."recorded_at" desc');
    const where = sqlOf(captured.where);
    expect(where.sql).toBe(
      '(("price_history"."product_id" = $1) and ("price_history"."recorded_at" >= $2))'
    );
    expect(where.params[0]).toBe(PRODUCT_ID);
  });

  test("returns the points in chronological order, with statistics", async () => {
    // în ordinea bazei de date: cel mai nou primul
    const { db } = historyDb([point(9000, 3), point(11_000, 2), point(10_000, 1)]);

    const result = await createCaller({ session: null, db }).history({ productId: PRODUCT_ID });

    expect(result.points.map((p) => p.price)).toEqual([10_000, 11_000, 9000]);
    expect(result.stats).toEqual({
      min: 9000,
      max: 11_000,
      current: 9000,
      changePct: -10,
    });
  });

  test("returns a single point with no change", async () => {
    const { db } = historyDb([point(10_000, 1)]);

    const result = await createCaller({ session: null, db }).history({ productId: PRODUCT_ID });

    expect(result.stats).toEqual({ min: 10_000, max: 10_000, current: 10_000, changePct: 0 });
  });

  test("returns at most 2000 points, the newest ones", async () => {
    const newestFirst = Array.from({ length: 5000 }, (_, index) => point(1000 + index, 5000 - index));
    const { db } = historyDb(newestFirst);

    const result = await createCaller({ session: null, db }).history({ productId: PRODUCT_ID });

    expect(result.points).toHaveLength(2000);
    expect(result.points[0]?.price).toBe(1000 + 1999);
    expect(result.points.at(-1)?.price).toBe(1000);
    expect(result.stats).toMatchObject({ min: 1000, max: 2999, current: 1000 });
  });

  test("computes the statistics without spreading the points, which fails for very large arrays", async () => {
    const rows = Array.from({ length: 300_000 }, (_, index) => point(1 + (index % 977), index));
    // o bază de date care ignoră limita: statisticile nu trebuie să depindă de numărul de argumente
    const unlimited = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({ limit: () => Promise.resolve(rows) }),
          }),
        }),
      }),
    } as unknown as Database;

    const result = await createCaller({ session: null, db: unlimited }).history({
      productId: PRODUCT_ID,
    });

    expect(result.points).toHaveLength(300_000);
    expect(result.stats?.min).toBe(1);
    expect(result.stats?.max).toBe(977);
  });

  test("rejects a bad product id and an interval out of range before querying", async () => {
    const { db, captured } = historyDb([]);
    const caller = createCaller({ session: null, db });

    await expect(caller.history({ productId: "nope" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(
      caller.history({ productId: PRODUCT_ID, days: 366 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(captured.limit).toBeUndefined();
  });
});
