import type { Metadata } from "next";
import ContactForm from "@/components/ContactForm";

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with Gamrie Chalets.",
  alternates: { canonical: "/contact" },
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
