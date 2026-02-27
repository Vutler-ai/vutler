"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, MessageSquare, Building2, Users, Hammer, Mail,
  CheckSquare, CalendarDays, HardDrive, Server, Settings2, BarChart3,
  Settings, Play, FileCode, Store, ChevronLeft, LogOut, Ticket
} from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  badge?: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

interface SidebarProps {
  user?: {
    name: string;
    email: string;
    initials?: string;
  };
}

export default function Sidebar({ user = { name: 'User', email: 'user@vutler.com', initials: 'U' } }: SidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  // Persist collapsed state
  useEffect(() => {
    const saved = localStorage.getItem('sidebar-collapsed');
    if (saved === 'true') setCollapsed(true);
  }, []);

  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', String(collapsed));
    // Dispatch event so AppShell can adjust padding
    window.dispatchEvent(new CustomEvent('sidebar-toggle', { detail: { collapsed } }));
  }, [collapsed]);

  const sections: NavSection[] = [
    {
      title: 'Workspace',
      items: [
        {
          label: 'Dashboard',
          href: '/dashboard',
          icon: <LayoutDashboard className="w-5 h-5 flex-shrink-0" />,
        },
        {
          label: 'Chat',
          href: '/chat',
          icon: <MessageSquare className="w-5 h-5 flex-shrink-0" />,
        },
        {
          label: 'Pixel Office',
          href: '/chat/pixel',
          icon: <Building2 className="w-5 h-5 flex-shrink-0" />,
        },
        {
          label: 'Agents',
          href: '/agents',
          icon: <Users className="w-5 h-5 flex-shrink-0" />,
        },
        {
          label: 'Builder',
          href: '/builder',
          icon: <Hammer className="w-5 h-5 flex-shrink-0" />,
        },
      ],
    },
    {
      title: 'Tools',
      items: [
        {
          label: 'Email',
          href: '/email',
          icon: <Mail className="w-5 h-5 flex-shrink-0" />,
        },
        {
          label: 'Tasks',
          href: '/tasks',
          icon: <CheckSquare className="w-5 h-5 flex-shrink-0" />,
        },
        {
          label: 'Calendar',
          href: '/calendar',
          icon: <CalendarDays className="w-5 h-5 flex-shrink-0" />,
        },
        {
          label: 'Drive',
          href: '/drive',
          icon: <HardDrive className="w-5 h-5 flex-shrink-0" />,
        },
      ],
    },
    {
      title: 'Config',
      items: [
        {
          label: 'Providers',
          href: '/providers',
          icon: <Server className="w-5 h-5 flex-shrink-0" />,
        },
        {
          label: 'LLM Settings',
          href: '/llm-settings',
          icon: <Settings2 className="w-5 h-5 flex-shrink-0" />,
        },
        {
          label: 'Usage',
          href: '/usage',
          icon: <BarChart3 className="w-5 h-5 flex-shrink-0" />,
        },
        {
          label: 'Settings',
          href: '/settings',
          icon: <Settings className="w-5 h-5 flex-shrink-0" />,
        },
      ],
    },
    {
      title: 'Discover',
      items: [
        {
          label: 'Demo',
          href: '/demo',
          icon: <Play className="w-5 h-5 flex-shrink-0" />,
        },
        {
          label: 'Templates',
          href: '/templates',
          icon: <FileCode className="w-5 h-5 flex-shrink-0" />,
        },
        {
          label: 'Marketplace',
          href: '/marketplace',
          icon: <Store className="w-5 h-5 flex-shrink-0" />,
        },
      ],
    },
  ];

  const initials = user.initials || user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const sidebarWidth = collapsed ? 'w-16' : 'w-64';

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-[#14151f] border border-[rgba(255,255,255,0.07)] text-white hover:bg-[#1a1b2e] transition-colors duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#3b82f6]"
        aria-label={mobileOpen ? "Close menu" : "Open menu"}
      >
        {mobileOpen ? (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        )}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 h-screen ${sidebarWidth} bg-[#0e0f1a] border-r border-[rgba(255,255,255,0.07)]
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
              <img 
                src="/landing/vutler-logo-full-white.svg" 
                alt="Vutler" 
                className="h-7"
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
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <ChevronLeft className={`w-5 h-5 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-2">
          {sections.map((section, idx) => (
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
                {section.items.map((item) => {
                  const isActive = pathname === item.href || (item.href !== '/' && pathname?.startsWith(item.href));
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setMobileOpen(false)}
                        title={collapsed ? item.label : undefined}
                        className={`
                          flex items-center ${collapsed ? 'justify-center' : 'space-x-3'} px-3 py-2 rounded-lg transition-colors duration-200 cursor-pointer
                          focus:outline-none focus:ring-2 focus:ring-[#3b82f6]
                          ${isActive
                            ? 'bg-[#3b82f6] text-white'
                            : 'text-[#9ca3af] hover:bg-[#14151f] hover:text-white'
                          }
                        `}
                        aria-current={isActive ? 'page' : undefined}
                      >
                        <span aria-hidden="true">{item.icon}</span>
                        {!collapsed && <span className="text-sm font-medium">{item.label}</span>}
                        {!collapsed && item.badge && (
                          <span className="ml-auto text-xs bg-[#3b82f6]/20 text-[#3b82f6] px-2 py-0.5 rounded-full">{item.badge}</span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* User profile + Logout */}
        <div className="p-3 border-t border-[rgba(255,255,255,0.07)]">
          <div className={`flex items-center ${collapsed ? 'justify-center' : 'space-x-3'} px-2 py-2`}>
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#a855f7] to-[#3b82f6] flex items-center justify-center text-white font-semibold text-xs flex-shrink-0" aria-hidden="true">
              {initials}
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-medium text-white truncate">{user.name}</p>
                <p className="text-xs text-[#6b7280] truncate">{user.email}</p>
              </div>
            )}
            <button
              onClick={() => {
                localStorage.removeItem('authToken');
                localStorage.removeItem('userId');
                localStorage.removeItem('user');
                window.location.href = '/login';
              }}
              className={`${collapsed ? 'mt-2' : ''} p-1.5 rounded-lg text-[#6b7280] hover:text-red-400 hover:bg-[#14151f] transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-400`}
              aria-label="Logout"
              title="Logout"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

// Export collapsed width for AppShell
export const SIDEBAR_WIDTH = 256; // 16rem = w-64
export const SIDEBAR_COLLAPSED_WIDTH = 64; // 4rem = w-16
