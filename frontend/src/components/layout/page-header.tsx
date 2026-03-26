import React from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PageHeaderProps {
  title: string;
  description?: string;
  children?: React.ReactNode;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PageHeader({ title, description, children }: PageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-white truncate">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-[#9ca3af] truncate">{description}</p>
        )}
      </div>
      {children && (
        <div className="flex items-center gap-3 flex-shrink-0">{children}</div>
      )}
    </div>
  );
}
