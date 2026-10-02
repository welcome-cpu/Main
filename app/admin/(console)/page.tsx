import Link from "next/link";
import { createPropertyAction } from "@/app/admin/(console)/actions";
import { NewPropertyForm } from "@/components/admin/PropertyForms";
import { requireAdmin } from "@/lib/admin/dal";
import { listProperties } from "@/lib/admin/properties";
import { formatPence } from "@/lib/money";

export default async function AdminPropertiesPage() {
  await requireAdmin();
  const properties = await listProperties();

  return (
    <div className="space-y-12">
      <section>
        <h1 className="text-2xl font-semibold text-foreground-strong">Properties</h1>
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                <th className="py-2 pr-4 font-medium">Property</th>
                <th className="py-2 pr-4 font-medium">Direct booking</th>
                <th className="py-2 pr-4 font-medium">Guests</th>
                <th className="py-2 pr-4 font-medium">Min stay</th>
                <th className="py-2 pr-4 font-medium">Base rate</th>
                <th className="py-2 pr-4 font-medium">Prices from</th>
              </tr>
            </thead>
            <tbody>
              {properties.map((p) => (
                <tr key={p.id} className="border-b border-border">
                  <td className="py-3 pr-4">
                    <Link href={`/admin/properties/${p.id}`} className="font-medium text-foreground-strong underline">
                      {p.name}
                    </Link>
                  </td>
                  <td className="py-3 pr-4">{p.isActive ? "On" : "Off"}</td>
                  <td className="py-3 pr-4">{p.maxGuests}</td>
                  <td className="py-3 pr-4">{p.defaultMinNights} nights</td>
                  <td className="py-3 pr-4">{formatPence(p.basePence, p.currency)}</td>
                  <td className="py-3 pr-4">{p.rateSource === "LODGIFY" ? "Lodgify" : "Admin"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="max-w-2xl">
        <h2 className="text-lg font-semibold text-foreground-strong">Add a property</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          New properties start switched off. Set them up fully before enabling direct booking.
        </p>
        <div className="mt-4">
          <NewPropertyForm action={createPropertyAction} />
        </div>
      </section>
    </div>
  );
}
