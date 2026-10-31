"use client";

import { useActionState, useState } from "react";
import { signIn, signUp } from "@/app/actions/auth";
import { Alert } from "@/components/ui/alert";
import { SubmitButton, TextField } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { initialFormState } from "@/lib/types";

export function SignInForm({ next }: { next: string }) {
  const [state, action] = useActionState(signIn, initialFormState);
  const e = (k: string) => state.fieldErrors?.[k];
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
      {state.status === "error" && state.message && <Alert tone="error">{state.message}</Alert>}
      <TextField label="Email" name="email" type="email" autoComplete="email" required defaultValue={state.values?.email as string | undefined} errors={e("email")} />
      <TextField label="Password" name="password" type="password" autoComplete="current-password" required errors={e("password")} />
      <SubmitButton pendingText="Signing in…" className="w-full">
        Sign in
      </SubmitButton>
    </form>
  );
}

export function SignUpForm() {
  const [state, action] = useActionState(signUp, initialFormState);
  const [accountType, setAccountType] = useState<"customer" | "operator">(
    state.values?.accountType === "operator" ? "operator" : "customer",
  );
  const e = (k: string) => state.fieldErrors?.[k];
  const v = (k: string) => (typeof state.values?.[k] === "string" ? (state.values[k] as string) : undefined);

  if (state.status === "success") {
    return <Alert tone="success" title="Almost there">{state.message}</Alert>;
  }

  return (
    <form action={action} className="space-y-4" noValidate>
      {state.status === "error" && state.message && <Alert tone="error">{state.message}</Alert>}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">I am…</legend>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["customer", "An EV driver"],
              ["operator", "A charge point operator"],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className={cn(
                "flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm",
                accountType === value ? "border-brand-500 bg-brand-50" : "border-line bg-white",
              )}
            >
              <input
                type="radio"
                name="accountType"
                value={value}
                checked={accountType === value}
                onChange={() => setAccountType(value)}
                className="accent-brand-600"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <TextField label="Full name" name="fullName" autoComplete="name" required defaultValue={v("fullName")} errors={e("fullName")} />
      {accountType === "operator" && (
        <TextField label="Company name" name="companyName" autoComplete="organization" required defaultValue={v("companyName")} errors={e("companyName")} />
      )}
      <TextField label="Email" name="email" type="email" autoComplete="email" required defaultValue={v("email")} errors={e("email")} />
      <TextField label="Password" name="password" type="password" autoComplete="new-password" required hint="At least 8 characters" errors={e("password")} />
      <SubmitButton pendingText="Creating account…" className="w-full">
        Create account
      </SubmitButton>
    </form>
  );
}
