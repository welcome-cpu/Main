import { describe, expect, it } from "vitest";
import { readPromotion } from "@/lib/pricing/lodgify-promotions";

const quote = (roomRate: number, promo: number, name = "December Discount") => [
  {
    room_types: [
      {
        price_types: [
          { type: 0, subtotal: roomRate, prices: [{ description: "Muckle View", amount: roomRate }] },
          { type: 1, subtotal: promo, prices: promo ? [{ description: name, amount: promo }] : [] },
        ],
      },
    ],
  },
];

describe("readPromotion", () => {
  it("reads Lodgify's discount as a percentage of its room rate", () => {
    expect(readPromotion(quote(555, -55.5), "MOHR10")).toEqual({ code: "MOHR10", name: "December Discount", percentOff: 10 });
  });

  it("turns a fixed amount off into the matching percentage", () => {
    const p = readPromotion(quote(555, -156, "November Escape"), "ESCAPE2025")!;
    expect(Math.round((55500 * p.percentOff) / 100)).toBe(15600);
  });

  it("treats no discount, or a nonsense one, as not valid", () => {
    expect(readPromotion(quote(555, 0), "NOPE")).toBeNull();
    expect(readPromotion(quote(555, -600), "NOPE")).toBeNull();
    expect(readPromotion({ message: "error" }, "NOPE")).toBeNull();
  });
});
