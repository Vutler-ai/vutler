import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/legal/legal-page';
import { LEGAL_ENTITY, LEGAL_LAST_UPDATED, LEGAL_RELATED_LINKS } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Privacy Policy | Vutler',
  description: 'How Vutler handles personal data, workspace content, analytics, and data subject rights.',
};

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Privacy"
      title="Privacy Policy"
      summary={`This policy explains how ${LEGAL_ENTITY.brandName} and ${LEGAL_ENTITY.operatorName} collect, use, store, and protect personal data when you visit the public site, create an account, or use the Vutler platform.`}
      meta={[
        { label: 'Last updated', value: LEGAL_LAST_UPDATED },
        { label: 'Controller', value: LEGAL_ENTITY.operatorName },
        { label: 'Location', value: LEGAL_ENTITY.location },
      ]}
      relatedLinks={[...LEGAL_RELATED_LINKS]}
      sections={[
        {
          title: '1. Scope',
          paragraphs: [
            `This Privacy Policy applies to ${LEGAL_ENTITY.brandName}, including the public website at vutler.ai, the authenticated application at app.vutler.ai, support interactions, and related communications.`,
            `Where a customer uses ${LEGAL_ENTITY.brandName} for its own business purposes, that customer may act as the controller of workspace content and end-user data processed through the service. In those cases, ${LEGAL_ENTITY.operatorName} generally acts as a processor or service provider for that customer.`,
          ],
        },
        {
          title: '2. Data we collect',
          bullets: [
            'Account and contact information, such as name, email address, company details, billing contact details, and support correspondence.',
            'Workspace and usage data, such as workspace identifiers, configuration choices, plan information, feature flags, logs, and audit events.',
            'Content submitted to the service, including agent prompts, messages, tasks, drive metadata, email routing settings, and files or snippets intentionally uploaded or connected by users.',
            'Technical and security data, such as IP address, browser or device information, authentication events, error diagnostics, and anti-abuse signals.',
            'Optional analytics data on the public site only if you consent to analytics under our Cookie Policy.',
          ],
        },
        {
          title: '3. How we use personal data',
          bullets: [
            'To provide, secure, maintain, and improve the service.',
            'To authenticate users, manage workspaces, enforce plan limits, and operate routing, storage, and real-time features.',
            'To respond to support requests, legal requests, and security incidents.',
            'To process payments, invoices, and commercial requests where applicable.',
            'To generate aggregated service analytics and reliability metrics.',
          ],
        },
        {
          title: '4. Legal bases',
          paragraphs: [
            'Depending on the context, we rely on contractual necessity, legitimate interests, compliance with legal obligations, and consent where required. We use consent specifically for optional analytics or other optional tracking technologies on the public site.',
          ],
        },
        {
          title: '5. AI providers, integrations, and subprocessors',
          paragraphs: [
            `${LEGAL_ENTITY.brandName} routes AI requests through provider integrations selected or enabled within the platform. This may include external model providers and infrastructure partners that receive prompts, files, or context strictly as needed to perform the requested service.`,
            'We also use infrastructure, storage, email, and support vendors to operate the platform. Where required, we put contractual safeguards in place with those vendors and limit access to the minimum needed to deliver the service.',
          ],
          note: (
            <>
              Customers should avoid sending personal data or regulated data to third-party providers unless that use is
              permitted by their own policies, contracts, and applicable law.
            </>
          ),
        },
        {
          title: '6. Cookies and similar technologies',
          paragraphs: [
            <>
              We use essential cookies for authentication, security, and workspace state. Optional analytics is disabled by
              default until you choose otherwise. See the{' '}
              <Link href="/cookies" className="text-blue-300 hover:text-blue-200">
                Cookie Policy
              </Link>{' '}
              for details.
            </>,
          ],
        },
        {
          title: '7. Retention',
          paragraphs: [
            'We keep personal data only for as long as necessary for the purposes described in this policy, to comply with legal obligations, resolve disputes, enforce agreements, and maintain security records. Retention periods may vary depending on account status, workspace settings, and the type of data involved.',
          ],
        },
        {
          title: '8. International transfers',
          paragraphs: [
            'Because customers can enable third-party providers and integrations, personal data may be processed outside Switzerland or the European Economic Area. Where required, we rely on appropriate transfer mechanisms, contractual protections, or adequacy decisions.',
          ],
        },
        {
          title: '9. Customer controller and processor roles',
          paragraphs: [
            'For account management, security, billing, and direct service operations, Vutler generally acts as controller of the personal data it needs to run the service. For customer workspace content processed on behalf of the customer, Vutler generally acts as processor or service provider, depending on the applicable legal framework and contract.',
            'If you are an end user interacting with a customer-configured agent or workflow, your organization may be the primary controller for that interaction and should be your first point of contact for rights requests relating to that workspace context.',
          ],
        },
        {
          title: '10. Your rights',
          bullets: [
            'Request access to the personal data we hold about you.',
            'Request correction, deletion, or restriction where applicable.',
            'Object to certain processing based on legitimate interests.',
            'Withdraw consent for optional analytics at any time through Cookie Settings.',
            'Request data portability where the law provides that right.',
            'Lodge a complaint with the competent supervisory authority.',
          ],
        },
        {
          title: '11. Minors and sensitive uses',
          paragraphs: [
            'The service is designed for business and professional use and is not directed to children. Customers are responsible for assessing whether they may use the service for special-category, highly confidential, regulated, employment, health, or other sensitive workflows and for applying appropriate contractual and technical safeguards before doing so.',
          ],
        },
        {
          title: '12. Security',
          paragraphs: [
            'We use technical and organizational measures designed to protect confidentiality, integrity, and availability, including access controls, encrypted transport, and operational monitoring. No system can guarantee absolute security, but we continuously review controls as the platform evolves.',
          ],
        },
        {
          title: '13. Contact',
          paragraphs: [
            <>
              Privacy requests can be sent to{' '}
              <a href={`mailto:${LEGAL_ENTITY.privacyEmail}`} className="text-blue-300 hover:text-blue-200">
                {LEGAL_ENTITY.privacyEmail}
              </a>
              . General inquiries can be sent to{' '}
              <a href={`mailto:${LEGAL_ENTITY.generalEmail}`} className="text-blue-300 hover:text-blue-200">
                {LEGAL_ENTITY.generalEmail}
              </a>
              .
            </>,
          ],
        },
      ]}
    />
  );
}
