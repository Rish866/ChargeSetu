"use client";

import { Loader2 } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { cn } from "@/lib/cn";
import { buttonClasses } from "./button";

const controlBase =
  "block w-full rounded-xl border bg-white px-3.5 text-base text-ink shadow-sm placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200 disabled:bg-gray-50 sm:text-sm";

function controlClass(hasError: boolean, extra?: string) {
  return cn(controlBase, hasError ? "border-red-400" : "border-line", extra);
}

interface FieldMeta {
  label: string;
  name: string;
  hint?: ReactNode;
  errors?: string[];
  required?: boolean;
  className?: string;
}

function FieldShell({
  id,
  label,
  hint,
  errors,
  required,
  className,
  children,
}: FieldMeta & { id: string; children: ReactNode }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
        {required ? (
          <span className="text-red-600" aria-hidden>
            {" "}
            *
          </span>
        ) : (
          <span className="font-normal text-ink-subtle"> (optional)</span>
        )}
      </label>
      {children}
      {hint && !errors?.length && (
        <p id={`${id}-hint`} className="text-xs text-ink-subtle">
          {hint}
        </p>
      )}
      <FieldErrors id={`${id}-error`} errors={errors} />
    </div>
  );
}

export function FieldErrors({ id, errors }: { id: string; errors?: string[] }) {
  if (!errors?.length) return null;
  return (
    <p id={id} className="text-xs font-medium text-red-700">
      {errors[0]}
    </p>
  );
}

function describedBy(id: string, hint: unknown, errors?: string[]) {
  if (errors?.length) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}

export function TextField({
  label,
  name,
  hint,
  errors,
  required,
  className,
  ...input
}: FieldMeta & Omit<ComponentProps<"input">, "name">) {
  const id = `f-${name}`;
  return (
    <FieldShell id={id} {...{ label, name, hint, errors, required, className }}>
      <input
        id={id}
        name={name}
        required={required}
        aria-invalid={errors?.length ? true : undefined}
        aria-describedby={describedBy(id, hint, errors)}
        className={controlClass(!!errors?.length, "h-11")}
        {...input}
      />
    </FieldShell>
  );
}

export function TextareaField({
  label,
  name,
  hint,
  errors,
  required,
  className,
  ...textarea
}: FieldMeta & Omit<ComponentProps<"textarea">, "name">) {
  const id = `f-${name}`;
  return (
    <FieldShell id={id} {...{ label, name, hint, errors, required, className }}>
      <textarea
        id={id}
        name={name}
        required={required}
        rows={4}
        aria-invalid={errors?.length ? true : undefined}
        aria-describedby={describedBy(id, hint, errors)}
        className={controlClass(!!errors?.length, "py-2.5")}
        {...textarea}
      />
    </FieldShell>
  );
}

export function SelectField({
  label,
  name,
  hint,
  errors,
  required,
  className,
  options,
  placeholder,
  ...select
}: FieldMeta &
  Omit<ComponentProps<"select">, "name"> & {
    options: ReadonlyArray<{ value: string; label: string }>;
    placeholder?: string;
  }) {
  const id = `f-${name}`;
  return (
    <FieldShell id={id} {...{ label, name, hint, errors, required, className }}>
      <select
        // Remount when the default changes so React's post-action form reset
        // restores the echoed value (selects don't pick up a new defaultValue).
        key={String(select.defaultValue ?? "")}
        id={id}
        name={name}
        required={required}
        aria-invalid={errors?.length ? true : undefined}
        aria-describedby={describedBy(id, hint, errors)}
        className={controlClass(!!errors?.length, "h-11 pr-8")}
        {...select}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export function CheckboxGroupField({
  legend,
  name,
  options,
  defaultValues = [],
  errors,
  hint,
  required,
}: {
  legend: string;
  name: string;
  options: ReadonlyArray<{ value: string; label: string; detail?: string }>;
  defaultValues?: string[];
  errors?: string[];
  hint?: string;
  required?: boolean;
}) {
  const id = `f-${name}`;
  return (
    <fieldset
      className="space-y-2"
      aria-describedby={describedBy(id, hint, errors)}
      aria-invalid={errors?.length ? true : undefined}
    >
      <legend className="text-sm font-medium text-ink">
        {legend}
        {required ? (
          <span className="text-red-600" aria-hidden>
            {" "}
            *
          </span>
        ) : (
          <span className="font-normal text-ink-subtle"> (optional)</span>
        )}
      </legend>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              "flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border bg-white px-3 py-2 text-sm has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50",
              errors?.length ? "border-red-300" : "border-line",
            )}
          >
            <input
              type="checkbox"
              name={name}
              value={o.value}
              defaultChecked={defaultValues.includes(o.value)}
              className="size-4 accent-brand-600"
            />
            <span>
              {o.label}
              {o.detail && <span className="ml-1 text-xs text-ink-subtle">{o.detail}</span>}
            </span>
          </label>
        ))}
      </div>
      {hint && !errors?.length && (
        <p id={`${id}-hint`} className="text-xs text-ink-subtle">
          {hint}
        </p>
      )}
      <FieldErrors id={`${id}-error`} errors={errors} />
    </fieldset>
  );
}

/** Submit button that shows a spinner while its parent form is pending. */
export function SubmitButton({
  children,
  pendingText,
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & {
  pendingText?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || props.disabled}
      aria-disabled={pending || props.disabled}
      className={buttonClasses(variant, size, className)}
      {...props}
    >
      {pending && <Loader2 aria-hidden className="size-4 animate-spin" />}
      {pending ? (pendingText ?? children) : children}
    </button>
  );
}
