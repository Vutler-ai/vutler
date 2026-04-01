export const LEGAL_LAST_UPDATED = 'April 1, 2026';

export const LEGAL_ENTITY = {
  brandName: 'Vutler',
  operatorName: 'Starbox Group GmbH',
  registrationNumber: 'CHE-326.317.262',
  location: 'Geneva, Switzerland',
  generalEmail: 'info@starbox-group.com',
  legalEmail: 'legal@starbox-group.com',
  privacyEmail: 'privacy@starbox-group.com',
  securityEmail: 'security@starbox-group.com',
} as const;

export const LEGAL_RELATED_LINKS = [
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/terms', label: 'Terms of Service' },
  { href: '/cookies', label: 'Cookie Policy' },
  { href: '/dpa', label: 'DPA' },
  { href: '/subprocessors', label: 'Subprocessors' },
  { href: '/security', label: 'Security' },
  { href: '/legal-notice', label: 'Legal Notice' },
] as const;
