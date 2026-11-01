import type { Metadata } from "next";
import { DraftLegalNotice, SupportContact } from "@/components/legal/draft-notice";
import { PageHeader } from "@/components/ui/page-header";
import { supportEmail } from "@/lib/config";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What personal data ChargeSetu collects, why, and how to ask for it to be corrected or deleted.",
};

export default function PrivacyPage() {
  const email = supportEmail();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Privacy Policy" description="Last updated: [date to be set before launch]" />
      <DraftLegalNotice />
      <div className="space-y-6 leading-relaxed text-ink-muted [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-ink [&_li]:ml-5 [&_li]:list-disc">
        <section>
          <h2>Who we are</h2>
          <p>
            ChargeSetu is a directory of electric-vehicle charging stations in India, operated by{" "}
            <strong>[legal entity name, registered address]</strong>. We don&apos;t own or operate chargers, and we
            don&apos;t take bookings or payments.
          </p>
        </section>
        <section>
          <h2>What we collect</h2>
          <ul>
            <li>
              <strong>Browsing the directory:</strong> no account is needed. If you tap &ldquo;Stations near me&rdquo;,
              your browser shares your approximate location with this page to sort results. It is placed in the page
              address so the results can load, and we don&apos;t save it to our database.
            </li>
            <li>
              <strong>Accounts:</strong> name, email address and password (stored by our authentication provider in
              hashed form). For operator accounts: company name and business phone number.
            </li>
            <li>
              <strong>Station listings:</strong> the details operators submit, including station phone numbers and
              email addresses, which are shown publicly once approved.
            </li>
            <li>
              <strong>Reports:</strong> what you tell us about a station and, only if you provide it, your email
              address.
            </li>
            <li>
              <strong>Technical data:</strong> our hosting and database providers keep standard server logs (such as IP
              address and browser type) for security and reliability.
            </li>
          </ul>
        </section>
        <section>
          <h2>Why we use it</h2>
          <ul>
            <li>To run your account and let operators manage their listings.</li>
            <li>To review and verify station information before it is published.</li>
            <li>To follow up on reports you send us.</li>
            <li>To keep the service secure and prevent abuse.</li>
          </ul>
          <p className="mt-2">We don&apos;t sell personal data and we don&apos;t use it for advertising.</p>
        </section>
        <section>
          <h2>Who we share it with</h2>
          <p>
            Service providers that host the app and database, currently Vercel (hosting) and Supabase (database and
            sign-in). Their servers may be outside India. Map tiles are loaded from{" "}
            <strong>[map tile provider]</strong>, which receives your IP address when the map is shown. We disclose
            data if required by law.
          </p>
        </section>
        <section>
          <h2>How long we keep it</h2>
          <p>
            <strong>[Retention periods to be decided]</strong> — for example, reports are kept for [N] months after
            they are resolved, and accounts until you ask us to delete them.
          </p>
        </section>
        <section id="your-rights" className="scroll-mt-24">
          <h2>Correcting or deleting your data</h2>
          <p>
            Email <SupportContact email={email} /> from the address on your account to ask for a copy of your data,
            to correct it, or to delete your account. We aim to reply within <strong>[N]</strong> working days. Station
            operators can correct their listings themselves from the operator dashboard.
          </p>
          <p className="mt-2">
            Grievance officer: <strong>[name, email, address — required details to be confirmed with a lawyer]</strong>.
          </p>
        </section>
        <section>
          <h2>Changes</h2>
          <p>We&apos;ll post any changes on this page and update the date at the top.</p>
        </section>
      </div>
    </div>
  );
}
