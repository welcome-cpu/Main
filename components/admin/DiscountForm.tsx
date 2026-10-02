"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/admin/(console)/actions";
import { Field, FormMessage, Select, SubmitButton } from "@/components/admin/Form";

export function DiscountForm({
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
      <Field label="Code" name="code" errors={e} required hint="Guests type this in, e.g. SPRING10" />
      <Select
        label="Property"
        name="propertyId"
        errors={e}
        options={[{ value: "", label: "All properties" }, ...properties.map((p) => ({ value: p.id, label: p.name }))]}
      />
      <Select
        label="Type"
        name="discountType"
        errors={e}
        options={[
          { value: "PERCENT", label: "Percentage off accommodation" },
          { value: "FIXED", label: "Fixed amount off accommodation (£)" },
        ]}
      />
      <Field label="Amount (% or £)" name="value" errors={e} required />
      <Field label="First night of stay (optional)" name="stayFirstNight" type="date" errors={e} />
      <Field label="Last night of stay (optional)" name="stayLastNight" type="date" errors={e} />
      <Field label="Bookable from (optional)" name="bookFrom" type="date" errors={e} />
      <Field label="Bookable until (optional)" name="bookUntil" type="date" errors={e} />
      <Field label="Minimum nights (optional)" name="minNights" type="number" errors={e} />
      <Field label="Maximum uses (optional)" name="maxRedemptions" type="number" errors={e} />
      <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
        <SubmitButton>Create code</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
