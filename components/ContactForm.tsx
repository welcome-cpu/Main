"use client";

import { useCallback, useState } from "react";
import Turnstile from "@/components/Turnstile";

type Status = "idle" | "sending" | "success" | "error";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

export default function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
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
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message, turnstileToken }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || "Something went wrong.");
      }

      setStatus("success");
      setName("");
      setEmail("");
      setMessage("");
      setTurnstileToken("");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  if (status === "success") {
    return (
      <p className="rounded-xl border border-border bg-muted px-5 py-4 text-sm text-foreground">
        Thanks for reaching out — we&apos;ll get back to you soon.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-foreground">
          Name
        </label>
        <input
          id="name"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-foreground outline-none focus:border-primary"
        />
      </div>
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-foreground">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-foreground outline-none focus:border-primary"
        />
      </div>
      <div>
        <label htmlFor="message" className="block text-sm font-medium text-foreground">
          Message
        </label>
        <textarea
          id="message"
          required
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-foreground outline-none focus:border-primary"
        />
      </div>
      {TURNSTILE_SITE_KEY && (
        <Turnstile siteKey={TURNSTILE_SITE_KEY} onVerify={handleVerify} />
      )}
      {status === "error" && (
        <p className="text-sm text-red-700">{error}</p>
      )}
      <button
        type="submit"
        disabled={
          status === "sending" || (Boolean(TURNSTILE_SITE_KEY) && !turnstileToken)
        }
        className="rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
      >
        {status === "sending" ? "Sending…" : "Send Message"}
      </button>
    </form>
  );
}
