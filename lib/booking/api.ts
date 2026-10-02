import "server-only";
import { NextResponse } from "next/server";
import type { z } from "zod";
import { isDirectBookingEnabled } from "@/lib/booking/feature";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const NO_STORE = { "Cache-Control": "private, no-store" };

export function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

/**
 * Common gate for public booking endpoints: feature switched on, and the
 * caller within its rate limit. Returns an error response, or null to go on.
 */
export async function guardPublicRequest(request: Request, name: string, limit: number, windowSeconds = 60) {
  if (!isDirectBookingEnabled()) return json({ error: "Not found" }, 404);
  if (!(await rateLimit(`${name}:${clientIp(request)}`, limit, windowSeconds))) {
    return json({ error: "Too many requests. Please wait a few minutes and try again." }, 429);
  }
  return null;
}

export function validationError(error: z.ZodError) {
  return json({ error: error.issues[0]?.message ?? "Invalid request." }, 400);
}
