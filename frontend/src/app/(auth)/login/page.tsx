'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/auth-context';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { setAuthToken } from '@/lib/api/client';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { login, isAuthenticated, refreshUser } = useAuth();
  const router = useRouter();

  const nextPath = useMemo(() => {
    if (typeof window === 'undefined') return '/dashboard';
    const next = new URLSearchParams(window.location.search).get('next');
    if (!next || !next.startsWith('/')) return '/dashboard';
    return next;
  }, []);

  // Handle OAuth callback: ?token=JWT or ?error=...
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const token = params.get('token');
      const oauthError = params.get('error');

      if (token) {
        // Store the JWT from OAuth redirect and hydrate user
        setAuthToken(token);
        window.history.replaceState({}, '', '/login');
        refreshUser().then(() => {
          router.push(nextPath);
        });
        return;
      }

      if (oauthError) {
        const errorMessages: Record<string, string> = {
          oauth_cancelled: 'OAuth login was cancelled.',
          oauth_invalid: 'Invalid OAuth response.',
          oauth_token_failed: 'Failed to exchange OAuth token.',
          oauth_no_email: 'Could not retrieve email from OAuth provider.',
          oauth_server_error: 'OAuth server error. Please try again.',
        };
        setError(errorMessages[oauthError] || 'OAuth login failed.');
        window.history.replaceState({}, '', '/login');
        return;
      }

      // Strip any other query params (e.g. pre-filled email from old flow)
      if (Array.from(params.keys()).length > 0) {
        const qpEmail = params.get('email');
        if (qpEmail) setEmail(qpEmail);
        // SECURITY: never pre-fill password from URL (audit 2026-03-29)
        window.history.replaceState({}, '', '/login');
      }
    } catch {
      // ignore
    }
  }, [nextPath, refreshUser, router]);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      router.push(nextPath);
    }
  }, [isAuthenticated, nextPath, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      router.push(nextPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    window.location.href = `${API_URL}/api/v1/auth/google`;
  };

  const handleGitHubLogin = () => {
    window.location.href = `${API_URL}/api/v1/auth/github`;
  };

  return (
    <Card className="bg-[#14151f] border-[rgba(255,255,255,0.07)] shadow-2xl">
      <CardHeader className="space-y-1 pb-4">
        <CardTitle className="text-2xl font-bold text-white text-center">
          Sign in
        </CardTitle>
        <CardDescription className="text-[#9ca3af] text-center">
          Enter your credentials to access your workspace
        </CardDescription>
      </CardHeader>

      <CardContent>
        {/* OAuth buttons */}
        <div className="space-y-3 mb-6">
          <Button
            type="button"
            onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-100 text-gray-900 font-medium h-10 transition-colors border border-gray-300"
          >
            <svg className="size-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Sign in with Google
          </Button>

          <Button
            type="button"
            onClick={handleGitHubLogin}
            className="w-full flex items-center justify-center gap-3 bg-[#24292e] hover:bg-[#1a1e22] text-white font-medium h-10 transition-colors"
          >
            <svg className="size-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
              <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
            </svg>
            Sign in with GitHub
          </Button>
        </div>

        {/* Divider */}
        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-[rgba(255,255,255,0.1)]" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-[#14151f] px-2 text-[#6b7280]">Or continue with email</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert className="bg-red-500/10 border-red-500/30 text-red-400">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="email" className="text-[#d1d5db] text-sm font-medium">
              Email address
            </Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-[#0a0b14] border-[rgba(255,255,255,0.1)] text-white placeholder-[#4b5563] focus-visible:ring-[#3b82f6] focus-visible:border-[#3b82f6]"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className="text-[#d1d5db] text-sm font-medium">
                Password
              </Label>
              <Link
                href="/forgot-password"
                className="text-xs text-[#3b82f6] hover:text-[#60a5fa] transition-colors"
              >
                Forgot password?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-[#0a0b14] border-[rgba(255,255,255,0.1)] text-white placeholder-[#4b5563] focus-visible:ring-[#3b82f6] focus-visible:border-[#3b82f6]"
            />
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-[#3b82f6] hover:bg-[#2563eb] text-white font-medium h-10 transition-colors"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg
                  className="animate-spin size-4"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Signing in...
              </span>
            ) : (
              'Sign in'
            )}
          </Button>
        </form>
      </CardContent>

      <CardFooter className="justify-center pt-0">
        <p className="text-sm text-[#9ca3af]">
          Don&apos;t have an account?{' '}
          <Link
            href="/register"
            className="text-[#3b82f6] hover:text-[#60a5fa] font-medium transition-colors"
          >
            Create one
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
