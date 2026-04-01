import type { MarketplaceTemplate } from '@/lib/api/types';

function getPermissionString(template: MarketplaceTemplate, key: string): string | null {
  const value = template.permissions?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function getTemplateLaunchHref(template: MarketplaceTemplate): string | null {
  const launchSurface = getPermissionString(template, 'launch_surface');
  if (!launchSurface) return null;

  const params = new URLSearchParams();
  const launchMode = getPermissionString(template, 'launch_mode');
  const launchProfileKey = getPermissionString(template, 'launch_profile_key');

  if (launchMode) params.set('mode', launchMode);
  if (launchProfileKey) params.set('profile', launchProfileKey);

  const query = params.toString();
  return query ? `${launchSurface}?${query}` : launchSurface;
}

export function getTemplateLaunchLabel(template: MarketplaceTemplate): string | null {
  const explicit = getPermissionString(template, 'launch_label');
  if (explicit) return explicit;

  const launchSurface = getPermissionString(template, 'launch_surface');
  if (launchSurface === '/browser-operator') return 'Open Browser Operator';
  if (launchSurface === '/nexus') return 'Open Nexus Deploy';
  return null;
}

