import type { Metadata } from "next";
import { Suspense } from "react";
import { UpdatePasswordForm } from "@/components/forms/auth-forms";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

export default function UpdatePasswordPage() {
  return (
    <div className="mx-auto max-w-md">
      <PageHeader title="Choose a new password" />
      <Card>
        <CardBody>
          <Suspense fallback={<Skeleton className="h-40 w-full" />}>
            <Content />
          </Suspense>
        </CardBody>
      </Card>
    </div>
  );
}

async function Content() {
  const user = await getCurrentUser();
  if (!user || user.isDemo) {
    return (
      <div className="space-y-4">
        <Alert tone="warning">
          This page only works from a password-reset link, and that link has expired or wasn&apos;t opened in this
          browser.
        </Alert>
        <ButtonLink href="/login/forgot">Send a new reset link</ButtonLink>
      </div>
    );
  }
  return <UpdatePasswordForm email={user.email} />;
}
