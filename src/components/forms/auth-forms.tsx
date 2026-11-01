"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { requestPasswordReset, signIn, signUp, updatePassword } from "@/app/actions/auth";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { FieldErrors, SubmitButton, TextField } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { initialFormState } from "@/lib/types";

const str = (v: unknown) => (typeof v === "string" ? v : undefined);

export function SignInForm({ next }: { next: string }) {
  const [state, action] = useActionState(signIn, initialFormState);
  const e = (k: string) => state.fieldErrors?.[k];
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
      {state.status === "error" && state.message && <Alert tone="error">{state.message}</Alert>}
      <TextField label="Email" name="email" type="email" autoComplete="email" required defaultValue={str(state.values?.email)} errors={e("email")} />
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
  const v = (k: string) => str(state.values?.[k]);

  if (state.status === "success") {
    return (
      <Alert tone="success" title="Check your email">
        {state.message}
      </Alert>
    );
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
        <>
          <TextField label="Company name" name="companyName" autoComplete="organization" required defaultValue={v("companyName")} errors={e("companyName")} hint="The registered name of your charging business" />
          <TextField label="Business phone" name="companyPhone" type="tel" autoComplete="tel" required defaultValue={v("companyPhone")} errors={e("companyPhone")} hint="Our team may call to confirm your company before your first station goes live" placeholder="+91 98765 43210" />
        </>
      )}
      <TextField label="Email" name="email" type="email" autoComplete="email" required defaultValue={v("email")} errors={e("email")} />
      <TextField label="Password" name="password" type="password" autoComplete="new-password" required hint="At least 8 characters, with a letter and a number" errors={e("password")} />
      <div className="space-y-1">
        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="consent"
            value="yes"
            required
            defaultChecked={v("consent") === "yes"}
            aria-invalid={e("consent") ? true : undefined}
            aria-describedby={e("consent") ? "f-consent-error" : undefined}
            className="mt-0.5 size-4 accent-brand-600"
          />
          <span>
            I agree to the{" "}
            <Link href="/terms" target="_blank" className="font-medium text-brand-700 underline">
              Terms of Use
            </Link>{" "}
            and{" "}
            <Link href="/privacy" target="_blank" className="font-medium text-brand-700 underline">
              Privacy Policy
            </Link>
            , and to my details being used to run my account.
          </span>
        </label>
        <FieldErrors id="f-consent-error" errors={e("consent")} />
      </div>
      <SubmitButton pendingText="Creating account…" className="w-full">
        Create account
      </SubmitButton>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState(requestPasswordReset, initialFormState);
  if (state.status === "success") {
    return <Alert tone="success" title="Check your email">{state.message}</Alert>;
  }
  return (
    <form action={action} className="space-y-4" noValidate>
      {state.status === "error" && state.message && <Alert tone="error">{state.message}</Alert>}
      <TextField label="Email" name="email" type="email" autoComplete="email" required errors={state.fieldErrors?.email} />
      <SubmitButton pendingText="Sending…" className="w-full">
        Send reset link
      </SubmitButton>
    </form>
  );
}

export function UpdatePasswordForm({ email }: { email: string | null }) {
  const [state, action] = useActionState(updatePassword, initialFormState);
  if (state.status === "success") {
    return (
      <div className="space-y-4">
        <Alert tone="success">{state.message}</Alert>
        <ButtonLink href="/">Continue</ButtonLink>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4" noValidate>
      {email && <p className="text-sm text-ink-muted">Account: {email}</p>}
      {state.status === "error" && state.message && <Alert tone="error">{state.message}</Alert>}
      <TextField label="New password" name="password" type="password" autoComplete="new-password" required hint="At least 8 characters, with a letter and a number" errors={state.fieldErrors?.password} />
      <TextField label="Repeat new password" name="confirmPassword" type="password" autoComplete="new-password" required errors={state.fieldErrors?.confirmPassword} />
      <SubmitButton pendingText="Saving…" className="w-full">
        Save new password
      </SubmitButton>
    </form>
  );
}
