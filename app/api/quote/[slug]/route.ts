import { guardPublicRequest, json, readJsonBody, validationError } from "@/lib/booking/api";
import { getPublicProperty } from "@/lib/booking/public";
import { quoteBodySchema } from "@/lib/booking/public-validation";
import { db } from "@/lib/db/client";
import { lookupLodgifyPromotion } from "@/lib/pricing/lodgify-promotions";
import { quoteStay } from "@/lib/pricing/quote-service";
import { lookupVoucher } from "@/lib/vouchers/giftup";

/**
 * Availability and a server-calculated price for a stay. The response is
 * for display only: payment (Phase 9) recalculates on the server and never
 * accepts a price from the browser.
 */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const blocked = await guardPublicRequest(request, "quote", 60);
  if (blocked) return blocked;

  const read = await readJsonBody(request);
  if (!read.ok) return read.response;
  const parsed = quoteBodySchema.safeParse(read.body);
  if (!parsed.success) return validationError(parsed.error);

  const property = await getPublicProperty((await params).slug);
  if (!property) return json({ error: "Not found" }, 404);

  const { voucherCode, ...stay } = parsed.data;
  // The voucher's balance comes from Gift Up, never from the browser.
  // So are Lodgify promotion codes, checked with Lodgify.
  const [voucher, lodgifyPromotion] = await Promise.all([
    voucherCode ? lookupVoucher(voucherCode) : null,
    lookupLodgifyPromotion(db(), property.id, stay, stay.discountCode),
  ]);
  const result = await quoteStay(db(), property.id, { ...stay, voucher: voucher?.ok ? voucher : null, lodgifyPromotion });
  if (!result) return json({ error: "Not found" }, 404);
  if (voucher && !voucher.ok && result.pricing?.ok) {
    result.pricing = { ok: false, error: { code: "VOUCHER_INVALID", message: voucher.message } };
  }

  return json({
    available: result.availability.available,
    nights: result.availability.nights,
    // Reasons only: never the details of what the dates clash with.
    reasons: result.availability.reasons.map(({ code, message }) => ({ code, message })),
    quote: result.pricing?.ok ? result.pricing.quote : null,
    quoteError: result.pricing && !result.pricing.ok ? result.pricing.error : null,
  });
}
