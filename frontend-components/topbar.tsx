"use client";

import React from 'react';

interface TopbarProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export default function Topbar({ title, subtitle, actions }: TopbarProps) {
  return (
    <header className="sticky top-0 z-30 bg-[#08090f]/80 backdrop-blur-xl border-b border-[rgba(255,255,255,0.07)]">
      <div className="flex items-center justify-between px-6 py-4">
        {/* Title section */}
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-white truncate">{title}</h1>
          {subtitle && (
            <p className="mt-1 text-sm text-[#9ca3af] truncate">{subtitle}</p>
          )}
        </div>

        {/* Actions section */}
        {actions && (
          <div className="flex items-center space-x-3 ml-6">
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}

// Pre-built action button components
export function TopbarButton({
  children,
  onClick,
  variant = 'secondary',
  icon,
  disabled = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  icon?: React.ReactNode;
  disabled?: boolean;
}) {
  const variants = {
    primary: 'bg-[#3b82f6] hover:bg-[#2563eb] text-white disabled:bg-[#3b82f6]/50 disabled:cursor-not-allowed',
    secondary: 'bg-[#14151f] hover:bg-[#1a1b2e] text-white border border-[rgba(255,255,255,0.07)] disabled:opacity-50 disabled:cursor-not-allowed',
    danger: 'bg-red-600 hover:bg-red-700 text-white disabled:bg-red-600/50 disabled:cursor-not-allowed',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        flex items-center space-x-2 px-4 py-2 rounded-lg font-medium text-sm
        motion-safe:transition-colors motion-safe:duration-200 cursor-pointer
        focus:outline-none focus:ring-2 focus:ring-[#3b82f6] focus:ring-offset-2 focus:ring-offset-[#08090f]
        ${variants[variant]}
      `}
    >
      {icon && <span className="w-4 h-4" aria-hidden="true">{icon}</span>}
      <span>{children}</span>
    </button>
  );
}

export function TopbarIconButton({
  onClick,
  icon,
  label,
  disabled = false,
}: {
  onClick?: () => void;
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="min-w-[44px] min-h-[44px] p-2 rounded-lg bg-[#14151f] hover:bg-[#1a1b2e] text-[#9ca3af] hover:text-white border border-[rgba(255,255,255,0.07)] motion-safe:transition-colors motion-safe:duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#3b82f6] focus:ring-offset-2 focus:ring-offset-[#08090f]"
    >
      <span className="w-5 h-5 block" aria-hidden="true">{icon}</span>
    </button>
  );
}
