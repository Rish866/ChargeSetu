import { z } from "zod";
import { parseIndianPhone } from "@/lib/india";

// Trim first: mobile keyboards and autofill often add a trailing space.
const email = z.preprocess(
  (v) => (typeof v === "string" ? v.trim().toLowerCase() : v),
  z.email("Enter a valid email address").max(200),
);
const newPassword = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(72, "Use at most 72 characters")
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), "Use at least one letter and one number");

export const signInSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password").max(200),
});

export const signUpSchema = z
  .object({
    fullName: z.string().trim().min(2, "Enter your name").max(100, "Keep your name under 100 characters"),
    email,
    password: newPassword,
    accountType: z.enum(["customer", "operator"], { error: "Choose an account type" }),
    companyName: z.string().trim().max(120, "Keep the company name under 120 characters").optional(),
    companyPhone: z.string().trim().max(25).optional(),
    consent: z.literal("yes", { error: "Please accept the Terms of Use and Privacy Policy to continue" }),
  })
  .transform((d, ctx) => {
    let companyPhone: string | null = null;
    if (d.accountType === "operator") {
      if (!d.companyName || d.companyName.length < 2) {
        ctx.addIssue({ code: "custom", path: ["companyName"], message: "Enter your company name" });
      }
      const p = parseIndianPhone(d.companyPhone ?? "");
      if (!p.ok) {
        ctx.addIssue({
          code: "custom",
          path: ["companyPhone"],
          message: "Enter a business phone number in India, e.g. +91 98765 43210",
        });
      } else {
        companyPhone = p.display;
      }
    }
    return {
      fullName: d.fullName,
      email: d.email,
      password: d.password,
      accountType: d.accountType,
      companyName: d.accountType === "operator" ? (d.companyName ?? null) : null,
      companyPhone,
    };
  });

export const forgotPasswordSchema = z.object({ email });

export const updatePasswordSchema = z
  .object({ password: newPassword, confirmPassword: z.string() })
  .refine((d) => d.password === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "The two passwords don't match",
  });

/**
 * Turns Supabase Auth error codes into friendly, non-revealing messages.
 * Never echoes raw provider errors to users.
 */
export function friendlyAuthError(code: string | undefined): string {
  switch (code) {
    case "weak_password":
      return "That password is too easy to guess. Try a longer one with letters and numbers.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Too many attempts. Please wait a few minutes and try again.";
    case "email_address_invalid":
      return "That email address can't receive mail. Please use a different one.";
    case "signup_disabled":
      return "New sign-ups are paused right now. Please contact support.";
    case "same_password":
      return "Choose a password different from your current one.";
    default:
      return "Something went wrong. Please try again in a moment.";
  }
}
