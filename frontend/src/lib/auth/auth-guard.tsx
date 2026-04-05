'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './auth-context';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.replace('/login');

      const timeout = window.setTimeout(() => {
        window.location.replace('/login');
      }, 300);

      return () => window.clearTimeout(timeout);
    }
  }, [loading, isAuthenticated, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#08090f] p-6">
        <div className="space-y-4 max-w-7xl mx-auto">
          <Skeleton className="h-10 w-48 bg-[#14151f]" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Skeleton className="h-32 bg-[#14151f]" />
            <Skeleton className="h-32 bg-[#14151f]" />
            <Skeleton className="h-32 bg-[#14151f]" />
          </div>
          <Skeleton className="h-64 bg-[#14151f]" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#08090f] flex items-center justify-center px-6">
        <div className="w-full max-w-sm rounded-2xl border border-[rgba(255,255,255,0.07)] bg-[#14151f] p-6 text-center shadow-2xl">
          <h1 className="text-lg font-semibold text-white">Opening Vutler</h1>
          <p className="mt-2 text-sm text-[#9ca3af]">
            Redirecting to the sign-in screen.
          </p>
          <Button
            className="mt-5 w-full bg-[#3b82f6] text-white hover:bg-[#2563eb]"
            onClick={() => window.location.replace('/login')}
          >
            Continue to login
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
