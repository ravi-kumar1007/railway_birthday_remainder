import type { Metadata } from "next";
import type { ReactNode } from "react";

const company = process.env.NEXT_PUBLIC_COMPANY_NAME || "Our company";
const LAST_UPDATED = "26 October 2026";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: `How ${company} uses employee details to send birthday wishes on WhatsApp.`,
};

// Public: Meta requires a privacy policy URL before a WhatsApp app can go live
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 sm:py-16">
      <p className="text-sm font-medium text-emerald-700">{company}</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Privacy policy: birthday wishes</h1>
      <p className="mt-2 text-sm text-slate-500">Last updated {LAST_UPDATED}</p>

      <div className="mt-8 space-y-8 text-[15px] leading-relaxed text-slate-700">
        <Section title="What this service does">
          {company} sends employees a birthday wish on WhatsApp, once a year, on their birthday. It is an internal
          service run by {company} for its own employees. It doesn&apos;t send advertising and it doesn&apos;t sell or
          share data for marketing.
        </Section>

        <Section title="What we store">
          For each employee: name, WhatsApp phone number, date of birth (the year is optional), an employee code if
          there is one, and whether they have agreed to receive WhatsApp messages. For each wish sent, we keep the date,
          the message template used, and the delivery status WhatsApp reports (sent, delivered, read or failed).
        </Section>

        <Section title="Why we use it">
          Only to send the birthday wish and to check that it was delivered. Wishes go only to employees who have
          agreed to receive WhatsApp messages from {company}.
        </Section>

        <Section title="Who handles it">
          <ul className="list-disc space-y-1 pl-5">
            <li>{company} staff who manage this service, through a password-protected admin site.</li>
            <li>
              Meta Platforms, which delivers the messages through the WhatsApp Business Platform. When a message is
              sent, Meta receives the phone number and the message text. See{" "}
              <a href="https://www.whatsapp.com/legal/business-policy" className="font-medium text-emerald-700 underline">
                WhatsApp&apos;s Business Policy
              </a>
              .
            </li>
            <li>Our hosting and database providers, which store the data on our behalf.</li>
          </ul>
        </Section>

        <Section title="How long we keep it">
          While you work at {company}. When you leave, or ask us to, your record is deactivated so no more wishes are
          sent, and it is deleted on request. Delivery records are kept as long as your record is.
        </Section>

        <Section title="Your choices">
          You can stop the wishes or have your details corrected or deleted at any time by contacting {company}&apos;s
          HR or administration team. Stopping the wishes doesn&apos;t affect anything else about your employment.
        </Section>

        <Section title="Security">
          The data is stored in an access-controlled database, sent only over encrypted connections, and the admin site
          is protected by a password with limits on failed sign-in attempts.
        </Section>

        <Section title="Changes">
          If this policy changes, the date at the top of this page changes too.
        </Section>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}
