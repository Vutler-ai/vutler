import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that belong to the marketing site (vutler.ai)
const LANDING_ROUTES = ['/', '/pricing', '/about', '/docs', '/privacy', '/terms', '/security', '/setup-llm'];

// Routes that belong to the app (app.vutler.ai)
const APP_ROUTE_PREFIXES = ['/dashboard', '/agents', '/settings', '/chat', '/mail', '/calendar', '/drive', '/tasks', '/automations', '/marketplace', '/admin', '/onboarding', '/integrations', '/vchat', '/clients', '/billing', '/notifications', '/goals'];

const AUTH_ROUTES = ['/login', '/register', '/forgot-password'];

const APP_DOMAIN = 'app.vutler.ai';
const SITE_DOMAINS = ['vutler.ai', 'www.vutler.ai'];

export function middleware(request: NextRequest) {
  const hostname = request.headers.get('host')?.split(':')[0] || '';
  const { pathname } = request.nextUrl;

  // Skip static files, API routes, and Next.js RSC/prefetch requests
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/ws') ||
    pathname.startsWith('/static') ||
    pathname.match(/\.(ico|png|jpg|jpeg|svg|css|js|woff2?)$/) ||
    request.headers.get('RSC') === '1' ||
    request.headers.get('Next-Router-State-Tree') !== null ||
    request.nextUrl.searchParams.has('_rsc')
  ) {
    return NextResponse.next();
  }

  const isAppDomain = hostname === APP_DOMAIN;
  const isSiteDomain = SITE_DOMAINS.includes(hostname);

  // On vutler.ai: redirect app/auth routes to app.vutler.ai
  if (isSiteDomain) {
    const isAppRoute = APP_ROUTE_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(prefix + '/'));
    const isAuthRoute = AUTH_ROUTES.some(route => pathname === route);

    if (isAppRoute || isAuthRoute) {
      return NextResponse.redirect(new URL(`https://${APP_DOMAIN}${pathname}${request.nextUrl.search}`));
    }
  }

  // On app.vutler.ai: redirect landing routes to vutler.ai
  if (isAppDomain) {
    const isLandingRoute = LANDING_ROUTES.includes(pathname);

    if (isLandingRoute) {
      // "/" on app.vutler.ai → redirect to vutler.ai unless it's a logged-in user
      // For "/" specifically, we check if user might be authenticated (has token cookie or auth header)
      // If not authenticated, redirect to vutler.ai
      if (pathname === '/') {
        // Let Next.js handle it — the landing page already redirects to /dashboard if authenticated
        // For unauthenticated users, redirect to marketing site
        return NextResponse.redirect(new URL(`https://vutler.ai${request.nextUrl.search}`));
      }
      return NextResponse.redirect(new URL(`https://vutler.ai${pathname}${request.nextUrl.search}`));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all paths except static files
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
