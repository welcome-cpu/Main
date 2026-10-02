import "server-only";
import { isDatabaseConfigured } from "@/lib/db/client";

/**
 * Why the public direct-booking pages are switched off on this deployment,
 * or null if they're on. They exist only where DIRECT_BOOKING_ENABLED=true
 * (the dev site); production keeps using Lodgify until the owner switches over.
 */
export function directBookingProblem(): string | null {
  const raw = process.env.DIRECT_BOOKING_ENABLED;
  if (raw === undefined) return "DIRECT_BOOKING_ENABLED isn't set for this deployment.";
  if (raw.trim().toLowerCase() !== "true") {
    // The flag isn't secret, so showing a short excerpt helps spot paste errors.
    return `DIRECT_BOOKING_ENABLED is set to "${raw.slice(0, 40)}", but needs to be exactly "true".`;
  }
  if (!isDatabaseConfigured()) return "DATABASE_URL isn't set for this deployment.";
  return null;
}

export function isDirectBookingEnabled() {
  return directBookingProblem() === null;
}
