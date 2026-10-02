import "server-only";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { auth, isAdminConfigured } from "@/lib/auth";
import { getActiveAdminByObjectId, type AdminUser } from "@/lib/admin/users";

/**
 * The secure admin check. Every admin page and every admin server action
 * must call this: it verifies the session AND re-checks the database, so
 * deactivating an admin takes effect on their very next request.
 */
export const requireAdmin = cache(async (): Promise<AdminUser> => {
  // Never prerender admin pages: always decide per request.
  await connection();
  if (!isAdminConfigured()) {
    // Production hides the admin area entirely; other deployments explain
    // what is missing on the login page.
    if (process.env.VERCEL_ENV === "production") notFound();
    redirect("/admin/login");
  }

  const session = await auth();
  if (!session?.objectId) redirect("/admin/login");

  const admin = await getActiveAdminByObjectId(session.objectId);
  if (!admin) redirect("/admin/login?error=AccessDenied");

  return admin;
});
