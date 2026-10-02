// Applies db/migrations/*.sql in filename order, each in its own transaction.
// Applied files are recorded with a checksum; editing an already-applied
// migration is refused, so every database ends up with the same schema.
//
// Usage: npm run db:migrate   (uses DATABASE_URL_UNPOOLED, else DATABASE_URL)

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL_UNPOOLED or DATABASE_URL must be set.");
  process.exit(1);
}

const dir = path.join(import.meta.dirname, "..", "db", "migrations");
const sql = postgres(url, { max: 1, onnotice: () => {} });

try {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       text PRIMARY KEY,
      checksum   text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  const applied = new Map(
    (await sql`SELECT name, checksum FROM schema_migrations`).map((r) => [r.name, r.checksum])
  );
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();

  for (const file of files) {
    // Normalise line endings so a Windows checkout (CRLF) has the same checksum.
    const body = (await readFile(path.join(dir, file), "utf8")).replace(/\r\n/g, "\n");
    const checksum = createHash("sha256").update(body).digest("hex");

    if (applied.has(file)) {
      if (applied.get(file) !== checksum) {
        throw new Error(`${file} was changed after being applied. Add a new migration instead.`);
      }
      continue;
    }

    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`INSERT INTO schema_migrations (name, checksum) VALUES (${file}, ${checksum})`;
    });
    console.log(`applied ${file}`);
  }

  console.log("Database is up to date.");
} finally {
  await sql.end();
}
