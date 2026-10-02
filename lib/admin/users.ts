import "server-only";
import { recordAudit } from "@/lib/audit";
import { db } from "@/lib/db/client";

export type AdminUser = {
  id: string;
  email: string;
  displayName: string | null;
  role: "OWNER" | "STAFF";
};

/**
 * Decides whether a Microsoft sign-in may enter the admin area. The account
 * must be on the active allowlist by email. Its Entra object id is pinned on
 * first sign-in, so a different account later given the same address is
 * refused.
 */
export async function authorizeAdminSignIn(input: {
  objectId: string;
  emails: string[];
  displayName: string | null;
}): Promise<AdminUser | null> {
  const sql = db();
  const emails = input.emails.map((e) => e.toLowerCase());

  return sql.begin(async (tx) => {
    const [row] = await tx<(AdminUser & { entraObjectId: string | null; isActive: boolean })[]>`
      SELECT id, email, display_name, role, entra_object_id, is_active
      FROM admin_users
      WHERE entra_object_id = ${input.objectId}
         OR lower(email) = ANY(${emails})
      ORDER BY (entra_object_id = ${input.objectId}) DESC NULLS LAST
      LIMIT 1
      FOR UPDATE
    `;

    const allowed =
      row &&
      row.isActive &&
      (row.entraObjectId === null || row.entraObjectId === input.objectId);

    if (!allowed) {
      await recordAudit(tx, {
        actorType: "SYSTEM",
        action: "admin.sign_in_denied",
        entityType: "admin_user",
        entityId: row?.id ?? null,
        details: { emails, objectId: input.objectId },
      });
      return null;
    }

    await tx`
      UPDATE admin_users
      SET entra_object_id = ${input.objectId},
          display_name = COALESCE(${input.displayName}, display_name),
          last_login_at = now()
      WHERE id = ${row.id}
    `;
    await recordAudit(tx, {
      actorType: "ADMIN",
      actor: row.email,
      action: "admin.signed_in",
      entityType: "admin_user",
      entityId: row.id,
    });
    return { id: row.id, email: row.email, displayName: row.displayName, role: row.role };
  });
}

/** The active admin for a signed-in Entra account, or null if revoked. */
export async function getActiveAdminByObjectId(objectId: string): Promise<AdminUser | null> {
  const [row] = await db()<AdminUser[]>`
    SELECT id, email, display_name, role
    FROM admin_users
    WHERE entra_object_id = ${objectId} AND is_active
  `;
  return row ?? null;
}
