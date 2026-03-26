'use client';

import { AuthProvider, useAuth } from '@/lib/auth/auth-context';
import { AuthGuard } from '@/lib/auth/auth-guard';
import AppShell from '@/components/layout/app-shell';
import { FeaturesProvider } from '@/components/features-provider';
import { ErrorBoundary } from '@/components/error-boundary';
import { TooltipProvider } from '@/components/ui/tooltip';

// Inner component so it can access AuthContext
function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  const shellUser = user
    ? {
        name: user.display_name || user.email || 'User',
        email: user.email || '',
        initials: user.display_name
          ? user.display_name
              .split(' ')
              .map((n: string) => n[0] || '')
              .join('')
              .toUpperCase()
              .slice(0, 2) || 'U'
          : (user.email || 'U').slice(0, 2).toUpperCase(),
      }
    : { name: 'User', email: '', initials: 'U' };

  return (
    <TooltipProvider>
      <FeaturesProvider>
        <AppShell pageTitle="" user={shellUser}>
          <ErrorBoundary>{children}</ErrorBoundary>
        </AppShell>
      </FeaturesProvider>
    </TooltipProvider>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AuthGuard>
        <AuthenticatedLayout>{children}</AuthenticatedLayout>
      </AuthGuard>
    </AuthProvider>
  );
}
