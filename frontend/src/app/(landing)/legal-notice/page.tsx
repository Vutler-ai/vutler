import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal/legal-page';
import { LEGAL_ENTITY, LEGAL_LAST_UPDATED, LEGAL_RELATED_LINKS } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Legal Notice | Vutler',
  description: 'Publisher and contact details for the Vutler public site and platform.',
};

export default function LegalNoticePage() {
  return (
    <LegalPage
      eyebrow="Legal Notice"
      title="Legal Notice"
      summary="Publisher and contact details for the Vutler website and application."
      meta={[
        { label: 'Last updated', value: LEGAL_LAST_UPDATED },
        { label: 'Publisher', value: LEGAL_ENTITY.operatorName },
        { label: 'Registration', value: LEGAL_ENTITY.registrationNumber },
      ]}
      relatedLinks={[...LEGAL_RELATED_LINKS]}
      sections={[
        {
          title: '1. Publisher',
          paragraphs: [
            `${LEGAL_ENTITY.operatorName}`,
            `${LEGAL_ENTITY.location}`,
            `Commercial register: ${LEGAL_ENTITY.registrationNumber}`,
          ],
        },
        {
          title: '2. Product',
          paragraphs: [
            `${LEGAL_ENTITY.brandName} is the AI agent platform published and operated by ${LEGAL_ENTITY.operatorName}.`,
          ],
        },
        {
          title: '3. Contact channels',
          bullets: [
            `General: ${LEGAL_ENTITY.generalEmail}`,
            `Legal: ${LEGAL_ENTITY.legalEmail}`,
            `Privacy: ${LEGAL_ENTITY.privacyEmail}`,
            `Security: ${LEGAL_ENTITY.securityEmail}`,
          ],
        },
        {
          title: '4. Intellectual property and repository license',
          paragraphs: [
            'Brand assets, product content, and documentation remain protected by applicable intellectual property law unless a specific license states otherwise.',
            'Open-source code published in the project repository remains subject to the license distributed with that repository.',
          ],
        },
      ]}
    />
  );
}
