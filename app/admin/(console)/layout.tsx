import Link from "next/link";
import { requireAdmin } from "@/lib/admin/dal";
import { signOut } from "@/lib/auth";

export default async function AdminConsoleLayout({ children }: LayoutProps<"/admin">) {
  // Pages and actions each call requireAdmin() too: a layout alone isn't a
  // reliable guard because it doesn't re-run on every navigation.
  const admin = await requireAdmin();

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/admin/login" });
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <nav className="flex gap-6 text-sm font-medium">
          <Link href="/admin" className="text-foreground-strong hover:underline">
            Properties
          </Link>
          <Link href="/admin/calendars" className="text-foreground-strong hover:underline">
            Calendars
          </Link>
          <Link href="/admin/discounts" className="text-foreground-strong hover:underline">
            Discounts
          </Link>
        </nav>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>{admin.email}</span>
          <form action={signOutAction}>
            <button type="submit" className="underline hover:text-foreground-strong">
              Sign out
            </button>
          </form>
        </div>
      </div>
      <div className="pt-8">{children}</div>
    </div>
  );
}
