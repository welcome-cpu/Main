"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/dal";
import { isUuid } from "@/lib/admin/properties";
import { processOutbox } from "@/lib/email/outbox";
import { runHeating, saveCurrentSchedule, setHeatingEnabled } from "@/lib/heating/run";
import { runAfterResponse } from "@/lib/after-response";

const PAGE = "/admin/heating";

function done(message: string, isError = false): never {
  revalidatePath(PAGE);
  redirect(`${PAGE}?${isError ? "error" : "ok"}=${encodeURIComponent(message)}`);
}

export async function saveScheduleAction(formData: FormData) {
  const admin = await requireAdmin();
  const propertyId = String(formData.get("propertyId"));
  if (!isUuid(propertyId)) return;
  const result = await saveCurrentSchedule(admin, propertyId);
  if ("error" in result) done(result.error, true);
  done("Saved the current Hive heating and hot water schedules as standard.");
}

export async function toggleHeatingAction(formData: FormData) {
  const admin = await requireAdmin();
  const propertyId = String(formData.get("propertyId"));
  const enabled = formData.get("enabled") === "true";
  if (!isUuid(propertyId)) return;
  const result = await setHeatingEnabled(admin, propertyId, enabled);
  if ("error" in result) done(result.error, true);
  done(enabled ? "Automatic control switched on." : "Automatic control switched off. The heating and hot water stay as they are.");
}

export async function runHeatingAction(formData: FormData) {
  const admin = await requireAdmin();
  const propertyId = String(formData.get("propertyId"));
  if (!isUuid(propertyId)) return;
  const [outcome] = await runHeating({ trigger: "MANUAL", actor: admin.email, propertyId });
  runAfterResponse(() => processOutbox());
  if (!outcome) done("Hive isn't set up for this deployment.", true);
  switch (outcome.result) {
    case "DONE":
      done(outcome.action === "RESET" ? "Put the standard heating and hot water schedules back on." : "Turned the heating and hot water off.");
    case "FAILED":
      done(`Couldn't change the heating and hot water: ${outcome.error}`, true);
    case "BASELINE":
      done("Starting from the heating and hot water as they are now. The next planned change will be made on time.");
    case "UP_TO_DATE":
      done("Nothing to do: the heating and hot water already match the bookings.");
    case "NOTHING_DUE":
      done("Nothing to do yet.");
    case "DISABLED":
      done("Automatic control is switched off.", true);
  }
}
