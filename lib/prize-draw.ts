import "server-only";
import { z } from "zod";
import type { AdminUser } from "@/lib/admin/users";
import { recordAudit } from "@/lib/audit";
import { todayInZone } from "@/lib/dates";
import { db } from "@/lib/db/client";

// The annual free-night draw: guests enter with the name shown on their
// Google review, and the owner verifies the review before it counts.

export const prizeDrawEntrySchema = z.object({
  googleName: z.string().trim().min(1, "Enter the name shown on your Google review").max(100),
  email: z.email("Enter a valid email address").max(254),
  propertySlug: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .max(60)
    .nullish(),
});

export type PrizeDrawEntryInput = z.infer<typeof prizeDrawEntrySchema>;

export type PrizeDrawStatus = "PENDING" | "VERIFIED" | "REJECTED";

export type PrizeDrawEntry = {
  id: string;
  googleName: string;
  email: string;
  propertySlug: string | null;
  status: PrizeDrawStatus;
  reviewedBy: string | null;
  createdAt: Date;
};

/** The draw year an entry made today belongs to. */
export function currentDrawYear() {
  return Number(todayInZone("Europe/London").slice(0, 4));
}

/** Records an entry. Entering again with the same name and email changes nothing. */
export async function enterPrizeDraw(input: PrizeDrawEntryInput) {
  await db()`
    INSERT INTO prize_draw_entries (draw_year, google_name, email, property_slug)
    VALUES (${currentDrawYear()}, ${input.googleName}, ${input.email.trim()}, ${input.propertySlug ?? null})
    ON CONFLICT (draw_year, lower(email), lower(google_name)) DO NOTHING
  `;
}

export async function listPrizeDrawEntries(year: number) {
  return db()<PrizeDrawEntry[]>`
    SELECT id, google_name, email, property_slug, status, reviewed_by, created_at
    FROM prize_draw_entries WHERE draw_year = ${year}
    ORDER BY created_at DESC
  `;
}

export async function prizeDrawYears() {
  const rows = await db()<{ drawYear: number }[]>`SELECT DISTINCT draw_year FROM prize_draw_entries ORDER BY draw_year DESC`;
  return rows.map((r) => r.drawYear);
}

export async function setPrizeDrawEntryStatus(admin: AdminUser, id: string, status: PrizeDrawStatus) {
  await db().begin(async (tx) => {
    const [entry] = await tx<{ googleName: string; drawYear: number }[]>`
      UPDATE prize_draw_entries
      SET status = ${status},
          reviewed_by = ${status === "PENDING" ? null : admin.email},
          reviewed_at = CASE WHEN ${status} = 'PENDING' THEN NULL ELSE now() END
      WHERE id = ${id}
      RETURNING google_name, draw_year
    `;
    if (!entry) return;
    await recordAudit(tx, {
      actorType: "ADMIN",
      actor: admin.email,
      action: "prize_draw.entry_reviewed",
      entityType: "prize_draw_entry",
      entityId: id,
      details: { status, googleName: entry.googleName, drawYear: entry.drawYear },
    });
  });
}
