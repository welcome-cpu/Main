import type { Metadata } from "next";
import { pageOpenGraph, pageTwitter } from "@/lib/metadata";

const GIFT_UP_CHECKOUT_URL =
  "https://giftup.app/place-order/d4f77063-d502-4034-a385-847b17596001?platform=hosted&justshowcheckout=true";

const title = "Gift Vouchers";
const description =
  "Give the gift of a clifftop escape. Buy a Gamrie Chalets gift voucher, redeemable against a stay at Muckle View or Murray Cottage.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/gift-vouchers" },
  openGraph: pageOpenGraph({ title, description, path: "/gift-vouchers" }),
  twitter: pageTwitter({ title, description }),
};

export default function GiftVouchersPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-24">
      <p className="text-xs font-semibold tracking-[0.3em] text-accent uppercase">
        Gift Vouchers
      </p>
      <h1 className="mt-4 text-4xl font-semibold text-foreground sm:text-5xl">
        Give the Gift of a Clifftop Escape
      </h1>
      <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
        Whether it&apos;s a birthday, an anniversary, or just because, a
        Gamrie Chalets gift voucher lets someone choose their own dates and
        settle in above Gardenstown at their own pace. Vouchers can be put
        towards a stay at either Muckle View or Murray Cottage.
      </p>

      <div className="mt-10 overflow-hidden rounded-2xl border border-border">
        <iframe
          src={GIFT_UP_CHECKOUT_URL}
          title="Gamrie Chalets gift voucher checkout"
          allow="payment"
          className="h-[1400px] w-full sm:h-[1100px]"
        />
      </div>
    </div>
  );
}
