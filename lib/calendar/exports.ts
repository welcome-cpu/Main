import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { recordAudit } from "@/lib/audit";
import { buildExportIcs, type ExportEvent } from "@/lib/calendar/export-ics";
import { db } from "@/lib/db/client";
import type { AdminUser } from "@/lib/admin/users";

const hash = (token: string) => createHash("sha256").update(token).digest();

export type ExportLink = {
  id: string;
  propertyId: string;
  propertyName: string;
  label: string;
  isActive: boolean;
  createdAt: Date;
  lastAccessedAt: Date | null;
};

export async function listExportLinks(): Promise<ExportLink[]> {
  return db()<ExportLink[]>`
    SELECT x.id, x.property_id, p.name AS property_name, x.label, x.is_active, x.created_at, x.last_accessed_at
    FROM calendar_exports x JOIN properties p ON p.id = x.property_id
    ORDER BY x.is_active DESC, p.name, x.created_at
  `;
}

/**
 * Creates a private export link. The token is returned once to show the
 * admin; only its SHA-256 hash is stored, so it can't be recovered later.
 */
export async function createExportLink(admin: AdminUser, propertyId: string, label: string): Promise<{ token: string }> {
  const token = randomBytes(24).toString("base64url");
  await db().begin(async (tx) => {
    const [row] = await tx<{ id: string }[]>`
      INSERT INTO calendar_exports (property_id, label, token_sha256) VALUES (${propertyId}, ${label}, ${hash(token)})
      RETURNING id
    `;
    await recordAudit(tx, {
      actorType: "ADMIN",
      actor: admin.email,
      action: "calendar_export.created",
      entityType: "calendar_export",
      entityId: row.id,
      propertyId,
      details: { label },
    });
  });
  return { token };
}

export async function revokeExportLink(admin: AdminUser, id: string) {
  await db().begin(async (tx) => {
    const [row] = await tx<{ propertyId: string; label: string }[]>`
      UPDATE calendar_exports SET is_active = false, revoked_at = now() WHERE id = ${id} AND is_active
      RETURNING property_id, label
    `;
    if (!row) return;
    await recordAudit(tx, {
      actorType: "ADMIN",
      actor: admin.email,
      action: "calendar_export.revoked",
      entityType: "calendar_export",
      entityId: id,
      propertyId: row.propertyId,
      details: { label: row.label },
    });
  });
}

/**
 * The export feed for a token, or null if the token is unknown or revoked.
 * Contains bookings taken in this system (confirmed, plus live checkout
 * holds so dates close quickly) and owner blocks. Imported bookings are
 * deliberately left out: each channel already has its own, and re-exporting
 * them would bounce bookings between systems.
 */
export async function exportFeedForToken(token: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{32}$/.test(token)) return null;
  const sql = db();
  const [link] = await sql<{ id: string; propertyId: string; propertyName: string }[]>`
    UPDATE calendar_exports x SET last_accessed_at = now()
    FROM properties p
    WHERE x.token_sha256 = ${hash(token)} AND x.is_active AND p.id = x.property_id
    RETURNING x.id, x.property_id, p.name AS property_name
  `;
  if (!link) return null;

  const events = await sql<ExportEvent[]>`
    SELECT 'reservation-' || r.id || '@gamriechalets.co.uk' AS uid,
           r.check_in::text AS start, r.check_out::text AS "end",
           'Booked (Gamrie Chalets direct)' AS summary
    FROM reservations r
    WHERE r.property_id = ${link.propertyId}
      AND (r.status = 'CONFIRMED' OR (r.status = 'HOLD' AND r.hold_expires_at > now()))
      AND r.check_out >= current_date - 30
    UNION ALL
    SELECT 'block-' || b.id || '@gamriechalets.co.uk', b.start_date::text, b.end_date::text, 'Blocked'
    FROM manual_blocks b
    WHERE b.property_id = ${link.propertyId} AND b.is_active AND b.end_date >= current_date - 30
    ORDER BY start
  `;
  return buildExportIcs(`${link.propertyName} (Gamrie Chalets direct)`, events);
}
