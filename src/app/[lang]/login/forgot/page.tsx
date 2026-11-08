import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "@/components/forms/auth-forms";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { isSupabaseConfigured } from "@/lib/config";

export const metadata: Metadata = { title: "Reset your password", robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <div className="mx-auto max-w-md">
      <PageHeader title="Reset your password" description="Enter the email you signed up with and we'll send you a reset link." />
      <Card>
        <CardBody className="space-y-4">
          {isSupabaseConfigured() ? (
            <ForgotPasswordForm />
          ) : (
            <Alert tone="info">Password reset isn&apos;t available in demo mode.</Alert>
          )}
          <Link href="/login" className="inline-block text-sm font-medium text-brand-700 hover:underline">
            Back to sign in
          </Link>
        </CardBody>
      </Card>
    </div>
  );
}
