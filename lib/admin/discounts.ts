import "server-only";
import type { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { db } from "@/lib/db/client";
import type { AdminUser } from "@/lib/admin/users";
import type { discountCodeSchema } from "@/lib/admin/validation";

export type DiscountCodeRow = {
  id: string;
  code: string;
  propertyName: string | null;
  discountType: "PERCENT" | "FIXED";
  percentOff: string | null;
  amountOffPence: number | null;
  minNights: number | null;
  stayFirstNight: string | null;
  stayLastNight: string | null;
  bookFrom: string | null;
  bookUntil: string | null;
  maxRedemptions: number | null;
  redemptions: number;
  isActive: boolean;
};

export async function listDiscountCodes(): Promise<DiscountCodeRow[]> {
  return db()<DiscountCodeRow[]>`
    SELECT d.id, d.code, p.name AS property_name, d.discount_type, d.percent_off, d.amount_off_pence,
      d.min_nights,
      lower(d.stay_window)::text AS stay_first_night, (upper(d.stay_window) - 1)::text AS stay_last_night,
      lower(d.booking_window)::text AS book_from, (upper(d.booking_window) - 1)::text AS book_until,
      d.max_redemptions, d.is_active,
      (SELECT count(*)::int FROM reservations r
        WHERE r.discount_code_id = d.id AND r.status = 'CONFIRMED') AS redemptions
    FROM discount_codes d LEFT JOIN properties p ON p.id = d.property_id
    ORDER BY d.is_active DESC, d.created_at DESC
  `;
}

export async function createDiscountCode(
  admin: AdminUser,
  input: z.infer<typeof discountCodeSchema>
): Promise<{ error?: string }> {
  return db().begin(async (tx) => {
    const [dupe] = await tx`SELECT 1 FROM discount_codes WHERE code = ${input.code}`;
    if (dupe) return { error: "That code already exists." };

    const stayWindow = input.stayFirstNight
      ? tx`daterange(${input.stayFirstNight}::date, ${input.stayLastNight}::date, '[]')`
      : tx`NULL`;
    const bookingWindow = input.bookFrom
      ? tx`daterange(${input.bookFrom}::date, ${input.bookUntil}::date, '[]')`
      : tx`NULL`;

    const [row] = await tx<{ id: string }[]>`
      INSERT INTO discount_codes (code, property_id, discount_type, percent_off, amount_off_pence,
        min_nights, stay_window, booking_window, max_redemptions)
      VALUES (${input.code}, ${input.propertyId}, ${input.discountType}, ${input.percentOff},
        ${input.amountOffPence}, ${input.minNights}, ${stayWindow}, ${bookingWindow}, ${input.maxRedemptions})
      RETURNING id
    `;
    await recordAudit(tx, {
      actorType: "ADMIN",
      actor: admin.email,
      action: "discount_code.created",
      entityType: "discount_code",
      entityId: row.id,
      propertyId: input.propertyId,
      details: input,
    });
    return {};
  });
}

export async function setDiscountCodeActive(admin: AdminUser, id: string, isActive: boolean) {
  await db().begin(async (tx) => {
    const [row] = await tx<{ code: string; propertyId: string | null }[]>`
      UPDATE discount_codes SET is_active = ${isActive} WHERE id = ${id} RETURNING code, property_id
    `;
    if (!row) return;
    await recordAudit(tx, {
      actorType: "ADMIN",
      actor: admin.email,
      action: isActive ? "discount_code.enabled" : "discount_code.disabled",
      entityType: "discount_code",
      entityId: id,
      propertyId: row.propertyId,
      details: { code: row.code },
    });
  });
}
