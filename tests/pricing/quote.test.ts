import { describe, expect, it } from "vitest";
import {
  buildQuote,
  groupNights,
  percentOf,
  type DiscountDefinition,
  type ExtraDefinition,
  type NightPriceInput,
  type PricingPolicy,
  type QuoteRequest,
} from "@/lib/pricing/quote";

const policy: PricingPolicy = {
  currency: "GBP",
  basePence: 15000,
  requireRates: false,
  cleaningFeePence: 0,
  petFeePence: 4000,
  depositPercent: 50,
  balanceDueDaysBefore: 7,
};

const TODAY = "2026-10-02";

const request = (extra: Partial<QuoteRequest> = {}): QuoteRequest => ({
  checkIn: "2027-02-09",
  checkOut: "2027-02-12",
  adults: 2,
  children: 0,
  pets: 0,
  extras: [],
  ...extra,
});

const rates = (checkIn: string, pence: number[], rule: (number | null)[] = []): NightPriceInput[] =>
  pence.map((p, i) => {
    const d = new Date(`${checkIn}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return { date: d.toISOString().slice(0, 10), ratePence: p, rulePence: rule[i] ?? null };
  });

function quote(opts: {
  req?: Partial<QuoteRequest>;
  nights?: NightPriceInput[];
  pol?: Partial<PricingPolicy>;
  extras?: ExtraDefinition[];
  discount?: DiscountDefinition | null;
  today?: string;
}) {
  const req = request(opts.req);
  return buildQuote({
    request: req,
    nights: opts.nights ?? rates(req.checkIn, [16500, 16500, 16500]),
    policy: { ...policy, ...opts.pol },
    extras: opts.extras ?? [],
    discount: opts.discount ?? null,
    today: opts.today ?? TODAY,
  });
}

function ok(result: ReturnType<typeof quote>) {
  if (!result.ok) throw new Error(`expected a quote, got ${result.error.code}`);
  return result.quote;
}

const discount = (d: Partial<DiscountDefinition>): DiscountDefinition => ({
  id: "d1",
  code: "SAVE",
  discountType: "PERCENT",
  percentOff: 10,
  amountOffPence: null,
  minNights: null,
  stayWindow: null,
  bookingWindow: null,
  maxRedemptions: null,
  redemptions: 0,
  ...d,
});

describe("buildQuote", () => {
  it("matches Lodgify's own quote for Muckle View (3 nights, 9–12 Feb 2027)", () => {
    // Lodgify quoted £495 total, £247.50 on booking and £247.50 due 2 Feb 2027.
    const q = ok(quote({}));
    expect(q.accommodationPence).toBe(49500);
    expect(q.totalPence).toBe(49500);
    expect(q.dueNowPence).toBe(24750);
    expect(q.balancePence).toBe(24750);
    expect(q.balanceDueDate).toBe("2027-02-02");
  });

  it("prices each night from a rate rule first, then the stored rate, then the base rate", () => {
    const nights: NightPriceInput[] = [
      { date: "2027-02-09", rulePence: 20000, ratePence: 16500 },
      { date: "2027-02-10", rulePence: null, ratePence: 17000 },
      { date: "2027-02-11", rulePence: null, ratePence: null },
    ];
    const q = ok(quote({ nights }));
    expect(q.nights.map((n) => [n.pricePence, n.source])).toEqual([
      [20000, "RULE"],
      [17000, "RATE"],
      [15000, "BASE"],
    ]);
    expect(q.accommodationPence).toBe(52000);
  });

  it("refuses to quote when prices should come from Lodgify but a night is missing", () => {
    const nights = rates("2027-02-09", [16500, 16500]); // third night missing
    const r = quote({ nights, pol: { requireRates: true } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("PRICE_UNAVAILABLE");
  });

  it("charges the pet fee once per stay, however many pets", () => {
    expect(ok(quote({ req: { pets: 1 } })).petFeePence).toBe(4000);
    expect(ok(quote({ req: { pets: 2 } })).petFeePence).toBe(4000);
    expect(ok(quote({ req: { pets: 0 } })).petFeePence).toBe(0);
  });

  it("adds the cleaning fee per stay", () => {
    expect(ok(quote({ pol: { cleaningFeePence: 3500 } })).totalPence).toBe(49500 + 3500);
  });

  describe("extras", () => {
    const extras: ExtraDefinition[] = [
      { id: "stay", name: "Hamper", pricePence: 4500, pricingType: "PER_STAY", maxQuantity: 2 },
      { id: "night", name: "Firewood", pricePence: 800, pricingType: "PER_NIGHT", maxQuantity: 3 },
      { id: "guest", name: "Breakfast pack", pricePence: 1200, pricingType: "PER_GUEST", maxQuantity: 1 },
      { id: "gn", name: "Dinner", pricePence: 2500, pricingType: "PER_GUEST_PER_NIGHT", maxQuantity: 1 },
    ];

    it("prices each charging type correctly", () => {
      const q = ok(
        quote({
          extras,
          req: {
            adults: 2,
            children: 1,
            extras: [
              { id: "stay", quantity: 2 },
              { id: "night", quantity: 1 },
              { id: "guest", quantity: 1 },
              { id: "gn", quantity: 1 },
            ],
          },
          pol: { depositPercent: 100 },
        })
      );
      expect(q.extras.map((x) => [x.extraId, x.totalPence])).toEqual([
        ["stay", 9000], // £45 × 2
        ["night", 2400], // £8 × 3 nights
        ["guest", 3600], // £12 × 3 guests
        ["gn", 22500], // £25 × 3 guests × 3 nights
      ]);
      expect(q.extrasPence).toBe(37500);
      expect(q.totalPence).toBe(49500 + 37500);
    });

    it("ignores extras with quantity 0", () => {
      expect(ok(quote({ extras, req: { extras: [{ id: "stay", quantity: 0 }] } })).extras).toEqual([]);
    });

    it("rejects an unknown or inactive extra", () => {
      const r = quote({ extras, req: { extras: [{ id: "nope", quantity: 1 }] } });
      expect(r.ok || r.error.code).toBe("UNKNOWN_EXTRA");
    });

    it("rejects more than the maximum quantity, and quantities on per-guest extras", () => {
      expect(quote({ extras, req: { extras: [{ id: "stay", quantity: 3 }] } }).ok).toBe(false);
      expect(quote({ extras, req: { extras: [{ id: "guest", quantity: 2 }] } }).ok).toBe(false);
    });
  });

  describe("discounts (accommodation only)", () => {
    it("takes a percentage off the accommodation, not fees", () => {
      const q = ok(quote({ req: { pets: 1 }, discount: discount({ percentOff: 10 }) }));
      expect(q.discount).toEqual({ id: "d1", code: "SAVE", pence: 4950 });
      expect(q.totalPence).toBe(49500 - 4950 + 4000);
    });

    it("rounds percentage discounts to the nearest penny", () => {
      expect(percentOf(33333, 12.5)).toBe(4167);
      expect(percentOf(49500, 10)).toBe(4950);
    });

    it("caps a fixed discount at the accommodation price", () => {
      const q = ok(quote({ discount: discount({ discountType: "FIXED", percentOff: null, amountOffPence: 100000 }) }));
      expect(q.discount?.pence).toBe(49500);
      expect(q.totalPence).toBe(0);
    });

    it("enforces the minimum stay", () => {
      expect(quote({ discount: discount({ minNights: 4 }) }).ok).toBe(false);
      expect(quote({ discount: discount({ minNights: 3 }) }).ok).toBe(true);
    });

    it("needs every night inside the stay window", () => {
      expect(quote({ discount: discount({ stayWindow: { start: "2027-02-09", end: "2027-02-11" } }) }).ok).toBe(true);
      expect(quote({ discount: discount({ stayWindow: { start: "2027-02-10", end: "2027-02-20" } }) }).ok).toBe(false);
      expect(quote({ discount: discount({ stayWindow: { start: "2027-02-01", end: "2027-02-10" } }) }).ok).toBe(false);
    });

    it("only works when booked inside the booking window (like SF10OFF, 15–30 Sep)", () => {
      const sf10 = discount({ bookingWindow: { start: "2026-09-15", end: "2026-10-01" } });
      expect(quote({ discount: sf10, today: "2026-09-30" }).ok).toBe(true);
      expect(quote({ discount: sf10, today: "2026-10-01" }).ok).toBe(false);
    });

    it("stops once fully used", () => {
      expect(quote({ discount: discount({ maxRedemptions: 5, redemptions: 5 }) }).ok).toBe(false);
      expect(quote({ discount: discount({ maxRedemptions: 5, redemptions: 4 }) }).ok).toBe(true);
    });
  });

  describe("payment schedule", () => {
    it("takes full payment when the balance would already be due", () => {
      // Arriving 9 Feb, balance due 2 Feb: booking on 2 Feb means paying in full.
      const q = ok(quote({ today: "2027-02-02" }));
      expect(q).toMatchObject({ dueNowPence: 49500, balancePence: 0, balanceDueDate: null });
    });

    it("splits payment when booking before the balance due date", () => {
      expect(ok(quote({ today: "2027-02-01" })).balanceDueDate).toBe("2027-02-02");
    });

    it("takes full payment for properties without a deposit", () => {
      expect(ok(quote({ pol: { depositPercent: 100 } }))).toMatchObject({ dueNowPence: 49500, balanceDueDate: null });
    });

    it("rounds an odd deposit to the penny and puts the remainder in the balance", () => {
      const q = ok(quote({ nights: rates("2027-02-09", [10001, 10000, 10000]) }));
      expect(q.dueNowPence + q.balancePence).toBe(q.totalPence);
      expect(q.dueNowPence).toBe(15001);
    });
  });

  it("always adds up: total = accommodation + fees + extras − discount", () => {
    const q = ok(
      quote({
        req: { pets: 1, extras: [{ id: "x", quantity: 1 }] },
        extras: [{ id: "x", name: "X", pricePence: 1234, pricingType: "PER_STAY", maxQuantity: 1 }],
        pol: { cleaningFeePence: 2500 },
        discount: discount({ percentOff: 15 }),
      })
    );
    expect(q.totalPence).toBe(
      q.accommodationPence + q.cleaningFeePence + q.petFeePence + q.extrasPence - (q.discount?.pence ?? 0)
    );
    expect(q.dueNowPence + q.balancePence).toBe(q.totalPence);
  });
});

describe("groupNights", () => {
  it("groups consecutive nights at the same price", () => {
    const lines = [16500, 16500, 22500, 16500].map((p, i) => ({ date: `2027-02-0${i + 1}`, pricePence: p, source: "RATE" as const }));
    expect(groupNights(lines)).toEqual([
      { from: "2027-02-01", nights: 2, pricePence: 16500 },
      { from: "2027-02-03", nights: 1, pricePence: 22500 },
      { from: "2027-02-04", nights: 1, pricePence: 16500 },
    ]);
  });
});
