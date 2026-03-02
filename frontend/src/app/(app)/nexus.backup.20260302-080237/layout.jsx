'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function NexusLayout({ children }) {
  const pathname = usePathname();

  const navItems = [
    { href: '/nexus/setup', label: 'Setup', icon: '🚀' },
    { href: '/nexus/dashboard', label: 'Dashboard', icon: '📊' },
    { href: '/nexus/tokens', label: 'Tokens', icon: '🔑' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nexus Navigation */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🎯</span>
              <span className="text-xl font-bold">Vutler Nexus</span>
            </div>
            <p className="text-sm text-gray-600">AI Agent Runtime Management</p>
          </div>

          <div className="flex gap-2">
            {navItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-4 py-2 rounded-md transition flex items-center gap-2 ${
                    isActive
                      ? 'bg-blue-100 text-blue-700 font-medium'
                      : 'text-gray-700 hover:bg-gray-100'
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

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-8 mt-16">
        <div className="max-w-6xl mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <h3 className="text-white font-semibold mb-2">Vutler Nexus</h3>
              <p className="text-sm">Complete AI agent runtime with cloud & local support</p>
            </div>
            <div>
              <h3 className="text-white font-semibold mb-2">Quick Links</h3>
              <ul className="text-sm space-y-1">
                <li><a href="/nexus/setup" className="hover:text-white">Setup Guide</a></li>
                <li><a href="/nexus/dashboard" className="hover:text-white">Dashboard</a></li>
                <li><a href="/nexus/tokens" className="hover:text-white">API Tokens</a></li>
              </ul>
            </div>
            <div>
              <h3 className="text-white font-semibold mb-2">Documentation</h3>
              <ul className="text-sm space-y-1">
                <li><a href="https://www.npmjs.com/package/vutler-nexus" className="hover:text-white" target="_blank">NPM Package</a></li>
                <li><a href="https://github.com/starbox-group/vutler" className="hover:text-white" target="_blank">GitHub</a></li>
                <li><a href="https://app.vutler.ai" className="hover:text-white" target="_blank">Main App</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 mt-8 pt-8 text-center text-sm">
            <p>© 2026 Starbox Group. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
