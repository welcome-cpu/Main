"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/dal";
import { isUuid } from "@/lib/admin/properties";
import { setPrizeDrawEntryStatus, type PrizeDrawStatus } from "@/lib/prize-draw";

const STATUSES: PrizeDrawStatus[] = ["PENDING", "VERIFIED", "REJECTED"];

export async function setPrizeDrawStatusAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id"));
  const status = String(formData.get("status")) as PrizeDrawStatus;
  if (!isUuid(id) || !STATUSES.includes(status)) return;
  await setPrizeDrawEntryStatus(admin, id, status);
  revalidatePath("/admin/prize-draw");
}
