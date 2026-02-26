"use client";

import React, { useState, useEffect } from 'react';
import StatCard, { StatIcons } from './stat-card';
import AgentsTable, { Agent } from './agents-table';
import { TopbarButton, TopbarIconButton } from './topbar';

interface DashboardData {
  success: boolean;
  agents: Agent[];
  stats: {
    totalAgents: number;
    activeAgents: number;
    messagesToday: number;
    totalTokens: number;
    uptimeHours: number;
    uptimeSeconds: number;
  };
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/v1/dashboard')
      .then(r => r.json())
      .then(result => {
        // Normalize API response to expected format
        const normalized: DashboardData = result.stats ? result : {
          success: true,
          agents: result.agentsList || [],
          stats: {
            totalAgents: result.agents || 0,
            activeAgents: result.agents || 0,
            messagesToday: result.messages || 0,
            totalTokens: 0,
            uptimeHours: Math.round((result.uptime || 0) / 3600),
            uptimeSeconds: result.uptime || 0,
          },
        };
        setData(normalized);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch dashboard data:', err);
        setLoading(false);
      });
  }, []);

  const handleCreateAgent = () => {
    window.location.href = '/admin/agent-builder';
  };

  const handleRefresh = () => {
    console.log('Refresh dashboard');
    setLoading(true);
    fetch('/api/v1/dashboard')
      .then(r => r.json())
      .then(result => {
        const normalized: DashboardData = result.stats ? result : {
          success: true,
          agents: result.agentsList || [],
          stats: {
            totalAgents: result.agents || 0,
            activeAgents: result.agents || 0,
            messagesToday: result.messages || 0,
            totalTokens: 0,
            uptimeHours: Math.round((result.uptime || 0) / 3600),
            uptimeSeconds: result.uptime || 0,
          },
        };
        setData(normalized);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch dashboard data:', err);
        setLoading(false);
      });
  };

  const handleAgentClick = (agent: Agent) => {
    console.log('Agent clicked:', agent);
    // Navigate to agent details page
  };

  const handleStatClick = (label: string) => {
    console.log('Stat card clicked:', label);
    // Navigate to relevant details page
  };

  const stats = data ? [
    {
      label: 'Total Agents',
      value: data.stats.totalAgents.toString(),
      icon: StatIcons.Agents,
      color: 'blue' as const,
    },
    {
      label: 'Active Agents',
      value: data.stats.activeAgents.toString(),
      icon: StatIcons.Agents,
      color: 'green' as const,
    },
    {
      label: 'Messages Today',
      value: data.stats.messagesToday.toLocaleString(),
      icon: StatIcons.Messages,
      color: 'purple' as const,
    },
    {
      label: 'Total Tokens',
      value: data.stats.totalTokens.toLocaleString(),
      icon: StatIcons.ApiCalls,
      color: 'orange' as const,
    },
  ] : [];

  return (
    <>
      {/* Dashboard Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-[#9ca3af]">Monitor your agents and system performance</p>
        </div>
        <div className="flex items-center space-x-2">
          <TopbarIconButton
            onClick={handleRefresh}
            label="Refresh dashboard"
            icon={
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            }
          />
          <TopbarIconButton
            onClick={() => console.log('Settings')}
            label="Open settings"
            icon={
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            }
          />
          <TopbarButton
            variant="primary"
            onClick={handleCreateAgent}
            icon={
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            }
          >
            New Agent
          </TopbarButton>
        </div>
      </div>
      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {loading ? (
          // Loading skeletons
          <>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6 animate-pulse">
                <div className="h-4 bg-[#1a1b2e] rounded w-24 mb-4"></div>
                <div className="h-8 bg-[#1a1b2e] rounded w-16 mb-4"></div>
                <div className="h-3 bg-[#1a1b2e] rounded w-32"></div>
              </div>
            ))}
          </>
        ) : (
          stats.map((stat, index) => (
            <StatCard 
              key={index} 
              {...stat} 
              onClick={() => handleStatClick(stat.label)}
            />
          ))
        )}
      </div>

      {/* Quick Actions */}
      <section className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6 mb-8" aria-labelledby="quick-actions-title">
        <h2 id="quick-actions-title" className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <button onClick={() => window.location.href = "/admin/agent-builder"} className="flex items-center space-x-3 p-4 rounded-lg bg-[#0e0f1a] hover:bg-[#1a1b2e] border border-[rgba(255,255,255,0.07)] hover:border-[rgba(255,255,255,0.15)] motion-safe:transition-all motion-safe:duration-200 group cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#3b82f6] focus:ring-offset-2 focus:ring-offset-[#14151f]">
            <div className="min-w-[40px] min-h-[40px] w-10 h-10 rounded-lg bg-gradient-to-br from-[#3b82f6] to-[#2563eb] flex items-center justify-center text-white" aria-hidden="true">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <span className="text-sm font-medium text-white group-hover:text-[#3b82f6] motion-safe:transition-colors motion-safe:duration-200">
              Create Agent
            </span>
          </button>

          <button onClick={() => window.location.href = "/channel/general"} className="flex items-center space-x-3 p-4 rounded-lg bg-[#0e0f1a] hover:bg-[#1a1b2e] border border-[rgba(255,255,255,0.07)] hover:border-[rgba(255,255,255,0.15)] motion-safe:transition-all motion-safe:duration-200 group cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#3b82f6] focus:ring-offset-2 focus:ring-offset-[#14151f]">
            <div className="min-w-[40px] min-h-[40px] w-10 h-10 rounded-lg bg-gradient-to-br from-[#a855f7] to-[#9333ea] flex items-center justify-center text-white" aria-hidden="true">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <span className="text-sm font-medium text-white group-hover:text-[#a855f7] motion-safe:transition-colors motion-safe:duration-200">
              Start Chat
            </span>
          </button>

          <button onClick={() => window.location.href = "/admin/usage"} className="flex items-center space-x-3 p-4 rounded-lg bg-[#0e0f1a] hover:bg-[#1a1b2e] border border-[rgba(255,255,255,0.07)] hover:border-[rgba(255,255,255,0.15)] motion-safe:transition-all motion-safe:duration-200 group cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#3b82f6] focus:ring-offset-2 focus:ring-offset-[#14151f]">
            <div className="min-w-[40px] min-h-[40px] w-10 h-10 rounded-lg bg-gradient-to-br from-[#22c55e] to-[#16a34a] flex items-center justify-center text-white" aria-hidden="true">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <span className="text-sm font-medium text-white group-hover:text-[#22c55e] motion-safe:transition-colors motion-safe:duration-200">
              View Analytics
            </span>
          </button>

          <button onClick={() => window.location.href = "/admin/templates"} className="flex items-center space-x-3 p-4 rounded-lg bg-[#0e0f1a] hover:bg-[#1a1b2e] border border-[rgba(255,255,255,0.07)] hover:border-[rgba(255,255,255,0.15)] motion-safe:transition-all motion-safe:duration-200 group cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#3b82f6] focus:ring-offset-2 focus:ring-offset-[#14151f]">
            <div className="min-w-[40px] min-h-[40px] w-10 h-10 rounded-lg bg-gradient-to-br from-[#f59e0b] to-[#d97706] flex items-center justify-center text-white" aria-hidden="true">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-3zM14 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1h-4a1 1 0 01-1-1v-3z" />
              </svg>
            </div>
            <span className="text-sm font-medium text-white group-hover:text-[#f59e0b] motion-safe:transition-colors motion-safe:duration-200">
              Browse Templates
            </span>
          </button>
        </div>
      </section>

      {/* Agents Table */}
      <section className="mb-8" aria-labelledby="agents-title">
        <div className="flex items-center justify-between mb-4">
          <h2 id="agents-title" className="text-lg font-semibold text-white">Active Agents</h2>
          <a 
            href="/agents" 
            className="text-sm text-[#3b82f6] hover:text-[#2563eb] font-medium motion-safe:transition-colors motion-safe:duration-200 focus:outline-none focus:ring-2 focus:ring-[#3b82f6] rounded px-2 py-1"
          >
            View all →
          </a>
        </div>
        {loading ? (
          <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-12 text-center animate-pulse">
            <div className="h-4 bg-[#1a1b2e] rounded w-48 mx-auto mb-4"></div>
            <div className="h-4 bg-[#1a1b2e] rounded w-32 mx-auto"></div>
          </div>
        ) : (
          <AgentsTable agents={data?.agents || []} onAgentClick={handleAgentClick} />
        )}
      </section>

      {/* Recent Activity */}
      <section className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6" aria-labelledby="activity-title">
        <h2 id="activity-title" className="text-lg font-semibold text-white mb-4">Recent Activity</h2>
        {loading ? (
          <div className="space-y-4 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-start space-x-3 pb-4 border-b border-[rgba(255,255,255,0.07)]">
                <div className="w-2 h-2 rounded-full bg-[#1a1b2e] mt-2"></div>
                <div className="flex-1">
                  <div className="h-4 bg-[#1a1b2e] rounded w-3/4 mb-2"></div>
                  <div className="h-3 bg-[#1a1b2e] rounded w-24"></div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <svg className="w-12 h-12 mx-auto text-[#6b7280] mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-[#9ca3af]">No recent activity</p>
          </div>
        )}
      </section>
    </>
  );
}
