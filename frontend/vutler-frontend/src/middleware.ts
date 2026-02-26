import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that don't require authentication
const PUBLIC_ROUTES = ['/login', '/api/v1/auth/login'];

// Routes that should redirect to dashboard if already authenticated
const AUTH_ROUTES = ['/login'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Get auth token from cookies or Authorization header
  const authToken = request.cookies.get('authToken')?.value || 
                    request.headers.get('authorization')?.replace('Bearer ', '');

  const isAuthenticated = !!authToken;
  const isPublicRoute = PUBLIC_ROUTES.some(route => pathname.startsWith(route));
  const isAuthRoute = AUTH_ROUTES.some(route => pathname.startsWith(route));

  // If user is authenticated and trying to access login page, redirect to dashboard
  if (isAuthenticated && isAuthRoute) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // If user is not authenticated and trying to access protected route, redirect to login
  if (!isAuthenticated && !isPublicRoute && pathname !== '/') {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // For API calls, add auth headers if token exists
  if (pathname.startsWith('/api') && authToken) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-auth-token', authToken);
    
    // Also pass userId if available from cookie
    const userId = request.cookies.get('userId')?.value;
    if (userId) {
      requestHeaders.set('x-user-id', userId);
    }

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
