/**
 * Logs an error without its attached data. Database and Stripe errors can
 * carry query parameters or request bodies (guest names, emails), which
 * must not end up in server logs.
 */
export function logError(context: string, error: unknown) {
  const e = error as { name?: string; code?: string; type?: string; message?: string };
  const summary = [e?.name, e?.type, e?.code].filter(Boolean).join("/");
  console.error(`${context}: ${summary ? `[${summary}] ` : ""}${String(e?.message ?? error).slice(0, 300)}`);
}
