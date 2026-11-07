import Link from "next/link";
import { notFound } from "next/navigation";
import {
  cancelWithRefundAction,
  moveBookingAction,
  keepDespiteLodgifyAction,
  linkLodgifyBookingAction,
  retryLodgifyPushAction,
  recordPaymentAction,
  resendConfirmationAction,
  retryBalanceAction,
  retryCancellationRefundAction,
  retryLodgifyCancelAction,
} from "@/app/admin/(console)/bookings/actions";
import { ActionButton, CancelWithRefundForm, LinkLodgifyForm, ManualPaymentForm, MoveBookingForm } from "@/components/admin/BookingActions";
import PriceBreakdown from "@/components/booking/PriceBreakdown";
import { getBooking } from "@/lib/admin/bookings";
import { getCancellationRecord, previewCancellation } from "@/lib/admin/cancellations";
import { requireAdmin } from "@/lib/admin/dal";
import { getMoves, previewMove } from "@/lib/admin/moves";
import { isUuid } from "@/lib/admin/properties";
import { countryName } from "@/lib/countries";
import { formatPence } from "@/lib/money";

const day = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const show = (iso: string) => day.format(new Date(`${iso}T00:00:00Z`));
const at = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
const when = (d: Date | null) => (d ? at.format(new Date(d)) : "—");
const words = (s: string) => s.toLowerCase().replaceAll("_", " ");
const LODGIFY_STATUS: Record<string, string> = {
  OFF: "not sent (sending to Lodgify was switched off)",
  PENDING: "waiting to be sent",
  SENDING: "being sent",
  FAILED: "Lodgify refused it, so it's not in Lodgify",
  CHECK: "unclear whether it reached Lodgify: check there",
};

export default async function AdminBookingPage({ params, searchParams }: PageProps<"/admin/bookings/[id]">) {
  await requireAdmin();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const b = await getBooking(id);
  if (!b) notFound();

  // Payments are listed oldest first; a move can add a later balance payment.
  const lastBalance = b.payments.filter((p) => p.kind === "BALANCE").at(-1);
  const failedBalance =
    lastBalance?.status === "FAILED";

  // Worked out afresh on each view, as the refund depends on today's date.
  const sp = await searchParams;
  const param = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : null);
  const moveIn = param("moveIn");
  const moveOut = param("moveOut");
  const justMoved = param("moved") === "1";
  const chargeFailed = param("chargeFailed") === "1";
  const [preview, cancellation, moves, movePreview] = await Promise.all([
    b.status === "CONFIRMED" ? previewCancellation(b.id) : null,
    getCancellationRecord(b.id),
    getMoves(b.id),
    b.status === "CONFIRMED" && moveIn && moveOut ? previewMove(b.id, moveIn, moveOut) : null,
  ]);
  const mv = movePreview?.ok ? movePreview.preview : null;
  const dateInput = "mt-1 block border border-border bg-surface px-2 py-1.5 text-sm";

  return (
    <div className="space-y-10">
      <div>
        <Link href="/admin/bookings" className="text-sm text-muted-foreground underline">
          ← All bookings
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-foreground-strong">
          {b.reference} <span className="text-base font-normal text-muted-foreground">· {words(b.status)}</span>
        </h1>
        <p className="text-muted-foreground">
          {b.propertyName} · {show(b.checkIn)} → {show(b.checkOut)} · {b.sourceLabel}
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <section className="space-y-2 text-sm">
          <h2 className="text-lg font-semibold text-foreground-strong">Guest</h2>
          {b.guest ? (
            <>
              <p>
                {b.guest.firstName} {b.guest.lastName}
              </p>
              <p>
                <a href={`mailto:${b.guest.email}`} className="underline">
                  {b.guest.email}
                </a>
              </p>
              {b.guest.phone && (
                <p>
                  <a href={`tel:${b.guest.phone.replace(/\s/g, "")}`} className="underline">
                    {b.guest.phone}
                  </a>
                </p>
              )}
              {b.guest.address && <p>{b.guest.address}</p>}
              {b.guest.country && <p>{countryName(b.guest.country)}</p>}
            </>
          ) : (
            <p className="text-muted-foreground">No guest details.</p>
          )}
          <p>
            {b.adults} adults{b.children ? `, ${b.children} children` : ""}
            {b.infants ? `, ${b.infants} infants` : ""}
            {b.pets ? `, ${b.pets} pets` : ""}
          </p>
          {b.guestMessage && <p className="whitespace-pre-line border-l-2 border-border pl-3">{b.guestMessage}</p>}
          <p className="text-muted-foreground">
            Booked {when(b.createdAt)}
            {b.confirmedAt && ` · confirmed ${when(b.confirmedAt)}`}
            {b.termsAcceptedAt && ` · terms accepted ${when(b.termsAcceptedAt)}`}
          </p>
          {b.source === "DIRECT" && (
            <p>
              Newsletter:{" "}
              {!b.newsletterOptIn
                ? "didn't sign up"
                : b.newsletterStatus === "DONE"
                  ? "signed up"
                  : b.newsletterStatus === "FAILED"
                    ? "sign-up failed"
                    : "asked to sign up (sent once the booking's paid and EmailOctopus is set up)"}
            </p>
          )}
          {b.lodgifyPushStatus && (
            <p>
              Lodgify:{" "}
              {b.lodgifyPushStatus === "PUSHED" ? (
                <>booking {b.lodgifyBookingId}</>
              ) : (
                LODGIFY_STATUS[b.lodgifyPushStatus] ?? words(b.lodgifyPushStatus)
              )}
              {b.lodgifyPushError && <span className="block text-red-800">{b.lodgifyPushError}</span>}
              {b.lodgifyMismatch && (
                <span className={`block ${b.lodgifyMismatchIgnored ? "text-muted-foreground" : "text-red-800"}`}>
                  {b.lodgifyMismatchDetail}
                  {b.lodgifyMismatchIgnored ? " You chose to keep the booking as it is here." : " Its balance won't be charged until you deal with it."}
                </span>
              )}
            </p>
          )}
          {moves.map((m, i) => (
            <p key={i}>
              Moved {when(m.movedAt)} by {m.movedBy} from {show(m.fromCheckIn)} → {show(m.fromCheckOut)} to {show(m.toCheckIn)} →{" "}
              {show(m.toCheckOut)}: {m.reason}. Price {formatPence(m.oldTotalPence)} → {formatPence(m.newTotalPence)}
              {m.owedPence > 0 && `, ${formatPence(m.owedPence)} to pay${m.chargedAutomatically ? " by saved card" : " (no saved card)"}`}
              {m.creditPence > 0 && `, ${formatPence(m.creditPence)} held as credit`}.
            </p>
          ))}
          {b.cancelledAt && (
            <p className="text-red-800">
              Cancelled {when(b.cancelledAt)}
              {b.cancellationReason && `: ${b.cancellationReason}`}
            </p>
          )}
          {cancellation && (
            <div className="space-y-2">
              <p>
                Refund approved by {cancellation.approvedBy} on {show(cancellation.cancelledOn)}, {cancellation.daysBefore} days before arrival:{" "}
                {formatPence(cancellation.refundPence)}
                {cancellation.status === "DONE" ? "." : cancellation.status === "FAILED" ? ", not yet made." : ", being made."}
              </p>
              {cancellation.voucherPence > 0 && (
                <p>Give {formatPence(cancellation.voucherPence)} back as credit on voucher {cancellation.voucherCode} in Gift Up.</p>
              )}
              {cancellation.manualPence > 0 && <p>Return {formatPence(cancellation.manualPence)} paid outside Stripe.</p>}
              {cancellation.status !== "DONE" && (
                <>
                  {cancellation.failureMessage && <p className="text-red-800">{cancellation.failureMessage}</p>}
                  <ActionButton
                    action={retryCancellationRefundAction.bind(null, b.id)}
                    label="Retry refund"
                    confirmText={`Try the refund of ${formatPence(cancellation.cardPence)} to the card again?`}
                  />
                </>
              )}
            </div>
          )}
          {b.lodgifyCancelError && (
            <div className="space-y-2">
              <p className="text-red-800">{b.lodgifyCancelError}</p>
              <ActionButton action={retryLodgifyCancelAction.bind(null, b.id)} label="Try Lodgify again" />
            </div>
          )}
        </section>

        <section className="space-y-3 text-sm">
          <h2 className="text-lg font-semibold text-foreground-strong">Price and payments</h2>
          {b.quote && (
            <div className="max-w-sm border border-border bg-surface p-3">
              <PriceBreakdown quote={b.quote} />
            </div>
          )}
          <p>
            Paid {formatPence(b.paidPence)} ·{" "}
            {b.balancePence < 0 ? `Credit held for a future stay ${formatPence(-b.balancePence)}` : `Balance ${formatPence(b.balancePence)}`} · {words(b.paymentStatus)}
          </p>
          <ul className="divide-y divide-border border-y border-border">
            {b.payments.map((p) => (
              <li key={p.id} className="py-2">
                <span className="font-medium">{words(p.kind)}</span> {formatPence(p.amountPence)} · {words(p.status)}
                {p.dueDate && p.status === "PENDING" && ` · due ${show(p.dueDate)}`}
                {p.refundedPence > 0 && ` · refunded ${formatPence(p.refundedPence)}`}
                {p.provider === "MANUAL" && " · recorded manually"}
                {p.voucherCode && ` · Gift Up ${p.voucherCode}`}
                {p.voucherReversedAt && " · given back to the voucher"}
                {p.failureMessage && <span className="block text-xs text-muted-foreground">{p.failureMessage}</span>}
                {p.stripePaymentIntentId && (
                  <span className="block font-mono text-xs text-muted-foreground">{p.stripePaymentIntentId}</span>
                )}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Cancelling below makes the refund due. Any extra refund is made in the Stripe dashboard (search for the payment id above) and appears here automatically.
            Gift voucher amounts on a booking you cancel aren&apos;t given back automatically: give any refund due on them back as voucher credit in Gift Up.
          </p>
        </section>
      </div>

      {b.status === "CONFIRMED" && (
        <section className="max-w-3xl space-y-8">
          <h2 className="text-lg font-semibold text-foreground-strong">Actions</h2>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Send the guest their confirmation email again.</p>
            <ActionButton action={resendConfirmationAction.bind(null, b.id)} label="Resend confirmation" />
          </div>
          {failedBalance && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">The automatic balance payment failed. Try the saved card again:</p>
              <ActionButton
                action={retryBalanceAction.bind(null, b.id)}
                label="Retry balance charge"
                confirmText="Charge the guest's saved card for the balance now?"
              />
            </div>
          )}
          {b.balancePence > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Received money another way (e.g. bank transfer)? Record it here. Any automatic balance charge it makes unnecessary is called off.
              </p>
              <ManualPaymentForm action={recordPaymentAction.bind(null, b.id)} />
            </div>
          )}
          {b.lodgifyMismatch && !b.lodgifyMismatchIgnored && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                {b.lodgifyMismatch === "CANCELLED"
                  ? "This booking is cancelled in Lodgify. Cancel it here too (below) to release the dates and stop the balance, and refund in Stripe if due."
                  : "This booking is different in Lodgify. If that's expected, keep it as it is here and the balance will be charged as normal; otherwise cancel it below."}
              </p>
              <ActionButton
                action={keepDespiteLodgifyAction.bind(null, b.id)}
                label="Keep charging as normal"
                confirmText="Keep this booking as it is here and charge its balance as normal?"
              />
            </div>
          )}
          {(b.lodgifyPushStatus === "FAILED" || b.lodgifyPushStatus === "CHECK" || b.lodgifyPushStatus === "OFF") && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                This booking isn&apos;t linked to Lodgify. First check it isn&apos;t there already. If it is, enter its
                Lodgify booking number; if not, send it again.
              </p>
              <ActionButton
                action={retryLodgifyPushAction.bind(null, b.id)}
                label="Send to Lodgify"
                confirmText="Have you checked this booking isn't already in Lodgify? Sending it again would create a second copy."
              />
              <LinkLodgifyForm action={linkLodgifyBookingAction.bind(null, b.id)} />
            </div>
          )}
          <div id="move" className="space-y-3 border-t border-border pt-6">
            <h2 className="text-lg font-semibold text-foreground-strong">Move this booking</h2>
            {justMoved && (
              <p role="status" className="text-green-800">
                Booking moved.
                {chargeFailed && " Charging the difference to the saved card failed (see Payments): collect it from the guest and record it below."}
                {b.lodgifyBookingId &&
                  ` Now change Lodgify booking ${b.lodgifyBookingId} to ${show(b.checkIn)} → ${show(b.checkOut)} too. Until it matches, it shows as different in Lodgify and its balance isn't charged.`}
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              Choose the new dates to see the new price and what it means for payment. Nothing changes until you approve. There are no limits
              on dates here: anything outside the published terms is pointed out for you to decide.
            </p>
            <form method="get" action="#move" className="flex flex-wrap items-end gap-3">
              <label className="text-sm">
                New check-in
                <input type="date" name="moveIn" defaultValue={moveIn ?? b.checkIn} required className={dateInput} />
              </label>
              <label className="text-sm">
                New check-out
                <input type="date" name="moveOut" defaultValue={moveOut ?? b.checkOut} required className={dateInput} />
              </label>
              <button type="submit" className="border border-border px-4 py-2 text-sm font-medium">
                Preview the move
              </button>
            </form>
            {movePreview && !movePreview.ok && !justMoved && (
              <p role="alert" className="text-sm text-red-700">
                {movePreview.error}
              </p>
            )}
            {mv && (
              <div className="space-y-3">
                <p>
                  {show(mv.from.checkIn)} → {show(mv.from.checkOut)} ({mv.from.nights} nights) moves to{" "}
                  <strong>
                    {show(mv.to.checkIn)} → {show(mv.to.checkOut)}
                  </strong>{" "}
                  ({mv.to.nights} nights).
                </p>
                {mv.warnings.length > 0 && (
                  <div className="border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                    <p className="font-medium">Outside the published terms (your call):</p>
                    <ul className="mt-1 list-disc pl-5">
                      {mv.warnings.map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="max-w-sm">
                  <PriceBreakdown quote={mv.quote} />
                </div>
                <dl className="max-w-sm space-y-1">
                  <div className="flex justify-between gap-4"><dt>Price now</dt><dd>{formatPence(mv.oldTotalPence)}</dd></div>
                  <div className="flex justify-between gap-4"><dt>New price</dt><dd>{formatPence(mv.newTotalPence)}</dd></div>
                  <div className="flex justify-between gap-4"><dt>Paid so far</dt><dd>{formatPence(mv.paidPence)}</dd></div>
                  {mv.plan.owedPence > 0 && (
                    <div className="flex justify-between gap-4 border-t border-border pt-1 font-semibold"><dt>Still to pay</dt><dd>{formatPence(mv.plan.owedPence)}</dd></div>
                  )}
                  {mv.plan.payNowPence > 0 && (
                    <div className="flex justify-between gap-4"><dt>Charged to the saved card now (the difference)</dt><dd>{formatPence(mv.plan.payNowPence)}</dd></div>
                  )}
                  {mv.plan.payNowPence > 0 && mv.plan.owedPence > mv.plan.payNowPence && (
                    <div className="flex justify-between gap-4"><dt>Balance</dt><dd>{formatPence(mv.plan.owedPence - mv.plan.payNowPence)}</dd></div>
                  )}
                  {mv.plan.creditPence > 0 && (
                    <div className="flex justify-between gap-4 border-t border-border pt-1 font-semibold"><dt>Held as credit for a future stay</dt><dd>{formatPence(mv.plan.creditPence)}</dd></div>
                  )}
                  {mv.plan.owedPence === 0 && mv.plan.creditPence === 0 && (
                    <div className="flex justify-between gap-4 border-t border-border pt-1 font-semibold"><dt>Paid in full</dt><dd>{formatPence(0)} to pay</dd></div>
                  )}
                </dl>
                <p className="text-sm text-muted-foreground">
                  {mv.plan.owedPence > 0 && (mv.plan.balance.action === "UPDATE" || mv.plan.balance.action === "CREATE")
                    ? mv.plan.chargedAutomatically
                      ? `The balance is charged to the guest's saved card with the daily balance run on ${show(mv.plan.balance.dueDate)}.`
                      : "There's no saved card (the guest paid in full when booking), so collect it from them and record it on this page once paid."
                    : mv.plan.creditPence > 0
                      ? "Nothing is refunded. Any balance still waiting to be charged is called off."
                      : ""}{" "}
                  {mv.plan.payNowPence > 0 && "The difference is charged as soon as you move it; if the card is declined, the booking still moves and the difference is listed for you to collect."}{" "}
                  {mv.lodgifyBookingId
                    ? `Lodgify isn't changed from here: change booking ${mv.lodgifyBookingId} there to the new dates too. Until it matches, the booking shows as different in Lodgify and its balance isn't charged.`
                    : ""}
                </p>
                <MoveBookingForm
                  action={moveBookingAction.bind(null, b.id)}
                  checkIn={mv.to.checkIn}
                  checkOut={mv.to.checkOut}
                  approvedTotalPence={mv.newTotalPence}
                  approvedOwedPence={mv.plan.owedPence}
                  confirmText={`Move ${b.reference} to ${show(mv.to.checkIn)} → ${show(mv.to.checkOut)} at ${formatPence(mv.newTotalPence)}${mv.plan.payNowPence > 0 ? ` and charge ${formatPence(mv.plan.payNowPence)} to the guest's card now` : ""}?`}
                />
              </div>
            )}
          </div>
          {preview && (
            <div className="space-y-3 border-t border-border pt-6">
              <h2 className="text-lg font-semibold text-foreground-strong">Cancel this booking</h2>
              <p>{preview.explanation}</p>
              <dl className="max-w-sm space-y-1">
                <div className="flex justify-between gap-4"><dt>Total booking value</dt><dd>{formatPence(preview.totalPence)}</dd></div>
                <div className="flex justify-between gap-4"><dt>Paid so far</dt><dd>{formatPence(preview.paidPence)}</dd></div>
                <div className="flex justify-between gap-4 border-t border-border pt-1 font-semibold"><dt>Refund</dt><dd>{formatPence(preview.refundPence)}</dd></div>
                {preview.cardPence > 0 && <div className="flex justify-between gap-4"><dt>To the card, through Stripe</dt><dd>{formatPence(preview.cardPence)}</dd></div>}
                {preview.voucherPence > 0 && <div className="flex justify-between gap-4"><dt>Voucher credit {preview.voucherCode}, by hand in Gift Up</dt><dd>{formatPence(preview.voucherPence)}</dd></div>}
                {preview.manualPence > 0 && <div className="flex justify-between gap-4"><dt>Paid outside Stripe, return by hand</dt><dd>{formatPence(preview.manualPence)}</dd></div>}
              </dl>
              <p className="text-sm text-muted-foreground">
                Nothing happens until you approve. This cancels the booking, releases its dates here and in Lodgify, makes the card refund and emails the guest.
              </p>
              <CancelWithRefundForm
                action={cancelWithRefundAction.bind(null, b.id)}
                approvedRefundPence={preview.refundPence}
                label={preview.refundPence > 0 ? `Cancel and refund ${formatPence(preview.refundPence)}` : "Cancel with no refund"}
                confirmText={`Cancel ${b.reference} and refund ${formatPence(preview.refundPence)}? This can't be undone.`}
              />
            </div>
          )}
        </section>
      )}

      <section className="text-sm">
        <h2 className="text-lg font-semibold text-foreground-strong">Emails</h2>
        {b.emails.length === 0 ? (
          <p className="text-muted-foreground">None.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {b.emails.map((e, i) => (
              <li key={i}>
                {words(e.kind)} to {e.recipient}: {words(e.status)}
                {e.sentAt && ` ${when(e.sentAt)}`}
                {e.lastError && <span className="text-red-800"> ({e.lastError})</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="text-sm">
        <h2 className="text-lg font-semibold text-foreground-strong">History</h2>
        <ul className="mt-2 space-y-1">
          {b.history.map((h, i) => (
            <li key={i}>
              <span className="text-muted-foreground">{when(h.occurredAt)}</span> · {h.action.replaceAll(".", " ").replaceAll("_", " ")}
              {h.actor && ` · ${h.actor}`}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
