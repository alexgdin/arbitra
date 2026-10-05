import { Pool } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { drizzle } from "drizzle-orm/node-postgres";

import type { DatabaseConfig } from "./config";
import { relations } from "./relations";

function createPgDb(url: string) {
  return drizzle(url, { relations });
}

export type Database = ReturnType<typeof createPgDb>;

// Neon acceptă conexiuni prin WebSocket pe portul 443. Multe rețele (Wi-Fi de la evenimente,
// rețele de firmă) blochează portul Postgres 5432, așa că pentru Neon folosim driverul lor.
function isNeonUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith(".neon.tech");
  } catch {
    return false;
  }
}

export function createDb(env: DatabaseConfig): Database {
  if (isNeonUrl(env.DATABASE_URL)) {
    const pool = new Pool({ connectionString: env.DATABASE_URL });
    // Ambele drivere expun același API Drizzle pentru Postgres (select, insert, transaction, query).
    return drizzleNeon({ client: pool, relations }) as unknown as Database;
  }
  return createPgDb(env.DATABASE_URL);
}
