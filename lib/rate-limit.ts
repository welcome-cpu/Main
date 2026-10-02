import "server-only";
import { db } from "@/lib/db/client";

/**
 * Fixed-window rate limit backed by Postgres (no extra infrastructure).
 * Returns true if the request is allowed.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const sql = db();
  const [row] = await sql<{ count: number }[]>`
    INSERT INTO rate_limits (key, window_start, count)
    VALUES (${key}, to_timestamp(floor(extract(epoch FROM now()) / ${windowSeconds}) * ${windowSeconds}), 1)
    ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limits.count + 1
    RETURNING count
  `;

  // Occasionally clear out old windows.
  if (Math.random() < 0.01) {
    await sql`DELETE FROM rate_limits WHERE window_start < now() - interval '1 day'`;
  }
  return row.count <= limit;
}

/** The caller's IP as seen by Vercel's edge, for rate-limit keys only. */
export function clientIp(request: Request) {
  return (
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}
