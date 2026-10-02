import Link from "next/link";
import { notFound } from "next/navigation";
import {
  createExtraAction,
  createRateRuleAction,
  toggleExtraAction,
  toggleRateRuleAction,
  updatePropertyAction,
} from "@/app/admin/(console)/actions";
import { ExtraForm, PropertySettingsForm, RateRuleForm } from "@/components/admin/PropertyForms";
import { requireAdmin } from "@/lib/admin/dal";
import { getProperty, listExtras, listRateRules } from "@/lib/admin/properties";
import { formatPence } from "@/lib/money";

const PRICING_LABELS = {
  PER_STAY: "per stay",
  PER_NIGHT: "per night",
  PER_GUEST: "per guest",
  PER_GUEST_PER_NIGHT: "per guest per night",
} as const;

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const showDate = (isoDate: string) => dateFormat.format(new Date(`${isoDate}T00:00:00Z`));

export default async function AdminPropertyPage({ params }: PageProps<"/admin/properties/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const property = await getProperty(id);
  if (!property) notFound();

  const [extras, rateRules] = await Promise.all([listExtras(id), listRateRules(id)]);

  return (
    <div className="space-y-14">
      <div>
        <Link href="/admin" className="text-sm text-muted-foreground underline">
          ← All properties
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-foreground-strong">{property.name}</h1>
        <p className="text-sm text-muted-foreground">/{property.slug}</p>
      </div>

      <section className="max-w-3xl">
        <PropertySettingsForm property={property} action={updatePropertyAction.bind(null, id)} />
      </section>

      <section className="max-w-3xl">
        <h2 className="text-lg font-semibold text-foreground-strong">Rate rules</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Seasonal prices and stay-length rules. These override both Lodgify prices and the base rate.
        </p>
        {rateRules.length > 0 && (
          <ul className="mt-4 divide-y divide-border border-y border-border text-sm">
            {rateRules.map((r) => (
              <li key={r.id} className={`flex flex-wrap items-center justify-between gap-2 py-3 ${r.isActive ? "" : "opacity-50"}`}>
                <span>
                  <span className="font-medium text-foreground-strong">{r.name}</span>{" "}
                  {showDate(r.firstNight)} – {showDate(r.lastNight)}
                  {r.pricePence !== null && ` · ${formatPence(r.pricePence)}/night`}
                  {r.minNights !== null && ` · min ${r.minNights} nights`}
                  {r.maxNights !== null && ` · max ${r.maxNights} nights`}
                  {r.priority !== 0 && ` · priority ${r.priority}`}
                </span>
                <ToggleForm
                  action={toggleRateRuleAction}
                  fields={{ propertyId: id, ruleId: r.id, isActive: String(!r.isActive) }}
                  label={r.isActive ? "Disable" : "Enable"}
                />
              </li>
            ))}
          </ul>
        )}
        <div className="mt-6">
          <RateRuleForm action={createRateRuleAction.bind(null, id)} />
        </div>
      </section>

      <section className="max-w-3xl">
        <h2 className="text-lg font-semibold text-foreground-strong">Extras</h2>
        <p className="mt-1 text-sm text-muted-foreground">Optional add-ons guests can choose when booking.</p>
        {extras.length > 0 && (
          <ul className="mt-4 divide-y divide-border border-y border-border text-sm">
            {extras.map((x) => (
              <li key={x.id} className={`flex flex-wrap items-center justify-between gap-2 py-3 ${x.isActive ? "" : "opacity-50"}`}>
                <span>
                  <span className="font-medium text-foreground-strong">{x.name}</span> ·{" "}
                  {formatPence(x.pricePence)} {PRICING_LABELS[x.pricingType]}
                  {x.maxQuantity > 1 && ` · up to ${x.maxQuantity}`}
                  {x.propertyId === null && " · all properties"}
                </span>
                {x.propertyId !== null && (
                  <ToggleForm
                    action={toggleExtraAction}
                    fields={{ propertyId: id, extraId: x.id, isActive: String(!x.isActive) }}
                    label={x.isActive ? "Disable" : "Enable"}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-6">
          <ExtraForm action={createExtraAction.bind(null, id)} />
        </div>
      </section>
    </div>
  );
}

function ToggleForm({
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
