import { guardPublicRequest, json } from "@/lib/booking/api";
import { getHoldForGuest, releaseHold } from "@/lib/booking/holds";
import { isPaymentConfigured, stripeGateway } from "@/lib/payments/gateway";

// A guest's own hold or booking. Access needs the token handed out when the
// hold was created, sent in a header (so it doesn't end up in URLs or logs).
const token = (request: Request) => request.headers.get("x-access-token") ?? "";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await guardPublicRequest(request, "reservation-view", 60);
  if (blocked) return blocked;

  const view = await getHoldForGuest((await params).id, token(request));
  if (!view) return json({ error: "Not found" }, 404);

  const { checkoutSessionId, ...publicView } = view;
  // While the hold is live and unpaid, offer the way back to Stripe.
  let checkoutUrl: string | null = null;
  if (view.status === "HOLD" && view.payment?.status === "PENDING" && checkoutSessionId && isPaymentConfigured()) {
    checkoutUrl = await stripeGateway.checkoutUrl(checkoutSessionId).catch(() => null);
  }
  return json({ ...publicView, checkoutUrl });
}

/** Releases the guest's hold, e.g. to change dates. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await guardPublicRequest(request, "reservation-release", 20);
  if (blocked) return blocked;

  const id = (await params).id;
  const view = await getHoldForGuest(id, token(request));
  const released = view ? await releaseHold(id, token(request)) : false;
  // Close the Stripe page too, so a released hold can't then be paid.
  if (released && view?.checkoutSessionId && isPaymentConfigured()) {
    await stripeGateway.expireCheckout(view.checkoutSessionId).catch(() => undefined);
  }
  return released ? json({ released: true }) : json({ error: "Not found" }, 404);
}
