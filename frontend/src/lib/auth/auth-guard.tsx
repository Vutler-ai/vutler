'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './auth-context';
import { Skeleton } from '@/components/ui/skeleton';

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push('/login');
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
    // Will redirect via useEffect above, render nothing in the meantime
    return null;
  }

  return <>{children}</>;
}
