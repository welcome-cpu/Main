import "server-only";
import { recordAudit } from "@/lib/audit";
import { lockPropertyAvailability } from "@/lib/booking/locks";
import { addDays } from "@/lib/dates";
import { db } from "@/lib/db/client";
import type { AdminUser } from "@/lib/admin/users";

export type ManualBlock = {
  id: string;
  firstNight: string;
  lastNight: string;
  reason: string | null;
  createdBy: string;
  createdAt: Date;
};

export async function listUpcomingBlocks(propertyId: string): Promise<ManualBlock[]> {
  return db()<ManualBlock[]>`
    SELECT b.id, b.start_date AS first_night, (b.end_date - 1) AS last_night,
           b.reason, b.created_by, b.created_at
    FROM manual_blocks b JOIN properties p ON p.id = b.property_id
    WHERE b.property_id = ${propertyId} AND b.is_active
      AND b.end_date > (now() AT TIME ZONE p.timezone)::date
    ORDER BY b.start_date
  `;
}

/**
 * Blocks nights firstNight..lastNight (inclusive). Refused if a live booking
 * taken in this system already occupies any of those nights: blocking over
 * a guest's stay would hide a booking rather than prevent one.
 */
export async function createBlock(
  admin: AdminUser,
  propertyId: string,
  input: { firstNight: string; lastNight: string; reason: string }
): Promise<{ error?: string }> {
  const endDate = addDays(input.lastNight, 1);
  return db().begin(async (tx) => {
    await lockPropertyAvailability(tx, propertyId);

    const clashes = await tx<{ reference: string }[]>`
      SELECT reference FROM reservations
      WHERE property_id = ${propertyId}
        AND (status = 'CONFIRMED' OR (status = 'HOLD' AND hold_expires_at > now()))
        AND stay && daterange(${input.firstNight}::date, ${endDate}::date, '[)')
    `;
    if (clashes.length > 0) {
      return {
        error: `Those dates overlap booking ${clashes.map((c) => c.reference).join(", ")}. Cancel or move it first.`,
      };
    }

    const [row] = await tx<{ id: string }[]>`
      INSERT INTO manual_blocks (property_id, start_date, end_date, reason, created_by)
      VALUES (${propertyId}, ${input.firstNight}, ${endDate}, ${input.reason || null}, ${admin.email})
      RETURNING id
    `;
    await recordAudit(tx, {
      actorType: "ADMIN",
      actor: admin.email,
      action: "manual_block.created",
      entityType: "manual_block",
      entityId: row.id,
      propertyId,
      details: input,
    });
    return {};
  });
}

export async function removeBlock(admin: AdminUser, propertyId: string, blockId: string) {
  await db().begin(async (tx) => {
    await lockPropertyAvailability(tx, propertyId);
    const [row] = await tx<{ startDate: string; endDate: string }[]>`
      UPDATE manual_blocks
      SET is_active = false, removed_by = ${admin.email}, removed_at = now()
      WHERE id = ${blockId} AND property_id = ${propertyId} AND is_active
      RETURNING start_date, end_date
    `;
    if (!row) return;
    await recordAudit(tx, {
      actorType: "ADMIN",
      actor: admin.email,
      action: "manual_block.removed",
      entityType: "manual_block",
      entityId: blockId,
      propertyId,
      details: { firstNight: row.startDate, lastNight: addDays(row.endDate, -1) },
    });
  });
}
