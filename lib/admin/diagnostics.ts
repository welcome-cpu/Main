import "server-only";
import { db } from "@/lib/db/client";

export type Check = { name: string; ok: boolean; detail: string };

/**
 * Sign-in self-test for non-production deployments, shown on the login page
 * after a configuration error. Reports pass/fail and error codes only —
 * never secret values.
 */
export async function runSignInDiagnostics(origin: string): Promise<Check[]> {
  const issuer = process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER?.trim().replace(/\/$/, "") ?? "";
  const checks: Check[] = [];

  try {
    const [row] = await db()<{ admins: number }[]>`
      SELECT count(*)::int AS admins FROM admin_users WHERE is_active
    `;
    checks.push({
      name: "Database",
      ok: row.admins > 0,
      detail: row.admins > 0 ? `Connected; ${row.admins} active admin(s).` : "Connected, but no active admins.",
    });
  } catch (error) {
    checks.push({ name: "Database", ok: false, detail: describeError(error) });
  }

  let tokenEndpoint: string | null = null;
  try {
    const res = await fetch(`${issuer}/.well-known/openid-configuration`, { cache: "no-store" });
    const config = res.ok ? ((await res.json()) as { token_endpoint?: string }) : null;
    tokenEndpoint = config?.token_endpoint ?? null;
    checks.push({
      name: "Microsoft tenant",
      ok: Boolean(tokenEndpoint),
      detail: tokenEndpoint ? "Tenant found." : `Issuer lookup failed (HTTP ${res.status}). Check the tenant id.`,
    });
  } catch (error) {
    checks.push({ name: "Microsoft tenant", ok: false, detail: describeError(error) });
  }

  if (tokenEndpoint) {
    try {
      // A client-credentials request proves the client id and secret are
      // valid without signing anyone in.
      const res = await fetch(tokenEndpoint, {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: process.env.AUTH_MICROSOFT_ENTRA_ID_ID ?? "",
          client_secret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET ?? "",
          scope: "https://graph.microsoft.com/.default",
          grant_type: "client_credentials",
        }),
      });
      if (res.ok) {
        checks.push({ name: "Client ID and secret", ok: true, detail: "Accepted by Microsoft." });
      } else {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          error_description?: string;
        };
        const code = body.error_description?.match(/AADSTS\d+[^.]*\./)?.[0] ?? body.error ?? `HTTP ${res.status}`;
        checks.push({ name: "Client ID and secret", ok: false, detail: code });
      }
    } catch (error) {
      checks.push({ name: "Client ID and secret", ok: false, detail: describeError(error) });
    }
  }

  checks.push({
    name: "Redirect URI",
    ok: true,
    detail: `${origin}/api/auth/callback/microsoft-entra-id — must be listed exactly in Azure.`,
  });

  return checks;
}

function describeError(error: unknown) {
  if (error && typeof error === "object") {
    const e = error as { code?: string; message?: string };
    return [e.code, e.message].filter(Boolean).join(": ").slice(0, 300);
  }
  return "Unknown error";
}
