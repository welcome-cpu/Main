import { z } from "zod";
import { poundsToPence } from "@/lib/money";

const int = (min: number, max: number) => z.coerce.number().int().min(min).max(max);

/** A pounds amount from a form field, converted to integer pence. */
const pounds = (min: number) =>
  z
    .string()
    .transform((value, ctx) => {
      const pence = poundsToPence(value);
      if (pence === null || pence < min) {
        ctx.addIssue({ code: "custom", message: "Enter an amount like 165 or 165.50" });
        return z.NEVER;
      }
      return pence;
    });

const optionalInt = (min: number, max: number) =>
  z.preprocess((v) => (v === "" || v == null ? null : v), int(min, max).nullable());

const optionalPounds = z.preprocess(
  (v) => (v === "" || v == null ? null : v),
  pounds(1).nullable()
);

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:00)?$/, "Use HH:MM, e.g. 15:00");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date");
const checkbox = z.preprocess((v) => v === "on" || v === "true", z.boolean());

export const propertySettingsSchema = z
  .object({
    name: z.string().trim().min(1, "Required").max(100),
    isActive: checkbox,
    maxGuests: int(1, 30),
    maxPets: int(0, 10),
    checkInTime: time,
    checkOutTime: time,
    turnoverNights: int(0, 7),
    basePence: pounds(1),
    cleaningFeePence: pounds(0),
    petFeePence: pounds(0),
    defaultMinNights: int(1, 60),
    defaultMaxNights: int(1, 365),
    advanceNoticeHours: int(0, 720),
    bookingWindowDays: int(1, 730),
    depositPercent: int(1, 100),
    balanceDueDaysBefore: int(0, 120),
    rateSource: z.enum(["MANUAL", "LODGIFY"]),
    lodgifyPropertyId: optionalInt(1, 2_147_483_647),
    lodgifyRoomTypeId: optionalInt(1, 2_147_483_647),
  })
  .refine((v) => v.defaultMaxNights >= v.defaultMinNights, {
    path: ["defaultMaxNights"],
    message: "Must be at least the minimum stay",
  })
  .refine(
    (v) => v.rateSource !== "LODGIFY" || (v.lodgifyPropertyId && v.lodgifyRoomTypeId),
    { path: ["rateSource"], message: "Lodgify pricing needs both Lodgify IDs" }
  );
export type PropertySettings = z.infer<typeof propertySettingsSchema>;

export const newPropertySchema = z.object({
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Lowercase letters, numbers and hyphens, e.g. mohr-rest"),
  name: z.string().trim().min(1, "Required").max(100),
  maxGuests: int(1, 30),
  basePence: pounds(1),
});

export const extraSchema = z.object({
  name: z.string().trim().min(1, "Required").max(100),
  description: z.string().trim().max(500).optional().default(""),
  pricePence: pounds(0),
  pricingType: z.enum(["PER_STAY", "PER_NIGHT", "PER_GUEST", "PER_GUEST_PER_NIGHT"]),
  maxQuantity: int(1, 20),
});

export const rateRuleSchema = z
  .object({
    name: z.string().trim().min(1, "Required").max(100),
    // Both inclusive, as an admin thinks of them: "the nights of 19 Dec to 4 Jan".
    firstNight: isoDate,
    lastNight: isoDate,
    pricePence: optionalPounds,
    minNights: optionalInt(1, 60),
    maxNights: optionalInt(1, 365),
    priority: int(0, 100),
  })
  .refine((v) => v.lastNight >= v.firstNight, {
    path: ["lastNight"],
    message: "Must be on or after the first night",
  })
  .refine((v) => v.pricePence !== null || v.minNights !== null || v.maxNights !== null, {
    path: ["pricePence"],
    message: "Set a price, a minimum stay or a maximum stay",
  });

export const manualBlockSchema = z
  .object({
    firstNight: isoDate,
    lastNight: isoDate,
    reason: z.string().trim().max(500).optional().default(""),
  })
  .refine((v) => v.lastNight >= v.firstNight, {
    path: ["lastNight"],
    message: "Must be on or after the first night",
  });

export const availabilityCheckSchema = z
  .object({
    checkIn: isoDate,
    checkOut: isoDate,
    adults: int(0, 30),
    children: int(0, 30),
    infants: int(0, 10),
    pets: int(0, 10),
    discountCode: z.string().trim().max(32).optional().default(""),
  })
  .refine((v) => v.checkOut > v.checkIn, {
    path: ["checkOut"],
    message: "Must be after check-in",
  });

export const calendarFeedSchema = z.object({
  propertyId: z.uuid("Choose a property"),
  source: z.enum(["AIRBNB", "BOOKING_COM", "LODGIFY", "OTHER"]),
  name: z.string().trim().min(1, "Required").max(100),
  url: z
    .string()
    .trim()
    .max(2000)
    .refine((v) => {
      try {
        const u = new URL(v);
        return u.protocol === "https:" && !u.username && !u.password;
      } catch {
        return false;
      }
    }, "Paste the full https:// calendar link"),
  applyTurnover: checkbox,
});

const optionalDate = z.preprocess((v) => (v === "" || v == null ? null : v), isoDate.nullable());

export const discountCodeSchema = z
  .object({
    code: z
      .string()
      .trim()
      .transform((v) => v.toUpperCase())
      .pipe(z.string().regex(/^[A-Z0-9_-]{3,32}$/, "3–32 letters, numbers, - or _")),
    propertyId: z.preprocess((v) => (v === "" || v == null ? null : v), z.uuid().nullable()),
    discountType: z.enum(["PERCENT", "FIXED"]),
    value: z.string().trim().min(1, "Required"),
    minNights: optionalInt(1, 60),
    stayFirstNight: optionalDate,
    stayLastNight: optionalDate,
    bookFrom: optionalDate,
    bookUntil: optionalDate,
    maxRedemptions: optionalInt(1, 100_000),
  })
  .transform((v, ctx) => {
    let percentOff: number | null = null;
    let amountOffPence: number | null = null;
    if (v.discountType === "PERCENT") {
      const pct = Number(v.value);
      if (!/^\d{1,3}(\.\d{1,2})?$/.test(v.value) || pct <= 0 || pct > 100) {
        ctx.addIssue({ code: "custom", path: ["value"], message: "Enter a percentage between 0 and 100" });
        return z.NEVER;
      }
      percentOff = pct;
    } else {
      amountOffPence = poundsToPence(v.value);
      if (!amountOffPence) {
        ctx.addIssue({ code: "custom", path: ["value"], message: "Enter an amount like 20 or 20.50" });
        return z.NEVER;
      }
    }
    const pairs = [
      [v.stayFirstNight, v.stayLastNight, "stayLastNight"],
      [v.bookFrom, v.bookUntil, "bookUntil"],
    ] as const;
    for (const [first, last, field] of pairs) {
      if ((first === null) !== (last === null)) {
        ctx.addIssue({ code: "custom", path: [field], message: "Fill in both dates, or neither" });
        return z.NEVER;
      }
      if (first !== null && last !== null && last < first) {
        ctx.addIssue({ code: "custom", path: [field], message: "Must be on or after the first date" });
        return z.NEVER;
      }
    }
    return { ...v, percentOff, amountOffPence };
  });

export const cancelBookingSchema = z.object({
  reason: z.string().trim().min(1, "Give a reason (kept in the booking history)").max(500),
  emailGuest: checkbox,
});

export const manualPaymentSchema = z.object({
  amountPence: pounds(1),
  note: z.string().trim().max(300).optional().default(""),
});

/** Field errors keyed by field name, for redisplaying a form. */
export function fieldErrors(error: z.ZodError) {
  return z.flattenError(error).fieldErrors as Record<string, string[] | undefined>;
}
