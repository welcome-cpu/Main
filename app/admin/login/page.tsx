import { notFound } from "next/navigation";
import { connection } from "next/server";
import { isAdminConfigured, signIn } from "@/lib/auth";

const ERRORS: Record<string, string> = {
  AccessDenied: "That Microsoft account doesn't have admin access.",
  Configuration: "Sign-in isn't configured correctly. Check the Azure and Vercel settings.",
};

export default async function AdminLoginPage({ searchParams }: PageProps<"/admin/login">) {
  await connection();
  if (!isAdminConfigured()) notFound();

  const { error } = await searchParams;
  const message =
    typeof error === "string" ? (ERRORS[error] ?? "Sign-in failed. Please try again.") : null;

  async function signInWithMicrosoft() {
    "use server";
    await signIn("microsoft-entra-id", { redirectTo: "/admin" });
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-24">
      <h1 className="text-2xl font-semibold text-foreground-strong">Gamrie Chalets admin</h1>
      <p className="mt-2 text-muted-foreground">Sign in with your Microsoft 365 account.</p>
      {message && (
        <p role="alert" className="mt-6 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {message}
        </p>
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
