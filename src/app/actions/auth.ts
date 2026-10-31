"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeNextPath } from "@/lib/auth/redirect";
import { DEMO_ROLE_COOKIE } from "@/lib/auth/session";
import { isSupabaseConfigured, siteUrl } from "@/lib/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/types";
import { formDataToObject, toFieldErrors } from "@/lib/validation/helpers";

/** DEMO MODE ONLY — pick a role without a real account. */
export async function setDemoRole(formData: FormData) {
  if (isSupabaseConfigured()) {
    throw new Error("Demo roles are disabled when Supabase auth is configured.");
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

const signInSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!isSupabaseConfigured()) {
    return { status: "error", message: "Authentication is not configured. Use a demo role instead." };
  }
  const values = formDataToObject(formData);
  const parsed = signInSchema.safeParse(values);
  if (!parsed.success) {
    return { status: "error", fieldErrors: toFieldErrors(parsed.error), values: { email: values.email ?? "" } };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return {
      status: "error",
      message: "Sign-in failed. Check your email and password, and confirm your email if you just signed up.",
      values: { email: parsed.data.email },
    };
  }
  redirect(safeNextPath(formData.get("next"), "/"));
}

const signUpSchema = z
  .object({
    fullName: z.string().trim().min(2, "Enter your name").max(100),
    email: z.email("Enter a valid email address"),
    password: z.string().min(8, "Use at least 8 characters"),
    accountType: z.enum(["customer", "operator"], { error: "Choose an account type" }),
    companyName: z.string().trim().max(120).optional(),
  })
  .superRefine((d, ctx) => {
    if (d.accountType === "operator" && (!d.companyName || d.companyName.length < 2)) {
      ctx.addIssue({ code: "custom", path: ["companyName"], message: "Enter your company name" });
    }
  });

export async function signUp(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!isSupabaseConfigured()) {
    return { status: "error", message: "Authentication is not configured. Use a demo role instead." };
  }
  const values = formDataToObject(formData);
  const parsed = signUpSchema.safeParse(values);
  const { password: _pw, ...safeValues } = values;
  void _pw;
  if (!parsed.success) {
    return { status: "error", fieldErrors: toFieldErrors(parsed.error), values: safeValues };
  }
  const { email, password, fullName, accountType, companyName } = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Read by the `handle_new_user` trigger. It can only ever create
      // `customer` or `operator` profiles — never `admin`.
      data: { full_name: fullName, account_type: accountType, company_name: companyName ?? null },
      emailRedirectTo: `${siteUrl()}/auth/callback?next=${accountType === "operator" ? "/operator" : "/"}`,
    },
  });
  if (error) {
    return { status: "error", message: error.message, values: safeValues };
  }
  if (data.session) {
    redirect(accountType === "operator" ? "/operator" : "/");
  }
  return {
    status: "success",
    message: "Account created. Check your inbox to confirm your email, then sign in.",
  };
}
