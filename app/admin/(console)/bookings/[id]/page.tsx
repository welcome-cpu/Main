import Link from "next/link";
import { notFound } from "next/navigation";
import {
  cancelBookingAction,
  recordPaymentAction,
  resendConfirmationAction,
  retryBalanceAction,
} from "@/app/admin/(console)/bookings/actions";
import { ActionButton, CancelBookingForm, ManualPaymentForm } from "@/components/admin/BookingActions";
import PriceBreakdown from "@/components/booking/PriceBreakdown";
import { getBooking } from "@/lib/admin/bookings";
import { requireAdmin } from "@/lib/admin/dal";
import { isUuid } from "@/lib/admin/properties";
import { formatPence } from "@/lib/money";

const day = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const show = (iso: string) => day.format(new Date(`${iso}T00:00:00Z`));
const at = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
const when = (d: Date | null) => (d ? at.format(new Date(d)) : "—");
const words = (s: string) => s.toLowerCase().replaceAll("_", " ");

export default async function AdminBookingPage({ params }: PageProps<"/admin/bookings/[id]">) {
  await requireAdmin();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const b = await getBooking(id);
  if (!b) notFound();

  const failedBalance =
    b.payments.some((p) => p.kind === "BALANCE" && p.status === "FAILED") &&
    !b.payments.some((p) => p.kind === "BALANCE" && (p.status === "PENDING" || p.status === "SUCCEEDED"));

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
          {b.cancelledAt && (
            <p className="text-red-800">
              Cancelled {when(b.cancelledAt)}
              {b.cancellationReason && `: ${b.cancellationReason}`}
            </p>
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
            Paid {formatPence(b.paidPence)} · Balance {formatPence(b.balancePence)} · {words(b.paymentStatus)}
          </p>
          <ul className="divide-y divide-border border-y border-border">
            {b.payments.map((p) => (
              <li key={p.id} className="py-2">
                <span className="font-medium">{words(p.kind)}</span> {formatPence(p.amountPence)} · {words(p.status)}
                {p.dueDate && p.status === "PENDING" && ` · due ${show(p.dueDate)}`}
                {p.refundedPence > 0 && ` · refunded ${formatPence(p.refundedPence)}`}
                {p.provider === "MANUAL" && " · recorded manually"}
                {p.failureMessage && <span className="block text-xs text-muted-foreground">{p.failureMessage}</span>}
                {p.stripePaymentIntentId && (
                  <span className="block font-mono text-xs text-muted-foreground">{p.stripePaymentIntentId}</span>
                )}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Refunds are made in the Stripe dashboard (search for the payment id above); they appear here automatically.
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
                Received the balance another way (e.g. bank transfer)? Record it here. This stops the automatic charge.
              </p>
              <ManualPaymentForm action={recordPaymentAction.bind(null, b.id)} />
            </div>
          )}
          <div className="space-y-2 border-t border-border pt-6">
            <p className="text-sm text-muted-foreground">
              Cancelling releases the dates straight away. Payments aren&apos;t refunded automatically.
            </p>
            <CancelBookingForm action={cancelBookingAction.bind(null, b.id)} />
          </div>
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
