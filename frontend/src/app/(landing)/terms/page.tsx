import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/legal/legal-page';
import { LEGAL_ENTITY, LEGAL_LAST_UPDATED, LEGAL_RELATED_LINKS } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Terms of Service | Vutler',
  description: 'Terms governing access to the Vutler public site, platform, agents, integrations, and beta features.',
};

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Terms"
      title="Terms of Service"
      summary={`These Terms govern your access to and use of ${LEGAL_ENTITY.brandName}, including the public site, the authenticated application, APIs, and related services operated by ${LEGAL_ENTITY.operatorName}.`}
      meta={[
        { label: 'Last updated', value: LEGAL_LAST_UPDATED },
        { label: 'Operator', value: LEGAL_ENTITY.operatorName },
        { label: 'Governing venue', value: 'Geneva, Switzerland' },
      ]}
      relatedLinks={[...LEGAL_RELATED_LINKS]}
      sections={[
        {
          title: '1. Acceptance and eligibility',
          paragraphs: [
            `By accessing or using ${LEGAL_ENTITY.brandName}, you agree to these Terms. If you use the service on behalf of an organization, you represent that you have authority to bind that organization.`,
            'You must use the service in compliance with applicable law and must not use the service if you are prohibited from doing so.',
          ],
        },
        {
          title: '2. The service',
          paragraphs: [
            `${LEGAL_ENTITY.brandName} provides a workspace-based platform for configuring and operating AI agents across chat, email, tasks, drive, and related tools. Features may change over time, and some features may be marked as beta, preview, or experimental.`,
          ],
        },
        {
          title: '3. Accounts and workspace responsibility',
          bullets: [
            'You are responsible for the security of your account credentials and for activity occurring under your account or workspace.',
            'You must provide accurate registration and billing information and keep it up to date.',
            'Workspace administrators are responsible for access control, connected integrations, and the instructions given to agents.',
          ],
        },
        {
          title: '4. Acceptable use',
          bullets: [
            'Do not use the service for illegal, fraudulent, abusive, or deceptive activity.',
            'Do not attempt to interfere with the service, bypass security controls, or gain unauthorized access to systems, data, or accounts.',
            'Do not use the service to develop or distribute malware, spam, or content that infringes third-party rights.',
            'Do not submit data unless you have a lawful basis and appropriate rights to process that data through the service.',
          ],
        },
        {
          title: '5. Customer content and instructions',
          paragraphs: [
            'You retain responsibility for prompts, files, messages, tasks, and other content you or your users submit to the service. You grant us the limited rights necessary to host, transmit, process, and display that content solely to operate and improve the service in accordance with these Terms and our Privacy Policy.',
            'You are responsible for verifying that agent outputs are appropriate for your use case before relying on them for legal, financial, medical, employment, or other high-impact decisions.',
          ],
        },
        {
          title: '6. AI outputs and third-party providers',
          paragraphs: [
            'AI-generated output may be incomplete, inaccurate, offensive, or unsuitable for your intended purpose. You are responsible for human review and downstream use.',
            'The service may connect to third-party providers, models, tools, or integrations. Their services are governed by their own terms and privacy commitments, and their availability may change without notice.',
          ],
          note: (
            <>
              If you configure Bring Your Own Key or third-party integrations, you are responsible for ensuring that your
              provider configuration, prompts, and content flows meet your own contractual and compliance requirements.
            </>
          ),
        },
        {
          title: '7. Fees and billing',
          paragraphs: [
            'Paid features, if any, are billed according to the pricing page, an order form, or another written commercial agreement. Unless otherwise stated, fees are non-refundable except where required by law.',
            'We may change pricing for future billing periods by giving reasonable notice. Taxes, duties, and bank or payment-provider fees are your responsibility unless stated otherwise.',
          ],
        },
        {
          title: '8. Beta and preview features',
          paragraphs: [
            'Some features may be designated beta, preview, experimental, or similar. Those features may change materially, may be incomplete, and may be subject to reduced support, limited documentation, or separate usage limits.',
            'Unless otherwise stated in a signed agreement, beta and preview features are provided without any commitment that they will become generally available in their current form.',
          ],
        },
        {
          title: '9. Intellectual property',
          paragraphs: [
            `${LEGAL_ENTITY.brandName} and related branding, software, and documentation remain the property of ${LEGAL_ENTITY.operatorName} or its licensors. These Terms do not grant you ownership of the service or its underlying technology.`,
            <>
              The source code may include open-source components. Where applicable, those components remain subject to
              their own licenses, including the project license published in the repository.
            </>,
          ],
        },
        {
          title: '10. Output and customer responsibility',
          paragraphs: [
            'As between the parties, you retain responsibility for your inputs and for how you use outputs. To the extent permitted by law and by third-party provider terms, Vutler does not claim ownership of customer inputs solely because they are processed through the service.',
            'You are responsible for evaluating whether outputs may be used in production, customer-facing, legal, employment, financial, or other high-impact contexts. The service does not replace qualified professional advice.',
          ],
        },
        {
          title: '11. Suspension and termination',
          paragraphs: [
            'We may suspend or terminate access if necessary to address security risks, abuse, non-payment, legal exposure, or material violations of these Terms. You may stop using the service at any time.',
            'Sections that by their nature should survive termination will survive, including those concerning payment obligations, intellectual property, disclaimers, liability, and dispute resolution.',
          ],
        },
        {
          title: '12. Changes to the service and terms',
          paragraphs: [
            'We may update the service and these Terms from time to time. If we make a material change, we may provide notice by updating the site, notifying workspace administrators, or using another reasonable channel.',
            'Your continued use after the effective date of updated Terms constitutes acceptance of the revised Terms, unless mandatory law requires a different mechanism.',
          ],
        },
        {
          title: '13. Warranties disclaimer',
          paragraphs: [
            `To the maximum extent permitted by law, ${LEGAL_ENTITY.brandName} is provided on an "as is" and "as available" basis. We do not warrant uninterrupted availability, error-free operation, or that the service will meet every specific customer requirement.`,
          ],
        },
        {
          title: '14. Limitation of liability',
          paragraphs: [
            `To the maximum extent permitted by law, ${LEGAL_ENTITY.operatorName} will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, or for loss of profits, revenues, goodwill, data, or business opportunities.`,
            'Our aggregate liability arising out of or relating to the service will not exceed the amount paid by you for the service during the twelve months preceding the event giving rise to the claim, unless a different cap applies in a signed agreement.',
          ],
        },
        {
          title: '15. Governing law and disputes',
          paragraphs: [
            'These Terms are governed by the laws of Switzerland, excluding conflict-of-law rules. Unless mandatory law provides otherwise, the courts of Geneva, Switzerland will have exclusive jurisdiction.',
          ],
        },
        {
          title: '16. Contact',
          paragraphs: [
            <>
              Legal notices can be sent to{' '}
              <a href={`mailto:${LEGAL_ENTITY.legalEmail}`} className="text-blue-300 hover:text-blue-200">
                {LEGAL_ENTITY.legalEmail}
              </a>
              . For data protection terms, also see our{' '}
              <Link href="/privacy" className="text-blue-300 hover:text-blue-200">
                Privacy Policy
              </Link>
              .
            </>,
          ],
        },
      ]}
    />
  );
}
