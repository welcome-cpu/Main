import "server-only";
import type { Tx } from "@/lib/db/client";

/**
 * Serialises everything that changes a property's availability (creating a
 * hold, confirming a booking, adding a manual block) for the rest of the
 * transaction. Combined with re-checking availability after taking the lock,
 * this stops two requests both seeing the same dates as free.
 */
export async function lockPropertyAvailability(tx: Tx, propertyId: string) {
  await tx`SELECT pg_advisory_xact_lock(hashtext(${"property_availability:" + propertyId}))`;
}
