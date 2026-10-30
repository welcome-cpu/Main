// Read-only copy of bookings from Lodgify, kept for the admin area: guest
// names for the dates other channels' calendars block, and guest countries.

import { parsePhoneNumberFromString } from "libphonenumber-js/min";
import metadata from "libphonenumber-js/min/metadata";
import { isValidDate } from "@/lib/dates";

export type ImportedBooking = {
  lodgifyBookingId: number;
  lodgifyPropertyId: number;
  channel: string;
  status: string;
  arrival: string;
  departure: string;
  guestName: string | null;
  country: string | null;
  adults: number;
  children: number;
  infants: number;
  pets: number;
};

const CHANNEL_LABELS: Record<string, string> = {
  AirbnbIntegration: "Airbnb",
  BookingCom: "Booking.com",
  OH: "Lodgify website",
  Manual: "Lodgify (manual)",
};

/** Lodgify's channel codes as they appear in the admin area. */
export function channelLabel(channel: string): string {
  return CHANNEL_LABELS[channel] ?? channel;
}

/** Our booking-source filter codes that correspond to a Lodgify channel. */
export const CHANNEL_FOR_SOURCE: Record<string, string> = {
  AIRBNB: "AirbnbIntegration",
  BOOKING_COM: "BookingCom",
};

// Calling codes are prefix-free, so at most one of the 1-3 digit prefixes
// matches. The first country listed is the code's main one (44 → GB).
function countryFromCallingCode(digits: string): string | null {
  for (const length of [1, 2, 3]) {
    const countries = (metadata.country_calling_codes as Record<string, string[]>)[digits.slice(0, length)];
    if (countries) return countries[0] ?? null;
  }
  return null;
}

/**
 * The guest's country from their phone number's dialling code. Neither Airbnb
 * nor Booking.com pass a country to Lodgify, but both pass a phone number:
 * Booking.com as "+49 …", Airbnb as bare international digits ("4477…").
 * Numbers in UK national format ("07…") are taken as UK. This is where the
 * phone is registered, which is usually but not always where the guest lives.
 */
export function countryFromPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // A few records hold two numbers; the first is the guest's own.
  const first = raw.split(/[,;/]|\bor\b/i)[0];
  const compact = first.replace(/[^\d+]/g, "");
  if (!/\d{6,}/.test(compact)) return null;

  let international: string;
  if (compact.startsWith("+")) international = compact.slice(1).replace(/\+/g, "");
  else if (compact.startsWith("00")) international = compact.slice(2);
  else if (compact.startsWith("0")) return parsePhoneNumberFromString(compact, "GB") ? "GB" : null;
  else international = compact;

  const parsed = parsePhoneNumberFromString(`+${international}`);
  return parsed?.country ?? countryFromCallingCode(international);
}

const count = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v > 0 ? v : 0);

/**
 * Converts one page of Lodgify's /v2/reservations/bookings response. Shape
 * verified against live data: { count, items: [{ id, property_id, arrival,
 * departure, status, source, is_deleted, guest: { name, phone }, rooms:
 * [{ guest_breakdown: { adults, children, infants, pets } }] }] }. Only the
 * guest's name and the country worked out from their phone are kept; the
 * phone number itself and email are not.
 */
export function normalizeLodgifyBookings(raw: unknown): ImportedBooking[] {
  const items = (raw as { items?: unknown })?.items;
  if (!Array.isArray(items)) return [];

  const bookings: ImportedBooking[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const b = item as {
      id?: unknown;
      property_id?: unknown;
      arrival?: unknown;
      departure?: unknown;
      status?: unknown;
      source?: unknown;
      is_deleted?: unknown;
      guest?: { name?: unknown; phone?: unknown } | null;
      rooms?: { guest_breakdown?: Record<string, unknown> | null }[] | null;
    };
    if (b.is_deleted === true) continue;
    if (!Number.isSafeInteger(b.id) || !Number.isSafeInteger(b.property_id)) continue;
    if (typeof b.arrival !== "string" || typeof b.departure !== "string") continue;
    if (!isValidDate(b.arrival) || !isValidDate(b.departure) || b.departure <= b.arrival) continue;

    const rooms = Array.isArray(b.rooms) ? b.rooms : [];
    const total = (k: string) => rooms.reduce((sum, r) => sum + count(r?.guest_breakdown?.[k]), 0);
    const name = typeof b.guest?.name === "string" ? b.guest.name.trim().slice(0, 200) : "";

    bookings.push({
      lodgifyBookingId: b.id as number,
      lodgifyPropertyId: b.property_id as number,
      channel: typeof b.source === "string" && b.source ? b.source.slice(0, 50) : "Unknown",
      status: typeof b.status === "string" && b.status ? b.status.slice(0, 30) : "Unknown",
      arrival: b.arrival,
      departure: b.departure,
      guestName: name || null,
      country: countryFromPhone(typeof b.guest?.phone === "string" ? b.guest.phone : null),
      adults: total("adults"),
      children: total("children"),
      infants: total("infants"),
      pets: total("pets"),
    });
  }
  return bookings;
}
