import { createDiscountAction, toggleDiscountAction } from "@/app/admin/(console)/discounts/actions";
import { DiscountForm } from "@/components/admin/DiscountForm";
import { requireAdmin } from "@/lib/admin/dal";
import { listDiscountCodes } from "@/lib/admin/discounts";
import { listProperties } from "@/lib/admin/properties";
import { formatPence } from "@/lib/money";

const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const show = (iso: string) => day.format(new Date(`${iso}T00:00:00Z`));

export default async function AdminDiscountsPage() {
  await requireAdmin();
  const [codes, properties] = await Promise.all([listDiscountCodes(), listProperties()]);

  return (
    <div className="space-y-12">
      <section>
        <h1 className="text-2xl font-semibold text-foreground-strong">Discount codes</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Discounts apply to the accommodation price only, not fees or extras.
        </p>
        {codes.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No codes yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-border border-y border-border text-sm">
            {codes.map((c) => (
              <li
                key={c.id}
                className={`flex flex-wrap items-center justify-between gap-2 py-3 ${c.isActive ? "" : "opacity-50"}`}
              >
                <span>
                  <span className="font-mono font-medium text-foreground-strong">{c.code}</span> ·{" "}
                  {c.discountType === "PERCENT"
                    ? `${Number(c.percentOff)}% off`
                    : `${formatPence(c.amountOffPence ?? 0)} off`}
                  {" · "}
                  {c.propertyName ?? "all properties"}
                  {c.minNights !== null && ` · min ${c.minNights} nights`}
                  {c.stayFirstNight && c.stayLastNight && ` · stays ${show(c.stayFirstNight)}–${show(c.stayLastNight)}`}
                  {c.bookFrom && c.bookUntil && ` · book ${show(c.bookFrom)}–${show(c.bookUntil)}`}
                  {` · used ${c.redemptions}${c.maxRedemptions !== null ? `/${c.maxRedemptions}` : ""}`}
                </span>
                <form action={toggleDiscountAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="isActive" value={String(!c.isActive)} />
                  <button type="submit" className="text-sm underline">
                    {c.isActive ? "Disable" : "Enable"}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="max-w-3xl">
        <h2 className="text-lg font-semibold text-foreground-strong">Create a code</h2>
        <div className="mt-4">
          <DiscountForm action={createDiscountAction} properties={properties.map((p) => ({ id: p.id, name: p.name }))} />
        </div>
      </section>
    </div>
  );
}
