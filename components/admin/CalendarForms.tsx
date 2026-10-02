"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/admin/(console)/actions";
import { Checkbox, Field, FormMessage, Select, SubmitButton } from "@/components/admin/Form";

export function AddFeedForm({
  action,
  properties,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  properties: { id: string; name: string }[];
}) {
  const [state, formAction] = useActionState(action, {});
  const e = state.errors;
  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2">
      <Select
        label="Property"
        name="propertyId"
        errors={e}
        options={properties.map((p) => ({ value: p.id, label: p.name }))}
      />
      <Select
        label="Channel"
        name="source"
        errors={e}
        options={[
          { value: "LODGIFY", label: "Lodgify" },
          { value: "AIRBNB", label: "Airbnb" },
          { value: "BOOKING_COM", label: "Booking.com" },
          { value: "OTHER", label: "Other" },
        ]}
      />
      <Field label="Name" name="name" errors={e} required hint="e.g. Lodgify export" />
      <Field label="Calendar link (.ics)" name="url" errors={e} required hint="Kept private; only the website address is shown here afterwards." />
      <div className="sm:col-span-2">
        <Checkbox
          label="Apply turnover nights after these bookings"
          name="applyTurnover"
          defaultChecked
          hint="Leave ticked unless this calendar already includes cleaning days."
        />
      </div>
      <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
        <SubmitButton>Add and sync</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function SyncAllButton({ action }: { action: () => Promise<FormState> }) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-4">
      <SubmitButton>Sync calendars now</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function ExportLinkForm({
  action,
  properties,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  properties: { id: string; name: string }[];
}) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2">
      <Select
        label="Property"
        name="propertyId"
        errors={state.errors}
        options={properties.map((p) => ({ value: p.id, label: p.name }))}
      />
      <Field label="Which channel will use it" name="label" errors={state.errors} required hint="e.g. Lodgify, Airbnb" />
      <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
        <SubmitButton>Create export link</SubmitButton>
      </div>
      {state.message && (
        <p role={state.ok ? "status" : "alert"} className={`break-all text-sm sm:col-span-2 ${state.ok ? "text-green-800" : "text-red-700"}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}
