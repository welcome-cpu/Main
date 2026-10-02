import {
  addFeedAction,
  createExportAction,
  deleteFeedAction,
  revokeExportAction,
  syncAllAction,
  syncFeedAction,
  toggleFeedAction,
} from "@/app/admin/(console)/calendars/actions";
import { AddFeedForm, ExportLinkForm, SyncAllButton } from "@/components/admin/CalendarForms";
import {
  listConflicts,
  listFeeds,
  listRecentRuns,
  listUpcomingImportedEvents,
} from "@/lib/admin/calendars";
import { requireAdmin } from "@/lib/admin/dal";
import { listProperties } from "@/lib/admin/properties";
import { listExportLinks } from "@/lib/calendar/exports";

const when = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/London",
});
const day = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const showDay = (iso: string) => day.format(new Date(`${iso}T00:00:00Z`));
const showWhen = (d: Date | null) => (d ? when.format(d) : "Never");

export default async function AdminCalendarsPage() {
  await requireAdmin();
  const [feeds, runs, events, allConflicts, properties, exportLinks] = await Promise.all([
    listFeeds(),
    listRecentRuns(),
    listUpcomingImportedEvents(),
    listConflicts(),
    listProperties(),
    listExportLinks(),
  ]);
  const conflicts = allConflicts.filter((c) => !c.exactMatch);
  const echoes = allConflicts.filter((c) => c.exactMatch);

  return (
    <div className="space-y-14">
      <section>
        <h1 className="text-2xl font-semibold text-foreground-strong">External calendars</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Bookings from other channels are imported from their iCal links and block those dates here.
          iCal is <strong>not real-time</strong>: changes appear only after the next sync (every 15 minutes
          on the live site, or when you press the button), and the other channel may itself take hours to
          update its own link. Imports never change bookings taken on this website.
        </p>
        <div className="mt-6">
          <SyncAllButton action={syncAllAction} />
        </div>
      </section>

      {conflicts.length > 0 && (
        <section className="border border-red-300 bg-red-50 p-4">
          <h2 className="font-semibold text-red-800">Possible double bookings ({conflicts.length})</h2>
          <ul className="mt-2 space-y-1 text-sm text-red-900">
            {conflicts.map((c) => (
              <li key={`${c.eventId}-${c.reservationReference}`}>
                {c.propertyName}: {c.feedName} has {showDay(c.eventStart)} – {showDay(c.eventEnd)}, which
                overlaps booking {c.reservationReference} ({showDay(c.reservationCheckIn)} –{" "}
                {showDay(c.reservationCheckOut)}).
              </li>
            ))}
          </ul>
        </section>
      )}

      {echoes.length > 0 && (
        <section className="border border-border bg-surface p-4 text-sm">
          <h2 className="font-semibold text-foreground-strong">Probably our own bookings, reflected back ({echoes.length})</h2>
          <p className="mt-1 text-muted-foreground">
            These imported bookings have exactly the same dates as a booking taken here, which is what happens when a
            channel imports our export feed. Worth a glance, but usually nothing to do.
          </p>
          <ul className="mt-2 space-y-1">
            {echoes.map((c) => (
              <li key={`${c.eventId}-${c.reservationReference}`}>
                {c.propertyName}: {c.reservationReference} also appears in {c.feedName} ({showDay(c.eventStart)} – {showDay(c.eventEnd)})
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold text-foreground-strong">Calendars</h2>
        {feeds.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No calendars added yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4 font-medium">Calendar</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">Last successful sync</th>
                  <th className="py-2 pr-4 font-medium">Upcoming</th>
                  <th className="py-2 pr-4 font-medium" />
                </tr>
              </thead>
              <tbody>
                {feeds.map((f) => (
                  <tr key={f.id} className={`border-b border-border align-top ${f.isActive ? "" : "opacity-60"}`}>
                    <td className="py-3 pr-4">
                      <span className="font-medium text-foreground-strong">{f.propertyName}</span> · {f.name}
                      <span className="block text-xs text-muted-foreground">
                        {f.sourceLabel} · {f.urlHost}
                        {!f.applyTurnover && " · no turnover nights"}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      {!f.isActive ? (
                        "Disabled — not blocking dates"
                      ) : f.lastStatus === "ERROR" ? (
                        <span className="text-red-700">
                          Failing{f.consecutiveFailures > 1 && ` (${f.consecutiveFailures} times)`}
                          <span className="block text-xs">{f.lastError}</span>
                        </span>
                      ) : f.lastStatus === "OK" ? (
                        <span className="text-green-800">OK</span>
                      ) : (
                        "Not synced yet"
                      )}
                      <span className="block text-xs text-muted-foreground">Last tried {showWhen(f.lastAttemptedAt)}</span>
                    </td>
                    <td className="py-3 pr-4">{showWhen(f.lastSuccessAt)}</td>
                    <td className="py-3 pr-4">{f.upcomingEvents}</td>
                    <td className="space-y-1 py-3 pr-4 text-right">
                      {f.isActive && (
                        <HiddenForm action={syncFeedAction} fields={{ feedId: f.id }} label="Sync" />
                      )}
                      <HiddenForm
                        action={toggleFeedAction}
                        fields={{ feedId: f.id, isActive: String(!f.isActive) }}
                        label={f.isActive ? "Disable" : "Enable"}
                      />
                      {!f.isActive && (
                        <HiddenForm action={deleteFeedAction} fields={{ feedId: f.id }} label="Delete" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="max-w-3xl">
        <h2 className="text-lg font-semibold text-foreground-strong">Export links for other channels</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Give one of these to Lodgify, Airbnb or Booking.com (as an imported calendar) so they block dates booked
          here. They contain only booked and blocked dates, never guest details. Like any iCal link, channels only
          check it every so often, so there is always some delay.
        </p>
        {exportLinks.length > 0 && (
          <ul className="mt-4 divide-y divide-border border-y border-border text-sm">
            {exportLinks.map((x) => (
              <li key={x.id} className={`flex flex-wrap items-center justify-between gap-2 py-3 ${x.isActive ? "" : "opacity-50"}`}>
                <span>
                  <span className="font-medium text-foreground-strong">{x.propertyName}</span> · {x.label}
                  <span className="block text-xs text-muted-foreground">
                    {x.isActive ? `Last fetched ${showWhen(x.lastAccessedAt)}` : "Revoked"}
                  </span>
                </span>
                {x.isActive && <HiddenForm action={revokeExportAction} fields={{ exportId: x.id }} label="Revoke" />}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-6">
          <ExportLinkForm action={createExportAction} properties={properties.map((p) => ({ id: p.id, name: p.name }))} />
        </div>
      </section>

      <section className="max-w-3xl">
        <h2 className="text-lg font-semibold text-foreground-strong">Add a calendar</h2>
        <div className="mt-4">
          <AddFeedForm action={addFeedAction} properties={properties.map((p) => ({ id: p.id, name: p.name }))} />
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-foreground-strong">Upcoming imported bookings</h2>
        {events.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">None.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4 font-medium">Property</th>
                  <th className="py-2 pr-4 font-medium">Arrive</th>
                  <th className="py-2 pr-4 font-medium">Depart</th>
                  <th className="py-2 pr-4 font-medium">From</th>
                  <th className="py-2 pr-4 font-medium">Details</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id} className={`border-b border-border ${e.feedActive ? "" : "opacity-50"}`}>
                    <td className="py-2 pr-4">{e.propertyName}</td>
                    <td className="py-2 pr-4">{showDay(e.startDate)}</td>
                    <td className="py-2 pr-4">{showDay(e.endDate)}</td>
                    <td className="py-2 pr-4">{e.feedName}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{e.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-foreground-strong">Sync history</h2>
        {runs.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No syncs yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4 font-medium">When</th>
                  <th className="py-2 pr-4 font-medium">Calendar</th>
                  <th className="py-2 pr-4 font-medium">By</th>
                  <th className="py-2 pr-4 font-medium">Result</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-b border-border align-top">
                    <td className="py-2 pr-4 whitespace-nowrap">{showWhen(r.startedAt)}</td>
                    <td className="py-2 pr-4">
                      {r.propertyName} · {r.feedName}
                    </td>
                    <td className="py-2 pr-4">{r.trigger === "SCHEDULED" ? "Schedule" : r.triggeredBy}</td>
                    <td className="py-2 pr-4">
                      {r.status === "OK" ? (
                        <>
                          {r.eventsSeen} in feed · {r.eventsAdded} new · {r.eventsUpdated} changed ·{" "}
                          {r.eventsRemoved} removed
                        </>
                      ) : r.status === "RUNNING" ? (
                        "Running…"
                      ) : (
                        <span className="text-red-700">Failed</span>
                      )}
                      {r.error && (
                        <span className="block whitespace-pre-line text-xs text-muted-foreground">{r.error}</span>
                      )}
                    </td>
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

function HiddenForm({
  action,
  fields,
  label,
}: {
  action: (formData: FormData) => Promise<void>;
  fields: Record<string, string>;
  label: string;
}) {
  return (
    <form action={action}>
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <button type="submit" className="text-sm underline">
        {label}
      </button>
    </form>
  );
}
