"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/admin/(console)/actions";
import { Checkbox, Field, FormMessage, Select, SubmitButton } from "@/components/admin/Form";
import type { Property } from "@/lib/admin/properties";
import { penceToInput } from "@/lib/money";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

export function NewPropertyForm({ action }: { action: Action }) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2">
      <Field label="Name" name="name" errors={state.errors} required />
      <Field
        label="Slug"
        name="slug"
        errors={state.errors}
        hint="Must match the property's page address, e.g. mohr-rest"
        required
      />
      <Field label="Max guests" name="maxGuests" type="number" errors={state.errors} required />
      <Field label="Base nightly price (£)" name="basePence" errors={state.errors} required />
      <div className="flex items-center gap-4 sm:col-span-2">
        <SubmitButton>Create property</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function PropertySettingsForm({ property, action }: { property: Property; action: Action }) {
  const [state, formAction] = useActionState(action, {});
  const e = state.errors;
  return (
    <form action={formAction} className="space-y-8">
      <Section title="Status">
        <Checkbox
          label="Directly bookable"
          name="isActive"
          defaultChecked={property.isActive}
          hint="Guests can book this property through the new booking system."
        />
      </Section>

      <Section title="Occupancy and stay rules">
        <Field label="Name" name="name" defaultValue={property.name} errors={e} />
        <Field label="Max guests" name="maxGuests" type="number" defaultValue={property.maxGuests} errors={e} />
        <Field label="Max pets" name="maxPets" type="number" defaultValue={property.maxPets} errors={e} />
        <Field label="Check-in from" name="checkInTime" type="time" defaultValue={property.checkInTime} errors={e} />
        <Field label="Check-out by" name="checkOutTime" type="time" defaultValue={property.checkOutTime} errors={e} />
        <Field
          label="Turnover nights"
          name="turnoverNights"
          type="number"
          defaultValue={property.turnoverNights}
          errors={e}
          hint="Nights kept empty after each stay. Applies to new bookings only."
        />
        <Field label="Minimum stay (nights)" name="defaultMinNights" type="number" defaultValue={property.defaultMinNights} errors={e} />
        <Field label="Maximum stay (nights)" name="defaultMaxNights" type="number" defaultValue={property.defaultMaxNights} errors={e} />
        <Field
          label="Advance notice (hours)"
          name="advanceNoticeHours"
          type="number"
          defaultValue={property.advanceNoticeHours}
          errors={e}
          hint="How far ahead of check-in a booking must be made."
        />
        <Field
          label="Booking window (days)"
          name="bookingWindowDays"
          type="number"
          defaultValue={property.bookingWindowDays}
          errors={e}
          hint="How far into the future guests can book."
        />
      </Section>

      <Section title="Pricing">
        <Select
          label="Nightly prices come from"
          name="rateSource"
          defaultValue={property.rateSource}
          errors={e}
          options={[
            { value: "LODGIFY", label: "Lodgify (copied daily, read-only)" },
            { value: "MANUAL", label: "This admin area only" },
          ]}
          hint="Rate rules below always override either source."
        />
        <Field
          label="Base nightly price (£)"
          name="basePence"
          defaultValue={penceToInput(property.basePence)}
          errors={e}
          hint="Used for any night with no other price."
        />
        <Field label="Cleaning fee per stay (£)" name="cleaningFeePence" defaultValue={penceToInput(property.cleaningFeePence)} errors={e} />
        <Field
          label="Pet fee per stay (£)"
          name="petFeePence"
          defaultValue={penceToInput(property.petFeePence)}
          errors={e}
          hint="Charged once when any pets are booked."
        />
        <Field label="Lodgify property ID" name="lodgifyPropertyId" type="number" defaultValue={property.lodgifyPropertyId} errors={e} />
        <Field label="Lodgify room type ID" name="lodgifyRoomTypeId" type="number" defaultValue={property.lodgifyRoomTypeId} errors={e} />
      </Section>

      <Section title="Payment terms">
        <Field
          label="Deposit at booking (%)"
          name="depositPercent"
          type="number"
          defaultValue={property.depositPercent}
          errors={e}
          hint="100 means full payment upfront."
        />
        <Field
          label="Balance due (days before arrival)"
          name="balanceDueDaysBefore"
          type="number"
          defaultValue={property.balanceDueDaysBefore}
          errors={e}
          hint="Bookings made closer to arrival than this pay in full."
        />
      </Section>

      <div className="flex items-center gap-4">
        <SubmitButton>Save settings</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function ExtraForm({ action }: { action: Action }) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2">
      <Field label="Name" name="name" errors={state.errors} required />
      <Field label="Price (£)" name="pricePence" errors={state.errors} required />
      <Select
        label="Charged"
        name="pricingType"
        errors={state.errors}
        options={[
          { value: "PER_STAY", label: "Once per stay" },
          { value: "PER_NIGHT", label: "Per night" },
          { value: "PER_GUEST", label: "Per guest" },
          { value: "PER_GUEST_PER_NIGHT", label: "Per guest per night" },
        ]}
      />
      <Field label="Max quantity" name="maxQuantity" type="number" defaultValue={1} errors={state.errors} />
      <div className="sm:col-span-2">
        <Field label="Description (optional)" name="description" errors={state.errors} />
      </div>
      <div className="flex items-center gap-4 sm:col-span-2">
        <SubmitButton>Add extra</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function RateRuleForm({ action }: { action: Action }) {
  const [state, formAction] = useActionState(action, {});
  const e = state.errors;
  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-3">
      <Field label="Name" name="name" errors={e} required hint="e.g. Christmas & New Year" />
      <Field label="First night" name="firstNight" type="date" errors={e} required />
      <Field label="Last night" name="lastNight" type="date" errors={e} required />
      <Field label="Nightly price (£)" name="pricePence" errors={e} hint="Leave blank to keep the usual price." />
      <Field label="Minimum stay" name="minNights" type="number" errors={e} />
      <Field label="Maximum stay" name="maxNights" type="number" errors={e} />
      <Field
        label="Priority"
        name="priority"
        type="number"
        defaultValue={0}
        errors={e}
        hint="Higher wins where rules overlap."
      />
      <div className="flex items-center gap-4 sm:col-span-3">
        <SubmitButton>Add rate rule</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-4 text-lg font-semibold text-foreground-strong">{title}</legend>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}
