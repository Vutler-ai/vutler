"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import {
  Home,
  MessageSquare,
  FlaskConical,
  Mail,
  Link2,
  ClipboardList,
  CalendarDays,
  FolderOpen,
  Wrench,
  Server,
  Settings,
  BarChart2,
  CreditCard,
  SlidersHorizontal,
  ChevronLeft,
  MoreHorizontal,
  Brain,
  Key,
  LogOut,
} from 'lucide-react';
import { useFeatures } from '@/hooks/useFeatures';
import { useAuth } from '@/lib/auth/auth-context';
import { getAgents } from '@/lib/api/endpoints/agents';

// ─── Types ────────────────────────────────────────────────────────────────────

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  badge?: string;
  external?: boolean;
  feature?: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

interface AppSidebarProps {
  user?: {
    name: string;
    email: string;
    initials?: string;
  };
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const SIDEBAR_WIDTH = 256;       // w-64
export const SIDEBAR_COLLAPSED_WIDTH = 64; // w-16

// ─── Navigation data ──────────────────────────────────────────────────────────

const sections: NavSection[] = [
  {
    title: 'Workspace',
    items: [
      {
        label: 'Dashboard',
        href: '/dashboard',
        icon: <Home className="w-5 h-5 flex-shrink-0" />,
      },
      {
        label: 'Chat',
        href: '/chat',
        feature: 'chat',
        icon: <MessageSquare className="w-5 h-5 flex-shrink-0" />,
      },
      {
        label: 'Tasks',
        href: '/tasks',
        feature: 'tasks',
        icon: <ClipboardList className="w-5 h-5 flex-shrink-0" />,
      },
      {
        label: 'Email',
        href: '/email',
        feature: 'email',
        icon: <Mail className="w-5 h-5 flex-shrink-0" />,
      },
      {
        label: 'Drive',
        href: '/drive',
        feature: 'drive',
        icon: <FolderOpen className="w-5 h-5 flex-shrink-0" />,
      },
      {
        label: 'Calendar',
        href: '/calendar',
        feature: 'calendar',
        icon: <CalendarDays className="w-5 h-5 flex-shrink-0" />,
      },
      {
        label: 'Memory',
        href: '/memory',
        icon: <Brain className="w-5 h-5 flex-shrink-0" />,
      },
    ],
  },
  {
    title: 'Agents',
    items: [
      {
        label: 'Agents',
        href: '/agents',
        feature: 'agents',
        icon: <Wrench className="w-5 h-5 flex-shrink-0" />,
      },
      {
        label: 'Nexus',
        href: '/nexus',
        feature: 'nexus',
        icon: <Server className="w-5 h-5 flex-shrink-0" />,
      },
      {
        label: 'Sandbox',
        href: '/sandbox',
        feature: 'sandbox',
        icon: <FlaskConical className="w-5 h-5 flex-shrink-0" />,
      },
    ],
  },
  {
    title: 'Config',
    items: [
      {
        label: 'Providers',
        href: '/providers',
        feature: 'providers',
        icon: <SlidersHorizontal className="w-5 h-5 flex-shrink-0" />,
      },
      {
        label: 'Integrations',
        href: '/integrations',
        feature: 'integrations',
        icon: <Link2 className="w-5 h-5 flex-shrink-0" />,
      },
      {
        label: 'Billing',
        href: '/billing',
        icon: <CreditCard className="w-5 h-5 flex-shrink-0" />,
      },
      {
        label: 'Usage',
        href: '/usage',
        icon: <BarChart2 className="w-5 h-5 flex-shrink-0" />,
      },
      {
        label: 'Settings',
        href: '/settings',
        icon: <Settings className="w-5 h-5 flex-shrink-0" />,
      },
    ],
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function AppSidebar({
  user: userProp,
  mobileOpen = false,
  onMobileClose,
}: AppSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const touchStartX = useRef(0);
  const touchCurrentX = useRef(0);
  const pathname = usePathname();
  const router = useRouter();
  const { features, hasFeature, loading } = useFeatures();
  const { user: authUser, logout } = useAuth();
  const [hasSandboxAgent, setHasSandboxAgent] = useState(false);

  // Resolve user from auth context or prop fallback
  const resolvedUser = authUser
    ? {
        name: authUser.display_name || authUser.email || 'User',
        email: authUser.email || '',
      }
    : userProp ?? { name: 'User', email: '' };
  const sandboxFeatureEnabled = features.includes('*') || features.includes('sandbox');

  // Persist collapsed state
  useEffect(() => {
    const saved = localStorage.getItem('sidebar-collapsed');
    if (saved === 'true') setCollapsed(true);
  }, []);

  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', String(collapsed));
    window.dispatchEvent(new CustomEvent('sidebar-toggle', { detail: { collapsed } }));
  }, [collapsed]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  useEffect(() => {
    let cancelled = false;

    if (loading || !sandboxFeatureEnabled) {
      setHasSandboxAgent(false);
      return () => {
        cancelled = true;
      };
    }

    const role = String(authUser?.role || '').toLowerCase();
    if (role === 'admin' || role === 'developer') {
      setHasSandboxAgent(true);
      return () => {
        cancelled = true;
      };
    }

    getAgents()
      .then((agents) => {
        if (cancelled) return;
        setHasSandboxAgent(
          agents.some((agent) => Array.isArray(agent.capabilities) && agent.capabilities.includes('code_execution'))
        );
      })
      .catch(() => {
        if (!cancelled) setHasSandboxAgent(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authUser?.role, loading, sandboxFeatureEnabled]);

  // Close sidebar on navigation (mobile)
  useEffect(() => {
    if (mobileOpen && onMobileClose) {
      onMobileClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // ─── Swipe gesture to close sidebar on mobile ───
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchCurrentX.current = e.touches[0].clientX;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    touchCurrentX.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback(() => {
    const diff = touchStartX.current - touchCurrentX.current;
    // Swipe left to close (>80px threshold)
    if (diff > 80 && mobileOpen && onMobileClose) {
      onMobileClose();
    }
  }, [mobileOpen, onMobileClose]);

  // ─── Swipe from left edge to open sidebar ───
  useEffect(() => {
    let startX = 0;
    const onTouchStart = (e: TouchEvent) => {
      startX = e.touches[0].clientX;
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (startX < 20 && e.changedTouches[0].clientX > 80 && !mobileOpen) {
        // Swiped from left edge to right → open sidebar
        // Dispatch a custom event that AppShell listens to
        window.dispatchEvent(new CustomEvent('mobile-sidebar-open'));
      }
    };
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchend', onTouchEnd);
    };
  }, [mobileOpen]);

  const handleLogout = async () => {
    setMenuOpen(false);
    await logout();
    router.push('/login');
  };

  const initials =
    resolvedUser.name
      .split(' ')
      .map((n: string) => n[0] || '')
      .join('')
      .toUpperCase()
      .slice(0, 2) || 'U';

  const sidebarWidth = collapsed ? 'w-16' : 'w-64';

  // Filter items based on feature flags
  const getVisibleItems = (items: NavItem[]) =>
    items.filter((item) => {
      if (item.href === '/sandbox' && !hasSandboxAgent) return false;
      return !item.feature || (!loading && hasFeature(item.feature));
    });

  const sidebarContent = (
    <aside
      ref={sidebarRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className={`
        fixed top-0 left-0 h-dvh ${sidebarWidth} bg-[#0e0f1a] border-r border-[rgba(255,255,255,0.07)]
        pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]
        flex flex-col z-40 transition-all duration-300 ease-in-out
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0
      `}
      role="navigation"
      aria-label="Main navigation"
    >
      {/* Logo + collapse toggle */}
      <div className="p-4 border-b border-[rgba(255,255,255,0.07)] flex items-center justify-between">
        {!collapsed && (
          <div className="flex items-center space-x-3">
            <Image
              src="/landing/vutler-logo-full-white.png"
              alt="Vutler"
              className="h-7"
              width={112}
              height={28}
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                const fb = e.currentTarget.nextElementSibling as HTMLElement;
                if (fb) fb.style.display = 'block';
              }}
            />
            <span className="text-lg font-bold text-white hidden">Vutler</span>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden lg:flex p-1.5 rounded-lg text-[#6b7280] hover:text-white hover:bg-[#14151f] transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#3b82f6]"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <ChevronLeft
            className={`w-5 h-5 transition-transform ${collapsed ? 'rotate-180' : ''}`}
          />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-2">
        {sections.map((section, idx) => {
          const visibleItems = getVisibleItems(section.items);
          if (visibleItems.length === 0) return null;

          return (
            <div key={idx} className="mb-5">
              {!collapsed && (
                <h3 className="px-3 mb-2 text-xs font-semibold text-[#6b7280] uppercase tracking-wider">
                  {section.title}
                </h3>
              )}
              {collapsed && idx > 0 && (
                <div className="mx-2 my-2 border-t border-[rgba(255,255,255,0.07)]" />
              )}
              <ul className="space-y-0.5" role="list">
                {visibleItems.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    (item.href !== '/' && pathname?.startsWith(item.href));

                  const linkClasses = `
                    flex items-center ${collapsed ? 'justify-center' : 'space-x-3'} px-3 py-2.5 rounded-lg transition-colors duration-200 cursor-pointer
                    focus:outline-none focus:ring-2 focus:ring-[#3b82f6]
                    ${
                      isActive
                        ? 'bg-[#3b82f6] text-white'
                        : 'text-[#9ca3af] hover:bg-[#14151f] hover:text-white'
                    }
                  `;

                  return (
                    <li key={item.href}>
                      {item.external ? (
                        <a
                          href={item.href}
                          onClick={onMobileClose}
                          title={collapsed ? item.label : undefined}
                          className={linkClasses}
                        >
                          <span aria-hidden="true">{item.icon}</span>
                          {!collapsed && (
                            <span className="text-sm font-medium">{item.label}</span>
                          )}
                        </a>
                      ) : (
                        <Link
                          href={item.href}
                          onClick={onMobileClose}
                          title={collapsed ? item.label : undefined}
                          className={linkClasses}
                          aria-current={isActive ? 'page' : undefined}
                        >
                          <span aria-hidden="true">{item.icon}</span>
                          {!collapsed && (
                            <span className="text-sm font-medium">{item.label}</span>
                          )}
                          {!collapsed && item.badge && (
                            <span className="ml-auto text-xs bg-[#3b82f6]/20 text-[#3b82f6] px-2 py-0.5 rounded-full">
                              {item.badge}
                            </span>
                          )}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      {/* User profile */}
      <div className="p-3 border-t border-[rgba(255,255,255,0.07)] relative" ref={menuRef}>
        {/* Dropdown menu */}
        {menuOpen && (
          <div className="absolute bottom-full left-3 right-3 mb-2 bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl shadow-xl overflow-hidden z-50">
            <Link
              href="/settings"
              onClick={() => setMenuOpen(false)}
              className="flex items-center space-x-3 px-4 py-2.5 text-sm text-[#9ca3af] hover:bg-[#1e1f2e] hover:text-white transition-colors"
            >
              <Settings className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
              <span>Settings</span>
            </Link>
            <Link
              href="/billing"
              onClick={() => setMenuOpen(false)}
              className="flex items-center space-x-3 px-4 py-2.5 text-sm text-[#9ca3af] hover:bg-[#1e1f2e] hover:text-white transition-colors"
            >
              <CreditCard className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
              <span>Billing</span>
            </Link>
            <Link
              href="/settings?tab=api-keys"
              onClick={() => setMenuOpen(false)}
              className="flex items-center space-x-3 px-4 py-2.5 text-sm text-[#9ca3af] hover:bg-[#1e1f2e] hover:text-white transition-colors"
            >
              <Key className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
              <span>API Keys</span>
            </Link>
            <div className="border-t border-[rgba(255,255,255,0.07)] my-1" />
            <button
              onClick={handleLogout}
              className="w-full flex items-center space-x-3 px-4 py-2.5 text-sm text-red-400 hover:bg-[#1e1f2e] hover:text-red-300 transition-colors"
            >
              <LogOut className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
              <span>Sign Out</span>
            </button>
          </div>
        )}

        <button
          onClick={() => setMenuOpen((prev) => !prev)}
          className={`w-full flex items-center ${collapsed ? 'justify-center' : 'space-x-3'} px-2 py-2 rounded-lg hover:bg-[#14151f] transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#3b82f6]`}
          aria-label="User menu"
          aria-expanded={menuOpen}
          title={collapsed ? resolvedUser.name : undefined}
        >
          <div
            className="w-8 h-8 rounded-full bg-gradient-to-br from-[#a855f7] to-[#3b82f6] flex items-center justify-center text-white font-semibold text-xs flex-shrink-0"
            aria-hidden="true"
          >
            {initials}
          </div>
          {!collapsed && (
            <>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-medium text-white truncate">{resolvedUser.name}</p>
                <p className="text-xs text-[#6b7280] truncate">{resolvedUser.email}</p>
              </div>
              <MoreHorizontal className="w-4 h-4 text-[#6b7280] flex-shrink-0" aria-hidden="true" />
            </>
          )}
        </button>
      </div>
    </aside>
  );

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}
      {sidebarContent}
    </>
  );
}
