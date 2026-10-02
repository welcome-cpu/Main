import { formatPence } from "@/lib/money";
import { groupNights, type Quote } from "@/lib/pricing/quote";

const shortDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const show = (iso: string) => shortDate.format(new Date(`${iso}T00:00:00Z`));

/** Itemised price for a stay, as calculated by the server. */
export default function PriceBreakdown({ quote }: { quote: Quote }) {
  const money = (pence: number) => formatPence(pence, quote.currency);
  const groups = groupNights(quote.nights);

  return (
    <dl className="space-y-2 text-sm">
      {groups.map((g) => (
        <Row
          key={g.from}
          label={`${g.nights} ${g.nights === 1 ? "night" : "nights"} × ${money(g.pricePence)}`}
          value={money(g.nights * g.pricePence)}
        />
      ))}
      {quote.cleaningFeePence > 0 && <Row label="Cleaning fee" value={money(quote.cleaningFeePence)} />}
      {quote.petFeePence > 0 && <Row label="Pet fee (per stay)" value={money(quote.petFeePence)} />}
      {quote.extras.map((x) => (
        <Row key={x.extraId} label={x.quantity > 1 ? `${x.name} × ${x.quantity}` : x.name} value={money(x.totalPence)} />
      ))}
      {quote.discount && (
        <Row label={`Discount (${quote.discount.code})`} value={`−${money(quote.discount.pence)}`} />
      )}
      <div className="border-t border-border pt-2">
        <Row label="Total" value={money(quote.totalPence)} strong />
      </div>
      {quote.balanceDueDate ? (
        <>
          <Row label="Pay now (deposit)" value={money(quote.dueNowPence)} strong />
          <Row label={`Balance, due ${show(quote.balanceDueDate)}`} value={money(quote.balancePence)} />
        </>
      ) : (
        <Row label="Pay now (in full)" value={money(quote.dueNowPence)} strong />
      )}
    </dl>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${strong ? "font-semibold text-foreground-strong" : ""}`}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
