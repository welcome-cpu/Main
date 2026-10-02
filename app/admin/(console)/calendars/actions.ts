"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/app/admin/(console)/actions";
import { createFeed, deleteFeed, setFeedActive } from "@/lib/admin/calendars";
import { requireAdmin } from "@/lib/admin/dal";
import { isUuid } from "@/lib/admin/properties";
import { calendarFeedSchema, fieldErrors } from "@/lib/admin/validation";
import { syncAllFeeds, syncFeed, type SyncOutcome } from "@/lib/calendar/sync";

const PAGE = "/admin/calendars";

export async function addFeedAction(_: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const parsed = calendarFeedSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const result = await createFeed(admin, parsed.data);
  if ("error" in result) return { message: result.error };

  // Import straight away so the admin sees whether the link works.
  const outcome = await syncFeed(result.id, "MANUAL", admin.email);
  revalidatePath(PAGE);
  return outcome.ok
    ? { ok: true, message: `Added and synced: ${describe(outcome)}.` }
    : { message: `Added, but the first sync failed: ${outcome.error}` };
}

export async function syncFeedAction(formData: FormData) {
  const admin = await requireAdmin();
  const feedId = String(formData.get("feedId"));
  if (!isUuid(feedId)) return;
  await syncFeed(feedId, "MANUAL", admin.email);
  revalidatePath(PAGE);
}

export async function syncAllAction(): Promise<FormState> {
  const admin = await requireAdmin();
  const outcomes = await syncAllFeeds("MANUAL", admin.email);
  revalidatePath(PAGE);
  if (outcomes.length === 0) return { message: "No active calendars to sync." };

  const failed = outcomes.filter((o) => !o.ok);
  const summary = outcomes.map((o) => `${o.feedName}: ${o.ok ? describe(o) : `failed — ${o.error}`}`).join(" · ");
  return { ok: failed.length === 0, message: summary };
}

export async function toggleFeedAction(formData: FormData) {
  const admin = await requireAdmin();
  const feedId = String(formData.get("feedId"));
  if (!isUuid(feedId)) return;
  await setFeedActive(admin, feedId, formData.get("isActive") === "true");
  revalidatePath(PAGE);
}

export async function deleteFeedAction(formData: FormData) {
  const admin = await requireAdmin();
  const feedId = String(formData.get("feedId"));
  if (!isUuid(feedId)) return;
  await deleteFeed(admin, feedId);
  revalidatePath(PAGE);
}

function describe(o: SyncOutcome) {
  const parts = [`${o.added} new`, `${o.updated} changed`, `${o.removed} removed`];
  if (o.warnings.length) parts.push(`${o.warnings.length} skipped`);
  return parts.join(", ");
}
