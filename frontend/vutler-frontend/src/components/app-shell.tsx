"use client";

import React, { useState, useEffect } from 'react';
import Sidebar from './sidebar';

interface AppShellProps {
  children: React.ReactNode;
  pageTitle?: string;
  user?: {
    name: string;
    email: string;
    initials?: string;
  };
}

export default function AppShell({
  children,
  user = { name: 'Alex Lopez', email: 'alex@vutler.com', initials: 'AL' },
}: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);

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

  return (
    <div className="min-h-screen bg-[#08090f]">
      <Sidebar user={user} />
      <div className={`transition-all duration-300 ${collapsed ? 'lg:pl-16' : 'lg:pl-64'}`}>
        <main className="p-6">
          {children}
        </main>
        <footer className="px-6 py-4 border-t border-[rgba(255,255,255,0.07)] mt-12">
          <div className="flex flex-col sm:flex-row items-center justify-between space-y-2 sm:space-y-0">
            <p className="text-sm text-[#6b7280]">
              © {new Date().getFullYear()} Vutler. All rights reserved.
            </p>
            <nav className="flex items-center space-x-6" role="navigation" aria-label="Footer navigation">
              <a href="/docs" className="text-sm text-[#9ca3af] hover:text-white transition-colors">Documentation</a>
              <a href="/support" className="text-sm text-[#9ca3af] hover:text-white transition-colors">Support</a>
              <a href="/privacy" className="text-sm text-[#9ca3af] hover:text-white transition-colors">Privacy</a>
            </nav>
          </div>
        </footer>
      </div>
    </div>
  );
}
