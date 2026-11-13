import { runHeatingAction, saveScheduleAction, toggleHeatingAction } from "@/app/admin/(console)/heating/actions";
import { requireAdmin } from "@/lib/admin/dal";
import { describeSchedule } from "@/lib/heating/hive-schedule";
import { getHeatingOverview } from "@/lib/heating/run";
import type { Transition } from "@/lib/heating/plan";

const when = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/London",
});
const showWhen = (d: Date | null) => (d ? when.format(d) : "—");
const describe = (t: Pick<Transition, "action" | "key">) => {
  const date = t.key.split(":")[1];
  const day = date ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`)) : "";
  return t.action === "RESET" ? `Standard schedule on, for the guest arriving ${day}` : `Heating off, after the guest leaving ${day}`;
};
const MODE: Record<string, string> = { SCHEDULE: "Schedule", MANUAL: "Manual", OFF: "Off", BOOST: "Boost" };

const button = "border border-border px-3 py-1.5 text-sm font-medium text-foreground-strong hover:bg-muted";

export default async function AdminHeatingPage({ searchParams }: PageProps<"/admin/heating">) {
  await requireAdmin();
  const sp = await searchParams;
  const ok = typeof sp.ok === "string" ? sp.ok : null;
  const error = typeof sp.error === "string" ? sp.error : null;
  const overview = await getHeatingOverview();

  return (
    <div className="space-y-10">
      <section>
        <h1 className="text-2xl font-semibold text-foreground-strong">Heating</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          The website controls the Hive thermostat from the bookings. At 6pm the evening before each guest arrives, it puts the
          standard schedule back on, so every guest starts the same whatever the last guest changed. Back-to-back guests get
          it at check-out time on changeover day. When a guest leaves and nobody arrives for more than 3 days, it turns the
          heating off at check-out time. Shorter gaps keep the schedule running. Every unavailable date counts as a stay,
          including owner blocks. Changes you make in the Hive app are left alone until the next planned change.
        </p>
      </section>

      {ok && <p className="border border-green-300 bg-green-50 p-3 text-sm text-green-900">{ok}</p>}
      {error && <p className="border border-red-300 bg-red-50 p-3 text-sm text-red-900">{error}</p>}

      {!overview.configured && (
        <p className="border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Hive isn&apos;t connected on this deployment. Run <code>scripts/hive-setup.mjs</code> and add the HIVE_* settings it
          gives you to Vercel.
        </p>
      )}

      {overview.properties.map((p) => {
        const failed = p.actions.find((a) => a.status !== "SKIPPED");
        return (
          <section key={p.propertyId} className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold text-foreground-strong">{p.propertyName}</h2>
              <div className="flex flex-wrap gap-2">
                <form action={toggleHeatingAction}>
                  <input type="hidden" name="propertyId" value={p.propertyId} />
                  <input type="hidden" name="enabled" value={String(!p.enabled)} />
                  <button type="submit" className={button} disabled={!overview.configured}>
                    {p.enabled ? "Switch off automatic heating" : "Switch on automatic heating"}
                  </button>
                </form>
                {p.enabled && (
                  <form action={runHeatingAction}>
                    <input type="hidden" name="propertyId" value={p.propertyId} />
                    <button type="submit" className={button}>
                      Check now
                    </button>
                  </form>
                )}
              </div>
            </div>

            <dl className="grid max-w-3xl grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Automatic heating</dt>
              <dd className="font-medium">{p.enabled ? "On" : "Off: the website won't change the heating"}</dd>
              <dt className="text-muted-foreground">Thermostat now</dt>
              <dd>
                {p.live
                  ? `${p.live.name ?? "Heating"}: ${MODE[p.live.mode ?? ""] ?? p.live.mode ?? "unknown"}, ${p.live.temperature ?? "?"}° in the cottage, set to ${p.live.target ?? "?"}°`
                  : p.liveError
                    ? <span className="text-red-700">Couldn&apos;t reach Hive: {p.liveError}</span>
                    : "—"}
              </dd>
              <dt className="text-muted-foreground">Should be now</dt>
              <dd>{p.current ? describe(p.current) : "No change due yet"}</dd>
              {failed?.status === "FAILED" && (
                <>
                  <dt className="text-red-700">Last attempt failed</dt>
                  <dd className="text-red-700">
                    {showWhen(failed.createdAt)}: {failed.error}
                  </dd>
                </>
              )}
            </dl>

            <div>
              <h3 className="font-semibold text-foreground-strong">Standard schedule</h3>
              {p.standardSchedule ? (
                <>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Saved {showWhen(p.scheduleSavedAt)} by {p.scheduleSavedBy}. Every guest starts with this.
                  </p>
                  <table className="mt-3 text-sm">
                    <tbody>
                      {describeSchedule(p.standardSchedule).map((d) => (
                        <tr key={d.day}>
                          <td className="py-0.5 pr-6 text-muted-foreground">{d.day}</td>
                          <td className="py-0.5">{d.slots}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">
                  None saved yet. Set the schedule you want in the Hive app, then save it here.
                </p>
              )}
              <form action={saveScheduleAction} className="mt-3">
                <input type="hidden" name="propertyId" value={p.propertyId} />
                <button type="submit" className={button} disabled={!overview.configured}>
                  Save the current Hive schedule as standard
                </button>
              </form>
            </div>

            <div>
              <h3 className="font-semibold text-foreground-strong">Coming up</h3>
              {p.next.length ? (
                <ul className="mt-2 space-y-1 text-sm">
                  {p.next.map((t) => (
                    <li key={t.key}>
                      <span className="text-muted-foreground">{showWhen(t.at)}</span> · {describe(t)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">No changes planned in the next four months.</p>
              )}
            </div>

            <div>
              <h3 className="font-semibold text-foreground-strong">Recent changes</h3>
              {p.actions.length ? (
                <ul className="mt-2 space-y-1 text-sm">
                  {p.actions.map((a) => (
                    <li key={a.id} className={a.status === "FAILED" ? "text-red-700" : undefined}>
                      <span className="text-muted-foreground">{showWhen(a.createdAt)}</span> · {describe({ action: a.action, key: a.transitionKey })} ·{" "}
                      {a.status === "DONE" ? "done" : a.status === "SKIPPED" ? "starting point, not changed" : `failed: ${a.error}`}
                      {a.trigger === "MANUAL" && a.actor ? ` (${a.actor})` : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">None yet.</p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
