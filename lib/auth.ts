import "server-only";
import NextAuth from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { authorizeAdminSignIn } from "@/lib/admin/users";
import { isDatabaseConfigured } from "@/lib/db/client";

declare module "next-auth" {
  interface Session {
    /** Microsoft Entra object id of the signed-in admin. */
    objectId?: string;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    objectId?: string;
  }
}

// Only accounts from our own Microsoft 365 tenant can sign in.
const TENANT_ID = process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER?.trim()
  .match(/microsoftonline\.com\/([0-9a-f-]{36})\/v2\.0\/?$/i)?.[1]
  ?.toLowerCase();

/** Names (never values) of settings the admin area needs but doesn't have. */
export function missingAdminSettings(): string[] {
  const missing: string[] = [];
  if (!isDatabaseConfigured()) missing.push("DATABASE_URL");
  if (!process.env.AUTH_SECRET) missing.push("AUTH_SECRET");
  if (!process.env.AUTH_MICROSOFT_ENTRA_ID_ID) missing.push("AUTH_MICROSOFT_ENTRA_ID_ID");
  if (!process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET) missing.push("AUTH_MICROSOFT_ENTRA_ID_SECRET");
  if (!process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER) {
    missing.push("AUTH_MICROSOFT_ENTRA_ID_ISSUER");
  } else if (!TENANT_ID) {
    missing.push(
      "AUTH_MICROSOFT_ENTRA_ID_ISSUER (set, but not in the form https://login.microsoftonline.com/<tenant id>/v2.0)"
    );
  }
  return missing;
}

/** True when every setting the admin area needs is present. */
export function isAdminConfigured() {
  return missingAdminSettings().length === 0;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    MicrosoftEntraID({
      // Skip the default Graph profile-photo fetch: it isn't needed and
      // would bloat the session cookie with a base64 image.
      profile: (profile) => ({
        id: profile.sub,
        name: profile.name,
        email: profile.email ?? profile.preferred_username,
        image: null,
      }),
    }),
  ],
  // Short-lived sessions; access is re-checked against the database on
  // every admin request regardless.
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  pages: { signIn: "/admin/login", error: "/admin/login" },
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== "microsoft-entra-id" || !profile) return false;
      if (!TENANT_ID || profile.tid !== TENANT_ID) return false;
      if (typeof profile.oid !== "string") return false;

      const emails = [profile.email, profile.preferred_username].filter(
        (e): e is string => typeof e === "string" && e.includes("@")
      );
      const admin = await authorizeAdminSignIn({
        objectId: profile.oid,
        emails,
        displayName: typeof profile.name === "string" ? profile.name : null,
      });
      return admin !== null;
    },
    async jwt({ token, profile }) {
      if (profile && typeof profile.oid === "string") {
        token.objectId = profile.oid;
      }
      return token;
    },
    async session({ session, token }) {
      session.objectId = token.objectId;
      return session;
    },
  },
});
