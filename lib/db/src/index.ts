import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

export const databaseUrl = process.env.DATABASE_URL ?? "";
export const databaseUrlProtocol = (() => {
  if (!databaseUrl) return "";
  try {
    return new URL(databaseUrl).protocol;
  } catch {
    return "invalid:";
  }
})();

export const isPostgresDatabaseUrl =
  databaseUrlProtocol === "postgres:" || databaseUrlProtocol === "postgresql:";

export const databaseConfigMessage = !databaseUrl
  ? "DATABASE_URL is not set."
  : isPostgresDatabaseUrl
    ? null
    : `DATABASE_URL must be a PostgreSQL URL for this API build; received ${databaseUrlProtocol || "unknown"} URL.`;

function createDisabledPool(): pg.Pool {
  const error = new Error(
    databaseConfigMessage ??
      "Database is disabled because DATABASE_URL is not configured for PostgreSQL.",
  );

  return {
    query: async () => {
      throw error;
    },
    connect: async () => {
      throw error;
    },
    end: async () => undefined,
    on: () => undefined,
  } as unknown as pg.Pool;
}

export const pool: pg.Pool = isPostgresDatabaseUrl
  ? new Pool({ connectionString: databaseUrl })
  : createDisabledPool();

if (isPostgresDatabaseUrl) {
  pool.on("error", (err) => {
    console.error("[db] PostgreSQL pool error:", err);
  });
} else {
  console.warn(`[db] ${databaseConfigMessage}`);
}

export const db = drizzle(pool, { schema });

export * from "./schema";
