import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal/legal-page';
import { LEGAL_ENTITY, LEGAL_LAST_UPDATED, LEGAL_RELATED_LINKS } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Subprocessors | Vutler',
  description: 'Overview of Vutler subprocessors and third-party service categories used to operate the platform.',
};

export default function SubprocessorsPage() {
  return (
    <LegalPage
      eyebrow="Subprocessors"
      title="Subprocessors and Service Providers"
      summary="This page gives a high-level overview of service-provider categories used to operate Vutler, plus customer-enabled providers that may receive data depending on configuration."
      meta={[
        { label: 'Last updated', value: LEGAL_LAST_UPDATED },
        { label: 'Operator', value: LEGAL_ENTITY.operatorName },
        { label: 'Contact', value: LEGAL_ENTITY.privacyEmail },
      ]}
      relatedLinks={[...LEGAL_RELATED_LINKS]}
      sections={[
        {
          title: '1. Infrastructure and platform operations',
          bullets: [
            'Hosting, compute, and deployment infrastructure used to run the public site, application, APIs, and supporting services.',
            'Database and storage services used for workspace data, metadata, and operational state.',
            'Object storage or file services used for shared drive and artifact persistence.',
            'Email delivery and routing providers used for platform-managed mail flows.',
          ],
        },
        {
          title: '2. Customer-enabled AI and integration providers',
          bullets: [
            'Model providers and routing providers selected or enabled in the workspace, including supported LLM vendors and customer-supplied API keys.',
            'Productivity, communication, and workspace integrations enabled by customers, such as email, calendar, drive, or other connected systems.',
            'Memory or knowledge services enabled as part of the workspace configuration.',
          ],
          note: 'These providers may act under the customer’s own instructions or terms, not only under Vutler’s service-provider chain. The exact position depends on configuration and contract structure.',
        },
        {
          title: '3. Public-site analytics',
          paragraphs: [
            'If a visitor consents to optional analytics on the public site, analytics tooling may be loaded to measure aggregate traffic and page usage. This optional category is disabled by default until consent is provided.',
          ],
        },
        {
          title: '4. Changes',
          paragraphs: [
            'We may update this page as our provider stack evolves. Material changes for customer-facing processing terms may also be reflected in a DPA or other contractual notice process where applicable.',
          ],
        },
      ]}
    />
  );
}
