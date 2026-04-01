import type { Metadata } from 'next';
import { CookieSettingsButton } from '@/components/legal/cookie-settings-button';
import { LegalPage } from '@/components/legal/legal-page';
import { LEGAL_ENTITY, LEGAL_LAST_UPDATED, LEGAL_RELATED_LINKS } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Cookie Policy | Vutler',
  description: 'Cookie categories, consent choices, and optional analytics behavior for the Vutler site and app.',
};

export default function CookiesPage() {
  return (
    <LegalPage
      eyebrow="Cookies"
      title="Cookie Policy"
      summary="This page explains which cookies and similar technologies Vutler uses, which ones are strictly necessary, and how you can manage your choices."
      meta={[
        { label: 'Last updated', value: LEGAL_LAST_UPDATED },
        { label: 'Applies to', value: 'vutler.ai and app.vutler.ai' },
        { label: 'Operator', value: LEGAL_ENTITY.operatorName },
      ]}
      relatedLinks={[...LEGAL_RELATED_LINKS]}
      sections={[
        {
          title: '1. How we use cookies',
          paragraphs: [
            'We use a limited set of cookies and similar technologies to keep the platform secure, maintain login state, route users between public and authenticated surfaces, and remember cookie choices.',
          ],
        },
        {
          title: '2. Essential cookies',
          paragraphs: [
            'Essential cookies are always active because they are required for the service to work safely and correctly.',
          ],
          bullets: [
            'Authentication and session continuity, including the sign-in state used by the authenticated application.',
            'Workspace feature state used to enforce plan access and preserve application behavior.',
            'Administrative session handling and security protections.',
            'Your saved consent preference so we can respect your privacy choices.',
          ],
          note: 'Current essential cookie names used by the application include `vutler_auth`, `vutler_admin`, `vutler_features`, and the consent preference cookie set by this consent manager.',
        },
        {
          title: '3. Analytics',
          paragraphs: [
            'Analytics is optional and disabled by default until you opt in. If you accept analytics, the public site may load privacy-focused analytics tooling to help us understand traffic and improve pages.',
            'At the time of this policy update, Vutler only enables analytics after consent and does not currently deploy advertising or retargeting cookies on the public site.',
          ],
        },
        {
          title: '4. How to manage your choice',
          paragraphs: [
            'You can accept all, reject optional technologies, or reopen the preference center at any time to change your choice.',
          ],
        },
        {
          title: '5. Browser controls',
          paragraphs: [
            'You can also use your browser settings to block or delete cookies. If you disable essential cookies, parts of the authenticated application may stop working correctly.',
          ],
        },
        {
          title: '6. Contact',
          paragraphs: [
            `Questions about cookies or tracking technologies can be sent to ${LEGAL_ENTITY.privacyEmail}.`,
          ],
        },
      ]}
    >
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-white">Preference center</p>
          <p className="mt-1 text-sm text-white/60">
            Open the consent manager to review or change your current settings.
          </p>
        </div>
        <CookieSettingsButton
          variant="outline"
          className="border-white/15 bg-transparent text-white hover:bg-white/10"
        />
      </div>
    </LegalPage>
  );
}
