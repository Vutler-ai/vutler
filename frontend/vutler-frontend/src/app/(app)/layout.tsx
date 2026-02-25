'use client';

import AppShell from '@/components/app-shell';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell 
      pageTitle=""
      user={{ name: 'Alex Lopez', email: 'alex@vutler.com', initials: 'AL' }}
    >
      {children}
    </AppShell>
  );
}
