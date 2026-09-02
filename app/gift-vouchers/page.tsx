import type { Metadata } from "next";
import type { ReactNode } from "react";
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

const steps = [
  {
    number: "01",
    title: "Choose an Amount",
    text: "Pick any amount you like using the voucher form below — there's no fixed denomination.",
  },
  {
    number: "02",
    title: "It's Delivered Instantly",
    text: "Add a personal message and the recipient's details at checkout, and the voucher is emailed straight to them.",
  },
  {
    number: "03",
    title: "They Choose Their Dates",
    text: "They book directly online and enter the voucher code at checkout to redeem it against a stay at Muckle View or Murray Cottage.",
  },
];

type IconProps = { className?: string };

function Icon({ className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

function FlameIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M12 2c1 3-3 4-3 8a3 3 0 0 0 6 0c1 1 2 2.5 2 4.5A5 5 0 0 1 7 14.5C7 9 12 7 12 2z" />
    </Icon>
  );
}

function MoonIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </Icon>
  );
}

function WavesIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M3 16c1.5 1.5 3 1.5 4.5 0s3-1.5 4.5 0 3 1.5 4.5 0 3-1.5 4.5 0" />
      <path d="M3 10c1.5 1.5 3 1.5 4.5 0s3-1.5 4.5 0 3 1.5 4.5 0 3-1.5 4.5 0" />
    </Icon>
  );
}

function PlugIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M9 2v4M15 2v4M7 6h10v4a5 5 0 0 1-5 5 5 5 0 0 1-5-5V6zM12 15v3M9 21h6" />
    </Icon>
  );
}

const stayFeatures = [
  {
    icon: FlameIcon,
    title: "Log Fires",
    text: "Wood burners for slow evenings when the weather turns.",
  },
  {
    icon: MoonIcon,
    title: "Dark Skies",
    text: "Balcony binoculars for watching the Northern Lights over the Firth.",
  },
  {
    icon: WavesIcon,
    title: "Dolphin Watching",
    text: "Bottlenose dolphins roll through the Moray Firth, often visible right from the balcony.",
  },
  {
    icon: PlugIcon,
    title: "Easy Arrival",
    text: "On-site EV charging at Muckle View, so the drive north is easy.",
  },
];

export default function GiftVouchersPage() {
  return (
    <>
      <div className="px-6 py-24">
        <div className="mx-auto max-w-3xl">
          <p className="text-xs font-semibold tracking-[0.3em] text-accent uppercase">
            Gift Vouchers
          </p>
          <h1 className="mt-4 text-4xl font-semibold text-foreground sm:text-5xl">
            Give the Gift of Escape
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
            A Gamrie Chalets gift voucher is an invitation to escape to the
            Aberdeenshire coast — luxury dog-friendly self-catering in
            clifftop chalets above Gardenstown, with panoramic Moray Firth
            views, log-burner evenings, and the sea always in view. Choose
            an amount, and we&apos;ll take care of the rest.
          </p>
          <a
            href="#voucher"
            className="mt-8 inline-block rounded-full bg-primary px-7 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Buy a Voucher
          </a>
        </div>
      </div>

      <section className="bg-muted px-6 py-24">
        <div className="mx-auto max-w-5xl text-center">
          <p className="text-xs font-semibold tracking-[0.3em] text-accent uppercase">
            The Stay
          </p>
          <h2 className="mt-4 text-3xl font-semibold text-foreground sm:text-4xl">
            A Stay Worth Gifting
          </h2>
          <div className="mt-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            {stayFeatures.map((feature) => (
              <div key={feature.title}>
                <feature.icon className="mx-auto h-7 w-7 text-accent" />
                <h3 className="mt-4 text-base font-semibold text-foreground">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {feature.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-24">
        <div className="mx-auto max-w-5xl text-center">
          <p className="text-xs font-semibold tracking-[0.3em] text-accent uppercase">
            How It Works
          </p>
          <h2 className="mt-4 text-3xl font-semibold text-foreground sm:text-4xl">
            Three Steps to a Voucher
          </h2>
          <div className="mt-14 grid gap-10 text-left sm:grid-cols-3">
            {steps.map((step) => (
              <div key={step.number}>
                <p className="text-3xl font-semibold text-border">
                  {step.number}
                </p>
                <h3 className="mt-3 text-lg font-semibold text-foreground">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {step.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="voucher" className="scroll-mt-24 bg-muted px-6 py-24">
        <div className="mx-auto max-w-3xl">
          <p className="text-xs font-semibold tracking-[0.3em] text-accent uppercase">
            Buy a Voucher
          </p>
          <h2 className="mt-4 text-3xl font-semibold text-foreground sm:text-4xl">
            Choose an Amount
          </h2>
          <p className="mt-4 text-muted-foreground">
            Pick a value below to get started — your voucher is delivered by
            email as soon as payment goes through.
          </p>

          <div className="mt-10">
            <div
              className="gift-up-target"
              data-site-id="d4f77063-d502-4034-a385-847b17596001"
              data-platform="Other"
            />
          </div>
        </div>
      </section>

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
    </>
  );
}
