import type { Database } from "@my-better-t-app/db";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

import type { CatalogRow } from "../lib/catalog";
import { SUPPORTED_STORE_IDS } from "../lib/store-config";

const dialect = new PgDialect();

// Un pas al scenariului: o interogare singură (`single`) sau câte una pe magazin cunoscut (`perStore`), cum
// fac căutarea și încărcarea surorilor. La `perStore`, fiecare interogare primește doar rândurile magazinului
// din condiția ei (ultimul parametru: `... and store = $n`).
export type Step = { single: CatalogRow[] } | { perStore: CatalogRow[] };

export function single(rows: CatalogRow[]): Step {
  return { single: rows };
}

export function perStore(rows: CatalogRow[]): Step {
  return { perStore: rows };
}

function queriesIn(step: Step): number {
  return "single" in step ? 1 : SUPPORTED_STORE_IDS.length;
}

function storeOf(condition: SQL | undefined): unknown {
  return condition ? dialect.sqlToQuery(condition).params.at(-1) : undefined;
}

// Baza de date falsă a catalogului: fiecare interogare primește rezultatul pasului ei, în ordinea apelurilor,
// iar condițiile (`wheres`), ordonările (`orders`) și limitele (`limits`) se păstrează ca testele să le poată citi.
export function fakeCatalogDb(steps: Step[]) {
  const wheres: (SQL | undefined)[] = [];
  const orders: SQL[][] = [];
  const limits: number[] = [];

  function rowsFor(call: number, condition: SQL | undefined): CatalogRow[] {
    let start = 0;
    for (const step of steps) {
      if (call < start + queriesIn(step)) {
        if ("single" in step) {
          return step.single;
        }
        const store = storeOf(condition);
        return step.perStore.filter((row) => row.store === store);
      }
      start += queriesIn(step);
    }
    return [];
  }

  const db = {
    select: () => ({
      from: () => ({
        where: (condition: SQL | undefined) => {
          const result = Promise.resolve(rowsFor(wheres.length, condition));
          wheres.push(condition);
          return Object.assign(result, {
            limit: (limit: number) => {
              limits.push(limit);
              return result;
            },
            orderBy: (...order: SQL[]) => {
              orders.push(order);
              return {
                limit: (limit: number) => {
                  limits.push(limit);
                  return result;
                },
              };
            },
          });
        },
      }),
    }),
  } as unknown as Database;

  return { db, wheres, orders, limits, queries: () => wheres.length };
}

export function sqlOf(condition: SQL | undefined) {
  if (!condition) {
    throw new Error("Expected a condition");
  }
  return dialect.sqlToQuery(condition);
}
