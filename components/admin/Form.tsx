"use client";

import { useFormStatus } from "react-dom";
import type { FormState } from "@/app/admin/(console)/actions";

export function Field({
  label,
  name,
  defaultValue,
  errors,
  hint,
  type = "text",
  step,
  required,
}: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  errors?: FormState["errors"];
  hint?: string;
  type?: "text" | "number" | "time" | "date";
  step?: string;
  required?: boolean;
}) {
  const error = errors?.[name]?.[0];
  return (
    <label className="block text-sm">
      <span className="font-medium text-foreground-strong">{label}</span>
      <input
        name={name}
        type={type}
        step={step}
        required={required}
        defaultValue={defaultValue ?? ""}
        aria-invalid={error ? true : undefined}
        className="mt-1 block w-full border border-border bg-surface px-3 py-2 text-foreground aria-invalid:border-red-500"
      />
      {hint && !error && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-red-700">{error}</span>}
    </label>
  );
}

export function Select({
  label,
  name,
  defaultValue,
  options,
  errors,
  hint,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  options: { value: string; label: string }[];
  errors?: FormState["errors"];
  hint?: string;
}) {
  const error = errors?.[name]?.[0];
  return (
    <label className="block text-sm">
      <span className="font-medium text-foreground-strong">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        className="mt-1 block w-full border border-border bg-surface px-3 py-2 text-foreground"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && !error && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-red-700">{error}</span>}
    </label>
  );
}

export function Checkbox({
  label,
  name,
  defaultChecked,
  hint,
}: {
  label: string;
  name: string;
  defaultChecked?: boolean;
  hint?: string;
}) {
  return (
    <label className="flex items-start gap-3 text-sm">
      <input name={name} type="checkbox" defaultChecked={defaultChecked} className="mt-1 h-4 w-4" />
      <span>
        <span className="font-medium text-foreground-strong">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}

export function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
    >
      {pending ? "Saving…" : children}
    </button>
  );
}

export function FormMessage({ state }: { state: FormState }) {
  if (!state.message && !state.errors) return null;
  const failed = !state.ok;
  return (
    <p
      role={failed ? "alert" : "status"}
      className={`text-sm ${failed ? "text-red-700" : "text-green-800"}`}
    >
      {state.message ?? "Please fix the highlighted fields."}
    </p>
  );
}
