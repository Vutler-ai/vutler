'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';

interface NexusLayoutProps {
  children: ReactNode;
}

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

export default function NexusLayout({ children }: NexusLayoutProps) {
  const pathname = usePathname();

  const navItems: NavItem[] = [
    { href: '/nexus', label: 'Overview', icon: '🎯' },
    { href: '/nexus/setup', label: 'Setup', icon: '🚀' },
    { href: '/deployments', label: 'Deployments', icon: '🚀' },
    { href: '/clients', label: 'Clients', icon: '🏢' },
    { href: '/sandbox', label: 'Sandbox', icon: '🧪' },
  ];

  return (
    <div className="min-h-screen bg-[#0a0b14]">
      {/* Nexus Navigation */}
      <nav className="bg-[#14151f] border-b border-[rgba(255,255,255,0.07)] sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🎯</span>
              <span className="text-xl font-bold text-white">Vutler Nexus</span>
            </div>
            <p className="text-sm text-[#9ca3af]">AI Agent Runtime Management</p>
          </div>

          <div className="flex gap-2">
            {navItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-4 py-2 rounded-lg transition flex items-center gap-2 text-sm ${
                    isActive
                      ? 'bg-[#3b82f6]/20 text-[#3b82f6] font-medium'
                      : 'text-[#9ca3af] hover:bg-[rgba(255,255,255,0.05)] hover:text-white'
                  }`}
                >
                  <span>{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="py-8">
        {children}
      </main>
    </div>
  );
}
