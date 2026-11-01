"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeNextPath } from "@/lib/auth/redirect";
import { DEMO_ROLE_COOKIE } from "@/lib/auth/session";
import { areDemoRolesAllowed, isSupabaseConfigured, siteUrl } from "@/lib/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/types";
import {
  forgotPasswordSchema,
  friendlyAuthError,
  signInSchema,
  signUpSchema,
  updatePasswordSchema,
} from "@/lib/validation/auth";
import { formDataToObject, toFieldErrors } from "@/lib/validation/helpers";

/** DEMO MODE ONLY — pick a role without a real account. */
export async function setDemoRole(formData: FormData) {
  if (!areDemoRolesAllowed()) {
    throw new Error("Not authorized: demo roles are disabled on this deployment.");
  }
  const role = z.enum(["customer", "operator", "admin"]).safeParse(formData.get("role"));
  if (!role.success) throw new Error("Unknown demo role");
  const store = await cookies();
  store.set(DEMO_ROLE_COOKIE, role.data, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  const fallback = role.data === "admin" ? "/admin" : role.data === "operator" ? "/operator" : "/stations";
  redirect(safeNextPath(formData.get("next"), fallback));
}

export async function signOut() {
  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  } else {
    (await cookies()).delete(DEMO_ROLE_COOKIE);
  }
  redirect("/");
}

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!isSupabaseConfigured()) {
    return { status: "error", message: "Authentication is not configured. Use a demo role instead." };
  }
  const values = formDataToObject(formData);
  const parsed = signInSchema.safeParse(values);
  if (!parsed.success) {
    return { status: "error", fieldErrors: toFieldErrors(parsed.error), values: { email: String(values.email ?? "") } };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    // Same message for wrong email or wrong password, so accounts can't be probed.
    const message =
      error.code === "email_not_confirmed"
        ? "Please confirm your email first — open the link we sent you, then sign in."
        : error.code === "over_request_rate_limit"
          ? friendlyAuthError(error.code)
          : "That email and password don't match. Check them and try again.";
    return { status: "error", message, values: { email: parsed.data.email } };
  }
  redirect(safeNextPath(formData.get("next"), "/"));
}

export async function signUp(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!isSupabaseConfigured()) {
    return { status: "error", message: "Authentication is not configured. Use a demo role instead." };
  }
  const values = formDataToObject(formData);
  const { password: _pw, ...safeValues } = values;
  void _pw;
  const parsed = signUpSchema.safeParse(values);
  if (!parsed.success) {
    return {
      status: "error",
      message: "Please fix the highlighted fields.",
      fieldErrors: toFieldErrors(parsed.error),
      values: safeValues,
    };
  }
  const { email, password, fullName, accountType, companyName, companyPhone } = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Read by the `handle_new_user` trigger. It can only ever create
      // `customer` or `operator` profiles — never `admin`.
      data: {
        full_name: fullName,
        account_type: accountType,
        company_name: companyName,
        company_phone: companyPhone,
        terms_accepted_at: new Date().toISOString(),
      },
      emailRedirectTo: `${siteUrl()}/auth/callback?next=${accountType === "operator" ? "/operator" : "/"}`,
    },
  });
  if (error) {
    // "User already registered" is reported the same as success below, so the
    // form can't be used to discover who has an account.
    if (error.code !== "user_already_exists") {
      return { status: "error", message: friendlyAuthError(error.code), values: safeValues };
    }
  }
  if (data?.session) {
    redirect(accountType === "operator" ? "/operator" : "/");
  }
  return {
    status: "success",
    message: `If ${email} can receive mail, we've sent a confirmation link to it. Open the link, then sign in. Check your spam folder if it doesn't arrive within a few minutes.`,
  };
}

/** Sends a password-reset email. Always reports success (no account probing). */
export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!isSupabaseConfigured()) {
    return { status: "error", message: "Authentication is not configured in demo mode." };
  }
  const parsed = forgotPasswordSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return { status: "error", fieldErrors: toFieldErrors(parsed.error) };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${siteUrl()}/auth/callback?next=/account/password`,
  });
  if (error && (error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit")) {
    return { status: "error", message: friendlyAuthError(error.code) };
  }
  return {
    status: "success",
    message: `If an account exists for ${parsed.data.email}, a reset link is on its way. It expires in about an hour.`,
  };
}

/** Sets a new password for the signed-in user (after following a reset link). */
export async function updatePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!isSupabaseConfigured()) {
    return { status: "error", message: "Authentication is not configured in demo mode." };
  }
  const parsed = updatePasswordSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return { status: "error", fieldErrors: toFieldErrors(parsed.error) };
  }
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return { status: "error", message: "Your reset link has expired. Please request a new one." };
  }
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { status: "error", message: friendlyAuthError(error.code) };
  return { status: "success", message: "Your password has been changed." };
}
