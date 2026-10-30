import "server-only";
import { logError } from "@/lib/log";

// Gift Up! (giftup.app) sells the gift vouchers; this checks and redeems them
// at our checkout. Shapes per developer.giftup.com/api: GET
// /gift-cards/{code}, POST /gift-cards/{code}/redeem { amount, reason,
// metadata } -> { transactionId, redeemedAmount, remainingCredit }, POST
// /gift-cards/{code}/undo-redemption { transactionId, reason }. Amounts are
// decimal pounds. Anything other than the live site uses Gift Up's test
// mode, so a test booking can never spend a real voucher.

const BASE_URL = "https://api.giftup.app";

export function isVoucherConfigured() {
  return Boolean(process.env.GIFTUP_API_KEY);
}

/** Codes are case-insensitive; Gift Up issues letters, digits and dashes. */
export function normaliseVoucherCode(code: string) {
  const normalised = code.trim().toUpperCase();
  return /^[A-Z0-9-]{4,40}$/.test(normalised) ? normalised : null;
}

const toPence = (pounds: unknown) =>
  typeof pounds === "number" && Number.isFinite(pounds) && pounds > 0 ? Math.round(pounds * 100) : 0;

async function giftUp(path: string, init: { method?: "GET" | "POST"; body?: unknown } = {}) {
  const key = process.env.GIFTUP_API_KEY;
  if (!key) throw new VoucherUnavailable();
  const headers: Record<string, string> = { Authorization: `Bearer ${key}`, Accept: "application/json" };
  if (process.env.VERCEL_ENV !== "production") headers["x-giftup-testmode"] = "true";
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  return fetch(`${BASE_URL}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
}

export type VoucherLookup = { ok: true; code: string; availablePence: number } | { ok: false; message: string };

/** What a voucher can pay right now. Read-only. */
export async function lookupVoucher(rawCode: string): Promise<VoucherLookup> {
  const code = normaliseVoucherCode(rawCode);
  if (!code) return { ok: false, message: "We don't recognise that gift voucher code." };
  if (!isVoucherConfigured()) return { ok: false, message: "Gift vouchers can't be used online yet. Please contact us to book with one." };

  let res: Response;
  try {
    res = await giftUp(`/gift-cards/${encodeURIComponent(code)}`);
  } catch (error) {
    logError("Gift Up lookup failed", error);
    return { ok: false, message: "We couldn't check your gift voucher just now. Please try again in a moment." };
  }
  if (res.status === 404) return { ok: false, message: "We don't recognise that gift voucher code." };
  if (!res.ok) {
    logError("Gift Up lookup failed", new Error(`HTTP ${res.status}`));
    return { ok: false, message: "We couldn't check your gift voucher just now. Please try again in a moment." };
  }

  const card = (await res.json()) as {
    canBeRedeemed?: boolean;
    isVoided?: boolean;
    hasExpired?: boolean;
    notYetValid?: boolean;
    backingType?: string;
    remainingValue?: number;
  };
  if (card.isVoided) return { ok: false, message: "This gift voucher has been cancelled." };
  if (card.hasExpired) return { ok: false, message: "This gift voucher has expired." };
  if (card.notYetValid) return { ok: false, message: "This gift voucher can't be used yet." };
  if (card.backingType !== "Currency") {
    return { ok: false, message: "This voucher is for a set stay rather than an amount. Please contact us to book with it." };
  }
  const availablePence = toPence(card.remainingValue);
  if (!card.canBeRedeemed || availablePence === 0) return { ok: false, message: "This gift voucher has no balance left." };
  return { ok: true, code, availablePence };
}

export type VoucherRedemption =
  | { ok: true; transactionId: string; redeemedPence: number }
  /** Gift Up said no: nothing was taken from the voucher. */
  | { ok: false; outcome: "REFUSED"; message: string }
  /** No clear answer (e.g. a timeout): the voucher may or may not have been used. */
  | { ok: false; outcome: "UNKNOWN"; message: string };

export async function redeemVoucher(code: string, pence: number, booking: { reservationId: string; reference: string }): Promise<VoucherRedemption> {
  let res: Response;
  try {
    res = await giftUp(`/gift-cards/${encodeURIComponent(code)}/redeem`, {
      method: "POST",
      body: {
        amount: pence / 100,
        reason: `Booking ${booking.reference}`,
        metadata: { reservationId: booking.reservationId, reference: booking.reference },
      },
    });
  } catch (error) {
    logError("Gift Up redemption failed", error);
    return { ok: false, outcome: "UNKNOWN", message: "No response from Gift Up" };
  }

  if (res.ok) {
    const body = (await res.json()) as { transactionId?: string; redeemedAmount?: number };
    const redeemedPence = toPence(body.redeemedAmount);
    if (!body.transactionId || redeemedPence !== pence) {
      return { ok: false, outcome: "UNKNOWN", message: `Unexpected redemption response (${redeemedPence}p of ${pence}p)` };
    }
    return { ok: true, transactionId: body.transactionId, redeemedPence };
  }
  if (res.status === 422 || res.status === 404) {
    const body = (await res.json().catch(() => ({}))) as { insufficientRemainingCredit?: boolean; wasVoided?: boolean };
    return {
      ok: false,
      outcome: "REFUSED",
      message: body.wasVoided
        ? "This gift voucher has been cancelled."
        : body.insufficientRemainingCredit
          ? "This gift voucher no longer has enough balance."
          : "This gift voucher can't be used.",
    };
  }
  // A server error or anything unexpected: we can't tell whether it was used.
  logError("Gift Up redemption failed", new Error(`HTTP ${res.status}`));
  return { ok: false, outcome: "UNKNOWN", message: `Gift Up returned HTTP ${res.status}` };
}

/** Gives the amount back to the voucher. Safe to repeat: Gift Up reports an already-undone redemption as done. */
export async function undoVoucherRedemption(code: string, transactionId: string, reference: string) {
  const res = await giftUp(`/gift-cards/${encodeURIComponent(code)}/undo-redemption`, {
    method: "POST",
    body: { transactionId, reason: `Booking ${reference} didn't go ahead` },
  });
  if (!res.ok) throw new Error(`Gift Up returned HTTP ${res.status}`);
}

class VoucherUnavailable extends Error {}
