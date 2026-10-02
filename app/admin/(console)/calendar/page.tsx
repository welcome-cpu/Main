import Link from "next/link";
import { loadAdminCalendar, type CalendarItem, type CalendarItemType } from "@/lib/admin/calendar";
import { requireAdmin } from "@/lib/admin/dal";
import { addDays, daysBetween, isValidDate, todayInZone } from "@/lib/dates";

const DAYS = 42;

const STYLES: Record<CalendarItemType, { label: string; className: string }> = {
  DIRECT: { label: "Direct booking", className: "bg-emerald-700 text-white" },
  MANUAL_BOOKING: { label: "Manual booking", className: "bg-teal-600 text-white" },
  HOLD: { label: "Checkout hold", className: "border-2 border-dashed border-amber-600 bg-amber-100 text-amber-900" },
  AIRBNB: { label: "Airbnb (imported)", className: "bg-rose-500 text-white" },
  BOOKING_COM: { label: "Booking.com (imported)", className: "bg-blue-700 text-white" },
  LODGIFY: { label: "Lodgify (imported)", className: "bg-violet-600 text-white" },
  OTHER: { label: "Other calendar (imported)", className: "bg-stone-500 text-white" },
  BLOCK: { label: "Blocked by owner", className: "bg-[repeating-linear-gradient(45deg,#57534e_0,#57534e_6px,#78716c_6px,#78716c_12px)] text-white" },
};

const monthLabel = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" });
const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "narrow", timeZone: "UTC" });
const full = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** Puts overlapping items on separate lines so clashes are visible, not hidden. */
function lanes(items: CalendarItem[]) {
  const result: CalendarItem[][] = [];
  for (const item of items) {
    const lane = result.find((l) => l.at(-1)!.end <= item.start);
    if (lane) lane.push(item);
    else result.push([item]);
  }
  return result.length ? result : [[]];
}

export default async function AdminCalendarPage({ searchParams }: PageProps<"/admin/calendar">) {
  await requireAdmin();
  const q = await searchParams;
  const today = todayInZone("Europe/London");
  const from = typeof q.from === "string" && isValidDate(q.from) ? q.from : addDays(today, -3);
  const to = addDays(from, DAYS);
  const rows = await loadAdminCalendar(from, to);
  const days = Array.from({ length: DAYS }, (_, i) => addDays(from, i));

  const col = (date: string) => Math.max(0, Math.min(DAYS, daysBetween(from, date)));
  const grid = { gridTemplateColumns: `11rem repeat(${DAYS}, minmax(2rem, 1fr))` };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-foreground-strong">Calendar</h1>
        <nav className="flex gap-4 text-sm">
          <Link href={`/admin/calendar?from=${addDays(from, -28)}`} className="underline">
            ← 4 weeks
          </Link>
          <Link href="/admin/calendar" className="underline">
            Today
          </Link>
          <Link href={`/admin/calendar?from=${addDays(from, 28)}`} className="underline">
            4 weeks →
          </Link>
        </nav>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs">
        {Object.values(STYLES).map((s) => (
          <span key={s.label} className="flex items-center gap-1.5">
            <span className={`inline-block h-3 w-5 ${s.className}`} /> {s.label}
          </span>
        ))}
      </div>

      <div className="overflow-x-auto border border-border">
        <div className="grid min-w-[72rem] text-xs" style={grid}>
          <div className="sticky left-0 z-10 border-b border-border bg-surface p-2 font-medium">Property</div>
          {days.map((day) => (
            <div
              key={day}
              className={`border-b border-l border-border p-1 text-center ${day === today ? "bg-amber-50 font-semibold" : ""} ${[0, 6].includes(d(day).getUTCDay()) ? "bg-stone-100" : ""}`}
            >
              {(day.endsWith("-01") || day === from) && <div className="text-muted-foreground">{monthLabel.format(d(day))}</div>}
              <div>{weekday.format(d(day))}</div>
              <div>{d(day).getUTCDate()}</div>
            </div>
          ))}

          {rows.map((row) =>
            lanes(row.items).map((lane, laneIndex) => (
              <div key={`${row.propertyId}-${laneIndex}`} className="contents">
                <div className="sticky left-0 z-10 border-b border-border bg-surface p-2 font-medium">
                  {laneIndex === 0 ? row.propertyName : <span className="text-red-700">overlap ↑</span>}
                </div>
                <div className="relative grid border-b border-border" style={{ gridColumn: `2 / span ${DAYS}`, gridTemplateColumns: `repeat(${DAYS}, minmax(2rem, 1fr))` }}>
                  {days.map((day) => (
                    <div key={day} className={`h-9 border-l border-border ${day === today ? "bg-amber-50" : ""}`} />
                  ))}
                  {lane.map((item, i) => {
                    const start = col(item.start);
                    const span = col(item.end) - start;
                    if (span <= 0) return null;
                    const style = STYLES[item.type];
                    const title = `${style.label}: ${item.label}, ${full.format(d(item.start))} – ${full.format(d(item.end))}`;
                    const bar = (
                      <span className={`block truncate px-1.5 py-1 leading-5 ${style.className}`} title={title}>
                        {item.label}
                      </span>
                    );
                    return (
                      <div
                        key={i}
                        className="absolute top-1 bottom-1"
                        style={{ left: `calc(${(start / DAYS) * 100}% + 50% / ${DAYS})`, width: `calc(${(span / DAYS) * 100}% - 2px)` }}
                      >
                        {item.reservationId ? (
                          <Link href={`/admin/bookings/${item.reservationId}`} className="block hover:opacity-90">
                            {bar}
                          </Link>
                        ) : (
                          bar
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Bars run from check-in afternoon to check-out morning, so back-to-back stays meet at mid-day. Imported bookings are
        only as current as each calendar&apos;s last sync.
      </p>
    </div>
  );
}
