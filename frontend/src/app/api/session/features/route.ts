import { NextRequest, NextResponse } from 'next/server';
import { serializeFeatureSnapshot } from '@/lib/auth/feature-snapshot';
import { AUTH_TOKEN_COOKIE, WORKSPACE_FEATURES_COOKIE } from '@/lib/auth/session';

const COOKIE_MAX_AGE = 60 * 60 * 8;

function getApiBaseUrl(): string {
  return process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:3001';
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const tokenFromBody = typeof body?.token === 'string' ? body.token : null;
  const tokenFromCookie = request.cookies.get(AUTH_TOKEN_COOKIE)?.value || null;
  const token = tokenFromBody || tokenFromCookie;

  if (!token) {
    return NextResponse.json({ error: 'token is required' }, { status: 400 });
  }

  const upstream = await fetch(`${getApiBaseUrl()}/api/v1/workspace/features`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });

  if (!upstream.ok) {
    return NextResponse.json({ error: 'failed to fetch workspace features' }, { status: upstream.status });
  }

  const payload = await upstream.json();
  const snapshot = serializeFeatureSnapshot({
    plan: typeof payload?.plan === 'string' ? payload.plan : 'free',
    features: Array.isArray(payload?.features) ? payload.features : [],
    snipara: Array.isArray(payload?.snipara) ? payload.snipara : [],
    updatedAt: new Date().toISOString(),
  });

  const response = NextResponse.json({ success: true });
  response.cookies.set(WORKSPACE_FEATURES_COOKIE, snapshot, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(WORKSPACE_FEATURES_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  return response;
}
