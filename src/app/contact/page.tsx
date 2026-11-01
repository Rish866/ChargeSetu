import type { Metadata } from "next";
import Link from "next/link";
import { Building2, Flag, Mail, ShieldCheck } from "lucide-react";
import { SupportContact } from "@/components/legal/draft-notice";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { supportEmail } from "@/lib/config";

export const metadata: Metadata = {
  title: "Contact & support",
  description: "Get help, correct station information, list your stations, or ask about your personal data.",
};

export default function ContactPage() {
  const email = supportEmail();
  const items = [
    {
      Icon: Flag,
      title: "Wrong station information",
      body: "The quickest way is the report form — it goes straight to our review team.",
      action: <ButtonLink href="/report" variant="secondary" size="sm">Report an issue</ButtonLink>,
    },
    {
      Icon: Building2,
      title: "List your charging stations",
      body: "Create a free operator account and submit your stations. Our team reviews each one before it goes live.",
      action: <ButtonLink href="/operator" variant="secondary" size="sm">For operators</ButtonLink>,
    },
    {
      Icon: ShieldCheck,
      title: "Your personal data",
      body: "To get a copy of your data, correct it, or delete your account, email us from the address on your account.",
      action: (
        <Link href="/privacy#your-rights" className="text-sm font-medium text-brand-700 underline">
          How we handle your data
        </Link>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Contact & support" />
      <Card>
        <CardBody className="flex items-start gap-3">
          <Mail aria-hidden className="mt-0.5 size-5 text-brand-600" />
          <div>
            <h2 className="font-semibold">Email</h2>
            <p className="text-ink-muted">
              <SupportContact email={email} />
            </p>
            <p className="mt-1 text-xs text-ink-subtle">
              We&apos;re a small pilot team, so replies may take a couple of working days. We can&apos;t help with
              charger faults or payments — please contact the station operator for those.
            </p>
          </div>
        </CardBody>
      </Card>
      <ul className="grid gap-4 md:grid-cols-3">
        {items.map(({ Icon, title, body, action }) => (
          <li key={title}>
            <Card className="h-full">
              <CardBody className="flex h-full flex-col gap-2">
                <Icon aria-hidden className="size-5 text-brand-600" />
                <h2 className="font-semibold">{title}</h2>
                <p className="flex-1 text-sm text-ink-muted">{body}</p>
                <div>{action}</div>
              </CardBody>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
