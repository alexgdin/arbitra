import { describe, expect, test } from "bun:test";

import type { Session } from "@my-better-t-app/auth";
import type { Database } from "@my-better-t-app/db";

import { t } from "../index";
import { INT4_MAX, MAX_BANI } from "../schemas";
import { brokerRouter } from "./broker";

const createCaller = t.createCallerFactory(brokerRouter);
const session = { user: { id: "user-1" } } as unknown as Session;
const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";

function fakeDb() {
  const updates: Record<string, unknown>[] = [];
  const inserts: Record<string, unknown>[] = [];
  const db = {
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: () => {
          updates.push(values);
          return Promise.resolve();
        },
      }),
    }),
    select: () => ({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve([{ id: PRODUCT_ID }]) }),
      }),
    }),
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        inserts.push(values);
        return {
          onConflictDoUpdate: () => ({
            returning: () => Promise.resolve([{ id: "item-1" }]),
          }),
        };
      },
    }),
  } as unknown as Database;
  return { db, updates, inserts };
}

describe("broker.updateSettings", () => {
  test("accepts an order cap and a monthly budget above the price ceiling", async () => {
    const { db, updates } = fakeDb();

    const result = await createCaller({ session, db }).updateSettings({
      maxOrderValue: MAX_BANI + 1,
      monthlyBudget: INT4_MAX,
    });

    expect(result).toEqual({ ok: true });
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      brokerMaxOrderValue: MAX_BANI + 1,
      brokerMonthlyBudget: INT4_MAX,
    });
  });

  test("still rejects an amount the column cannot store, before updating", async () => {
    const { db, updates } = fakeDb();
    const caller = createCaller({ session, db });

    await expect(
      caller.updateSettings({ maxOrderValue: INT4_MAX + 1 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller.updateSettings({ monthlyBudget: 0 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(updates).toHaveLength(0);
  });

  test("clears a limit with null", async () => {
    const { db, updates } = fakeDb();

    await createCaller({ session, db }).updateSettings({ maxOrderValue: null });

    expect(updates[0]).toMatchObject({ brokerMaxOrderValue: null });
  });
});

describe("broker.setTarget", () => {
  test("accepts a target price up to the price ceiling", async () => {
    const { db, inserts } = fakeDb();

    await createCaller({ session, db }).setTarget({
      productId: PRODUCT_ID,
      targetPrice: MAX_BANI,
    });

    expect(inserts[0]).toMatchObject({ targetPrice: MAX_BANI });
  });

  test("rejects a target price above the price ceiling, before querying", async () => {
    const { db, inserts } = fakeDb();

    await expect(
      createCaller({ session, db }).setTarget({
        productId: PRODUCT_ID,
        targetPrice: MAX_BANI + 1,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(inserts).toHaveLength(0);
  });
});
