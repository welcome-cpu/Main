import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { runSignInDiagnostics, type Check } from "@/lib/admin/diagnostics";
import { missingAdminSettings, signIn } from "@/lib/auth";

const ERRORS: Record<string, string> = {
  AccessDenied: "That Microsoft account doesn't have admin access.",
  Configuration: "Sign-in isn't configured correctly. Check the Azure and Vercel settings.",
};

export default async function AdminLoginPage({ searchParams }: PageProps<"/admin/login">) {
  await connection();
  const missing = missingAdminSettings();
  if (missing.length > 0) {
    if (process.env.VERCEL_ENV === "production") notFound();
    return <NotConfigured missing={missing} />;
  }

  const { error } = await searchParams;
  const message =
    typeof error === "string" ? (ERRORS[error] ?? "Sign-in failed. Please try again.") : null;

  // Outside production, a configuration error runs a self-test to show which
  // part of sign-in is broken.
  let checks: Check[] | null = null;
  if (error === "Configuration" && process.env.VERCEL_ENV !== "production") {
    const h = await headers();
    const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
    checks = await runSignInDiagnostics(origin);
  }

  async function signInWithMicrosoft() {
    "use server";
    await signIn("microsoft-entra-id", { redirectTo: "/admin" });
  }

  return (
    <div className="mx-auto max-w-md px-4 py-24">
      <h1 className="text-2xl font-semibold text-foreground-strong">Gamrie Chalets admin</h1>
      <p className="mt-2 text-muted-foreground">Sign in with your Microsoft 365 account.</p>
      {message && (
        <p role="alert" className="mt-6 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {message}
        </p>
      )}
      {checks && (
        <ul className="mt-4 space-y-2 text-sm">
          {checks.map((c) => (
            <li key={c.name}>
              <span className={c.ok ? "text-green-800" : "font-semibold text-red-700"}>
                {c.ok ? "✓" : "✗"} {c.name}
              </span>
              <span className="block break-words text-muted-foreground">{c.detail}</span>
            </li>
          ))}
        </ul>
      )}
      <form action={signInWithMicrosoft} className="mt-8">
        <button
          type="submit"
          className="w-full bg-primary px-4 py-3 font-medium text-primary-foreground hover:opacity-90"
        >
          Sign in with Microsoft
        </button>
      </form>
    </div>
  );
}

function NotConfigured({ missing }: { missing: string[] }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-24">
      <h1 className="text-2xl font-semibold text-foreground-strong">Admin isn&apos;t set up on this deployment</h1>
      <p className="mt-2 text-muted-foreground">
        These environment variables are missing for this deployment. Add them in Vercel, then
        redeploy:
      </p>
      <ul className="mt-4 list-disc space-y-1 pl-6 font-mono text-sm">
        {missing.map((name) => (
          <li key={name}>{name}</li>
        ))}
      </ul>
    </div>
  );
}
