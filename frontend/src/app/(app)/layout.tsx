'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated } from '@/lib/api';
import AppShell from '@/components/app-shell';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    const ok = isAuthenticated();
    setAuthed(ok);
    setAuthChecked(true);
    if (!ok) {
      router.push('/login');
    }
  }, [router]);

  // Show nothing until auth check completes (avoids hydration mismatch)
  if (!authChecked) {
    return null;
  }

  if (!authed) {
    return null;
  }

  return (
    <AppShell
      pageTitle=""
      user={{ name: 'Alex Lopez', email: 'alex@vutler.com', initials: 'AL' }}
    >
      {children}
    </AppShell>
  );
}
