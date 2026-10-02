import { guardPublicRequest, json, validationError } from "@/lib/booking/api";
import { getPublicProperty } from "@/lib/booking/public";
import { quoteBodySchema } from "@/lib/booking/public-validation";
import { db } from "@/lib/db/client";
import { quoteStay } from "@/lib/pricing/quote-service";

/**
 * Availability and a server-calculated price for a stay. The response is
 * for display only: payment (Phase 9) recalculates on the server and never
 * accepts a price from the browser.
 */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const blocked = await guardPublicRequest(request, "quote", 30);
  if (blocked) return blocked;

  const body = await request.json().catch(() => null);
  const parsed = quoteBodySchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const property = await getPublicProperty((await params).slug);
  if (!property) return json({ error: "Not found" }, 404);

  const result = await quoteStay(db(), property.id, parsed.data);
  if (!result) return json({ error: "Not found" }, 404);

  return json({
    available: result.availability.available,
    nights: result.availability.nights,
    // Reasons only: never the details of what the dates clash with.
    reasons: result.availability.reasons.map(({ code, message }) => ({ code, message })),
    quote: result.pricing?.ok ? result.pricing.quote : null,
    quoteError: result.pricing && !result.pricing.ok ? result.pricing.error : null,
  });
}
