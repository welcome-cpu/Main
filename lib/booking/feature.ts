import "server-only";
import { isDatabaseConfigured } from "@/lib/db/client";

/**
 * The public direct-booking pages and APIs exist only where this is switched
 * on (DIRECT_BOOKING_ENABLED=true). Production keeps using Lodgify until the
 * owner decides to switch over.
 */
export function isDirectBookingEnabled() {
  return process.env.DIRECT_BOOKING_ENABLED === "true" && isDatabaseConfigured();
}
