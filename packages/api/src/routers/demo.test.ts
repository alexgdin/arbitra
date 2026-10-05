import { afterEach, describe, expect, test } from "bun:test";

import type { Session } from "@my-better-t-app/auth";
import type { Database } from "@my-better-t-app/db";

import { t } from "../index";
import { demoRouter, simulatedPrice } from "./demo";

const createCaller = t.createCallerFactory(demoRouter);
const session = { user: { id: "user-1" } } as unknown as Session;
const PRODUCT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const originalEnv = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = originalEnv;
});

// Baza de date falsă pentru simulateDrop: citirea produsului urmărit și scrierile din tranzacție.
function fakeDb(tracked: { externalId: string; targetPrice: number | null } | undefined) {
  const updates: unknown[] = [];
  const inserts: unknown[] = [];
  const tx = {
    update: () => ({
      set: (values: unknown) => ({
        where: () => {
          updates.push(values);
          return Promise.resolve();
        },
      }),
    }),
    insert: () => ({
      values: (values: unknown) => {
        inserts.push(values);
        return Promise.resolve();
      },
    }),
  };
  const db = {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            limit: () => Promise.resolve(tracked ? [tracked] : []),
          }),
        }),
      }),
    }),
    transaction: (run: (transaction: typeof tx) => Promise<unknown>) => run(tx),
  } as unknown as Database;
  return { db, updates, inserts };
}

describe("simulatedPrice", () => {
  test("is 10 lei under the target, but at least 1 leu", () => {
    expect(simulatedPrice(130_000)).toBe(129_000);
    expect(simulatedPrice(1000)).toBe(100);
    expect(simulatedPrice(50)).toBe(100);
  });
});

describe("demo.simulateDrop", () => {
  test("is forbidden in production", async () => {
    process.env.NODE_ENV = "production";
    const { db, updates } = fakeDb({ externalId: "demo-emag-1", targetPrice: 130_000 });

    await expect(
      createCaller({ session, db }).simulateDrop({ productId: PRODUCT })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(updates).toEqual([]);
  });

  test("requires a session", async () => {
    const { db } = fakeDb(undefined);
    await expect(
      createCaller({ session: null, db }).simulateDrop({ productId: PRODUCT })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  test("rejects a product the user does not track", async () => {
    const { db } = fakeDb(undefined);
    await expect(
      createCaller({ session, db }).simulateDrop({ productId: PRODUCT })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("rejects a product that is not a demo product", async () => {
    const { db, updates } = fakeDb({ externalId: "12345", targetPrice: 130_000 });
    await expect(
      createCaller({ session, db }).simulateDrop({ productId: PRODUCT })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(updates).toEqual([]);
  });

  test("rejects a tracked product without a target price", async () => {
    const { db } = fakeDb({ externalId: "demo-emag-5", targetPrice: null });
    await expect(
      createCaller({ session, db }).simulateDrop({ productId: PRODUCT })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  test("drops the price under the target and records a manual history point", async () => {
    const { db, updates, inserts } = fakeDb({
      externalId: "demo-emag-1",
      targetPrice: 130_000,
    });

    const result = await createCaller({ session, db }).simulateDrop({
      productId: PRODUCT,
    });

    expect(result).toEqual({ productId: PRODUCT, newPrice: 129_000 });
    expect(updates).toEqual([
      { currentPrice: 129_000, inStock: true, lastCheckedAt: expect.any(Date) },
    ]);
    expect(inserts).toEqual([
      {
        productId: PRODUCT,
        price: 129_000,
        inStock: true,
        source: "manual",
        recordedAt: expect.any(Date),
      },
    ]);
  });
});

describe("demo.trackedDemoProducts", () => {
  test("is forbidden in production", async () => {
    process.env.NODE_ENV = "production";
    const { db } = fakeDb(undefined);
    await expect(
      createCaller({ session, db }).trackedDemoProducts()
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
