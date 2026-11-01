"use client";

import { useCallback, useState } from "react";
import Turnstile from "@/components/Turnstile";

type Status = "idle" | "sending" | "success" | "error";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

export default function PrizeDrawForm({ propertySlug }: { propertySlug: string }) {
  const [googleName, setGoogleName] = useState("");
  const [email, setEmail] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  const handleVerify = useCallback((token: string) => {
    setTurnstileToken(token);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError("");

    try {
      const res = await fetch("/api/prize-draw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ googleName, email, propertySlug, turnstileToken }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Something went wrong.");
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  if (status === "success") {
    return (
      <p className="mt-4 rounded-lg border border-border bg-background px-4 py-3 text-sm text-foreground">
        Thank you, you&apos;re entered! Once we&apos;ve spotted your review on Google, your entry counts
        towards this year&apos;s draw. We&apos;ll email you if you win.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-5 space-y-4 border-t border-border pt-5">
      <p className="text-sm font-semibold text-foreground">Left a review? Enter the draw</p>
      <div>
        <label htmlFor="prize-google-name" className="block text-sm font-medium text-foreground">
          Your name as it appears on your Google review
        </label>
        <input
          id="prize-google-name"
          type="text"
          required
          maxLength={100}
          value={googleName}
          onChange={(e) => setGoogleName(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-border bg-white px-3.5 py-2.5 text-foreground outline-none focus:border-primary"
        />
      </div>
      <div>
        <label htmlFor="prize-email" className="block text-sm font-medium text-foreground">
          Email address
        </label>
        <input
          id="prize-email"
          type="email"
          required
          maxLength={254}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-border bg-white px-3.5 py-2.5 text-foreground outline-none focus:border-primary"
        />
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        We use these only to check your review and to contact the winner. See our{" "}
        <a href="/privacy" target="_blank" className="underline">
          privacy policy
        </a>
        .
      </p>
      {TURNSTILE_SITE_KEY && <Turnstile siteKey={TURNSTILE_SITE_KEY} onVerify={handleVerify} />}
      {status === "error" && <p className="text-sm text-red-700">{error}</p>}
      <button
        type="submit"
        disabled={status === "sending" || (Boolean(TURNSTILE_SITE_KEY) && !turnstileToken)}
        className="rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
      >
        {status === "sending" ? "Entering…" : "Enter the draw"}
      </button>
    </form>
  );
}
