"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  MessageSquare,
  Wrench,
  ClipboardList,
  MoreHorizontal,
} from 'lucide-react';
import { useFeatures } from '@/hooks/useFeatures';

interface BottomNavProps {
  onMoreClick: () => void;
}

interface BottomNavItem {
  href: string;
  icon: typeof Home;
  label: string;
  feature?: string;
}

const NAV_ITEMS: BottomNavItem[] = [
  { href: '/dashboard', icon: Home, label: 'Home' },
  { href: '/chat', icon: MessageSquare, label: 'Chat', feature: 'chat' },
  { href: '/agents', icon: Wrench, label: 'Agents', feature: 'agents' },
  { href: '/tasks', icon: ClipboardList, label: 'Tasks', feature: 'tasks' },
];

export default function BottomNav({ onMoreClick }: BottomNavProps) {
  const pathname = usePathname();
  const { hasFeature, loading } = useFeatures();
  const visibleItems = NAV_ITEMS.filter((item) => !item.feature || (!loading && hasFeature(item.feature)));

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#0e0f1a]/95 backdrop-blur-xl border-t border-[rgba(255,255,255,0.07)] pb-[env(safe-area-inset-bottom,0px)]"
      role="navigation"
      aria-label="Mobile navigation"
    >
      <div className="flex items-center justify-around h-16">
        {visibleItems.map(({ href, icon: Icon, label }) => {
          const isActive =
            pathname === href || pathname?.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center justify-center flex-1 h-full gap-0.5 transition-colors ${
                isActive ? 'text-[#3b82f6]' : 'text-[#6b7280]'
              }`}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          );
        })}
        <button
          onClick={onMoreClick}
          className="flex flex-col items-center justify-center flex-1 h-full gap-0.5 text-[#6b7280] transition-colors"
          aria-label="More options"
        >
          <MoreHorizontal className="w-5 h-5" />
          <span className="text-[10px] font-medium">More</span>
        </button>
      </div>
    </nav>
  );
}
