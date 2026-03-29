"use client";

import React from 'react';
import { useIsMobile } from '@/hooks/use-mobile';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Column<T> {
  key: string;
  header: string;
  /** Render cell content for desktop table */
  render: (row: T) => React.ReactNode;
  /** Hide this column on mobile card view */
  hideOnMobile?: boolean;
}

interface ResponsiveTableProps<T> {
  columns: Column<T>[];
  data: T[];
  /** Render a mobile card for each row. If not provided, auto-generates from columns. */
  renderMobileCard?: (row: T, index: number) => React.ReactNode;
  /** Key extractor for list rendering */
  getKey: (row: T) => string;
  /** Empty state message */
  emptyMessage?: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ResponsiveTable<T>({
  columns,
  data,
  renderMobileCard,
  getKey,
  emptyMessage = 'No data',
}: ResponsiveTableProps<T>) {
  const isMobile = useIsMobile();

  if (data.length === 0) {
    return (
      <div className="text-center py-12 text-[#6b7280] text-sm">
        {emptyMessage}
      </div>
    );
  }

  // ─── Mobile card view ───
  if (isMobile) {
    if (renderMobileCard) {
      return (
        <div className="space-y-3">
          {data.map((row, i) => (
            <React.Fragment key={getKey(row)}>
              {renderMobileCard(row, i)}
            </React.Fragment>
          ))}
        </div>
      );
    }

    // Auto-generate cards from columns
    const mobileColumns = columns.filter((c) => !c.hideOnMobile);
    return (
      <div className="space-y-3">
        {data.map((row) => (
          <div
            key={getKey(row)}
            className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-4 space-y-2"
          >
            {mobileColumns.map((col) => (
              <div key={col.key} className="flex items-center justify-between gap-2">
                <span className="text-xs text-[#6b7280] flex-shrink-0">
                  {col.header}
                </span>
                <span className="text-sm text-white text-right truncate">
                  {col.render(row)}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  // ─── Desktop table view ───
  return (
    <div className="overflow-x-auto rounded-xl border border-[rgba(255,255,255,0.07)]">
      <table className="w-full">
        <thead>
          <tr className="border-b border-[rgba(255,255,255,0.07)]">
            {columns.map((col) => (
              <th
                key={col.key}
                className="px-4 py-3 text-left text-xs font-medium text-[#6b7280] uppercase tracking-wider"
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[rgba(255,255,255,0.05)]">
          {data.map((row) => (
            <tr
              key={getKey(row)}
              className="hover:bg-[rgba(255,255,255,0.02)] transition-colors"
            >
              {columns.map((col) => (
                <td key={col.key} className="px-4 py-3 text-sm text-white">
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
