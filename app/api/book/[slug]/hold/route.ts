import { guardPublicRequest, json, validationError } from "@/lib/booking/api";
import { createHold, GUEST_FACING_HOLD_MINUTES, HOLD_MINUTES } from "@/lib/booking/holds";
import { getPublicProperty } from "@/lib/booking/public";
import { holdBodySchema } from "@/lib/booking/public-validation";
import { clientIp } from "@/lib/rate-limit";
import { passesTurnstile } from "@/lib/turnstile";

/**
 * Starts checkout: holds the dates for 30 minutes while the guest pays.
 * Availability and price are worked out again here, under a lock; nothing
 * the browser says about price is used.
 */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  // Holds take dates off sale, so they're limited much more tightly than
  // quotes: 5 per IP per 10 minutes, plus a Turnstile check.
  const blocked = await guardPublicRequest(request, "hold", 5, 600);
  if (blocked) return blocked;

  const parsed = holdBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error);

  const ip = clientIp(request);
  if (!(await passesTurnstile(parsed.data.turnstileToken, ip))) {
    return json({ error: "Please complete the verification check and try again." }, 400);
  }

  const property = await getPublicProperty((await params).slug);
  if (!property) return json({ error: "Not found" }, 404);

  const { stay, guest } = parsed.data;
  const result = await createHold(
    property.id,
    { ...stay, discountCode: stay.discountCode ?? null },
    { ...guest, email: guest.email.toLowerCase() },
    { ip }
  );

  if (!result.ok) {
    return json(
      {
        error: result.quoteError?.message ?? result.reasons[0]?.message ?? "Those dates can't be booked.",
        reasons: result.reasons.map(({ code, message }) => ({ code, message })),
      },
      409
    );
  }

  return json(
    {
      reservationId: result.reservationId,
      reference: result.reference,
      accessToken: result.accessToken,
      payBy: new Date(result.expiresAt.getTime() - (HOLD_MINUTES - GUEST_FACING_HOLD_MINUTES) * 60_000).toISOString(),
      quote: result.quote,
    },
    201
  );
}
