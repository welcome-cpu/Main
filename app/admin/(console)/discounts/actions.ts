"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/app/admin/(console)/actions";
import { requireAdmin } from "@/lib/admin/dal";
import { createDiscountCode, setDiscountCodeActive } from "@/lib/admin/discounts";
import { isUuid } from "@/lib/admin/properties";
import { discountCodeSchema, fieldErrors } from "@/lib/admin/validation";

export async function createDiscountAction(_: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const parsed = discountCodeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const result = await createDiscountCode(admin, parsed.data);
  if (result.error) return { errors: { code: [result.error] } };
  revalidatePath("/admin/discounts");
  return { ok: true, message: `Code ${parsed.data.code} created.` };
}

export async function toggleDiscountAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id"));
  if (!isUuid(id)) return;
  await setDiscountCodeActive(admin, id, formData.get("isActive") === "true");
  revalidatePath("/admin/discounts");
}
