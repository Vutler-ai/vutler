import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal/legal-page';
import { LEGAL_ENTITY, LEGAL_LAST_UPDATED, LEGAL_RELATED_LINKS } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Security | Vutler',
  description: 'Overview of Vutler security controls, responsible disclosure, and incident handling.',
};

export default function SecurityPage() {
  return (
    <LegalPage
      eyebrow="Security"
      title="Security Overview"
      summary="This page summarizes the controls and operational practices Vutler applies to protect the platform, customer workspaces, and connected integrations."
      meta={[
        { label: 'Last updated', value: LEGAL_LAST_UPDATED },
        { label: 'Operator', value: LEGAL_ENTITY.operatorName },
        { label: 'Contact', value: LEGAL_ENTITY.securityEmail },
      ]}
      relatedLinks={[...LEGAL_RELATED_LINKS]}
      sections={[
        {
          title: '1. Security principles',
          bullets: [
            'Least-privilege access for internal operations and customer workspaces.',
            'Segregation between public site, authenticated application, and backend service layers.',
            'Encrypted transport for web traffic and authenticated sessions.',
            'Monitoring, logging, and operational review of security-relevant events.',
          ],
        },
        {
          title: '2. Workspace and application controls',
          bullets: [
            'Authenticated routes are protected by session cookies and route guards.',
            'Workspace feature gates and server-side validation reduce unauthorized feature access.',
            'Administrative surfaces use separate admin session handling.',
            'Providers, integrations, and runtime actions are mediated through application services rather than direct client trust.',
          ],
        },
        {
          title: '3. Infrastructure and data handling',
          paragraphs: [
            'Vutler is designed around Swiss-hosted operations and controlled storage layers. Access to production systems is restricted to authorized personnel with an operational need.',
            'We use logs, audit trails, and service-layer checks to support incident response, troubleshooting, and abuse detection.',
          ],
        },
        {
          title: '4. Customer responsibilities',
          bullets: [
            'Use strong authentication practices and protect workspace credentials.',
            'Review agent instructions, provider selections, and connected integrations before processing sensitive data.',
            'Apply your own internal review process for high-risk outputs and regulated workflows.',
            'Notify us promptly if you believe your account or workspace has been compromised.',
          ],
        },
        {
          title: '5. Vulnerability disclosure',
          paragraphs: [
            'If you discover a vulnerability, please report it responsibly and give us a reasonable opportunity to investigate and remediate before public disclosure.',
          ],
          note: (
            <>
              Security reports should be sent to{' '}
              <a href={`mailto:${LEGAL_ENTITY.securityEmail}`} className="text-blue-300 hover:text-blue-200">
                {LEGAL_ENTITY.securityEmail}
              </a>
              . Include steps to reproduce, affected URLs or features, impact, and any proof-of-concept details that help
              us validate the issue.
            </>
          ),
        },
        {
          title: '6. Incident response',
          paragraphs: [
            'When we identify a material security incident, we work to contain, investigate, remediate, and document it. Where required by law or contract, affected customers will be notified within the applicable timeframe.',
          ],
        },
      ]}
    />
  );
}
