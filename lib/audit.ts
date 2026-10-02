import "server-only";
import type { Sql, Tx } from "@/lib/db/client";

export type AuditActorType = "ADMIN" | "GUEST" | "SYSTEM" | "STRIPE";

export type AuditEntry = {
  actorType: AuditActorType;
  actor?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  propertyId?: string | null;
  // Never put secrets, card data or calendar URLs in here.
  details?: Record<string, unknown>;
};

/**
 * Appends to the audit log. Pass the transaction that made the change so the
 * audit entry commits (or rolls back) together with it.
 */
export async function recordAudit(sql: Sql | Tx, entry: AuditEntry) {
  await sql`
    INSERT INTO audit_log (actor_type, actor, action, entity_type, entity_id, property_id, details)
    VALUES (
      ${entry.actorType},
      ${entry.actor ?? null},
      ${entry.action},
      ${entry.entityType},
      ${entry.entityId ?? null},
      ${entry.propertyId ?? null},
      ${sql.json((entry.details ?? {}) as Parameters<Sql["json"]>[0])}
    )
  `;
}

/** The fields that differ between two versions of a record, for audit details. */
export function diffFields<T extends Record<string, unknown>>(before: T, after: T) {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(after)) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      changes[key] = { from: before[key], to: after[key] };
    }
  }
  return changes;
}
