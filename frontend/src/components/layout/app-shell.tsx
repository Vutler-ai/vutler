"use client";

import React, { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import AppSidebar from './app-sidebar';
import AppHeader from './app-header';
import BottomNav from './bottom-nav';
import OfflineBanner from '../offline-banner';
import PushPermission from '../push-permission';
import { CookieSettingsButton } from '@/components/legal/cookie-settings-button';
import { useAuth } from '@/lib/auth/auth-context';
import { useFeatures } from '@/hooks/useFeatures';
import { findGuardedFeature } from '@/lib/auth/route-access';

interface AppShellProps {
  children: React.ReactNode;
  pageTitle?: string;
  user?: {
    name: string;
    email: string;
    initials?: string;
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AppShell({
  children,
  user: userProp,
}: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user: authUser, logout } = useAuth();
  const { hasFeature, loading: featuresLoading } = useFeatures();
  const pathname = usePathname();
  const router = useRouter();

  // Resolve user from auth context or prop fallback
  const user = authUser
    ? {
        name: authUser.display_name || authUser.email || 'User',
        email: authUser.email || '',
        initials: (authUser.display_name || authUser.email || 'U')
          .split(' ')
          .map((n: string) => n[0] || '')
          .join('')
          .toUpperCase()
          .slice(0, 2) || 'U',
      }
    : userProp ?? { name: 'User', email: '', initials: 'U' };

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // best effort
    } finally {
      window.location.href = '/login';
    }
  };

  // Sync collapsed state from sidebar custom event
  useEffect(() => {
    const saved = localStorage.getItem('sidebar-collapsed');
    if (saved === 'true') setCollapsed(true);

    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setCollapsed(detail.collapsed);
    };
    window.addEventListener('sidebar-toggle', handler);
    return () => window.removeEventListener('sidebar-toggle', handler);
  }, []);

  useEffect(() => {
    if (featuresLoading || !pathname) return;

    const guardedFeature = findGuardedFeature(pathname);
    if (!guardedFeature || hasFeature(guardedFeature)) return;

    router.replace(`/upgrade/${guardedFeature}?from=${encodeURIComponent(pathname)}`);
  }, [featuresLoading, hasFeature, pathname, router]);

  useEffect(() => {
    const handleMobileSidebarOpen = () => setMobileOpen(true);
    window.addEventListener('mobile-sidebar-open', handleMobileSidebarOpen);
    return () => window.removeEventListener('mobile-sidebar-open', handleMobileSidebarOpen);
  }, []);

  return (
    <div className="min-h-dvh bg-[#08090f]">
      {/* Offline indicator */}
      <OfflineBanner />

      <AppSidebar
        user={user}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <div className={`transition-all duration-300 ${collapsed ? 'lg:pl-16' : 'lg:pl-64'}`}>
        <AppHeader
          user={user}
          onMenuClick={() => setMobileOpen(!mobileOpen)}
          onLogout={handleLogout}
        />

        {/* Main content — add bottom padding on mobile for BottomNav */}
        <main className="p-4 sm:p-6 pb-[calc(env(safe-area-inset-bottom,0px)+5.5rem)] lg:pb-6">
          {children}
        </main>

        {/* Footer — hidden on mobile (BottomNav takes its place) */}
        <footer className="hidden lg:block px-6 pt-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] border-t border-[rgba(255,255,255,0.07)] mt-12">
          <div className="flex flex-col sm:flex-row items-center justify-between space-y-2 sm:space-y-0">
            <p className="text-sm text-[#6b7280]">
              &copy; {new Date().getFullYear()} Vutler. All rights reserved.
            </p>
            <nav
              className="flex items-center space-x-6"
              role="navigation"
              aria-label="Footer navigation"
            >
              <a
                href="/docs"
                className="text-sm text-[#9ca3af] hover:text-white transition-colors"
              >
                Documentation
              </a>
              <a
                href="/support"
                className="text-sm text-[#9ca3af] hover:text-white transition-colors"
              >
                Support
              </a>
              <a
                href="/privacy"
                className="text-sm text-[#9ca3af] hover:text-white transition-colors"
              >
                Privacy
              </a>
              <CookieSettingsButton
                variant="link"
                className="h-auto p-0 text-sm text-[#9ca3af] hover:text-white"
              />
            </nav>
          </div>
        </footer>
      </div>

      {/* Mobile bottom navigation */}
      <BottomNav onMoreClick={() => setMobileOpen(true)} />

      <PushPermission />
    </div>
  );
}
