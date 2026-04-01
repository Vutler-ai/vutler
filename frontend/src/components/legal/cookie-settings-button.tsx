'use client';

import { Button } from '@/components/ui/button';
import { useCookieConsent } from '@/components/legal/cookie-consent';

interface CookieSettingsButtonProps {
  className?: string;
  variant?: 'ghost' | 'link' | 'outline';
}

export function CookieSettingsButton({
  className,
  variant = 'ghost',
}: CookieSettingsButtonProps) {
  const { openPreferences } = useCookieConsent();

  return (
    <Button
      type="button"
      variant={variant}
      size="sm"
      className={className}
      onClick={openPreferences}
    >
      Cookie Settings
    </Button>
  );
}
