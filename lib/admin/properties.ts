import "server-only";
import type { z } from "zod";
import { diffFields, recordAudit } from "@/lib/audit";
import { db } from "@/lib/db/client";
import type { AdminUser } from "@/lib/admin/users";
import type {
  extraSchema,
  newPropertySchema,
  PropertySettings,
  rateRuleSchema,
} from "@/lib/admin/validation";

export type Property = {
  id: string;
  slug: string;
  name: string;
  isActive: boolean;
  timezone: string;
  currency: string;
  maxGuests: number;
  maxPets: number;
  checkInTime: string;
  checkOutTime: string;
  turnoverNights: number;
  basePence: number;
  cleaningFeePence: number;
  petFeePence: number;
  defaultMinNights: number;
  defaultMaxNights: number;
  advanceNoticeHours: number;
  bookingWindowDays: number;
  depositPercent: number;
  balanceDueDaysBefore: number;
  rateSource: "MANUAL" | "LODGIFY";
  lodgifyPropertyId: number | null;
  lodgifyRoomTypeId: number | null;
};

export type Extra = {
  id: string;
  propertyId: string | null;
  name: string;
  description: string | null;
  pricePence: number;
  pricingType: "PER_STAY" | "PER_NIGHT" | "PER_GUEST" | "PER_GUEST_PER_NIGHT";
  maxQuantity: number;
  isActive: boolean;
};

export type RateRule = {
  id: string;
  name: string;
  firstNight: string;
  lastNight: string;
  pricePence: number | null;
  minNights: number | null;
  maxNights: number | null;
  priority: number;
  isActive: boolean;
};

const PROPERTY_COLUMNS = `
  id, slug, name, is_active, timezone, currency, max_guests, max_pets,
  to_char(check_in_time, 'HH24:MI') AS check_in_time,
  to_char(check_out_time, 'HH24:MI') AS check_out_time,
  turnover_nights, base_nightly_pence AS base_pence, cleaning_fee_pence, pet_fee_pence,
  default_min_nights, default_max_nights, advance_notice_hours, booking_window_days,
  deposit_percent, balance_due_days_before, rate_source,
  lodgify_property_id, lodgify_room_type_id
`;

export async function listProperties(): Promise<Property[]> {
  const sql = db();
  return sql<Property[]>`SELECT ${sql.unsafe(PROPERTY_COLUMNS)} FROM properties ORDER BY name`;
}

export async function getProperty(id: string): Promise<Property | null> {
  const sql = db();
  if (!isUuid(id)) return null;
  const [row] = await sql<Property[]>`
    SELECT ${sql.unsafe(PROPERTY_COLUMNS)} FROM properties WHERE id = ${id}
  `;
  return row ?? null;
}

export async function createProperty(
  admin: AdminUser,
  input: z.infer<typeof newPropertySchema>
): Promise<{ id: string } | { error: string }> {
  const sql = db();
  return sql.begin(async (tx) => {
    const [existing] = await tx`SELECT 1 FROM properties WHERE slug = ${input.slug}`;
    if (existing) return { error: "A property with that slug already exists." };

    const [row] = await tx<{ id: string }[]>`
      INSERT INTO properties (slug, name, max_guests, base_nightly_pence)
      VALUES (${input.slug}, ${input.name}, ${input.maxGuests}, ${input.basePence})
      RETURNING id
    `;
    await recordAudit(tx, {
      actorType: "ADMIN",
      actor: admin.email,
      action: "property.created",
      entityType: "property",
      entityId: row.id,
      propertyId: row.id,
      details: input,
    });
    return { id: row.id };
  });
}

export async function updatePropertySettings(
  admin: AdminUser,
  id: string,
  input: PropertySettings
) {
  const sql = db();
  await sql.begin(async (tx) => {
    const [before] = await tx<Property[]>`
      SELECT ${tx.unsafe(PROPERTY_COLUMNS)} FROM properties WHERE id = ${id} FOR UPDATE
    `;
    if (!before) throw new Error("Property not found");

    await tx`
      UPDATE properties SET
        name = ${input.name},
        is_active = ${input.isActive},
        max_guests = ${input.maxGuests},
        max_pets = ${input.maxPets},
        check_in_time = ${input.checkInTime},
        check_out_time = ${input.checkOutTime},
        turnover_nights = ${input.turnoverNights},
        base_nightly_pence = ${input.basePence},
        cleaning_fee_pence = ${input.cleaningFeePence},
        pet_fee_pence = ${input.petFeePence},
        default_min_nights = ${input.defaultMinNights},
        default_max_nights = ${input.defaultMaxNights},
        advance_notice_hours = ${input.advanceNoticeHours},
        booking_window_days = ${input.bookingWindowDays},
        deposit_percent = ${input.depositPercent},
        balance_due_days_before = ${input.balanceDueDaysBefore},
        rate_source = ${input.rateSource},
        lodgify_property_id = ${input.lodgifyPropertyId},
        lodgify_room_type_id = ${input.lodgifyRoomTypeId}
      WHERE id = ${id}
    `;

    const changes = diffFields(before as unknown as Record<string, unknown>, {
      ...before,
      ...input,
    } as unknown as Record<string, unknown>);
    if (Object.keys(changes).length === 0) return;

    await recordAudit(tx, {
      actorType: "ADMIN",
      actor: admin.email,
      action:
        "isActive" in changes
          ? input.isActive
            ? "property.enabled"
            : "property.disabled"
          : "property.updated",
      entityType: "property",
      entityId: id,
      propertyId: id,
      details: { changes },
    });
  });
}

// ---------------------------------------------------------------------------
// Extras
// ---------------------------------------------------------------------------

export async function listExtras(propertyId: string): Promise<Extra[]> {
  return db()<Extra[]>`
    SELECT id, property_id, name, description, price_pence, pricing_type, max_quantity, is_active
    FROM extras
    WHERE property_id = ${propertyId} OR property_id IS NULL
    ORDER BY is_active DESC, sort_order, name
  `;
}

export async function createExtra(
  admin: AdminUser,
  propertyId: string,
  input: z.infer<typeof extraSchema>
) {
  await db().begin(async (tx) => {
    const [row] = await tx<{ id: string }[]>`
      INSERT INTO extras (property_id, name, description, price_pence, pricing_type, max_quantity)
      VALUES (${propertyId}, ${input.name}, ${input.description || null}, ${input.pricePence},
              ${input.pricingType}, ${input.maxQuantity})
      RETURNING id
    `;
    await recordAudit(tx, {
      actorType: "ADMIN",
      actor: admin.email,
      action: "extra.created",
      entityType: "extra",
      entityId: row.id,
      propertyId,
      details: input,
    });
  });
}

export async function setExtraActive(
  admin: AdminUser,
  propertyId: string,
  extraId: string,
  isActive: boolean
) {
  await db().begin(async (tx) => {
    const updated = await tx`
      UPDATE extras SET is_active = ${isActive}
      WHERE id = ${extraId} AND property_id = ${propertyId}
    `;
    if (updated.count === 0) return;
    await recordAudit(tx, {
      actorType: "ADMIN",
      actor: admin.email,
      action: isActive ? "extra.enabled" : "extra.disabled",
      entityType: "extra",
      entityId: extraId,
      propertyId,
    });
  });
}

// ---------------------------------------------------------------------------
// Rate rules (seasonal prices and stay-length overrides)
// ---------------------------------------------------------------------------

export async function listRateRules(propertyId: string): Promise<RateRule[]> {
  return db()<RateRule[]>`
    SELECT id, name,
           lower(nights) AS first_night,
           (upper(nights) - 1) AS last_night,
           price_pence, min_nights, max_nights, priority, is_active
    FROM rate_rules
    WHERE property_id = ${propertyId}
    ORDER BY is_active DESC, lower(nights)
  `;
}

export async function createRateRule(
  admin: AdminUser,
  propertyId: string,
  input: z.infer<typeof rateRuleSchema>
) {
  await db().begin(async (tx) => {
    const [row] = await tx<{ id: string }[]>`
      INSERT INTO rate_rules (property_id, name, nights, price_pence, min_nights, max_nights, priority)
      VALUES (${propertyId}, ${input.name},
              daterange(${input.firstNight}::date, ${input.lastNight}::date, '[]'),
              ${input.pricePence}, ${input.minNights}, ${input.maxNights}, ${input.priority})
      RETURNING id
    `;
    await recordAudit(tx, {
      actorType: "ADMIN",
      actor: admin.email,
      action: "rate_rule.created",
      entityType: "rate_rule",
      entityId: row.id,
      propertyId,
      details: input,
    });
  });
}

export async function setRateRuleActive(
  admin: AdminUser,
  propertyId: string,
  ruleId: string,
  isActive: boolean
) {
  await db().begin(async (tx) => {
    const updated = await tx`
      UPDATE rate_rules SET is_active = ${isActive}
      WHERE id = ${ruleId} AND property_id = ${propertyId}
    `;
    if (updated.count === 0) return;
    await recordAudit(tx, {
      actorType: "ADMIN",
      actor: admin.email,
      action: isActive ? "rate_rule.enabled" : "rate_rule.disabled",
      entityType: "rate_rule",
      entityId: ruleId,
      propertyId,
    });
  });
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
