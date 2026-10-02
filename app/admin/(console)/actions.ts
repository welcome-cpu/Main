"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createBlock, removeBlock } from "@/lib/admin/blocks";
import { requireAdmin } from "@/lib/admin/dal";
import {
  createExtra,
  createProperty,
  createRateRule,
  isUuid,
  setExtraActive,
  setRateRuleActive,
  updatePropertySettings,
} from "@/lib/admin/properties";
import {
  availabilityCheckSchema,
  extraSchema,
  fieldErrors,
  manualBlockSchema,
  newPropertySchema,
  propertySettingsSchema,
  rateRuleSchema,
} from "@/lib/admin/validation";
import { checkAvailability } from "@/lib/booking/availability";
import { db } from "@/lib/db/client";

export type FormState = {
  ok?: boolean;
  message?: string;
  errors?: Record<string, string[] | undefined>;
};

// Every action re-checks admin access itself. Server actions are public
// HTTP endpoints, so the page that rendered the form proves nothing.

export async function createPropertyAction(_: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const parsed = newPropertySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const result = await createProperty(admin, parsed.data);
  if ("error" in result) return { errors: { slug: [result.error] } };

  revalidatePath("/admin");
  redirect(`/admin/properties/${result.id}`);
}

export async function updatePropertyAction(
  propertyId: string,
  _: FormState,
  formData: FormData
): Promise<FormState> {
  const admin = await requireAdmin();
  if (!isUuid(propertyId)) return { message: "Unknown property." };

  const parsed = propertySettingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  await updatePropertySettings(admin, propertyId, parsed.data);
  revalidatePath("/admin");
  revalidatePath(`/admin/properties/${propertyId}`);
  return { ok: true, message: "Saved." };
}

export async function createExtraAction(
  propertyId: string,
  _: FormState,
  formData: FormData
): Promise<FormState> {
  const admin = await requireAdmin();
  if (!isUuid(propertyId)) return { message: "Unknown property." };

  const parsed = extraSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  await createExtra(admin, propertyId, parsed.data);
  revalidatePath(`/admin/properties/${propertyId}`);
  return { ok: true, message: "Extra added." };
}

export async function toggleExtraAction(formData: FormData) {
  const admin = await requireAdmin();
  const propertyId = String(formData.get("propertyId"));
  const extraId = String(formData.get("extraId"));
  if (!isUuid(propertyId) || !isUuid(extraId)) return;

  await setExtraActive(admin, propertyId, extraId, formData.get("isActive") === "true");
  revalidatePath(`/admin/properties/${propertyId}`);
}

export async function createRateRuleAction(
  propertyId: string,
  _: FormState,
  formData: FormData
): Promise<FormState> {
  const admin = await requireAdmin();
  if (!isUuid(propertyId)) return { message: "Unknown property." };

  const parsed = rateRuleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  await createRateRule(admin, propertyId, parsed.data);
  revalidatePath(`/admin/properties/${propertyId}`);
  return { ok: true, message: "Rate rule added." };
}

export async function toggleRateRuleAction(formData: FormData) {
  const admin = await requireAdmin();
  const propertyId = String(formData.get("propertyId"));
  const ruleId = String(formData.get("ruleId"));
  if (!isUuid(propertyId) || !isUuid(ruleId)) return;

  await setRateRuleActive(admin, propertyId, ruleId, formData.get("isActive") === "true");
  revalidatePath(`/admin/properties/${propertyId}`);
}

export async function createBlockAction(
  propertyId: string,
  _: FormState,
  formData: FormData
): Promise<FormState> {
  const admin = await requireAdmin();
  if (!isUuid(propertyId)) return { message: "Unknown property." };

  const parsed = manualBlockSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const result = await createBlock(admin, propertyId, parsed.data);
  if (result.error) return { message: result.error };
  revalidatePath(`/admin/properties/${propertyId}`);
  return { ok: true, message: "Dates blocked." };
}

export async function removeBlockAction(formData: FormData) {
  const admin = await requireAdmin();
  const propertyId = String(formData.get("propertyId"));
  const blockId = String(formData.get("blockId"));
  if (!isUuid(propertyId) || !isUuid(blockId)) return;

  await removeBlock(admin, propertyId, blockId);
  revalidatePath(`/admin/properties/${propertyId}`);
}

export type AvailabilityCheckState = FormState & {
  result?: {
    available: boolean;
    nights: number;
    reasons: string[];
    conflicts: { kind: string; source: string | null; ref: string; start: string; end: string }[];
  };
};

/** Admin tool: runs the real availability engine for a hypothetical stay. */
export async function checkAvailabilityAction(
  propertyId: string,
  _: AvailabilityCheckState,
  formData: FormData
): Promise<AvailabilityCheckState> {
  await requireAdmin();
  if (!isUuid(propertyId)) return { message: "Unknown property." };

  const parsed = availabilityCheckSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const result = await checkAvailability(db(), propertyId, parsed.data);
  if (!result) return { message: "Unknown property." };
  return {
    ok: true,
    result: {
      available: result.available,
      nights: result.nights,
      reasons: result.reasons.map((r) => r.message),
      conflicts: result.conflicts.map(({ kind, source, ref, start, end }) => ({ kind, source, ref, start, end })),
    },
  };
}
