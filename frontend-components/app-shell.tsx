"use client";

import React from 'react';
import Sidebar from './sidebar';
import Topbar from './topbar';

interface AppShellProps {
  children: React.ReactNode;
  pageTitle: string;
  pageSubtitle?: string;
  topbarActions?: React.ReactNode;
  user?: {
    name: string;
    email: string;
    initials?: string;
  };
}

export default function AppShell({
  children,
  pageTitle,
  pageSubtitle,
  topbarActions,
  user,
}: AppShellProps) {
  return (
    <div className="min-h-screen bg-[#08090f]">
      {/* Sidebar */}
      <Sidebar user={user} />

      {/* Main content area */}
      <div className="lg:pl-64">
        {/* Topbar */}
        <Topbar
          title={pageTitle}
          subtitle={pageSubtitle}
          actions={topbarActions}
        />

        {/* Page content */}
        <main className="p-6">
          {children}
        </main>

        {/* Footer */}
        <footer className="px-6 py-4 border-t border-[rgba(255,255,255,0.07)] mt-12">
          <div className="flex flex-col sm:flex-row items-center justify-between space-y-2 sm:space-y-0">
            <p className="text-sm text-[#6b7280]">
              © {new Date().getFullYear()} Vutler. All rights reserved.
            </p>
            <nav className="flex items-center space-x-6" role="navigation" aria-label="Footer navigation">
              <a 
                href="/docs" 
                className="text-sm text-[#9ca3af] hover:text-white motion-safe:transition-colors motion-safe:duration-200 focus:outline-none focus:ring-2 focus:ring-[#3b82f6] rounded px-1"
              >
                Documentation
              </a>
              <a 
                href="/support" 
                className="text-sm text-[#9ca3af] hover:text-white motion-safe:transition-colors motion-safe:duration-200 focus:outline-none focus:ring-2 focus:ring-[#3b82f6] rounded px-1"
              >
                Support
              </a>
              <a 
                href="/privacy" 
                className="text-sm text-[#9ca3af] hover:text-white motion-safe:transition-colors motion-safe:duration-200 focus:outline-none focus:ring-2 focus:ring-[#3b82f6] rounded px-1"
              >
                Privacy
              </a>
            </nav>
          </div>
        </footer>
      </div>
    </div>
  );
}
