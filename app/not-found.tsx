import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page Not Found",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-6 py-32 text-center">
      <p className="text-xs font-semibold tracking-[0.3em] text-accent uppercase">
        404
      </p>
      <h1 className="mt-4 text-4xl font-semibold text-foreground sm:text-5xl">
        Page Not Found
      </h1>
      <p className="mt-4 text-muted-foreground">
        The page you&apos;re looking for doesn&apos;t exist or has moved.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-4">
        <Link
          href="/"
          className="rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Back to Home
        </Link>
        <Link
          href="/properties"
          className="rounded-full border border-border px-6 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
        >
          View Properties
        </Link>
      </div>
    </div>
  );
}
