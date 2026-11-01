// Sending paid direct bookings to Lodgify, and newsletter sign-ups to
// EmailOctopus, against a real database (npm run test:integration). Lodgify,
// EmailOctopus and Gift Up are replaced by a fake fetch.

import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_URL = process.env.TEST_DATABASE_URL;
const enabled = Boolean(TEST_URL) && TEST_URL !== process.env.DATABASE_URL;
/** Lodgify booking numbers unique to this run, as the column is unique. */
const lodgifyNumber = () => 1_000_000_000 + Math.floor(Math.random() * 1_000_000_000);

let dbMod: typeof import("@/lib/db/client");
let holds: typeof import("@/lib/booking/holds");
let redemption: typeof import("@/lib/vouchers/redemption");
let push: typeof import("@/lib/booking/lodgify-push");
let newsletter: typeof import("@/lib/newsletter/emailoctopus");

const guest = {
  firstName: "Lodgify",
  lastName: "Tester",
  email: "lodgify-push@example.com",
  phone: "07700 900003",
  country: "GB",
  message: "Arriving late",
  addressLine1: "1 Shore Street",
  addressLine2: null,
  city: "Gardenstown",
  postalCode: "AB45 3YP",
};

/** Pretend Lodgify, EmailOctopus and Gift Up. */
class FakeServices {
  lodgifyBodies: Record<string, unknown>[] = [];
  octopusBodies: Record<string, unknown>[] = [];
  lastLodgifyId = 0;
  lodgify: () => Response | Promise<Response> = () => new Response(String((this.lastLodgifyId = lodgifyNumber())), { status: 201 });

  fetch = async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (url.host === "api.lodgify.com") {
      this.lodgifyBodies.push(body);
      return this.lodgify();
    }
    if (url.host === "api.emailoctopus.com") {
      this.octopusBodies.push(body);
      return new Response(JSON.stringify({ id: randomUUID() }), { status: 200 });
    }
    if (url.host === "api.giftup.app" && url.pathname.endsWith("/redeem")) {
      return new Response(JSON.stringify({ transactionId: randomUUID(), redeemedAmount: body.amount }), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  };
}

let services: FakeServices;

async function createProperty() {
  const slug = `test-${randomUUID().slice(0, 8)}`;
  const lodgifyId = 900_000_000 + Math.floor(Math.random() * 99_999_999);
  const [{ id }] = await dbMod.db()<{ id: string }[]>`
    INSERT INTO properties (slug, name, is_active, max_guests, max_pets, base_nightly_pence, pet_fee_pence,
      default_min_nights, deposit_percent, balance_due_days_before, booking_window_days, advance_notice_hours,
      lodgify_property_id, lodgify_room_type_id)
    VALUES (${slug}, 'Lodgify push test', true, 4, 2, 15000, 4000, 2, 50, 7, 3650, 0, ${lodgifyId}, ${lodgifyId + 1})
    RETURNING id
  `;
  return { id, lodgifyId };
}

/** A booking paid in full by gift voucher: confirmed straight away, as the hold endpoint does. */
async function paidBooking(options: { newsletter?: boolean } = {}) {
  const p = await createProperty();
  const hold = await holds.createHold(
    p.id,
    { checkIn: "2036-05-01", checkOut: "2036-05-03", adults: 2, children: 1, infants: 0, pets: 1, extras: [], discountCode: null, voucher: { code: `GIFT-${randomUUID().slice(0, 6).toUpperCase()}`, availablePence: 100000 } },
    { ...guest, newsletter: options.newsletter ?? false },
    { ip: null }
  );
  if (!hold.ok) throw new Error(`expected a hold: ${JSON.stringify(hold)}`);
  expect(await redemption.redeemHoldVoucher(hold)).toEqual({ ok: true });
  expect(await redemption.confirmVoucherOnlyBooking(hold.reservationId)).toBe(true);
  return { property: p, reservationId: hold.reservationId, reference: hold.reference };
}

const pushState = async (id: string) =>
  (await dbMod.db()<{ lodgifyPushStatus: string | null; lodgifyBookingId: string | null; lodgifyPushError: string | null }[]>`
    SELECT lodgify_push_status, lodgify_booking_id, lodgify_push_error FROM reservations WHERE id = ${id}
  `)[0];

describe.runIf(enabled)("sending bookings to Lodgify (database)", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL;
    process.env.GIFTUP_API_KEY = "giftup_test_key";
    process.env.LODGIFY_API_KEY = "lodgify_test_key";
    process.env.DIRECT_BOOKING_ENABLED = "true";
    dbMod = await import("@/lib/db/client");
    holds = await import("@/lib/booking/holds");
    redemption = await import("@/lib/vouchers/redemption");
    push = await import("@/lib/booking/lodgify-push");
    newsletter = await import("@/lib/newsletter/emailoctopus");
  });
  beforeEach(() => {
    process.env.LODGIFY_BOOKING_PUSH = "on";
    services = new FakeServices();
    vi.stubGlobal("fetch", services.fetch);
  });
  afterEach(async () => {
    // Nothing left waiting for other runs, and no emails for the email tests.
    await dbMod.db()`
      UPDATE reservations SET lodgify_push_status = 'OFF'
      WHERE lodgify_push_status IN ('PENDING', 'SENDING')
        AND property_id IN (SELECT id FROM properties WHERE name = 'Lodgify push test')
    `;
    await dbMod.db()`
      DELETE FROM emails WHERE reservation_id IN (
        SELECT r.id FROM reservations r JOIN properties p ON p.id = r.property_id WHERE p.name = 'Lodgify push test'
      )
    `;
    await dbMod.db()`UPDATE newsletter_signups SET status = 'DONE' WHERE email = ${guest.email} AND status = 'PENDING'`;
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    for (const k of ["LODGIFY_BOOKING_PUSH", "LODGIFY_API_KEY", "GIFTUP_API_KEY", "DIRECT_BOOKING_ENABLED", "EMAILOCTOPUS_API_KEY", "EMAILOCTOPUS_LIST_ID"]) {
      delete process.env[k];
    }
    await dbMod?.db().end();
  });

  it("creates a paid booking in Lodgify with the guest's details and a note of what's paid", async () => {
    const b = await paidBooking();
    expect((await pushState(b.reservationId)).lodgifyPushStatus).toBe("PENDING");

    expect(await push.pushReservationToLodgify(b.reservationId)).toBe("PUSHED");
    const state = await pushState(b.reservationId);
    expect(state.lodgifyPushStatus).toBe("PUSHED");
    expect(Number(state.lodgifyBookingId)).toBe(services.lastLodgifyId);

    const [sent] = services.lodgifyBodies as {
      property_id: number;
      arrival: string;
      departure: string;
      status: string;
      total: number;
      rooms: { room_type_id: number; guest_breakdown: Record<string, number> }[];
      guest: Record<string, unknown>;
      messages: { type: string; message: string }[];
    }[];
    expect(sent).toMatchObject({
      property_id: b.property.lodgifyId,
      arrival: "2036-05-01",
      departure: "2036-05-03",
      status: "Booked",
      total: 340,
      rooms: [{ room_type_id: b.property.lodgifyId + 1, guest_breakdown: { adults: 2, children: 1, infants: 0, pets: 1 } }],
      guest: {
        guest_name: { first_name: "Lodgify", last_name: "Tester" },
        email: guest.email,
        street_address1: "1 Shore Street",
        city: "Gardenstown",
        postal_code: "AB45 3YP",
        country_code: "GB",
      },
    });
    const note = sent.messages.find((m) => m.type === "Comment")!.message;
    expect(note).toContain(b.reference);
    expect(note).toContain("£340.00 by gift voucher");
    expect(note).toContain("Paid in full. Don't request payment in Lodgify.");
    expect(sent.messages.find((m) => m.type === "Renter")?.message).toBe("Arriving late");

    // Never sent twice.
    expect(await push.pushReservationToLodgify(b.reservationId)).toBe("SKIPPED");
    await push.pushPendingLodgifyBookings();
    expect(services.lodgifyBodies).toHaveLength(1);
  });

  it("records bookings as not sent when sending is switched off", async () => {
    delete process.env.LODGIFY_BOOKING_PUSH;
    const b = await paidBooking();
    expect((await pushState(b.reservationId)).lodgifyPushStatus).toBe("OFF");
    await push.pushPendingLodgifyBookings();
    expect(services.lodgifyBodies).toHaveLength(0);
  });

  it("flags a refusal and doesn't retry it until the owner does", async () => {
    services.lodgify = () => new Response(JSON.stringify({ code: "PropertyNotAvailable", message: "Dates not available" }), { status: 400 });
    const b = await paidBooking();
    expect(await push.pushReservationToLodgify(b.reservationId)).toBe("FAILED");
    const state = await pushState(b.reservationId);
    expect(state.lodgifyPushStatus).toBe("FAILED");
    expect(state.lodgifyPushError).toContain("PropertyNotAvailable");

    await push.pushPendingLodgifyBookings();
    expect(services.lodgifyBodies).toHaveLength(1);

    const retried = lodgifyNumber();
    services.lodgify = () => new Response(String(retried), { status: 201 });
    expect(await push.resolveLodgifyPush(b.reservationId, "owner@example.com", { retry: true })).toBe(true);
    expect(await push.pushReservationToLodgify(b.reservationId)).toBe("PUSHED");
    expect(Number((await pushState(b.reservationId)).lodgifyBookingId)).toBe(retried);
  });

  it("asks the owner to check when Lodgify doesn't answer, rather than risk a second copy", async () => {
    services.lodgify = () => {
      throw new TypeError("fetch failed");
    };
    const b = await paidBooking();
    expect(await push.pushReservationToLodgify(b.reservationId)).toBe("CHECK");
    await push.pushPendingLodgifyBookings();
    expect(services.lodgifyBodies).toHaveLength(1);

    // The owner finds it in Lodgify and links it.
    expect(await push.resolveLodgifyPush(b.reservationId, "owner@example.com", { lodgifyBookingId: lodgifyNumber() })).toBe(true);
    expect(await pushState(b.reservationId)).toMatchObject({ lodgifyPushStatus: "PUSHED", lodgifyPushError: null });
  });

  it("marks an interrupted send for checking instead of resending it", async () => {
    const b = await paidBooking();
    await dbMod.db()`
      UPDATE reservations SET lodgify_push_status = 'SENDING', lodgify_push_started_at = now() - interval '10 minutes'
      WHERE id = ${b.reservationId}
    `;
    await push.pushPendingLodgifyBookings();
    expect((await pushState(b.reservationId)).lodgifyPushStatus).toBe("CHECK");
    expect(services.lodgifyBodies).toHaveLength(0);
  });

  it("signs the guest up to the newsletter only if they asked", async () => {
    process.env.EMAILOCTOPUS_API_KEY = "eo_test_key";
    process.env.EMAILOCTOPUS_LIST_ID = "list-123";
    const without = await paidBooking();
    const withSignup = await paidBooking({ newsletter: true });

    const signups = await dbMod.db()<{ reservationId: string }[]>`
      SELECT reservation_id FROM newsletter_signups WHERE reservation_id IN (${without.reservationId}, ${withSignup.reservationId})
    `;
    expect(signups.map((s) => s.reservationId)).toEqual([withSignup.reservationId]);

    const result = await newsletter.processNewsletterSignups();
    expect(result.sent).toBeGreaterThanOrEqual(1);
    expect(services.octopusBodies).toContainEqual({
      email_address: guest.email,
      fields: { FirstName: "Lodgify", LastName: "Tester" },
      tags: { "website-booking": true },
      status: "subscribed",
    });
    const [row] = await dbMod.db()<{ status: string }[]>`SELECT status FROM newsletter_signups WHERE reservation_id = ${withSignup.reservationId}`;
    expect(row.status).toBe("DONE");
  });
});
