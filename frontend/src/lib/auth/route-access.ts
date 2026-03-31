export const LANDING_ROUTES = ['/', '/pricing', '/about', '/docs', '/privacy', '/terms', '/security', '/setup-llm'] as const;

export const AUTH_ROUTES = ['/login', '/register', '/forgot-password'] as const;

export const APP_ROUTE_PREFIXES = [
  '/dashboard',
  '/agents',
  '/settings',
  '/chat',
  '/mail',
  '/email',
  '/calendar',
  '/drive',
  '/tasks',
  '/automations',
  '/marketplace',
  '/admin',
  '/onboarding',
  '/integrations',
  '/vchat',
  '/clients',
  '/billing',
  '/notifications',
  '/goals',
  '/nexus',
  '/sandbox',
  '/providers',
  '/memory',
  '/usage',
  '/upgrade',
] as const;

export const FEATURE_ROUTE_GUARDS: Array<{ prefix: string; feature: string }> = [
  { prefix: '/chat', feature: 'chat' },
  { prefix: '/tasks', feature: 'tasks' },
  { prefix: '/email', feature: 'email' },
  { prefix: '/drive', feature: 'drive' },
  { prefix: '/calendar', feature: 'calendar' },
  { prefix: '/agents', feature: 'agents' },
  { prefix: '/memory', feature: 'agents' },
  { prefix: '/nexus', feature: 'nexus' },
  { prefix: '/sandbox', feature: 'sandbox' },
  { prefix: '/providers', feature: 'providers' },
  { prefix: '/integrations', feature: 'integrations' },
  { prefix: '/settings/integrations', feature: 'integrations' },
  { prefix: '/settings/email', feature: 'email' },
];

export function matchesRoute(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

export function findGuardedFeature(pathname: string): string | null {
  const match = FEATURE_ROUTE_GUARDS.find(({ prefix }) => matchesRoute(pathname, prefix));
  return match?.feature || null;
}
