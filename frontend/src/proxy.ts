import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { deserializeFeatureSnapshot, snapshotHasFeature } from '@/lib/auth/feature-snapshot';
import { APP_ROUTE_PREFIXES, AUTH_ROUTES, findGuardedFeature, LANDING_ROUTES, matchesRoute } from '@/lib/auth/route-access';
import { ADMIN_TOKEN_COOKIE, AUTH_TOKEN_COOKIE, WORKSPACE_FEATURES_COOKIE } from '@/lib/auth/session';

const APP_DOMAIN = 'app.vutler.ai';
const SITE_DOMAINS = ['vutler.ai', 'www.vutler.ai'];

function isAppRoute(pathname: string): boolean {
  return APP_ROUTE_PREFIXES.some((prefix) => matchesRoute(pathname, prefix));
}

function isAuthRoute(pathname: string): boolean {
  return AUTH_ROUTES.some((route) => pathname === route);
}

function buildUpgradeUrl(request: NextRequest, feature: string): URL {
  const url = request.nextUrl.clone();
  url.pathname = `/upgrade/${feature}`;
  url.searchParams.set('from', `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return url;
}

function buildLoginUrl(request: NextRequest): URL {
  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.searchParams.set('next', `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return url;
}

export function proxy(request: NextRequest) {
  const hostname = request.headers.get('host')?.split(':')[0] || '';
  const { pathname } = request.nextUrl;

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

  if (isSiteDomain) {
    if (isAppRoute(pathname) || isAuthRoute(pathname)) {
      return NextResponse.redirect(new URL(`https://${APP_DOMAIN}${pathname}${request.nextUrl.search}`));
    }
    return NextResponse.next();
  }

  if (!isAppDomain) {
    return NextResponse.next();
  }

  const authToken = request.cookies.get(AUTH_TOKEN_COOKIE)?.value || null;
  const adminToken = request.cookies.get(ADMIN_TOKEN_COOKIE)?.value || null;
  const featureSnapshot = deserializeFeatureSnapshot(request.cookies.get(WORKSPACE_FEATURES_COOKIE)?.value);

  if (LANDING_ROUTES.includes(pathname as (typeof LANDING_ROUTES)[number])) {
    if (pathname === '/' && authToken) {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard';
      url.search = '';
      return NextResponse.redirect(url);
    }

    return NextResponse.redirect(new URL(`https://vutler.ai${pathname}${request.nextUrl.search}`));
  }

  if (isAuthRoute(pathname) && authToken) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  if (matchesRoute(pathname, '/admin')) {
    if (!adminToken && pathname !== '/admin') {
      const url = request.nextUrl.clone();
      url.pathname = '/admin';
      url.search = '';
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (isAppRoute(pathname) && !isAuthRoute(pathname) && !authToken) {
    return NextResponse.redirect(buildLoginUrl(request));
  }

  const guardedFeature = findGuardedFeature(pathname);
  if (authToken && guardedFeature && featureSnapshot && !snapshotHasFeature(featureSnapshot, guardedFeature)) {
    return NextResponse.redirect(buildUpgradeUrl(request, guardedFeature));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
