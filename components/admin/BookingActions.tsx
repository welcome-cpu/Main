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

export function CancelWithRefundForm({ action, approvedRefundPence, confirmText, label }: { action: FormAction; approvedRefundPence: number; confirmText: string; label: string }) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm(confirmText)) e.preventDefault();
      }}
      className="space-y-3"
    >
      <input type="hidden" name="approvedRefundPence" value={approvedRefundPence} />
      <Field label="Reason" name="reason" errors={state.errors} required />
      <Checkbox label="Email the guest to tell them" name="emailGuest" defaultChecked />
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton>{label}</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function MoveBookingForm({
  action,
  checkIn,
  checkOut,
  approvedTotalPence,
  approvedOwedPence,
  confirmText,
}: {
  action: FormAction;
  checkIn: string;
  checkOut: string;
  approvedTotalPence: number;
  approvedOwedPence: number;
  confirmText: string;
}) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm(confirmText)) e.preventDefault();
      }}
      className="space-y-3"
    >
      <input type="hidden" name="checkIn" value={checkIn} />
      <input type="hidden" name="checkOut" value={checkOut} />
      <input type="hidden" name="approvedTotalPence" value={approvedTotalPence} />
      <input type="hidden" name="approvedOwedPence" value={approvedOwedPence} />
      <Field label="Reason" name="reason" errors={state.errors} required />
      <Checkbox label="Email the guest their new dates" name="emailGuest" defaultChecked />
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton>Move booking</SubmitButton>
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

export function LinkLodgifyForm({ action }: { action: FormAction }) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <Field label="Lodgify booking number" name="lodgifyBookingId" errors={state.errors} required />
      <SubmitButton>Link</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
