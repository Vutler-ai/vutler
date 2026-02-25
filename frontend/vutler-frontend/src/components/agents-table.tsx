"use client";

import React, { useState } from 'react';

export interface Agent {
  id: string;
  name: string;
  type: string;
  model: string;
  status: 'active' | 'idle' | 'error' | 'offline';
  lastActive?: string;
}

interface AgentsTableProps {
  agents: Agent[];
  onAgentClick?: (agent: Agent) => void;
}

export default function AgentsTable({ agents, onAgentClick }: AgentsTableProps) {
  const [sortField, setSortField] = useState<keyof Agent>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const statusConfig = {
    active: { color: 'bg-[#22c55e]', text: 'text-[#22c55e]', label: 'Active' },
    idle: { color: 'bg-[#f59e0b]', text: 'text-[#f59e0b]', label: 'Idle' },
    error: { color: 'bg-red-500', text: 'text-red-500', label: 'Error' },
    offline: { color: 'bg-[#6b7280]', text: 'text-[#6b7280]', label: 'Offline' },
  };

  const handleSort = (field: keyof Agent) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortedAgents = [...agents].sort((a, b) => {
    const aVal = a[sortField];
    const bVal = b[sortField];
    const modifier = sortDirection === 'asc' ? 1 : -1;
    
    if (aVal === undefined || bVal === undefined) return 0;
    return aVal > bVal ? modifier : -modifier;
  });

  return (
    <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl overflow-hidden">
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full">
          <thead className="bg-[#0e0f1a] border-b border-[rgba(255,255,255,0.07)]">
            <tr>
              <th
                className="px-6 py-4 text-left text-xs font-semibold text-[#9ca3af] uppercase tracking-wider cursor-pointer hover:text-white motion-safe:transition-colors motion-safe:duration-200 focus:outline-none focus:text-white"
                onClick={() => handleSort('name')}
                onKeyDown={(e) => e.key === 'Enter' && handleSort('name')}
                tabIndex={0}
                role="button"
                aria-label="Sort by name"
              >
                <div className="flex items-center space-x-1">
                  <span>Name</span>
                  {sortField === 'name' && (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      {sortDirection === 'asc' ? (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      ) : (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      )}
                    </svg>
                  )}
                </div>
              </th>
              <th
                className="px-6 py-4 text-left text-xs font-semibold text-[#9ca3af] uppercase tracking-wider cursor-pointer hover:text-white motion-safe:transition-colors motion-safe:duration-200 focus:outline-none focus:text-white"
                onClick={() => handleSort('type')}
                onKeyDown={(e) => e.key === 'Enter' && handleSort('type')}
                tabIndex={0}
                role="button"
                aria-label="Sort by type"
              >
                <div className="flex items-center space-x-1">
                  <span>Type</span>
                  {sortField === 'type' && (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      {sortDirection === 'asc' ? (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      ) : (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      )}
                    </svg>
                  )}
                </div>
              </th>
              <th
                className="px-6 py-4 text-left text-xs font-semibold text-[#9ca3af] uppercase tracking-wider cursor-pointer hover:text-white motion-safe:transition-colors motion-safe:duration-200 focus:outline-none focus:text-white"
                onClick={() => handleSort('model')}
                onKeyDown={(e) => e.key === 'Enter' && handleSort('model')}
                tabIndex={0}
                role="button"
                aria-label="Sort by model"
              >
                <div className="flex items-center space-x-1">
                  <span>Model</span>
                  {sortField === 'model' && (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      {sortDirection === 'asc' ? (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      ) : (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      )}
                    </svg>
                  )}
                </div>
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-[#9ca3af] uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-[#9ca3af] uppercase tracking-wider">
                Last Active
              </th>
              <th className="px-6 py-4 text-right text-xs font-semibold text-[#9ca3af] uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgba(255,255,255,0.07)]">
            {sortedAgents.map((agent) => (
              <tr
                key={agent.id}
                className="hover:bg-[#0e0f1a] motion-safe:transition-colors motion-safe:duration-200 cursor-pointer focus-within:bg-[#0e0f1a]"
                onClick={() => onAgentClick?.(agent)}
                onKeyDown={(e) => e.key === 'Enter' && onAgentClick?.(agent)}
                tabIndex={0}
                role="button"
              >
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#3b82f6] to-[#a855f7] flex items-center justify-center text-white font-semibold text-sm" aria-hidden="true">
                      {agent.name.substring(0, 2).toUpperCase()}
                    </div>
                    <span className="text-sm font-medium text-white">{agent.name}</span>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="text-sm text-[#9ca3af]">{agent.type}</span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="text-sm text-[#9ca3af] font-mono">{agent.model}</span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="inline-flex items-center space-x-2 px-2.5 py-1 rounded-full bg-[rgba(255,255,255,0.05)] whitespace-nowrap">
                    <span className={`w-2 h-2 rounded-full ${statusConfig[agent.status].color}`} aria-hidden="true" />
                    <span className={`text-sm font-medium ${statusConfig[agent.status].text}`}>
                      {statusConfig[agent.status].label}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="text-sm text-[#6b7280]">{agent.lastActive || 'N/A'}</span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      // Handle action
                    }}
                    className="text-[#3b82f6] hover:text-[#2563eb] text-sm font-medium motion-safe:transition-colors motion-safe:duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#3b82f6] focus:ring-offset-2 focus:ring-offset-[#14151f] rounded px-2 py-1"
                    aria-label={`Manage ${agent.name}`}
                  >
                    Manage
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden divide-y divide-[rgba(255,255,255,0.07)]">
        {sortedAgents.map((agent) => (
          <button
            key={agent.id}
            className="w-full p-4 hover:bg-[#0e0f1a] motion-safe:transition-colors motion-safe:duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#3b82f6] text-left"
            onClick={() => onAgentClick?.(agent)}
            aria-label={`View ${agent.name} details`}
          >
            <div className="flex items-start space-x-3">
              <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-[#3b82f6] to-[#a855f7] flex items-center justify-center text-white font-semibold flex-shrink-0" aria-hidden="true">
                {agent.name.substring(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-sm font-medium text-white truncate">{agent.name}</h3>
                  <div className="inline-flex items-center space-x-1 ml-2 px-2 py-0.5 rounded-full bg-[rgba(255,255,255,0.05)] whitespace-nowrap">
                    <span className={`w-2 h-2 rounded-full ${statusConfig[agent.status].color}`} aria-hidden="true" />
                    <span className={`text-xs font-medium ${statusConfig[agent.status].text}`}>
                      {statusConfig[agent.status].label}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-[#9ca3af] mb-1">{agent.type}</p>
                <p className="text-xs text-[#6b7280] font-mono mb-2">{agent.model}</p>
                {agent.lastActive && (
                  <p className="text-xs text-[#6b7280]">Last active: {agent.lastActive}</p>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Empty state */}
      {agents.length === 0 && (
        <div className="py-12 text-center">
          <svg className="w-12 h-12 mx-auto text-[#6b7280] mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <p className="text-sm text-[#9ca3af]">No agents found</p>
        </div>
      )}
    </div>
  );
}
