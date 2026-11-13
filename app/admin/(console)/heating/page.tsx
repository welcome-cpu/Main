import { runHeatingAction, saveScheduleAction, toggleHeatingAction } from "@/app/admin/(console)/heating/actions";
import { requireAdmin } from "@/lib/admin/dal";
import { describeHotWaterSchedule, describeSchedule } from "@/lib/heating/hive-schedule";
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
  return t.action === "RESET" ? `Standard schedules on, for the guest arriving ${day}` : `Heating and hot water off, after the guest leaving ${day}`;
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
        <h1 className="text-2xl font-semibold text-foreground-strong">Heating and hot water</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          The website controls the Hive heating and hot water from the bookings. At 6pm the evening before each guest arrives,
          it puts the standard heating and hot water schedules back on, so every guest starts the same whatever the last guest
          changed. Back-to-back guests get them at check-out time on changeover day. When a guest leaves and nobody arrives for
          more than 3 days, it turns both off at check-out time. Shorter gaps keep the schedules running. Bookings, owner blocks and
          other closed dates count as stays; Lodgify&apos;s preparation nights either side of a booking don&apos;t. Changes you make in the Hive app are left alone until the next planned
          change.
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
                    {p.enabled ? "Switch off automatic control" : "Switch on automatic control"}
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
              <dt className="text-muted-foreground">Automatic control</dt>
              <dd className="font-medium">{p.enabled ? "On" : "Off: the website won&apos;t change anything"}</dd>
              <dt className="text-muted-foreground">Heating now</dt>
              <dd>
                {p.live
                  ? `${p.live.heating.name ?? "Heating"}: ${MODE[p.live.heating.mode ?? ""] ?? p.live.heating.mode ?? "unknown"}, ${p.live.heating.temperature ?? "?"}° in the cottage, set to ${p.live.heating.target ?? "?"}°`
                  : p.liveError
                    ? <span className="text-red-700">Couldn&apos;t reach Hive: {p.liveError}</span>
                    : "—"}
              </dd>
              <dt className="text-muted-foreground">Hot water now</dt>
              <dd>
                {p.live?.hotWater
                  ? `${p.live.hotWater.name ?? "Hot water"}: ${MODE[p.live.hotWater.mode ?? ""] ?? p.live.hotWater.mode ?? "unknown"}${p.live.hotWater.on === null ? "" : p.live.hotWater.on ? ", heating water now" : ", not heating water now"}`
                  : p.live?.hotWaterError
                    ? <span className="text-red-700">{p.live.hotWaterError}</span>
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
              <h3 className="font-semibold text-foreground-strong">Standard schedules</h3>
              {p.standardSchedule && p.standardHotWaterSchedule ? (
                <>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Saved {showWhen(p.scheduleSavedAt)} by {p.scheduleSavedBy}. Every guest starts with these.
                  </p>
                  <div className="mt-3 overflow-x-auto">
                    <table className="text-sm">
                      <thead>
                        <tr className="text-left">
                          <th className="pb-1 pr-6 font-medium" />
                          <th className="pb-1 pr-6 font-medium">Heating</th>
                          <th className="pb-1 font-medium">Hot water</th>
                        </tr>
                      </thead>
                      <tbody>
                        {describeSchedule(p.standardSchedule).map((d, i) => (
                          <tr key={d.day}>
                            <td className="py-0.5 pr-6 align-top text-muted-foreground">{d.day}</td>
                            <td className="py-0.5 pr-6 align-top">{d.slots}</td>
                            <td className="py-0.5 align-top">{describeHotWaterSchedule(p.standardHotWaterSchedule!)[i].slots}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">
                  Not saved yet. Set the heating and hot water schedules you want in the Hive app, then save them here.
                </p>
              )}
              <form action={saveScheduleAction} className="mt-3">
                <input type="hidden" name="propertyId" value={p.propertyId} />
                <button type="submit" className={button} disabled={!overview.configured}>
                  Save the current Hive schedules as standard
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
