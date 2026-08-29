import type { Metadata } from "next";
import ContactForm from "@/components/ContactForm";
import { pageOpenGraph, pageTwitter } from "@/lib/metadata";

const title = "Contact";
const description =
  "Questions about your stay at Gamrie Chalets? Email us or send a message and we'll get back to you.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/contact" },
  openGraph: pageOpenGraph({ title, description, path: "/contact" }),
  twitter: pageTwitter({ title, description }),
};

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-24">
      <p className="text-xs font-semibold tracking-[0.3em] text-accent uppercase">
        Contact
      </p>
      <h1 className="mt-4 text-4xl font-semibold text-foreground sm:text-5xl">
        Get in touch
      </h1>
      <p className="mt-4 text-muted-foreground">
        Have a question about your stay or our chalets? Send us a message
        and we&apos;ll be happy to help.
      </p>

      <div className="mt-6 rounded-xl border border-border bg-muted px-5 py-4 text-sm text-muted-foreground">
        Prefer email?{" "}
        <a
          href="mailto:welcome@gamriechalets.co.uk"
          className="font-semibold text-primary hover:underline"
        >
          welcome@gamriechalets.co.uk
        </a>
      </div>

      <div className="mt-10">
        <ContactForm />
      </div>
    </div>
  );
}
