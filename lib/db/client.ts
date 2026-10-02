import "server-only";
import postgres from "postgres";

export type Sql = postgres.Sql;
export type Tx = postgres.TransactionSql;

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

function createClient() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set.");
  }
  return postgres(process.env.DATABASE_URL, {
    // Serverless functions each hold a small pool; Neon's pooler fans in.
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
    // Required behind Neon's PgBouncer pooler (transaction mode).
    prepare: false,
    onnotice: () => {},
    // snake_case columns <-> camelCase in TypeScript.
    transform: postgres.camel,
    types: {
      // Keep DATE columns as "YYYY-MM-DD" strings. Parsing them into JS Dates
      // would attach a timezone and can shift a stay by a day around BST.
      date: {
        to: 1082,
        from: [1082],
        serialize: (value: string) => value,
        parse: (value: string) => value,
      },
    },
  });
}

// Reuse one client across hot reloads in development.
const globalForDb = globalThis as unknown as { gamrieSql?: Sql };

export function db(): Sql {
  globalForDb.gamrieSql ??= createClient();
  return globalForDb.gamrieSql;
}
