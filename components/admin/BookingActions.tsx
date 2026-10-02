"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/admin/(console)/actions";
import { Checkbox, Field, FormMessage, SubmitButton } from "@/components/admin/Form";

type FormAction = (state: FormState, formData: FormData) => Promise<FormState>;
type ButtonAction = () => Promise<FormState>;

export function ActionButton({ action, label, confirmText }: { action: ButtonAction; label: string; confirmText?: string }) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (confirmText && !window.confirm(confirmText)) e.preventDefault();
      }}
      className="flex flex-wrap items-center gap-3"
    >
      <SubmitButton>{label}</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function CancelBookingForm({ action }: { action: FormAction }) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm("Cancel this booking and release its dates? This can't be undone.")) e.preventDefault();
      }}
      className="space-y-3"
    >
      <Field label="Reason" name="reason" errors={state.errors} required />
      <Checkbox label="Email the guest to tell them" name="emailGuest" defaultChecked />
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton>Cancel booking</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function ManualPaymentForm({ action }: { action: FormAction }) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="grid gap-3 sm:grid-cols-2">
      <Field label="Amount received (£)" name="amountPence" errors={state.errors} required />
      <Field label="Note (e.g. bank transfer)" name="note" errors={state.errors} />
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <SubmitButton>Record payment</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
