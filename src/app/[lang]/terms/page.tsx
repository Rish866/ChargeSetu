import type { Metadata } from "next";
import { DraftLegalNotice, SupportContact } from "@/components/legal/draft-notice";
import { PageHeader } from "@/components/ui/page-header";
import { supportEmail } from "@/lib/config";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: "The rules for using ChargeSetu as an EV driver or charging station operator.",
};

export default function TermsPage() {
  const email = supportEmail();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Terms of Use" description="Last updated: [date to be set before launch]" />
      <DraftLegalNotice />
      <div className="space-y-6 leading-relaxed text-ink-muted [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-ink [&_li]:ml-5 [&_li]:list-disc">
        <section>
          <h2>What ChargeSetu is</h2>
          <p>
            ChargeSetu is an information directory of EV charging stations run by independent charge point operators.
            We don&apos;t own, install or operate chargers. We don&apos;t provide live charger availability, bookings or
            payments, and a listing does not mean we have a partnership with that operator.
          </p>
        </section>
        <section>
          <h2>Accuracy of information</h2>
          <p>
            Listings come from operators and are reviewed by our team, but details such as prices, opening hours and
            whether a charger is working can change at any time. Always confirm with the operator before you travel,
            especially for long journeys. Verified dates show when our team last checked a listing.
          </p>
        </section>
        <section>
          <h2>Operator responsibilities</h2>
          <ul>
            <li>Only list stations you operate or are authorised to list.</li>
            <li>Keep details — location, connectors, power, tariff, hours — accurate and up to date.</li>
            <li>Only add photos you have the right to share.</li>
            <li>We may edit, reject, hide or remove any listing, and suspend accounts that break these terms.</li>
          </ul>
        </section>
        <section>
          <h2>Acceptable use</h2>
          <ul>
            <li>Don&apos;t submit false reports or listings, or try to access accounts or data that aren&apos;t yours.</li>
            <li>Don&apos;t scrape the site at scale or interfere with how it works.</li>
          </ul>
        </section>
        <section>
          <h2>Liability</h2>
          <p>
            <strong>[Limitation-of-liability wording to be drafted by a lawyer.]</strong> ChargeSetu is provided
            &ldquo;as is&rdquo; during the pilot.
          </p>
        </section>
        <section>
          <h2>Governing law</h2>
          <p>
            These terms are governed by the laws of India. <strong>[Jurisdiction / courts to be confirmed.]</strong>
          </p>
        </section>
        <section>
          <h2>Contact</h2>
          <p>
            Questions about these terms: <SupportContact email={email} />.
          </p>
        </section>
      </div>
    </div>
  );
}
