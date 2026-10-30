import Link from "next/link";
import { importLodgifyBookingsAction } from "@/app/admin/(console)/bookings/actions";
import { ActionButton } from "@/components/admin/BookingActions";
import { listBookings, needsAttention, type BookingFilters } from "@/lib/admin/bookings";
import { listConflicts } from "@/lib/admin/calendars";
import { requireAdmin } from "@/lib/admin/dal";
import { isUuid, listProperties } from "@/lib/admin/properties";
import { countryName } from "@/lib/countries";
import { isValidDate } from "@/lib/dates";
import { guestCountries, lastBookingImport } from "@/lib/guests/lodgify-import";
import { formatPence } from "@/lib/money";

const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "2-digit", timeZone: "UTC" });
const show = (iso: string) => day.format(new Date(`${iso}T00:00:00Z`));
const money = (p: number | null) => (p === null ? "—" : formatPence(p));
const at = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

const STATUSES = ["CONFIRMED", "HOLD", "CANCELLED", "EXPIRED", "ALL"] as const;
const SOURCES = [
  { value: "", label: "All sources" },
  { value: "DIRECT", label: "Direct (website)" },
  { value: "MANUAL", label: "Manual" },
  { value: "EXTERNAL", label: "All imported calendars" },
  { value: "LODGIFY", label: "Lodgify import" },
  { value: "AIRBNB", label: "Airbnb import" },
  { value: "BOOKING_COM", label: "Booking.com import" },
  { value: "OTHER", label: "Other import" },
];

function parseFilters(q: Record<string, string | string[] | undefined>): BookingFilters {
  const one = (k: string) => (typeof q[k] === "string" ? (q[k] as string) : "");
  const status = STATUSES.find((s) => s === one("status")) ?? "CONFIRMED";
  const source = SOURCES.some((s) => s.value === one("source")) && one("source") ? one("source") : null;
  return {
    propertyId: isUuid(one("property")) ? one("property") : null,
    source,
    status,
    from: isValidDate(one("from")) ? one("from") : null,
    to: isValidDate(one("to")) ? one("to") : null,
  };
}

export default async function AdminBookingsPage({ searchParams }: PageProps<"/admin/bookings">) {
  await requireAdmin();
  const filters = parseFilters(await searchParams);
  const year = Number(new Intl.DateTimeFormat("en-GB", { year: "numeric", timeZone: "Europe/London" }).format(new Date()));
  const [rows, properties, attention, allConflicts, countries, lastImport] = await Promise.all([
    listBookings(filters),
    listProperties(),
    needsAttention(),
    listConflicts(),
    guestCountries(year),
    lastBookingImport(),
  ]);
  // Exact-date matches are our own bookings reflected back by a channel.
  const conflicts = allConflicts.filter((c) => !c.exactMatch);
  const hasAttention =
    attention.failedPayments.length +
      attention.failingFeeds.length +
      attention.failedEmails.length +
      attention.voucherProblems.length +
      conflicts.length >
    0;

  const select = "mt-1 block border border-border bg-surface px-2 py-1.5 text-sm";
  return (
    <div className="space-y-10">
      {hasAttention && (
        <section className="border border-red-300 bg-red-50 p-4 text-sm text-red-900">
          <h2 className="font-semibold">Needs attention</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {conflicts.map((c) => (
              <li key={`${c.eventId}-${c.reservationReference}`}>
                Possible double booking at {c.propertyName}: {c.feedName} has {show(c.eventStart)}–{show(c.eventEnd)},
                overlapping {c.reservationReference}.
              </li>
            ))}
            {attention.failedPayments.map((f) => (
              <li key={f.reservationId}>
                <Link href={`/admin/bookings/${f.reservationId}`} className="underline">
                  {f.reference}
                </Link>{" "}
                ({f.propertyName}, arriving {show(f.checkIn)}): balance of {formatPence(f.amountPence)} failed
                {f.message ? ` (${f.message})` : ""}.
              </li>
            ))}
            {attention.voucherProblems.map((v) => (
              <li key={`${v.reservationId}-${v.voucherCode}`}>
                <Link href={`/admin/bookings/${v.reservationId}`} className="underline">
                  {v.reference}
                </Link>
                : gift voucher {v.voucherCode} ({formatPence(v.amountPence)}). {v.message}
              </li>
            ))}
            {attention.failingFeeds.map((f) => (
              <li key={`${f.propertyName}-${f.name}`}>
                Calendar {f.propertyName} · {f.name} is failing ({f.failures}×): {f.error}{" "}
                <Link href="/admin/calendars" className="underline">
                  Calendars
                </Link>
              </li>
            ))}
            {attention.failedEmails.map((e, i) => (
              <li key={i}>
                Email {e.kind.toLowerCase().replaceAll("_", " ")} to {e.recipient} couldn&apos;t be sent
                {e.reference ? ` (${e.reference})` : ""}: {e.error}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h1 className="text-2xl font-semibold text-foreground-strong">Bookings</h1>
        <form className="mt-4 flex flex-wrap items-end gap-4" method="get">
          <label className="text-sm">
            Property
            <select name="property" defaultValue={filters.propertyId ?? ""} className={select}>
              <option value="">All properties</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Source
            <select name="source" defaultValue={filters.source ?? ""} className={select}>
              {SOURCES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Status
            <select name="status" defaultValue={filters.status} className={select}>
              <option value="CONFIRMED">Confirmed</option>
              <option value="HOLD">Checkout holds</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="EXPIRED">Expired holds</option>
              <option value="ALL">All</option>
            </select>
          </label>
          <label className="text-sm">
            Staying from
            <input type="date" name="from" defaultValue={filters.from ?? ""} className={select} />
          </label>
          <label className="text-sm">
            to
            <input type="date" name="to" defaultValue={filters.to ?? ""} className={select} />
          </label>
          <button type="submit" className="bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Filter
          </button>
          <Link href="/admin/bookings" className="text-sm underline">
            Reset
          </Link>
        </form>
        <p className="mt-2 text-xs text-muted-foreground">
          Without dates, shows stays from today onwards. Imported bookings come from other channels&apos; calendars and have
          no payment details here. Their guest names and countries are copied from Lodgify each morning; a country is worked
          out from the guest&apos;s phone number, as Airbnb and Booking.com don&apos;t share addresses.
        </p>
      </section>

      <section className="overflow-x-auto">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No bookings match.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                {["Ref", "Guest", "Country", "Property", "Check-in", "Check-out", "Guests", "Source", "Total", "Paid", "Balance", "Payment", "Status"].map((h) => (
                  <th key={h} className="py-2 pr-3 font-medium whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.kind}-${r.id}`} className="border-b border-border align-top">
                  <td className="py-2 pr-3 whitespace-nowrap">
                    {r.kind === "RESERVATION" ? (
                      <Link href={`/admin/bookings/${r.id}`} className="font-medium text-foreground-strong underline">
                        {r.reference}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">imported</span>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    {r.guestName ?? "—"}
                    {r.guestEmail && (
                      <a href={`mailto:${r.guestEmail}`} className="block text-xs text-muted-foreground underline">
                        {r.guestEmail}
                      </a>
                    )}
                    {r.guestPhone && (
                      <a href={`tel:${r.guestPhone.replace(/\s/g, "")}`} className="block text-xs whitespace-nowrap text-muted-foreground underline">
                        {r.guestPhone}
                      </a>
                    )}
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">{r.guestCountry ? countryName(r.guestCountry) : "—"}</td>
                  <td className="py-2 pr-3">{r.propertyName}</td>
                  <td className="py-2 pr-3 whitespace-nowrap">{show(r.checkIn)}</td>
                  <td className="py-2 pr-3 whitespace-nowrap">{show(r.checkOut)}</td>
                  <td className="py-2 pr-3 whitespace-nowrap">{r.guests ?? "—"}</td>
                  <td className="py-2 pr-3">{r.sourceLabel}</td>
                  <td className="py-2 pr-3 tabular-nums">{money(r.totalPence)}</td>
                  <td className="py-2 pr-3 tabular-nums">{money(r.paidPence)}</td>
                  <td className="py-2 pr-3 tabular-nums">{money(r.balancePence)}</td>
                  <td className="py-2 pr-3">{r.paymentStatus?.toLowerCase().replaceAll("_", " ") ?? "—"}</td>
                  <td className="py-2 pr-3">{r.status.toLowerCase()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground-strong">Where guests are from</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Confirmed bookings by year of arrival, from Lodgify (all channels) and this site. For Lodgify bookings the
            country comes from the guest&apos;s phone number, so it&apos;s where their phone is registered.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <ActionButton action={importLodgifyBookingsAction} label="Import from Lodgify now" />
          <span className="text-muted-foreground">
            {lastImport
              ? lastImport.status === "ERROR"
                ? `Last import failed ${at.format(new Date(lastImport.startedAt))}: ${lastImport.error}`
                : `Last imported ${at.format(new Date(lastImport.startedAt))}${lastImport.bookingsImported !== null ? ` (${lastImport.bookingsImported} bookings)` : ""}`
              : "Not imported yet."}
          </span>
        </div>
        {countries.length > 0 && (
          <div className="overflow-x-auto">
            <table className="text-left text-sm">
              <thead className="border-b border-border text-muted-foreground">
                <tr>
                  {["Country", String(year), String(year - 1), "All time"].map((h) => (
                    <th key={h} className="py-2 pr-6 font-medium whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {countries.map((c) => (
                  <tr key={c.country ?? "unknown"} className="border-b border-border">
                    <td className="py-2 pr-6">{c.country ? countryName(c.country) : "Unknown"}</td>
                    <td className="py-2 pr-6 tabular-nums">{c.thisYear}</td>
                    <td className="py-2 pr-6 tabular-nums">{c.lastYear}</td>
                    <td className="py-2 pr-6 tabular-nums">{c.allTime}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
