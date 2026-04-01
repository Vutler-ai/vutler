'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { CookieSettingsButton } from '@/components/legal/cookie-settings-button';

function LandingNavbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-[#08090f]/90 backdrop-blur-md border-b border-white/5 shadow-lg'
          : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <Image
              src="/vutler-logo-full-white.png"
              alt="Vutler"
              width={120}
              height={32}
              priority
              className="h-8 w-auto"
            />
          </Link>

          {/* Desktop nav links */}
          <div className="hidden md:flex items-center gap-8">
            <Link href="/#features" className="text-sm text-white/60 hover:text-white transition-colors">
              Features
            </Link>
            <Link href="/pricing" className="text-sm text-white/60 hover:text-white transition-colors">
              Pricing
            </Link>
            <a href="https://docs.vutler.ai" target="_blank" rel="noopener noreferrer" className="text-sm text-white/60 hover:text-white transition-colors">
              Docs
            </a>
            <a href="https://github.com/Vutler-ai/vutler" target="_blank" rel="noopener noreferrer" className="text-sm text-white/60 hover:text-white transition-colors">
              About
            </a>
          </div>

          {/* Desktop CTAs */}
          <div className="hidden md:flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <a href="https://app.vutler.ai/login">Sign In</a>
            </Button>
            <Button size="sm" className="bg-blue-600 hover:bg-blue-500 text-white" asChild>
              <a href="https://app.vutler.ai/register">Get Started</a>
            </Button>
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden p-2 text-white/60 hover:text-white"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            <div className="w-5 h-0.5 bg-current mb-1 transition-all" />
            <div className="w-5 h-0.5 bg-current mb-1 transition-all" />
            <div className="w-5 h-0.5 bg-current transition-all" />
          </button>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="md:hidden border-t border-white/5 bg-[#08090f]/95 backdrop-blur-md py-4 space-y-2">
            <Link href="/#features" className="block px-4 py-2 text-sm text-white/60 hover:text-white" onClick={() => setMobileOpen(false)}>
              Features
            </Link>
            <Link href="/pricing" className="block px-4 py-2 text-sm text-white/60 hover:text-white" onClick={() => setMobileOpen(false)}>
              Pricing
            </Link>
            <a href="https://docs.vutler.ai" target="_blank" rel="noopener noreferrer" className="block px-4 py-2 text-sm text-white/60 hover:text-white">
              Docs
            </a>
            <a href="https://github.com/Vutler-ai/vutler" target="_blank" rel="noopener noreferrer" className="block px-4 py-2 text-sm text-white/60 hover:text-white">
              About
            </a>
            <div className="px-4 pt-2 flex gap-3">
              <Button variant="outline" size="sm" asChild className="flex-1">
                <a href="https://app.vutler.ai/login">Sign In</a>
              </Button>
              <Button size="sm" className="flex-1 bg-blue-600 hover:bg-blue-500 text-white" asChild>
                <a href="https://app.vutler.ai/register">Get Started</a>
              </Button>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}

function LandingFooter() {
  return (
    <footer className="border-t border-white/5 bg-[#08090f] pt-16 pb-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="inline-block mb-4">
              <Image
                src="/vutler-logo-full-white.png"
                alt="Vutler"
                width={120}
                height={32}
                className="h-8 w-auto"
              />
            </Link>
            <p className="text-sm text-white/40 leading-relaxed max-w-xs">
              AI-powered automation platform. Build your AI workforce or bring your own.
            </p>
            {/* Swiss hosting badge */}
            <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/5">
              <span className="text-lg">🇨🇭</span>
              <span className="text-xs text-white/60">Swiss Hosted · Geneva</span>
            </div>
          </div>

          {/* Product */}
          <div>
            <h4 className="text-sm font-semibold text-white mb-4">Product</h4>
            <ul className="space-y-2">
              <li><Link href="/#features" className="text-sm text-white/40 hover:text-white transition-colors">Features</Link></li>
              <li><Link href="/pricing" className="text-sm text-white/40 hover:text-white transition-colors">Pricing</Link></li>
              <li><a href="https://github.com/Vutler-ai/vutler" target="_blank" rel="noopener noreferrer" className="text-sm text-white/40 hover:text-white transition-colors">GitHub</a></li>
              <li><a href="https://docs.vutler.ai" target="_blank" rel="noopener noreferrer" className="text-sm text-white/40 hover:text-white transition-colors">Docs</a></li>
            </ul>
          </div>

          {/* Solutions */}
          <div>
            <h4 className="text-sm font-semibold text-white mb-4">Solutions</h4>
            <ul className="space-y-2">
              <li><Link href="/#office" className="text-sm text-white/40 hover:text-white transition-colors">Vutler Office</Link></li>
              <li><Link href="/#agents" className="text-sm text-white/40 hover:text-white transition-colors">Vutler Agents</Link></li>
              <li><Link href="/#mcp" className="text-sm text-white/40 hover:text-white transition-colors">MCP Server</Link></li>
              <li><Link href="/#integrations" className="text-sm text-white/40 hover:text-white transition-colors">Integrations</Link></li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="text-sm font-semibold text-white mb-4">Legal</h4>
            <ul className="space-y-2">
              <li><Link href="/privacy" className="text-sm text-white/40 hover:text-white transition-colors">Privacy Policy</Link></li>
              <li><Link href="/terms" className="text-sm text-white/40 hover:text-white transition-colors">Terms of Service</Link></li>
              <li><Link href="/cookies" className="text-sm text-white/40 hover:text-white transition-colors">Cookie Policy</Link></li>
              <li><Link href="/dpa" className="text-sm text-white/40 hover:text-white transition-colors">DPA</Link></li>
              <li><Link href="/subprocessors" className="text-sm text-white/40 hover:text-white transition-colors">Subprocessors</Link></li>
              <li><Link href="/legal-notice" className="text-sm text-white/40 hover:text-white transition-colors">Legal Notice</Link></li>
              <li><Link href="/security" className="text-sm text-white/40 hover:text-white transition-colors">Security</Link></li>
              <li><a href="mailto:info@starbox-group.com" className="text-sm text-white/40 hover:text-white transition-colors">Contact</a></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/5 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-white/30">
            &copy; {new Date().getFullYear()} Vutler. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            <CookieSettingsButton
              variant="link"
              className="h-auto p-0 text-xs text-white/30 hover:text-white/60"
            />
            <span className="text-xs text-white/20">AGPL-3.0 Licensed</span>
            <span className="text-white/10">·</span>
            <a href="https://github.com/Vutler-ai/vutler" target="_blank" rel="noopener noreferrer" className="text-xs text-white/30 hover:text-white/60 transition-colors">
              Open Source
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#08090f] text-white">
      <LandingNavbar />
      <main>{children}</main>
      <LandingFooter />
    </div>
  );
}
