import Link from "next/link";
import { setPrizeDrawStatusAction } from "@/app/admin/(console)/prize-draw/actions";
import { requireAdmin } from "@/lib/admin/dal";
import { currentDrawYear, listPrizeDrawEntries, prizeDrawYears, type PrizeDrawStatus } from "@/lib/prize-draw";

const when = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });

const LABEL: Record<PrizeDrawStatus, string> = {
  PENDING: "To check",
  VERIFIED: "Review found",
  REJECTED: "No review",
};

function StatusButton({ id, status, label }: { id: string; status: PrizeDrawStatus; label: string }) {
  return (
    <form action={setPrizeDrawStatusAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <button type="submit" className="text-sm underline">
        {label}
      </button>
    </form>
  );
}

export default async function AdminPrizeDrawPage({ searchParams }: PageProps<"/admin/prize-draw">) {
  await requireAdmin();
  const requested = Number((await searchParams).year);
  const year = Number.isInteger(requested) && requested >= 2026 ? requested : currentDrawYear();
  const [entries, years] = await Promise.all([listPrizeDrawEntries(year), prizeDrawYears()]);
  const verified = entries.filter((e) => e.status === "VERIFIED");
  const toCheck = entries.filter((e) => e.status === "PENDING").length;

  return (
    <section>
      <h1 className="text-2xl font-semibold text-foreground-strong">Free-night prize draw {year}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Guests enter from their welcome guide with the name on their Google review. Check each one on Google,
        then mark it. Only entries marked &ldquo;Review found&rdquo; go into the draw.
      </p>
      {years.length > 1 && (
        <p className="mt-2 flex gap-3 text-sm">
          {years.map((y) => (
            <Link key={y} href={`/admin/prize-draw?year=${y}`} className={y === year ? "font-semibold" : "underline"}>
              {y}
            </Link>
          ))}
        </p>
      )}
      <p className="mt-4 text-sm text-foreground-strong">
        {entries.length} {entries.length === 1 ? "entry" : "entries"} · {verified.length} in the draw · {toCheck} to
        check
      </p>

      {entries.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">No entries yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-border border-y border-border text-sm">
          {entries.map((e) => (
            <li
              key={e.id}
              className={`flex flex-wrap items-center justify-between gap-3 py-3 ${e.status === "REJECTED" ? "opacity-50" : ""}`}
            >
              <span>
                <span className="font-medium text-foreground-strong">{e.googleName}</span> ·{" "}
                <a href={`mailto:${e.email}`} className="underline">
                  {e.email}
                </a>
                {e.propertySlug && ` · ${e.propertySlug.replace(/-/g, " ")}`} · entered {when.format(e.createdAt)}
                {" · "}
                <span className={e.status === "VERIFIED" ? "font-semibold text-green-800" : ""}>{LABEL[e.status]}</span>
              </span>
              <span className="flex gap-4">
                {e.status !== "VERIFIED" && <StatusButton id={e.id} status="VERIFIED" label="Review found" />}
                {e.status !== "REJECTED" && <StatusButton id={e.id} status="REJECTED" label="No review" />}
                {e.status !== "PENDING" && <StatusButton id={e.id} status="PENDING" label="Undo" />}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
