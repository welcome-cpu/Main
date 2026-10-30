import { describe, expect, it } from "vitest";
import { channelLabel, countryFromPhone, normalizeLodgifyBookings } from "@/lib/guests/lodgify-bookings";

describe("countryFromPhone", () => {
  it("reads Booking.com's international format", () => {
    expect(countryFromPhone("+44 7700 900123")).toBe("GB");
    expect(countryFromPhone("+49 30 901820")).toBe("DE");
    expect(countryFromPhone("+41 44 668 18 00")).toBe("CH");
    expect(countryFromPhone("+61 2 9374 4000")).toBe("AU");
  });

  it("reads Airbnb's bare international digits", () => {
    expect(countryFromPhone("447700900123")).toBe("GB");
    expect(countryFromPhone("31201234567")).toBe("NL");
    expect(countryFromPhone("12125550123")).toBe("US");
  });

  it("reads 00-prefixed and UK national numbers", () => {
    expect(countryFromPhone("0049 30 901820")).toBe("DE");
    expect(countryFromPhone("07700 900123")).toBe("GB");
    expect(countryFromPhone("01261 851234")).toBe("GB");
  });

  it("falls back to the dialling code when the number itself is malformed", () => {
    expect(countryFromPhone("+44 7700 900123 999")).toBe("GB");
    expect(countryFromPhone("4977009001239999")).toBe("DE");
  });

  it("uses the first of two numbers", () => {
    expect(countryFromPhone("+49 30 901820, +44 7700 900123")).toBe("DE");
    expect(countryFromPhone("+49 30 901820 or +44 7700 900123")).toBe("DE");
  });

  it("gives up on missing or junk numbers", () => {
    for (const junk of [null, undefined, "", "n/a", "12345", "+", "0000"]) {
      expect(countryFromPhone(junk)).toBeNull();
    }
  });
});

describe("normalizeLodgifyBookings", () => {
  // Field names copied from a live /v2/reservations/bookings response (2026-10-30); values invented.
  const booking = {
    id: 123456,
    property_id: 646178,
    arrival: "2026-11-05",
    departure: "2026-11-08",
    status: "Booked",
    source: "AirbnbIntegration",
    is_deleted: false,
    guest: { name: " Alex Example ", email: null, phone: "447700900123", has_temporary_phone: false, country_code: null },
    rooms: [{ room_type_id: 713160, people: 3, guest_breakdown: { adults: 2, children: 1, infants: 0, pets: 1 } }],
  };

  it("keeps the name, country and party size, but not the phone or email", () => {
    const [b] = normalizeLodgifyBookings({ count: 1, items: [booking] });
    expect(b).toEqual({
      lodgifyBookingId: 123456,
      lodgifyPropertyId: 646178,
      channel: "AirbnbIntegration",
      status: "Booked",
      arrival: "2026-11-05",
      departure: "2026-11-08",
      guestName: "Alex Example",
      country: "GB",
      adults: 2,
      children: 1,
      infants: 0,
      pets: 1,
    });
    expect(JSON.stringify(b)).not.toContain("7700");
  });

  it("skips deleted bookings and records it can't use", () => {
    const items = [
      { ...booking, id: 1, is_deleted: true },
      { ...booking, id: 2, arrival: "not a date" },
      { ...booking, id: 3, departure: "2026-11-05" },
      { ...booking, id: "4" },
      null,
    ];
    expect(normalizeLodgifyBookings({ items })).toEqual([]);
    expect(normalizeLodgifyBookings({})).toEqual([]);
    expect(normalizeLodgifyBookings(null)).toEqual([]);
  });

  it("copes with a missing guest or rooms", () => {
    const [b] = normalizeLodgifyBookings({ items: [{ ...booking, guest: null, rooms: null }] });
    expect(b).toMatchObject({ guestName: null, country: null, adults: 0, pets: 0 });
  });
});

describe("channelLabel", () => {
  it("names the channels", () => {
    expect(channelLabel("AirbnbIntegration")).toBe("Airbnb");
    expect(channelLabel("BookingCom")).toBe("Booking.com");
    expect(channelLabel("Vrbo")).toBe("Vrbo");
  });
});
