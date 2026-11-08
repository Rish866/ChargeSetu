import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Building2, Car, ShieldCheck } from "lucide-react";
import { setDemoRole } from "@/app/actions/auth";
import { SignInForm, SignUpForm } from "@/components/forms/auth-forms";
import { Alert } from "@/components/ui/alert";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { safeNextPath } from "@/lib/auth/redirect";
import { areDemoRolesAllowed, isSupabaseConfigured } from "@/lib/config";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage({ searchParams }: PageProps<"/[lang]/login">) {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Sign in" description="Operators sign in to manage listings. Drivers don't need an account to find stations." />
      <Suspense fallback={<Skeleton className="h-72 w-full" />}>
        <LoginContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function LoginContent({ searchParams }: { searchParams: PageProps<"/[lang]/login">["searchParams"] }) {
  const sp = await searchParams;
  const next = safeNextPath(typeof sp.next === "string" ? sp.next : undefined, "");

  if (!isSupabaseConfigured()) {
    if (areDemoRolesAllowed()) return <DemoRolePicker next={next} />;
    return (
      <Alert tone="warning" title="Sign-in isn't available on this site yet">
        This deployment has no account system connected, so sign-in is switched off. If you run this site, add your
        Supabase settings (see the README) and redeploy.
      </Alert>
    );
  }

  const errorNotice =
    sp.error === "confirmation"
      ? "That confirmation link didn't work here — it may have expired or been opened in a different browser. Your email may already be confirmed, so try signing in. If that fails, sign up again to get a new link."
      : sp.error === "reset"
        ? "That password-reset link has expired or was already used. Request a new one below."
        : null;

  return (
    <div className="space-y-6">
      {errorNotice && <Alert tone="warning">{errorNotice}</Alert>}
      <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardBody className="space-y-4">
          <h2 className="text-lg font-semibold">Sign in</h2>
          <SignInForm next={next || "/"} />
          <Link href="/login/forgot" className="inline-block text-sm font-medium text-brand-700 hover:underline">
            Forgot your password?
          </Link>
        </CardBody>
      </Card>
      <Card>
        <CardBody className="space-y-4">
          <h2 className="text-lg font-semibold">Create an account</h2>
          <SignUpForm />
          <p className="text-xs text-ink-subtle">
            Operator accounts can submit stations. Every submission is reviewed by our team before it is published.
          </p>
        </CardBody>
      </Card>
      </div>
    </div>
  );
}

function DemoRolePicker({ next }: { next: string }) {
  const roles = [
    { role: "operator", Icon: Building2, title: "Demo operator", body: "Submit and edit stations for “GreenPlug Demo Networks (Fictional)”." },
    { role: "admin", Icon: ShieldCheck, title: "Demo admin", body: "Review submissions, approve, reject, verify and handle reports." },
    { role: "customer", Icon: Car, title: "Demo driver", body: "Browse as a signed-in driver (same as browsing without an account)." },
  ] as const;

  return (
    <div className="space-y-5">
      <Alert tone="warning" title="Demo mode — real authentication is not configured">
        Pick a role to explore the app. This role picker is <strong>not secure</strong> and only exists while no database
        is connected. To enable real accounts, add your Supabase URL and anon key to <code>.env.local</code> (see the
        README) and the role picker disappears automatically.
      </Alert>
      <ul className="grid gap-4 md:grid-cols-3">
        {roles.map(({ role, Icon, title, body }) => (
          <li key={role}>
            <Card className="h-full">
              <CardBody className="flex h-full flex-col gap-3">
                <Icon aria-hidden className="size-6 text-brand-600" />
                <div className="flex-1">
                  <h2 className="font-semibold">{title}</h2>
                  <p className="mt-1 text-sm text-ink-muted">{body}</p>
                </div>
                <form action={setDemoRole}>
                  <input type="hidden" name="role" value={role} />
                  <input type="hidden" name="next" value={next} />
                  <button type="submit" className={buttonClasses("primary", "md", "w-full")}>
                    Continue as {title.replace("Demo ", "")}
                  </button>
                </form>
              </CardBody>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
