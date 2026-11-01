import type { Metadata } from "next";
import Link from "next/link";
import { pageOpenGraph, pageTwitter } from "@/lib/metadata";

const title = "Privacy Policy";
const description = "How Gamrie Chalets collects, uses and looks after your personal information when you book, enquire or sign up to our newsletter.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/privacy" },
  openGraph: pageOpenGraph({ title, description, path: "/privacy" }),
  twitter: pageTwitter({ title, description }),
};

const EMAIL = "welcome@gamriechalets.co.uk";

const services = [
  ["Stripe", "Takes card payments. We never see or store your full card details."],
  ["Lodgify", "Our booking management system. It holds your booking and contact details and sends booking emails, such as your confirmation and arrival information."],
  ["Microsoft 365", "Our email, used to send booking emails and answer your messages."],
  ["EmailOctopus", "Sends our newsletter, if you've signed up."],
  ["Gift Up!", "Sells and redeems our gift vouchers."],
  ["Vercel and Neon", "Host this website and its booking database."],
  ["Cloudflare Turnstile", "Checks that booking and contact forms are filled in by a person, not a bot."],
  ["Google Analytics", "Tells us how many people visit the site and which pages they look at."],
];

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-24">
      <p className="text-xs font-semibold tracking-[0.3em] text-accent uppercase">Privacy</p>
      <h1 className="mt-4 text-4xl font-semibold text-foreground sm:text-5xl">Privacy Policy</h1>
      <p className="mt-4 text-sm text-muted-foreground">Last updated November 2026</p>

      <div className="mt-10 space-y-10 text-foreground [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:text-foreground-strong [&_li]:mt-2 [&_p]:mt-4 [&_ul]:mt-4 [&_ul]:list-disc [&_ul]:pl-6">
        <section>
          <h2>Who we are</h2>
          <p>
            Gamrie Chalets is a small, family-run business letting holiday chalets in Gardenstown, Aberdeenshire. We
            decide how your personal information is used, which makes us its &ldquo;controller&rdquo; under UK data
            protection law. If you have any questions about this policy or your information, email us at{" "}
            <a href={`mailto:${EMAIL}`} className="underline">
              {EMAIL}
            </a>
            .
          </p>
        </section>

        <section>
          <h2>What we collect and why</h2>
          <p>
            <strong>When you book.</strong> Your name, email address, phone number, home address and country, who&apos;s
            coming (adults, children, infants and pets), your dates, any message you send us, and a record of your
            payments. We need these to take and manage your booking, take payment, and contact you about your stay. The
            legal basis is the contract between us. We keep booking and payment records because the law requires us to
            keep accounting records.
          </p>
          <p>
            <strong>When you contact us.</strong> Your name, email address and your message, so we can reply. The legal
            basis is our legitimate interest in answering enquiries.
          </p>
          <p>
            <strong>Our newsletter.</strong> If you sign up, either on the site or by ticking the box when you book, your
            email address and name, so we can send you news and occasional discounts. The legal basis is your consent.
            You can unsubscribe at any time using the link in every email.
          </p>
          <p>
            <strong>Our prize draw.</strong> If you enter our annual free-night draw, the name on your Google review
            and your email address, so we can check your review and contact you if you win. The legal basis is our
            legitimate interest in running the draw. We delete entries after the draw for that year.
          </p>
          <p>
            <strong>Using this website.</strong> Information about how the site is used, such as pages visited and the
            type of device, through Google Analytics, and technical information like your IP address, which we use to
            keep the booking and contact forms secure and to stop abuse.
          </p>
        </section>

        <section>
          <h2>Who we share it with</h2>
          <p>
            We don&apos;t sell your information or share it for anyone else&apos;s marketing. We use these trusted
            services to run our business, and they only use your information to provide their service to us:
          </p>
          <ul>
            {services.map(([name, what]) => (
              <li key={name}>
                <strong>{name}</strong>: {what}
              </li>
            ))}
          </ul>
          <p>
            Some of these services store information outside the UK. Where they do, they protect it with safeguards
            approved under UK law, such as the UK&apos;s adequacy regulations or standard data protection contracts.
          </p>
          <p>We may also share information where the law requires it, for example with HMRC.</p>
        </section>

        <section>
          <h2>How long we keep it</h2>
          <ul>
            <li>Booking and payment records: six years after your stay, as required for tax and accounting.</li>
            <li>Messages you send us: as long as we need to deal with them, and no more than two years.</li>
            <li>Newsletter: until you unsubscribe.</li>
            <li>Prize draw entries: until that year&apos;s draw has been made and the winner contacted.</li>
          </ul>
        </section>

        <section>
          <h2>Cookies</h2>
          <p>
            Google Analytics uses cookies to count visits and see how the site is used. Our booking pages also keep a
            small note in your browser while you pay, so you can return to your booking. Our gift voucher shop, provided
            by Gift Up!, and the form checks by Cloudflare may set their own cookies needed for them to work.
          </p>
        </section>

        <section>
          <h2>Your rights</h2>
          <p>You have the right to:</p>
          <ul>
            <li>ask for a copy of the information we hold about you</li>
            <li>ask us to correct it, or to delete it where we don&apos;t need to keep it</li>
            <li>object to, or ask us to limit, how we use it</li>
            <li>ask for it in a format you can take elsewhere</li>
            <li>withdraw your consent, for example to the newsletter, at any time</li>
          </ul>
          <p>
            To use any of these rights, email{" "}
            <a href={`mailto:${EMAIL}`} className="underline">
              {EMAIL}
            </a>
            . We&apos;ll reply within one month. If you&apos;re unhappy with how we&apos;ve handled your information, you
            can complain to the Information Commissioner&apos;s Office at{" "}
            <a href="https://ico.org.uk/make-a-complaint/" className="underline" target="_blank" rel="noopener noreferrer">
              ico.org.uk
            </a>
            , though we&apos;d appreciate the chance to put things right first.
          </p>
        </section>

        <section>
          <h2>Changes</h2>
          <p>
            If we change this policy, we&apos;ll update it here. See also our{" "}
            <Link href="/faqs" className="underline">
              FAQs
            </Link>{" "}
            or{" "}
            <Link href="/contact" className="underline">
              get in touch
            </Link>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
