import type { Metadata } from "next";
import Script from "next/script";
import { pageOpenGraph, pageTwitter } from "@/lib/metadata";

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

      <div className="mt-10">
        <div
          className="gift-up-target"
          data-site-id="d4f77063-d502-4034-a385-847b17596001"
          data-platform="Other"
        />
      </div>

      <Script
        id="gift-up"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            (function (g, i, f, t, u, p, s) {
                g[u] = g[u] || function() { (g[u].q = g[u].q || []).push(arguments) };
                p = i.createElement(f);
                p.async = 1;
                p.src = t;
                s = i.getElementsByTagName(f)[0];
                s.parentNode.insertBefore(p, s);
            })(window, document, "script", "https://cdn.giftup.app/dist/gift-up.js", "giftup");
          `,
        }}
      />
    </div>
  );
}
