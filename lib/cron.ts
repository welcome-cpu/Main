import "server-only";
import { timingSafeEqual } from "node:crypto";

/**
 * Vercel Cron sends "Authorization: Bearer <CRON_SECRET>". Returns false for
 * anything else, including when CRON_SECRET isn't configured.
 */
export function isAuthorizedCronRequest(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
