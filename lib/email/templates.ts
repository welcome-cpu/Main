// Transactional email content. Pure functions of the booking data, so they
// can be tested. Anything a guest typed is HTML-escaped.

import { formatPence } from "@/lib/money";
import { groupNights, type Quote } from "@/lib/pricing/quote";

export type BookingEmailData = {
  reference: string;
  propertyName: string;
  checkIn: string;
  checkOut: string;
  checkInTime: string;
  checkOutTime: string;
  adults: number;
  children: number;
  infants: number;
  pets: number;
  guestFirstName: string;
  guestLastName: string;
  guestEmail: string;
  guestPhone: string | null;
  guestMessage: string | null;
  quote: Quote;
  siteUrl: string;
  contactEmail: string;
};

export type RenderedEmail = { subject: string; html: string; text: string };

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const longDate = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
export const showDate = (iso: string) => longDate.format(new Date(`${iso}T00:00:00Z`));

function guestsLine(d: BookingEmailData) {
  const parts = [`${d.adults} adult${d.adults === 1 ? "" : "s"}`];
  if (d.children) parts.push(`${d.children} child${d.children === 1 ? "" : "ren"}`);
  if (d.infants) parts.push(`${d.infants} infant${d.infants === 1 ? "" : "s"}`);
  if (d.pets) parts.push(`${d.pets} pet${d.pets === 1 ? "" : "s"}`);
  return parts.join(", ");
}

function priceRows(q: Quote): [string, string][] {
  const m = (p: number) => formatPence(p, q.currency);
  const rows: [string, string][] = groupNights(q.nights).map((g) => [
    `${g.nights} night${g.nights === 1 ? "" : "s"} × ${m(g.pricePence)}`,
    m(g.nights * g.pricePence),
  ]);
  if (q.cleaningFeePence) rows.push(["Cleaning fee", m(q.cleaningFeePence)]);
  if (q.petFeePence) rows.push(["Pet fee", m(q.petFeePence)]);
  for (const x of q.extras) rows.push([x.quantity > 1 ? `${x.name} × ${x.quantity}` : x.name, m(x.totalPence)]);
  if (q.discount) rows.push([`${q.discount.name ?? "Discount"} (${q.discount.code})`, `−${m(q.discount.pence)}`]);
  rows.push(["Total", m(q.totalPence)]);
  if (q.voucher) rows.push([`Gift voucher (${q.voucher.code})`, `−${m(q.voucher.pence)}`]);
  return rows;
}

function paymentSummary(q: Quote) {
  const m = (p: number) => formatPence(p, q.currency);
  if (q.voucher) {
    return `Your gift voucher has paid ${m(q.voucher.pence)}${q.dueNowPence > 0 ? ` and we've taken ${m(q.dueNowPence)} by card` : ""}. Nothing more is due.`;
  }
  return q.balanceDueDate
    ? `We've taken a deposit of ${m(q.dueNowPence)}. The balance of ${m(q.balancePence)} will be charged automatically to the same card on ${showDate(q.balanceDueDate)}.`
    : `We've taken your payment of ${m(q.dueNowPence)} in full.`;
}

function layout(title: string, bodyHtml: string) {
  return `<!doctype html><html><body style="margin:0;background:#f5f2ec;font-family:Arial,Helvetica,sans-serif;color:#1c211c">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f2ec;padding:24px 0"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;padding:32px">
<tr><td><p style="margin:0 0 4px;font-size:13px;color:#6b6f6b">Gamrie Chalets</p>
<h1 style="margin:0 0 24px;font-size:22px;color:#374238">${escapeHtml(title)}</h1>
${bodyHtml}
</td></tr></table></td></tr></table></body></html>`;
}

const p = (html: string) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.5">${html}</p>`;

function detailsTable(rows: [string, string][]) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;font-size:15px;border-collapse:collapse">
${rows
  .map(
    ([label, value], i) =>
      `<tr><td style="padding:6px 0;border-top:${i ? "1px solid #e8e4dc" : "0"};color:#6b6f6b">${escapeHtml(label)}</td><td style="padding:6px 0;border-top:${i ? "1px solid #e8e4dc" : "0"};text-align:right">${escapeHtml(value)}</td></tr>`
  )
  .join("\n")}</table>`;
}

function stayRows(d: BookingEmailData): [string, string][] {
  return [
    ["Booking reference", d.reference],
    ["Property", d.propertyName],
    ["Check-in", `${showDate(d.checkIn)}, from ${d.checkInTime}`],
    ["Check-out", `${showDate(d.checkOut)}, by ${d.checkOutTime}`],
    ["Guests", guestsLine(d)],
  ];
}

const textTable = (rows: [string, string][]) => rows.map(([l, v]) => `${l}: ${v}`).join("\n");

// ---------------------------------------------------------------------------

export function guestBookingConfirmed(d: BookingEmailData): RenderedEmail {
  const subject = `Booking confirmed: ${d.propertyName}, ${showDate(d.checkIn)} (${d.reference})`;
  const html = layout(
    "Your booking is confirmed",
    p(`Dear ${escapeHtml(d.guestFirstName)},`) +
      p(`Thank you for booking ${escapeHtml(d.propertyName)} with us. We're looking forward to welcoming you.`) +
      detailsTable(stayRows(d)) +
      detailsTable(priceRows(d.quote)) +
      p(escapeHtml(paymentSummary(d.quote))) +
      p("All payments are non-refundable, so we recommend travel insurance. We'll be in touch before your stay with arrival details.") +
      p(`If you have any questions, just reply to this email or write to <a href="mailto:${escapeHtml(d.contactEmail)}">${escapeHtml(d.contactEmail)}</a>.`)
  );
  const text = [
    `Dear ${d.guestFirstName},`,
    "",
    `Thank you for booking ${d.propertyName} with us.`,
    "",
    textTable(stayRows(d)),
    "",
    textTable(priceRows(d.quote)),
    "",
    paymentSummary(d.quote),
    "",
    "All payments are non-refundable, so we recommend travel insurance. We'll be in touch before your stay with arrival details.",
    "",
    `Questions? Reply to this email or write to ${d.contactEmail}.`,
  ].join("\n");
  return { subject, html, text };
}

/**
 * Sent instead of guestBookingConfirmed when bookings go on to Lodgify,
 * which sends the confirmation itself. Lodgify can't see payments, so this
 * is where the guest learns what's been paid and when the balance is due.
 */
export function guestPaymentReceipt(d: BookingEmailData): RenderedEmail {
  const subject = `Payment receipt: ${d.propertyName}, ${showDate(d.checkIn)} (${d.reference})`;
  const intro = `Thank you for your payment for your stay at ${d.propertyName}. Your booking confirmation comes in a separate email.`;
  const html = layout(
    "Payment received",
    p(`Dear ${escapeHtml(d.guestFirstName)},`) +
      p(escapeHtml(intro)) +
      detailsTable(stayRows(d)) +
      detailsTable(priceRows(d.quote)) +
      p(escapeHtml(paymentSummary(d.quote))) +
      p("All payments are non-refundable, so we recommend travel insurance.") +
      p(`If you have any questions, just reply to this email or write to <a href="mailto:${escapeHtml(d.contactEmail)}">${escapeHtml(d.contactEmail)}</a>.`)
  );
  const text = [
    `Dear ${d.guestFirstName},`,
    "",
    intro,
    "",
    textTable(stayRows(d)),
    "",
    textTable(priceRows(d.quote)),
    "",
    paymentSummary(d.quote),
    "",
    "All payments are non-refundable, so we recommend travel insurance.",
    "",
    `Questions? Reply to this email or write to ${d.contactEmail}.`,
  ].join("\n");
  return { subject, html, text };
}

export function ownerNewBooking(d: BookingEmailData): RenderedEmail {
  const subject = `New direct booking ${d.reference}: ${d.propertyName}, ${showDate(d.checkIn)}`;
  const guestRows: [string, string][] = [
    ["Guest", `${d.guestFirstName} ${d.guestLastName}`],
    ["Email", d.guestEmail],
    ["Phone", d.guestPhone ?? "—"],
  ];
  const html = layout(
    `New booking: ${d.propertyName}`,
    detailsTable([...stayRows(d), ...guestRows]) +
      detailsTable(priceRows(d.quote)) +
      p(escapeHtml(paymentSummary(d.quote))) +
      (d.guestMessage ? p(`<strong>Guest's message:</strong><br>${escapeHtml(d.guestMessage).replaceAll("\n", "<br>")}`) : "") +
      p(`The booking is sent to Lodgify automatically; the admin area shows if it couldn't be. Other channels, like Airbnb, pick it up from Lodgify at their next calendar sync.`)
  );
  const text = [
    textTable([...stayRows(d), ...guestRows]),
    "",
    textTable(priceRows(d.quote)),
    "",
    paymentSummary(d.quote),
    d.guestMessage ? `\nGuest's message:\n${d.guestMessage}` : "",
  ].join("\n");
  return { subject, html, text };
}

export function guestNotCharged(d: BookingEmailData, reason: "DATES_UNAVAILABLE" | "PAYMENT_FAILED"): RenderedEmail {
  const subject = `Your booking at ${d.propertyName} couldn't be completed (${d.reference})`;
  const explanation =
    reason === "DATES_UNAVAILABLE"
      ? "Unfortunately your payment arrived after your hold on the dates had ended, and they had been booked in the meantime."
      : "Unfortunately your bank declined the payment when we tried to take it.";
  const body = `${explanation} No money has been taken. If your bank shows a pending amount, it will be released automatically, usually within a few days.`;
  const html = layout(
    "Your booking couldn't be completed",
    p(`Dear ${escapeHtml(d.guestFirstName)},`) +
      p(escapeHtml(body)) +
      detailsTable(stayRows(d)) +
      p(`We're sorry for the inconvenience. Please reply to this email or write to <a href="mailto:${escapeHtml(d.contactEmail)}">${escapeHtml(d.contactEmail)}</a> and we'll help you find other dates.`)
  );
  const text = [`Dear ${d.guestFirstName},`, "", body, "", textTable(stayRows(d)), "", `Please reply or write to ${d.contactEmail} and we'll help you find other dates.`].join("\n");
  return { subject, html, text };
}

export function ownerPaymentProblem(d: BookingEmailData, problem: string): RenderedEmail {
  const subject = `Action needed: ${d.reference} (${d.propertyName}), ${problem}`;
  const rows: [string, string][] = [...stayRows(d), ["Guest", `${d.guestFirstName} ${d.guestLastName}`], ["Email", d.guestEmail], ["Phone", d.guestPhone ?? "—"]];
  const html = layout(`Payment problem: ${d.reference}`, p(escapeHtml(problem)) + detailsTable(rows));
  return { subject, html, text: `${problem}\n\n${textTable(rows)}` };
}

export function guestBalanceFailed(d: BookingEmailData, amountPence: number): RenderedEmail {
  const amount = formatPence(amountPence, d.quote.currency);
  const subject = `Payment needed for your stay at ${d.propertyName} (${d.reference})`;
  const body = `We tried to take the balance of ${amount} for your upcoming stay, but the payment didn't go through. Your booking is still confirmed, but we need to collect the balance before you arrive.`;
  const html = layout(
    "We couldn't take your balance payment",
    p(`Dear ${escapeHtml(d.guestFirstName)},`) +
      p(escapeHtml(body)) +
      detailsTable(stayRows(d)) +
      p(`Please reply to this email or write to <a href="mailto:${escapeHtml(d.contactEmail)}">${escapeHtml(d.contactEmail)}</a> and we'll arrange payment with you.`)
  );
  const text = [`Dear ${d.guestFirstName},`, "", body, "", textTable(stayRows(d)), "", `Please reply or write to ${d.contactEmail} to arrange payment.`].join("\n");
  return { subject, html, text };
}

export function guestBalanceReceived(d: BookingEmailData, amountPence: number): RenderedEmail {
  const amount = formatPence(amountPence, d.quote.currency);
  const subject = `Balance received for ${d.propertyName} (${d.reference})`;
  const body = `We've received the balance of ${amount}, so your stay is now paid in full. We look forward to seeing you on ${showDate(d.checkIn)}.`;
  const html = layout("Your stay is paid in full", p(`Dear ${escapeHtml(d.guestFirstName)},`) + p(escapeHtml(body)) + detailsTable(stayRows(d)));
  const text = [`Dear ${d.guestFirstName},`, "", body, "", textTable(stayRows(d))].join("\n");
  return { subject, html, text };
}

export function guestBookingCancelled(d: BookingEmailData): RenderedEmail {
  const subject = `Your booking at ${d.propertyName} has been cancelled (${d.reference})`;
  const body = `Your booking below has been cancelled. If you have any questions about this, please get in touch.`;
  const html = layout(
    "Your booking has been cancelled",
    p(`Dear ${escapeHtml(d.guestFirstName)},`) +
      p(escapeHtml(body)) +
      detailsTable(stayRows(d)) +
      p(`Reply to this email or write to <a href="mailto:${escapeHtml(d.contactEmail)}">${escapeHtml(d.contactEmail)}</a>.`)
  );
  const text = [`Dear ${d.guestFirstName},`, "", body, "", textTable(stayRows(d)), "", `Reply or write to ${d.contactEmail}.`].join("\n");
  return { subject, html, text };
}

// ---------------------------------------------------------------------------
// Print sales (from the welcome guides)

export type PrintSaleEmailData = {
  printTitle: string;
  artist: string;
  amountPence: number;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string | null;
  /** The chalet they take it home from. */
  chaletName: string;
  contactEmail: string;
};

function printRows(d: PrintSaleEmailData): [string, string][] {
  return [
    ["Print", `${d.printTitle} by ${d.artist}`],
    ["Paid", formatPence(d.amountPence, "GBP")],
    ["Bought by", d.buyerName],
  ];
}

export function ownerPrintSold(d: PrintSaleEmailData): RenderedEmail {
  const subject = `Print sold: ${d.printTitle} to ${d.buyerName}`;
  const rows: [string, string][] = [...printRows(d), ["Email", d.buyerEmail], ["Phone", d.buyerPhone ?? "—"]];
  const note = `Paid in full by card through Stripe. They're taking the print with them from ${d.chaletName}.`;
  const html = layout("A print has been sold", detailsTable(rows) + p(escapeHtml(note)));
  const text = [textTable(rows), "", note].join("\n");
  return { subject, html, text };
}

export function printNeedsReplacing(d: PrintSaleEmailData): RenderedEmail {
  const subject = `Replace the print at changeover: ${d.printTitle} in ${d.chaletName}`;
  const note = `A guest has bought ${d.printTitle} by ${d.artist} and is taking it home with them, so the print in ${d.chaletName} needs replacing at the next changeover.`;
  const rows: [string, string][] = [
    ["Chalet", d.chaletName],
    ["Print", `${d.printTitle} by ${d.artist}`],
    ["Bought by", d.buyerName],
  ];
  const html = layout("A print needs replacing", p(escapeHtml(note)) + detailsTable(rows));
  const text = [note, "", textTable(rows)].join("\n");
  return { subject, html, text };
}

export function guestPrintReceipt(d: PrintSaleEmailData): RenderedEmail {
  const subject = `Thank you for buying ${d.printTitle}`;
  const body = `Thank you for buying ${d.printTitle} by ${d.artist}. We've received your payment, and the framed print on the wall in ${d.chaletName} is yours: please take it home with you when you leave.`;
  const html = layout(
    "Thank you for your order",
    p(`Dear ${escapeHtml(d.buyerName)},`) +
      p(escapeHtml(body)) +
      detailsTable(printRows(d)) +
      p(`If you have any questions, reply to this email or write to <a href="mailto:${escapeHtml(d.contactEmail)}">${escapeHtml(d.contactEmail)}</a>.`)
  );
  const text = [`Dear ${d.buyerName},`, "", body, "", textTable(printRows(d)), "", `Questions? Reply or write to ${d.contactEmail}.`].join("\n");
  return { subject, html, text };
}
