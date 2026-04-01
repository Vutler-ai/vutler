import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal/legal-page';
import { LEGAL_ENTITY, LEGAL_LAST_UPDATED, LEGAL_RELATED_LINKS } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Data Processing Addendum | Vutler',
  description: 'Commercial and privacy contact path for Vutler data processing terms and customer processor obligations.',
};

export default function DpaPage() {
  return (
    <LegalPage
      eyebrow="Data Processing"
      title="Data Processing Addendum"
      summary="This page describes the data processing framework available for customers that use Vutler to process personal data under their own instructions."
      meta={[
        { label: 'Last updated', value: LEGAL_LAST_UPDATED },
        { label: 'Provider', value: LEGAL_ENTITY.operatorName },
        { label: 'Contact', value: LEGAL_ENTITY.privacyEmail },
      ]}
      relatedLinks={[...LEGAL_RELATED_LINKS]}
      sections={[
        {
          title: '1. When a DPA applies',
          paragraphs: [
            'If a customer uses Vutler to process personal data on behalf of that customer, the customer will generally act as controller and Vutler will generally act as processor for the relevant service data, subject to the contract and actual use case.',
            'A separate DPA may be appropriate where the customer requires processor terms covering subject matter, duration, categories of personal data, security, confidentiality, subprocessors, assistance, audits, deletion, and international transfers.',
          ],
        },
        {
          title: '2. Core processing commitments',
          bullets: [
            'Process personal data on documented customer instructions, subject to applicable law.',
            'Ensure confidentiality obligations for personnel authorized to access relevant data.',
            'Apply appropriate technical and organizational security measures.',
            'Assist the customer with reasonable requests related to data subject rights, incidents, and compliance obligations where required and appropriate.',
            'Delete or return covered personal data at the end of the service relationship, subject to legal retention duties and agreed operational constraints.',
          ],
        },
        {
          title: '3. Subprocessors and providers',
          paragraphs: [
            'Vutler relies on infrastructure and service providers to deliver the platform, and customers may also enable third-party AI providers or integrations. The applicable subprocessor position depends on whether those services are used by Vutler as part of the service or selected directly by the customer in its own configuration.',
            'A current transparency page is available under Subprocessors. Customer-configured model providers and integrations may create additional data flows that the customer should review independently.',
          ],
        },
        {
          title: '4. How to request',
          paragraphs: [
            `To request the current DPA template or discuss customer-required terms, contact ${LEGAL_ENTITY.privacyEmail} or ${LEGAL_ENTITY.legalEmail} with your company name, workspace, and procurement or legal contact details.`,
          ],
          note: 'This page is a summary for commercial and review purposes and is not itself the full contractual DPA.',
        },
      ]}
    />
  );
}
